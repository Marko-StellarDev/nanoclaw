/**
 * NanoClaw REST API
 * Lightweight HTTP server — no external deps, uses Node's built-in http module.
 * Starts alongside the main process and exposes read-only data for the dashboard UI.
 *
 * Default port: 3001 (override with API_PORT env var)
 * CORS: restricted to http://localhost:4200 (Angular dev server)
 *
 * Endpoints:
 *   GET /api/health
 *   GET /api/groups
 *   GET /api/groups/:folder/messages?limit=50
 *   GET /api/groups/:folder/usage?month=YYYY-MM
 *   GET /api/groups/:folder/tasks
 *   GET /api/tasks
 */
import http from 'http';
import fs from 'fs';
import path from 'path';

import { GROUPS_DIR } from './config.js';
import { getAllRegisteredGroups, getAllTasks, getRecentMessages } from './db.js';
import { isValidGroupFolder } from './group-folder.js';
import { logger } from './logger.js';

const API_PORT = parseInt(process.env.API_PORT || '3001', 10);
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/; // YYYY-MM

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://localhost:4200',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

export function startApiServer(): void {
  const server = http.createServer((req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (req.method !== 'GET') {
      json(res, { error: 'Method not allowed' }, 405);
      return;
    }

    const url = new URL(req.url || '/', `http://localhost:${API_PORT}`);
    const parts = url.pathname.replace(/^\/|\/$/g, '').split('/');
    // parts: ['api', 'groups', ':folder', 'messages']

    try {
      // GET /api/health
      if (url.pathname === '/api/health') {
        json(res, { status: 'ok', uptime: Math.round(process.uptime()), ts: new Date().toISOString() });
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

      // /api/groups/:folder/*
      if (parts[0] === 'api' && parts[1] === 'groups' && parts[2]) {
        const folder = parts[2];
        if (!isValidGroupFolder(folder)) {
          notFound(res);
          return;
        }
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
    } catch (err) {
      logger.error({ err, path: url.pathname }, 'API error');
      json(res, { error: 'Internal server error' }, 500);
    }
  });

  server.listen(API_PORT, '127.0.0.1', () => {
    logger.info({ port: API_PORT }, `API server listening on http://127.0.0.1:${API_PORT}`);
  });

  server.on('error', (err) => {
    logger.error({ err }, 'API server error');
  });
}
