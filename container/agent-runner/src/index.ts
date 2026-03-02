/**
 * NanoClaw Agent Runner
 * Runs inside a container, receives config via stdin, outputs result to stdout
 *
 * Input protocol:
 *   Stdin: Full ContainerInput JSON (read until EOF, like before)
 *   IPC:   Follow-up messages written as JSON files to /workspace/ipc/input/
 *          Files: {type:"message", text:"..."}.json — polled and consumed
 *          Sentinel: /workspace/ipc/input/_close — signals session end
 *
 * Stdout protocol:
 *   Each result is wrapped in OUTPUT_START_MARKER / OUTPUT_END_MARKER pairs.
 *   Multiple results may be emitted (one per agent teams result).
 *   Final marker after loop ends signals completion.
 */

import fs from 'fs';
import path from 'path';
import { query, HookCallback, PreCompactHookInput, PreToolUseHookInput } from '@anthropic-ai/claude-agent-sdk';
import { fileURLToPath } from 'url';

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
  model?: string; // defaults to claude-sonnet-4-6 if not set
  secrets?: Record<string, string>;
}

interface RunUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

interface MonthlyUsage extends RunUsage {
  month: string;
  runs: number;
  last_updated: string;
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

interface SessionEntry {
  sessionId: string;
  fullPath: string;
  summary: string;
  firstPrompt: string;
}

interface SessionsIndex {
  entries: SessionEntry[];
}

interface SDKUserMessage {
  type: 'user';
  message: { role: 'user'; content: string };
  parent_tool_use_id: null;
  session_id: string;
}

const IPC_INPUT_DIR = '/workspace/ipc/input';
const IPC_INPUT_CLOSE_SENTINEL = path.join(IPC_INPUT_DIR, '_close');
const IPC_POLL_MS = 500;

/**
 * Push-based async iterable for streaming user messages to the SDK.
 * Keeps the iterable alive until end() is called, preventing isSingleUserTurn.
 */
class MessageStream {
  private queue: SDKUserMessage[] = [];
  private waiting: (() => void) | null = null;
  private done = false;

  push(text: string): void {
    this.queue.push({
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
      session_id: '',
    });
    this.waiting?.();
  }

  end(): void {
    this.done = true;
    this.waiting?.();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<SDKUserMessage> {
    while (true) {
      while (this.queue.length > 0) {
        yield this.queue.shift()!;
      }
      if (this.done) return;
      await new Promise<void>(r => { this.waiting = r; });
      this.waiting = null;
    }
  }
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(message: string): void {
  console.error(`[agent-runner] ${message}`);
}

function getSessionSummary(sessionId: string, transcriptPath: string): string | null {
  const projectDir = path.dirname(transcriptPath);
  const indexPath = path.join(projectDir, 'sessions-index.json');

  if (!fs.existsSync(indexPath)) {
    log(`Sessions index not found at ${indexPath}`);
    return null;
  }

  try {
    const index: SessionsIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const entry = index.entries.find(e => e.sessionId === sessionId);
    if (entry?.summary) {
      return entry.summary;
    }
  } catch (err) {
    log(`Failed to read sessions index: ${err instanceof Error ? err.message : String(err)}`);
  }

  return null;
}

/**
 * Archive the full transcript to conversations/ before compaction.
 */
function createPreCompactHook(assistantName?: string): HookCallback {
  return async (input, _toolUseId, _context) => {
    const preCompact = input as PreCompactHookInput;
    const transcriptPath = preCompact.transcript_path;
    const sessionId = preCompact.session_id;

    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
      log('No transcript found for archiving');
      return {};
    }

    try {
      const content = fs.readFileSync(transcriptPath, 'utf-8');
      const messages = parseTranscript(content);

      if (messages.length === 0) {
        log('No messages to archive');
        return {};
      }

      const summary = getSessionSummary(sessionId, transcriptPath);
      const name = summary ? sanitizeFilename(summary) : generateFallbackName();

      const conversationsDir = '/workspace/group/conversations';
      fs.mkdirSync(conversationsDir, { recursive: true });

      const date = new Date().toISOString().split('T')[0];
      const filename = `${date}-${name}.md`;
      const filePath = path.join(conversationsDir, filename);

      const markdown = formatTranscriptMarkdown(messages, summary, assistantName);
      fs.writeFileSync(filePath, markdown);

      log(`Archived conversation to ${filePath}`);

      // Also append session summary to CLAUDE.md Recent Sessions section
      if (summary) {
        appendSessionToClaude(summary, date);
      }
    } catch (err) {
      log(`Failed to archive transcript: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {};
  };
}

/**
 * Generate a human-readable description of a tool call for the activity log.
 */
function describeToolUse(toolName: string, toolInput: Record<string, unknown>): string {
  switch (toolName) {
    case 'Bash': {
      const cmd = String(toolInput.command || '').replace(/\n/g, ' ').trim();
      // agent-browser commands (look for URL patterns)
      if (cmd.includes('agent-browser') || cmd.includes('chromium') || cmd.includes('puppeteer')) {
        const urlMatch = cmd.match(/https?:\/\/[^\s'"]+/);
        if (urlMatch) return `Opening browser: ${urlMatch[0]}`;
        return 'Using browser automation';
      }
      const display = cmd.slice(0, 120);
      return `Running: ${display}${cmd.length > 120 ? '…' : ''}`;
    }
    case 'WebFetch': {
      const url = String(toolInput.url || '');
      return `Fetching: ${url}`;
    }
    case 'WebSearch': {
      const q = String(toolInput.query || '');
      return `Searching web: ${q}`;
    }
    case 'Read':
      return `Reading: ${path.basename(String(toolInput.file_path || ''))}`;
    case 'Write':
      return `Writing: ${path.basename(String(toolInput.file_path || ''))}`;
    case 'Edit':
      return `Editing: ${path.basename(String(toolInput.file_path || ''))}`;
    case 'Glob':
      return `Finding files: ${toolInput.pattern || ''}`;
    case 'Grep':
      return `Searching code: ${toolInput.pattern || ''}`;
    case 'Task': {
      const desc = String(toolInput.description || '');
      return `Spawning agent: ${desc.slice(0, 80)}${desc.length > 80 ? '…' : ''}`;
    }
    case 'TodoWrite':
      return 'Updating task list';
    default:
      return `Using ${toolName}`;
  }
}

/**
 * Hook that logs every tool call as a JSONL entry to /workspace/group/.activity.jsonl.
 * This powers the "background process" view in the audit log UI.
 */
function createActivityLogHook(): HookCallback {
  const activityFile = '/workspace/group/.activity.jsonl';
  return async (input, _toolUseId, _context) => {
    const preInput = input as PreToolUseHookInput;
    const toolName = (preInput as { tool_name?: string }).tool_name || 'Unknown';
    const toolInput = (preInput.tool_input as Record<string, unknown>) || {};
    try {
      const description = describeToolUse(toolName, toolInput);
      const entry = JSON.stringify({ ts: new Date().toISOString(), tool: toolName, description });
      fs.appendFileSync(activityFile, entry + '\n');
    } catch {
      // Never fail the tool call due to a logging error
    }
    return {};
  };
}

// Secrets to strip from Bash tool subprocess environments.
// These are needed by claude-code for API auth but should never
// be visible to commands Kit runs.
const SECRET_ENV_VARS = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'];

function createSanitizeBashHook(): HookCallback {
  return async (input, _toolUseId, _context) => {
    const preInput = input as PreToolUseHookInput;
    const command = (preInput.tool_input as { command?: string })?.command;
    if (!command) return {};

    const unsetPrefix = `unset ${SECRET_ENV_VARS.join(' ')} 2>/dev/null; `;
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: {
          ...(preInput.tool_input as Record<string, unknown>),
          command: unsetPrefix + command,
        },
      },
    };
  };
}

/**
 * Append a one-line session summary to the "Recent Sessions" section of CLAUDE.md.
 * Keeps only the last 10 entries to avoid unbounded growth.
 */
function appendSessionToClaude(summary: string, date: string): void {
  const claudeMdPath = '/workspace/group/CLAUDE.md';
  if (!fs.existsSync(claudeMdPath)) return;

  try {
    let content = fs.readFileSync(claudeMdPath, 'utf-8');
    const entry = `- ${date}: ${summary.slice(0, 120)}`;
    const sectionHeader = '## Recent Sessions';

    if (content.includes(sectionHeader)) {
      // Insert after the section header (and any existing comment line)
      const lines = content.split('\n');
      const headerIdx = lines.findIndex(l => l.trim() === sectionHeader);
      if (headerIdx !== -1) {
        // Find where entries start (skip comment lines)
        let insertAt = headerIdx + 1;
        while (insertAt < lines.length && lines[insertAt].startsWith('<!--')) {
          insertAt++;
        }
        lines.splice(insertAt, 0, entry);

        // Keep only the last 10 session entries in this section
        const entryStart = insertAt;
        let entryEnd = entryStart;
        while (entryEnd < lines.length && lines[entryEnd].startsWith('- ')) {
          entryEnd++;
        }
        if (entryEnd - entryStart > 10) {
          lines.splice(entryStart, entryEnd - entryStart - 10);
        }

        content = lines.join('\n');
      }
    } else {
      // Append section at end
      content += `\n${sectionHeader}\n${entry}\n`;
    }

    fs.writeFileSync(claudeMdPath, content);
    log(`Appended session summary to CLAUDE.md`);
  } catch (err) {
    log(`Failed to update CLAUDE.md: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function sanitizeFilename(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function generateFallbackName(): string {
  const time = new Date();
  return `conversation-${time.getHours().toString().padStart(2, '0')}${time.getMinutes().toString().padStart(2, '0')}`;
}

interface ParsedMessage {
  role: 'user' | 'assistant';
  content: string;
}

function parseTranscript(content: string): ParsedMessage[] {
  const messages: ParsedMessage[] = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'user' && entry.message?.content) {
        const text = typeof entry.message.content === 'string'
          ? entry.message.content
          : entry.message.content.map((c: { text?: string }) => c.text || '').join('');
        if (text) messages.push({ role: 'user', content: text });
      } else if (entry.type === 'assistant' && entry.message?.content) {
        const textParts = entry.message.content
          .filter((c: { type: string }) => c.type === 'text')
          .map((c: { text: string }) => c.text);
        const text = textParts.join('');
        if (text) messages.push({ role: 'assistant', content: text });
      }
    } catch {
    }
  }

  return messages;
}

function formatTranscriptMarkdown(messages: ParsedMessage[], title?: string | null, assistantName?: string): string {
  const now = new Date();
  const formatDateTime = (d: Date) => d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const lines: string[] = [];
  lines.push(`# ${title || 'Conversation'}`);
  lines.push('');
  lines.push(`Archived: ${formatDateTime(now)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of messages) {
    const sender = msg.role === 'user' ? 'User' : (assistantName || 'Assistant');
    const content = msg.content.length > 2000
      ? msg.content.slice(0, 2000) + '...'
      : msg.content;
    lines.push(`**${sender}**: ${content}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Check for _close sentinel.
 */
function shouldClose(): boolean {
  if (fs.existsSync(IPC_INPUT_CLOSE_SENTINEL)) {
    try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }
    return true;
  }
  return false;
}

/**
 * Drain all pending IPC input messages.
 * Returns messages found, or empty array.
 */
function drainIpcInput(): string[] {
  try {
    fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
    const files = fs.readdirSync(IPC_INPUT_DIR)
      .filter(f => f.endsWith('.json'))
      .sort();

    const messages: string[] = [];
    for (const file of files) {
      const filePath = path.join(IPC_INPUT_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        fs.unlinkSync(filePath);
        if (data.type === 'message' && data.text) {
          messages.push(data.text);
        }
      } catch (err) {
        log(`Failed to process input file ${file}: ${err instanceof Error ? err.message : String(err)}`);
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    }
    return messages;
  } catch (err) {
    log(`IPC drain error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/**
 * Wait for a new IPC message or _close sentinel.
 * Returns the messages as a single string, or null if _close.
 */
function waitForIpcMessage(): Promise<string | null> {
  return new Promise((resolve) => {
    const poll = () => {
      if (shouldClose()) {
        resolve(null);
        return;
      }
      const messages = drainIpcInput();
      if (messages.length > 0) {
        resolve(messages.join('\n'));
        return;
      }
      setTimeout(poll, IPC_POLL_MS);
    };
    poll();
  });
}

/**
 * Run a single query and stream results via writeOutput.
 * Uses MessageStream (AsyncIterable) to keep isSingleUserTurn=false,
 * allowing agent teams subagents to run to completion.
 * Also pipes IPC messages into the stream during the query.
 */
async function runQuery(
  prompt: string,
  sessionId: string | undefined,
  mcpServerPath: string,
  containerInput: ContainerInput,
  sdkEnv: Record<string, string | undefined>,
  resumeAt?: string,
): Promise<{ newSessionId?: string; lastAssistantUuid?: string; closedDuringQuery: boolean; usage: RunUsage }> {
  const stream = new MessageStream();
  stream.push(prompt);

  // Poll IPC for follow-up messages and _close sentinel during the query
  let ipcPolling = true;
  let closedDuringQuery = false;
  const pollIpcDuringQuery = () => {
    if (!ipcPolling) return;
    if (shouldClose()) {
      log('Close sentinel detected during query, ending stream');
      closedDuringQuery = true;
      stream.end();
      ipcPolling = false;
      return;
    }
    const messages = drainIpcInput();
    for (const text of messages) {
      log(`Piping IPC message into active query (${text.length} chars)`);
      stream.push(text);
    }
    setTimeout(pollIpcDuringQuery, IPC_POLL_MS);
  };
  setTimeout(pollIpcDuringQuery, IPC_POLL_MS);

  let newSessionId: string | undefined;
  let lastAssistantUuid: string | undefined;
  let messageCount = 0;
  let resultCount = 0;
  const totalUsage: RunUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

  // Load SOUL.md (personality/identity) and global CLAUDE.md (shared instructions)
  // SOUL.md = static personality, identity, instructions (doesn't change often)
  // CLAUDE.md = dynamic memory, conversation state (changes frequently)
  // global/CLAUDE.md = shared instructions across all groups
  let systemPromptAppend = '';

  // 1. Load per-group SOUL.md (if exists)
  const soulMdPath = '/workspace/group/SOUL.md';
  if (fs.existsSync(soulMdPath)) {
    const soulMd = fs.readFileSync(soulMdPath, 'utf-8');
    systemPromptAppend += soulMd + '\n\n';
    log('Loaded SOUL.md');
  }

  // 2. Load global CLAUDE.md for non-main groups (shared context)
  const globalClaudeMdPath = '/workspace/global/CLAUDE.md';
  if (!containerInput.isMain && fs.existsSync(globalClaudeMdPath)) {
    const globalClaudeMd = fs.readFileSync(globalClaudeMdPath, 'utf-8');
    systemPromptAppend += globalClaudeMd + '\n\n';
    log('Loaded global CLAUDE.md');
  }

  // Discover additional directories mounted at /workspace/extra/*
  // These are passed to the SDK so their CLAUDE.md files are loaded automatically
  const extraDirs: string[] = [];
  const extraBase = '/workspace/extra';
  if (fs.existsSync(extraBase)) {
    for (const entry of fs.readdirSync(extraBase)) {
      const fullPath = path.join(extraBase, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        extraDirs.push(fullPath);
      }
    }
  }
  if (extraDirs.length > 0) {
    log(`Additional directories: ${extraDirs.join(', ')}`);
  }

  for await (const message of query({
    prompt: stream,
    options: {
      cwd: '/workspace/group',
      additionalDirectories: extraDirs.length > 0 ? extraDirs : undefined,
      resume: sessionId,
      resumeSessionAt: resumeAt,
      systemPrompt: systemPromptAppend
        ? { type: 'preset' as const, preset: 'claude_code' as const, append: systemPromptAppend.trim() }
        : undefined,
      allowedTools: [
        'Bash',
        'Read', 'Write', 'Edit', 'Glob', 'Grep',
        'WebSearch', 'WebFetch',
        'Task', 'TaskOutput', 'TaskStop',
        'TeamCreate', 'TeamDelete', 'SendMessage',
        'TodoWrite', 'ToolSearch', 'Skill',
        'NotebookEdit',
        'mcp__nanoclaw__*'
      ],
      env: sdkEnv,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      settingSources: ['project', 'user'],
      mcpServers: {
        nanoclaw: {
          command: 'node',
          args: [mcpServerPath],
          env: {
            NANOCLAW_CHAT_JID: containerInput.chatJid,
            NANOCLAW_GROUP_FOLDER: containerInput.groupFolder,
            NANOCLAW_IS_MAIN: containerInput.isMain ? '1' : '0',
          },
        },
      },
      hooks: {
        PreCompact: [{ hooks: [createPreCompactHook(containerInput.assistantName)] }],
        PreToolUse: [
          { matcher: 'Bash', hooks: [createSanitizeBashHook()] },
          { hooks: [createActivityLogHook()] },
        ],
      },
    }
  })) {
    messageCount++;
    const msgType = message.type === 'system' ? `system/${(message as { subtype?: string }).subtype}` : message.type;
    log(`[msg #${messageCount}] type=${msgType}`);

    if (message.type === 'assistant' && 'uuid' in message) {
      lastAssistantUuid = (message as { uuid: string }).uuid;
    }

    if (message.type === 'system' && message.subtype === 'init') {
      newSessionId = message.session_id;
      log(`Session initialized: ${newSessionId}`);
    }

    if (message.type === 'system' && (message as { subtype?: string }).subtype === 'task_notification') {
      const tn = message as { task_id: string; status: string; summary: string };
      log(`Task notification: task=${tn.task_id} status=${tn.status} summary=${tn.summary}`);
    }

    if (message.type === 'result') {
      resultCount++;
      const textResult = 'result' in message ? (message as { result?: string }).result : null;
      // Accumulate token usage from each result
      const usage = (message as any).usage;
      if (usage) {
        totalUsage.input_tokens += usage.input_tokens || 0;
        totalUsage.output_tokens += usage.output_tokens || 0;
        totalUsage.cache_read_input_tokens += usage.cache_read_input_tokens || 0;
        totalUsage.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
      }
      log(`Result #${resultCount}: subtype=${message.subtype}${textResult ? ` text=${textResult.slice(0, 200)}` : ''}${usage ? ` tokens=${usage.input_tokens}in/${usage.output_tokens}out` : ''}`);
      writeOutput({
        status: 'success',
        result: textResult || null,
        newSessionId
      });
    }
  }

  ipcPolling = false;
  log(`Query done. Messages: ${messageCount}, results: ${resultCount}, lastAssistantUuid: ${lastAssistantUuid || 'none'}, closedDuringQuery: ${closedDuringQuery}, usage: ${totalUsage.input_tokens}in/${totalUsage.output_tokens}out`);
  return { newSessionId, lastAssistantUuid, closedDuringQuery, usage: totalUsage };
}

// Soft monthly token budget — warns in logs but does not block the agent.
// Adjustable by editing this constant or rebuilding the container image.
const MONTHLY_TOKEN_BUDGET = 500_000;

/**
 * Append this run's token usage to the group's monthly usage file.
 * File: /workspace/group/.usage/YYYY-MM.json (agent-readable)
 * Also logs a warning if the monthly budget is exceeded.
 */
function updateMonthlyUsage(usage: RunUsage, model: string): void {
  if (usage.input_tokens === 0 && usage.output_tokens === 0) return;

  const month = new Date().toISOString().slice(0, 7); // "2026-03"
  const usageDir = '/workspace/group/.usage';
  const usageFile = path.join(usageDir, `${month}.json`);

  let existing: MonthlyUsage = {
    month, input_tokens: 0, output_tokens: 0,
    cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
    runs: 0, last_updated: '',
  };

  try {
    fs.mkdirSync(usageDir, { recursive: true });
    if (fs.existsSync(usageFile)) {
      existing = JSON.parse(fs.readFileSync(usageFile, 'utf-8'));
    }
  } catch { /* ignore read errors, start fresh */ }

  existing.input_tokens += usage.input_tokens;
  existing.output_tokens += usage.output_tokens;
  existing.cache_read_input_tokens += usage.cache_read_input_tokens;
  existing.cache_creation_input_tokens += usage.cache_creation_input_tokens;
  existing.runs += 1;
  existing.last_updated = new Date().toISOString();

  const monthlyTotal = existing.input_tokens + existing.output_tokens;
  if (monthlyTotal > MONTHLY_TOKEN_BUDGET) {
    log(`WARNING: Monthly token budget exceeded: ${monthlyTotal.toLocaleString()} tokens used (budget: ${MONTHLY_TOKEN_BUDGET.toLocaleString()})`);
  }

  try {
    // Also write a human-readable summary for the agent
    const summary = {
      ...existing,
      model,
      monthly_total_tokens: monthlyTotal,
      budget: MONTHLY_TOKEN_BUDGET,
      budget_used_pct: Math.round((monthlyTotal / MONTHLY_TOKEN_BUDGET) * 100),
    };
    fs.writeFileSync(usageFile, JSON.stringify(summary, null, 2));
    log(`Usage written: ${usage.input_tokens}in/${usage.output_tokens}out this run | ${existing.input_tokens}in/${existing.output_tokens}out month total (${existing.runs} runs)`);
  } catch (err) {
    log(`Failed to write usage file: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main(): Promise<void> {
  let containerInput: ContainerInput;

  try {
    const stdinData = await readStdin();
    containerInput = JSON.parse(stdinData);
    // Delete the temp file the entrypoint wrote — it contains secrets
    try { fs.unlinkSync('/tmp/input.json'); } catch { /* may not exist */ }
    log(`Received input for group: ${containerInput.groupFolder}`);
  } catch (err) {
    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}`
    });
    process.exit(1);
  }

  // Build SDK env: merge secrets into process.env for the SDK only.
  // Secrets never touch process.env itself, so Bash subprocesses can't see them.
  const sdkEnv: Record<string, string | undefined> = { ...process.env };
  for (const [key, value] of Object.entries(containerInput.secrets || {})) {
    sdkEnv[key] = value;
  }

  // Set default model — claude-sonnet-4-6 for cost/quality balance.
  // Override via containerInput.model (host passes from config) or ANTHROPIC_MODEL env.
  // Agent can also switch mid-conversation using Claude Code's /model command.
  if (!sdkEnv.ANTHROPIC_MODEL) {
    sdkEnv.ANTHROPIC_MODEL = containerInput.model || 'claude-sonnet-4-6';
  }
  log(`Model: ${sdkEnv.ANTHROPIC_MODEL}`);

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const mcpServerPath = path.join(__dirname, 'ipc-mcp-stdio.js');

  let sessionId = containerInput.sessionId;
  fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });

  // Clean up stale _close sentinel from previous container runs
  try { fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL); } catch { /* ignore */ }

  // Build initial prompt (drain any pending IPC messages too)
  let prompt = containerInput.prompt;
  if (containerInput.isScheduledTask) {
    prompt = `[SCHEDULED TASK - The following message was sent automatically and is not coming directly from the user or group.]\n\n${prompt}`;
  }
  const pending = drainIpcInput();
  if (pending.length > 0) {
    log(`Draining ${pending.length} pending IPC messages into initial prompt`);
    prompt += '\n' + pending.join('\n');
  }

  // Query loop: run query → wait for IPC message → run new query → repeat
  let resumeAt: string | undefined;
  const sessionUsage: RunUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  try {
    while (true) {
      log(`Starting query (session: ${sessionId || 'new'}, resumeAt: ${resumeAt || 'latest'})...`);

      const queryResult = await runQuery(prompt, sessionId, mcpServerPath, containerInput, sdkEnv, resumeAt);
      if (queryResult.newSessionId) {
        sessionId = queryResult.newSessionId;
      }
      if (queryResult.lastAssistantUuid) {
        resumeAt = queryResult.lastAssistantUuid;
      }

      // Accumulate token usage across all turns in this container session
      sessionUsage.input_tokens += queryResult.usage.input_tokens;
      sessionUsage.output_tokens += queryResult.usage.output_tokens;
      sessionUsage.cache_read_input_tokens += queryResult.usage.cache_read_input_tokens;
      sessionUsage.cache_creation_input_tokens += queryResult.usage.cache_creation_input_tokens;

      // Write usage after every query turn so data is persisted even if the
      // container is killed by SIGKILL (timeout) before the loop exits cleanly.
      updateMonthlyUsage(queryResult.usage, sdkEnv.ANTHROPIC_MODEL || 'claude-sonnet-4-6');

      // If _close was consumed during the query, exit immediately.
      // Don't emit a session-update marker (it would reset the host's
      // idle timer and cause a 30-min delay before the next _close).
      if (queryResult.closedDuringQuery) {
        log('Close sentinel consumed during query, exiting');
        break;
      }

      // Emit session update so host can track it
      writeOutput({ status: 'success', result: null, newSessionId: sessionId });

      log('Query ended, waiting for next IPC message...');

      // Wait for the next message or _close sentinel
      const nextMessage = await waitForIpcMessage();
      if (nextMessage === null) {
        log('Close sentinel received, exiting');
        break;
      }

      log(`Got new message (${nextMessage.length} chars), starting new query`);
      prompt = nextMessage;
    }
    // Write cumulative usage for this container session to the monthly file
    updateMonthlyUsage(sessionUsage, sdkEnv.ANTHROPIC_MODEL || 'claude-sonnet-4-6');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Agent error: ${errorMessage}`);
    writeOutput({
      status: 'error',
      result: null,
      newSessionId: sessionId,
      error: errorMessage
    });
    process.exit(1);
  }
}

main();
