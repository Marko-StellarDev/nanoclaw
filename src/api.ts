/**
 * NanoClaw REST API
 * Lightweight HTTP server — no external deps, uses Node's built-in http module.
 * Starts alongside the main process and exposes data for the dashboard UI.
 *
 * Default port: 3001 (override with API_PORT env var)
 * CORS: restricted to http://localhost:4200 (Angular dev server)
 *
 * Endpoints:
 *   GET    /api/health
 *   GET    /api/status
 *   GET    /api/groups
 *   GET    /api/groups/:folder/messages?limit=50
 *   GET    /api/groups/:folder/usage?month=YYYY-MM
 *   GET    /api/groups/:folder/tasks
 *   POST   /api/groups/:folder/message        { text }
 *   GET    /api/tasks
 *   POST   /api/tasks                         { group_folder, prompt, schedule_type, schedule_value, context_mode }
 *   POST   /api/tasks/:id/pause
 *   POST   /api/tasks/:id/resume
 *   DELETE /api/tasks/:id
 *   GET    /api/audit?limit=100&group=folder
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { CronExpressionParser } from 'cron-parser';

import { GROUPS_DIR, TIMEZONE } from './config.js';
import {
  getAllRegisteredGroups, getAllTasks, getRecentMessages,
  getAuditEvents, AuditEvent,
  storeMessageDirect, createTask, updateTask, deleteTask, getTaskById,
} from './db.js';
import { getAgentStatuses } from './agent-status.js';
import { isValidGroupFolder } from './group-folder.js';
import { logger } from './logger.js';

const API_PORT = parseInt(process.env.API_PORT || '3001', 10);
// Default to localhost-only. Set API_HOST=0.0.0.0 to allow LAN access
// (e.g. to view the dashboard from another machine on the same network).
// Only do this on a trusted network — the API has no authentication.
const API_HOST = process.env.API_HOST || '127.0.0.1';
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/; // YYYY-MM

// Allow the Angular dev server origin. When API_HOST=0.0.0.0 (LAN mode),
// also allow requests from any local network origin by using '*'.
const CORS_ORIGIN = API_HOST === '127.0.0.1' ? 'http://localhost:4200' : '*';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': CORS_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS_HEADERS });
  res.end(body);
}

function notFound(res: http.ServerResponse): void {
  json(res, { error: 'Not found' }, 404);
}

const MAX_BODY_SIZE = 65536; // 64KB — more than enough for any valid API payload

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function readUsageFile(folder: string, month: string): unknown {
  const file = path.join(GROUPS_DIR, folder, '.usage', `${month}.json`);
  if (!fs.existsSync(file)) {
    return { month, input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, runs: 0, budget: 500000, budget_used_pct: 0 };
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return { month, error: 'Failed to parse usage file' };
  }
}

function readAllMonthsUsage(folder: string): unknown[] {
  const usageDir = path.join(GROUPS_DIR, folder, '.usage');
  if (!fs.existsSync(usageDir)) return [];
  return fs.readdirSync(usageDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, 12) // last 12 months
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(usageDir, f), 'utf-8')); }
      catch { return null; }
    })
    .filter(Boolean);
}

/**
 * Read tool-use activity events from .activity.jsonl files in each group's directory.
 * These are written by the createActivityLogHook inside the container on every tool call.
 * Returns up to `maxPerGroup` events per group, newest-first.
 */
function readActivityEvents(folder?: string, maxPerGroup = 500): AuditEvent[] {
  const events: AuditEvent[] = [];
  const groups = getAllRegisteredGroups();

  const foldersToRead = folder
    ? [folder]
    : Object.values(groups).map(g => g.folder);

  for (const f of foldersToRead) {
    const activityFile = path.join(GROUPS_DIR, f, '.activity.jsonl');
    if (!fs.existsSync(activityFile)) continue;
    try {
      const lines = fs.readFileSync(activityFile, 'utf-8')
        .split('\n')
        .filter(l => l.trim());
      // Take the last maxPerGroup lines (most recent)
      const recent = lines.slice(-maxPerGroup);
      const groupName = Object.values(groups).find(g => g.folder === f)?.name || f;
      for (const line of recent) {
        try {
          const entry = JSON.parse(line);
          if (!entry.ts || !entry.tool || !entry.description) continue;
          events.push({
            id: `activity-${f}-${entry.ts}-${entry.tool}`,
            ts: entry.ts,
            group_folder: f,
            group_name: groupName,
            type: 'activity',
            summary: entry.description,
            detail: entry.description,
            tool: entry.tool,
          });
        } catch { /* skip malformed lines */ }
      }
    } catch { /* skip unreadable files */ }
  }

  return events;
}

/**
 * Calculate next_run for a new task — mirrors the logic in src/ipc.ts.
 */
function calculateNextRun(
  scheduleType: 'cron' | 'interval' | 'once',
  scheduleValue: string,
): string | null {
  if (scheduleType === 'cron') {
    const interval = CronExpressionParser.parse(scheduleValue, { tz: TIMEZONE });
    return interval.next().toISOString();
  }
  if (scheduleType === 'interval') {
    const ms = parseInt(scheduleValue, 10);
    if (isNaN(ms) || ms <= 0) throw new Error('Invalid interval ms');
    return new Date(Date.now() + ms).toISOString();
  }
  if (scheduleType === 'once') {
    const d = new Date(scheduleValue);
    if (isNaN(d.getTime())) throw new Error('Invalid timestamp');
    return d.toISOString();
  }
  throw new Error('Invalid schedule_type');
}

export function startApiServer(): void {
  const server = http.createServer(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const method = req.method || 'GET';
    const url = new URL(req.url || '/', `http://localhost:${API_PORT}`);
    const parts = url.pathname.replace(/^\/|\/$/g, '').split('/');
    // parts: ['api', 'groups', ':folder', 'messages']

    try {
      // ── GET endpoints ──────────────────────────────────────────────────────

      if (method === 'GET') {
        // GET /api/health
        if (url.pathname === '/api/health') {
          json(res, { status: 'ok', uptime: Math.round(process.uptime()), ts: new Date().toISOString() });
          return;
        }

        // GET /api/status  → { keb-ops: 'thinking', main: 'idle' }
        if (url.pathname === '/api/status') {
          json(res, getAgentStatuses());
          return;
        }

        // GET /api/groups
        if (url.pathname === '/api/groups') {
          const groups = getAllRegisteredGroups();
          const result = Object.entries(groups).map(([jid, g]) => ({
            jid,
            name: g.name,
            folder: g.folder,
            trigger: g.trigger,
            added_at: g.added_at,
            requiresTrigger: g.requiresTrigger !== false,
          }));
          json(res, result);
          return;
        }

        // GET /api/tasks
        if (url.pathname === '/api/tasks') {
          json(res, getAllTasks());
          return;
        }

        // GET /api/audit?limit=100&group=keb-ops
        if (url.pathname === '/api/audit') {
          const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
          const group = url.searchParams.get('group') || undefined;
          if (group && !isValidGroupFolder(group)) {
            json(res, { error: 'Invalid group' }, 400);
            return;
          }
          const dbEvents = getAuditEvents(limit, group);
          const activityEvents = readActivityEvents(group);
          const merged = [...dbEvents, ...activityEvents]
            .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
            .slice(0, limit);
          json(res, merged);
          return;
        }

        // /api/groups/:folder/*
        if (parts[0] === 'api' && parts[1] === 'groups' && parts[2]) {
          const folder = parts[2];
          if (!isValidGroupFolder(folder)) { notFound(res); return; }
          const sub = parts[3];

          // GET /api/groups/:folder/messages?limit=50
          if (sub === 'messages') {
            const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
            const messages = getRecentMessages(folder, limit);
            json(res, messages.reverse()); // chronological order
            return;
          }

          // GET /api/groups/:folder/usage?month=YYYY-MM
          if (sub === 'usage') {
            const month = url.searchParams.get('month');
            if (month) {
              if (!MONTH_PATTERN.test(month)) {
                json(res, { error: 'Invalid month format, expected YYYY-MM' }, 400);
                return;
              }
              json(res, readUsageFile(folder, month));
            } else {
              json(res, readAllMonthsUsage(folder));
            }
            return;
          }

          // GET /api/groups/:folder/tasks
          if (sub === 'tasks') {
            json(res, getAllTasks().filter(t => t.group_folder === folder));
            return;
          }
        }

        notFound(res);
        return;
      }

      // ── POST endpoints ─────────────────────────────────────────────────────

      if (method === 'POST') {
        // POST /api/groups/:folder/message  { text }
        if (parts[0] === 'api' && parts[1] === 'groups' && parts[2] && parts[3] === 'message') {
          const folder = parts[2];
          if (!isValidGroupFolder(folder)) { notFound(res); return; }

          const groups = getAllRegisteredGroups();
          const group = Object.entries(groups).find(([, g]) => g.folder === folder);
          if (!group) { json(res, { error: 'Group not found' }, 404); return; }

          const body = await readBody(req);
          const text = typeof body.text === 'string' ? body.text.trim() : '';
          if (!text) { json(res, { error: 'text is required' }, 400); return; }

          const [jid] = group;
          storeMessageDirect({
            id: `ui-${Date.now()}-${randomBytes(8).toString('hex')}`,
            chat_jid: jid,
            sender: 'web-ui',
            sender_name: 'Web UI',
            content: text,
            timestamp: new Date().toISOString(),
            is_from_me: false,
            is_bot_message: false,
          });
          json(res, { ok: true });
          return;
        }

        // POST /api/tasks  { group_folder, prompt, schedule_type, schedule_value, context_mode }
        if (url.pathname === '/api/tasks') {
          const body = await readBody(req);
          const { group_folder, prompt, schedule_type, schedule_value, context_mode } = body as Record<string, string>;

          if (!group_folder || !prompt || !schedule_type || !schedule_value) {
            json(res, { error: 'group_folder, prompt, schedule_type, schedule_value are required' }, 400);
            return;
          }
          if (!isValidGroupFolder(group_folder)) {
            json(res, { error: 'Invalid group_folder' }, 400);
            return;
          }
          if (!['cron', 'interval', 'once'].includes(schedule_type)) {
            json(res, { error: 'schedule_type must be cron, interval, or once' }, 400);
            return;
          }

          const groups = getAllRegisteredGroups();
          const group = Object.entries(groups).find(([, g]) => g.folder === group_folder);
          if (!group) { json(res, { error: 'Group not found' }, 404); return; }
          const [jid] = group;

          const ctxMode = context_mode === 'group' ? 'group' : 'isolated';
          const taskId = `task-${Date.now()}-${randomBytes(8).toString('hex')}`;

          let nextRun: string | null = null;
          try {
            nextRun = calculateNextRun(schedule_type as 'cron' | 'interval' | 'once', schedule_value);
          } catch (e) {
            json(res, { error: (e as Error).message }, 400);
            return;
          }

          createTask({
            id: taskId,
            group_folder,
            chat_jid: jid,
            prompt,
            schedule_type: schedule_type as 'cron' | 'interval' | 'once',
            schedule_value,
            context_mode: ctxMode,
            next_run: nextRun,
            status: 'active',
            created_at: new Date().toISOString(),
          });
          json(res, { ok: true, id: taskId });
          return;
        }

        // POST /api/tasks/:id/pause  or  /resume
        if (parts[0] === 'api' && parts[1] === 'tasks' && parts[2] && parts[3]) {
          const taskId = parts[2];
          const action = parts[3]; // 'pause' | 'resume'
          const task = getTaskById(taskId);
          if (!task) { json(res, { error: 'Task not found' }, 404); return; }

          if (action === 'pause') {
            updateTask(taskId, { status: 'paused' });
            json(res, { ok: true });
            return;
          }
          if (action === 'resume') {
            updateTask(taskId, { status: 'active' });
            json(res, { ok: true });
            return;
          }
          notFound(res);
          return;
        }

        notFound(res);
        return;
      }

      // ── DELETE endpoints ───────────────────────────────────────────────────

      if (method === 'DELETE') {
        // DELETE /api/tasks/:id
        if (parts[0] === 'api' && parts[1] === 'tasks' && parts[2] && !parts[3]) {
          const taskId = parts[2];
          const task = getTaskById(taskId);
          if (!task) { json(res, { error: 'Task not found' }, 404); return; }
          deleteTask(taskId);
          json(res, { ok: true });
          return;
        }
        notFound(res);
        return;
      }

      json(res, { error: 'Method not allowed' }, 405);
    } catch (err) {
      logger.error({ err, path: url.pathname }, 'API error');
      json(res, { error: 'Internal server error' }, 500);
    }
  });

  server.listen(API_PORT, API_HOST, () => {
    logger.info({ port: API_PORT, host: API_HOST }, `API server listening on http://${API_HOST}:${API_PORT}`);
  });

  server.on('error', (err) => {
    logger.error({ err }, 'API server error');
  });
}
