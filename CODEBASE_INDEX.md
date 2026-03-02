# NanoClaw Codebase Index

**Last Updated:** 2026-03-02 (Session 8 — Haiku default model, sonnet:/opus: prefix routing; prior: model column in audit log, schedule humaniser + dropdown, chat input, task controls, agent status)
**Total Size:** ~35k tokens (17% of 200k context)

**⚠️ SESSION RECOVERY:** If terminal closes, read `PROJECT_STATUS.md` first - contains todo list, completed work, and next steps

## Quick Reference

### Core Architecture
- **Entry Point:** `src/index.ts` - Orchestrator managing state, message loop, agent invocation
- **Message Flow:** Slack → DB → Poll → Queue → Container → Agent → Output → Slack
- **Container Runtime:** Linux containers (Docker/Apple Container) running Claude Agent SDK
- **Group Isolation:** Separate filesystem, sessions, IPC namespace, SOUL.md per group
- **Multi-Arch:** Supports both Apple Container (M1 arm64) and Docker (Intel amd64)

### Key Files Map

| File | Purpose | Key Functions |
|------|---------|---------------|
| `src/index.ts` | Orchestrator | `main()`, `startMessageLoop()`, `runAgent()`, `processGroupMessages()` |
| `src/db.ts` | SQLite persistence | `storeMessage()`, `getNewMessages()`, task CRUD, sessions |
| `src/channels/slack.ts` | Slack I/O | `connect()`, `sendMessage()`, `setTyping()`, message chunking |
| `src/container-runner.ts` | Agent spawner | `runContainerAgent()`, `buildVolumeMounts()`, secret handling |
| `src/group-queue.ts` | Concurrency control | `enqueueMessageCheck()`, `sendMessage()`, global limit (5) |
| `src/ipc.ts` | File-based IPC | Poll 1s, process messages/tasks, authorization checks |
| `src/task-scheduler.ts` | Scheduled tasks | Poll 60s, `getDueTasks()`, `runTask()` |
| `src/router.ts` | Message formatting | `formatMessages()`, `stripInternalTags()`, XML escaping |
| `src/config.ts` | Configuration | Trigger patterns, paths, timeouts, concurrency limits |
| `container/agent-runner/src/index.ts` | Container-side agent | Query loop, IPC polling, session management, SOUL.md loading |
| `container/agent-runner/src/ipc-mcp-stdio.ts` | MCP tools | `send_message`, `schedule_task`, task lifecycle, `register_group` |

---

## Phase 1 Enhancements (2026-03-01)

### SOUL.md System
- **Purpose:** Separate static personality/identity from dynamic conversation memory
- **Location:** Per-group `SOUL.md` file (e.g., `groups/keb-ops/SOUL.md`)
- **Loading:** Container agent-runner loads SOUL.md and appends to Claude Code system prompt
- **Templates:** Created for KEB Ops (direct, analytical, retail-focused) and Personal (friendly, versatile)
- **Separation:**
  - `SOUL.md` = Static personality, operational context, communication style
  - `CLAUDE.md` = Dynamic memory, conversation state, ongoing tasks

### Slack Integration
- **Channel:** Replaced WhatsApp with Slack Bot API
- **Implementation:** `src/channels/slack.ts` using `@slack/bolt`
- **JID Format:** `slack:{channelId}` (e.g., `slack:C1234567890` for channels, `slack:D1234567890` for DMs)
- **Features:**
  - Socket Mode (no public URL required)
  - Inline group names (no separate sync needed)
  - Message chunking (4000 char limit for readability)
  - Markdown formatting (mrkdwn)
  - App mentions and DM support
- **Tokens:** Requires both Bot Token (xoxb-...) and App Token (xapp-...). Supports `DEV_SLACK_BOT_TOKEN`/`DEV_SLACK_APP_TOKEN` (M1 dev) and `SLACK_BOT_TOKEN`/`SLACK_APP_TOKEN` (Intel prod)

### Multi-Machine Deployment
- **Development:** M1 MacBook Pro with Apple Container (arm64) + DEV token
- **Production:** Intel MacBook Pro with Docker Desktop (amd64, 2 CPU / 4GB) + PROD token
- **Deployment Script:** `deploy.sh` - DB backup, git pull, deps, container rebuild, service restart
- **Documentation:** `SLACK_SETUP.md` and `INTEL_SETUP.md` for complete setup

---

## 1. CORE ARCHITECTURE

### Message Processing Flow
```
Slack → onMessage callback → storeMessage(db) →
polling loop (2s) → formatMessages() →
runContainerAgent() → agent output →
stripInternalTags() → sendMessage(channel) → Slack
```

### Container Execution Model
```
Host Process (Node.js)
├── Slack connection (Bolt SDK, Socket Mode)
├── REST API server (:3001)
├── Message polling loop (2s)
├── IPC watcher (1s)
├── Scheduler loop (60s)
└── GroupQueue (max 5 concurrent)
    ↓
Container (per group)
├── Agent SDK query loop
├── IPC input polling
├── MCP server (send_message, schedule_task, etc.)
└── agent-browser tool (Chromium)
```

### Group Isolation
- **Filesystem:** Separate folder in `groups/{name}/`, mounted at `/workspace/group/`
- **Sessions:** Unique Claude session ID per group (persisted in DB)
- **IPC:** Namespace via directory: `data/ipc/{groupFolder}/`
- **Memory:** Per-group `CLAUDE.md` + global read-only `groups/global/CLAUDE.md`

---

## 2. SOURCE FILES REFERENCE

### Core Orchestration

**`src/index.ts` (560 lines)**
- Main entry point and orchestrator
- **State:**
  - `lastTimestamp` - Global message cursor
  - `lastAgentTimestamp` - Per-group processing cursor
  - `sessions` - Per-group Claude session IDs
  - `registeredGroups` - Active group configs
- **Key Functions:**
  - `main()` - Initialize DB, channels, subsystems, start loops
  - `startMessageLoop()` - Poll every 2s, route to groups
  - `processGroupMessages()` - Get unprocessed messages, spawn container
  - `runAgent()` - Container spawner with streaming output
  - `registerGroup()` - Validate and register new group
  - `getAvailableGroups()` - List groups ordered by activity
- **Dependencies:** db, channels, container-runner, group-queue, ipc, router, task-scheduler

### Configuration & Environment

**`src/config.ts` (85 lines)**
- Exports all configuration constants
- **Key Exports:**
  - `ASSISTANT_NAME` - Default "StellarBot" (from `.env`)
  - `TRIGGER_PATTERN` - Case-insensitive regex `@StellarBot`
  - `POLL_INTERVAL` - 2000ms message polling
  - `CONTAINER_TIMEOUT` - 30min max runtime
  - `IDLE_TIMEOUT` - 30min idle before shutdown
  - `MAX_CONCURRENT_CONTAINERS` - 5 (default)
  - `SCHEDULER_POLL_INTERVAL` - 60s task polling
  - Paths: `STORE_DIR`, `GROUPS_DIR`, `DATA_DIR`, etc.
  - `MODEL_DEFAULT` = haiku (fast/cheap default for all runs)
  - `MODEL_SONNET` = claude-sonnet-4-6 (triggered by `sonnet:` message prefix)
  - `MODEL_COMPLEX` = claude-opus-4-6 (triggered by `opus:` message prefix)

**`src/env.ts` (43 lines)**
- `readEnvFile(keys)` - Parse `.env` without loading to `process.env`
- Keeps secrets isolated from child processes
- Supports quoted values, comments

**`src/types.ts` (105 lines)**
- Core TypeScript interfaces
- **Key Types:**
  - `RegisteredGroup` - JID, name, trigger, container config, folder
  - `NewMessage` - Sender, content, timestamp, bot detection
  - `ScheduledTask` - Cron/interval/once with context mode
  - `Channel` - Abstract messaging platform interface
  - `AdditionalMount` - Security-validated external mounts
  - `MountAllowlist` - Tamper-proof mount security config

### Database & State

**`src/db.ts` (778 lines)**
- SQLite via better-sqlite3
- **Location:** `store/messages.db`
- **Schema:**
  - `chats` - All chats (discovery), indexed by timestamp
  - `messages` - Full content for registered groups only
  - `scheduled_tasks` - Tasks with next_run index
  - `task_run_logs` - Execution history
  - `router_state` - Key-value state
  - `sessions` - Per-group Claude session IDs
  - `registered_groups` - Group configs
- **Key Functions:**
  - `initDatabase()` - Schema creation, migrations
  - `storeMessage()` / `storeMessageDirect()` / `getNewMessages()` - Message CRUD
  - `getAllChats()` - Group discovery (ordered by activity)
  - Task CRUD: `createTask()`, `updateTask()`, `deleteTask()`, `getDueTasks()`
  - Session: `getSession()`, `saveSession()`
  - Groups: `getAllRegisteredGroups()`, `registerGroup()`
  - Audit: `getAuditEvents(limit, folder?)` - UNION of messages + task_run_logs, newest-first
  - `AuditEvent` interface: `type: 'user' | 'bot' | 'task' | 'activity'`, `tool?: string`, `model?: string`
  - `messages` schema includes `model TEXT` (auto-migrated); bot messages backfilled and new ones set to `MODEL_DEFAULT`
  - `task_run_logs` schema includes `model TEXT` (auto-migrated); set to `MODEL_DEFAULT` on every task run
  - `storeMessageDirect()` accepts optional `model` field

### Channels

**`src/channels/slack.ts` (348 lines)**
- Slack integration via @slack/bolt with Socket Mode
- **Class:** `SlackChannel implements Channel`
- **Key Methods:**
  - `connect()` - Bot auth via Bot Token and App Token, start Socket Mode
  - `sendMessage()` - Send with optional prefix, message chunking (4000 char limit)
  - `setTyping()` - Not implemented (Slack bots don't have built-in typing indicators)
  - `handleMessage()` - Process app_mentions and DMs, detect channels
  - `splitMessage()` - Split long messages at word/newline boundaries
- **Features:**
  - Socket Mode (no public URL required)
  - Inline channel names (provided in event metadata)
  - Bot self-detection (skip own messages)
  - Offline message queue
  - Markdown formatting (mrkdwn)
- **JID Format:** `slack:{channelId}` where channelId starts with C (channel) or D (DM)

### Container System

**`src/container-runner.ts` (650 lines)**
- Spawns agent containers with mounts and streaming
- **Key Functions:**
  - `runContainerAgent()` - Main spawner, returns streaming output
  - `buildVolumeMounts()` - Create mount array per group type
  - `buildContainerArgs()` - Docker/container CLI construction
  - `writeTasksSnapshot()` - Filter tasks to IPC directory
  - `writeGroupsSnapshot()` - Available groups for main
- **Mounts (Main Group):**
  - Project root (ro) - for code access
  - Group folder (rw) - `/workspace/group/`
  - `.claude` directory (rw) - SDK state
  - IPC directory (rw) - `/workspace/ipc/`
  - Global memory (ro) - `/workspace/global/`
- **Mounts (Other Groups):**
  - Group folder (rw), `.claude` (rw), IPC (rw), global (ro), validated additional
  - No project root access
- **Security:**
  - Secrets via stdin JSON (deleted immediately)
  - Readonly mounts for shared resources
  - Timeout: 30min + activity-based reset

**`src/container-runtime.ts` (77 lines)**
- Abstraction for Docker vs Apple Container
- **Exports:**
  - `CONTAINER_RUNTIME_BIN` - 'docker' or 'container'
  - `readonlyMountArgs()` - Platform-specific readonly args
  - `stopContainer()` - Stop command
  - `ensureContainerRuntimeRunning()` - Start runtime if needed
  - `cleanupOrphans()` - Kill orphaned containers

### Queue & Concurrency

**`src/group-queue.ts` (340 lines)**
- Per-group queue with global concurrency limit
- **Class:** `GroupQueue`
- **State per Group:**
  - `active` - Container running
  - `idleWaiting` - Container idle, awaiting input
  - `isTaskContainer` - Running scheduled task
  - `pendingMessages` / `pendingTasks` - Queued work
  - `process` / `containerName` / `groupFolder` - Active tracking
- **Key Methods:**
  - `enqueueMessageCheck()` - Queue message processing
  - `enqueueTask()` - Queue scheduled task
  - `sendMessage()` - Pipe to active container via IPC
  - `closeStdin()` - Write `_close` sentinel
  - `notifyIdle()` - Mark idle, trigger preemption
  - `registerProcess()` - Track active container
- **Concurrency:** Global limit (5), fairness queue
- **Retry:** Exponential backoff (5s base, max 5 retries)

### IPC & Task Management

**`src/ipc.ts` (388 lines)**
- File-based IPC watcher
- **Poll:** 1s interval
- **Layout:** `data/ipc/{groupFolder}/{messages,tasks,input}/`
- **Authorization:**
  - Main: send to any group, schedule for any, register groups
  - Others: send/schedule only for self
- **Task Commands:**
  - `schedule_task` - Create cron/interval/once
  - `pause_task` / `resume_task` / `cancel_task` - Lifecycle
  - `register_group` - Add group (main only)
  - `refresh_groups` - Sync WhatsApp metadata (main only)

**`src/task-scheduler.ts` (250 lines)**
- Scheduled task runner
- **Poll:** 60s interval
- **Workflow:**
  1. `getDueTasks()` from DB
  2. `enqueueTask()` to group queue
  3. `runTask()` spawns container
  4. Update `next_run` based on schedule type
- **Context Modes:**
  - `group` - Runs in conversation session (has history)
  - `isolated` - Fresh session (no history)
- **Output:** Via `send_message` MCP or final result
- **Logging:** All runs in `task_run_logs` table

### Routing & Formatting

**`src/router.ts` (45 lines)**
- Message formatting and XML handling
- **Functions:**
  - `formatMessages()` - NewMessage[] → XML for agent
  - `escapeXml()` - Entity escaping
  - `stripInternalTags()` - Remove `<internal>...</internal>`
  - `formatOutbound()` - Prepare for sending
  - `findChannel()` - Match JID to channel

### Security & Validation

**`src/mount-security.ts` (420 lines)**
- Validates additional mounts against allowlist
- **Allowlist:** `~/.config/nanoclaw/mount-allowlist.json` (outside project)
- **Features:**
  - Path expansion, symlink resolution
  - Block sensitive patterns (`.ssh`, `.gnupg`, `.env`)
  - Verify paths under allowed roots
  - Force read-only for non-main (configurable)
- **Functions:**
  - `loadMountAllowlist()` - Cached load
  - `validateMount()` / `validateAdditionalMounts()` - Validation
  - `generateAllowlistTemplate()` - Example config

**`src/group-folder.ts` (45 lines)**
- Group folder validation and path resolution
- **Validation:** Alphanumeric+dash/underscore, 1-64 chars, no traversal
- **Reserved:** `global` (shared read-only memory)
- **Functions:**
  - `isValidGroupFolder()`, `resolveGroupFolderPath()`, `resolveGroupIpcPath()`

### Web Dashboard

**`src/agent-status.ts` (21 lines)**
- Shared in-memory status registry
- **Exports:** `setAgentStatus(folder, 'thinking'|'idle')`, `clearAgentStatus(folder)`, `getAgentStatuses()`
- Written by `GroupQueue.registerProcess()` on container start; cleared in `finally` blocks on container stop
- Read by `GET /api/status` endpoint

**`src/api.ts` (417 lines)**
- Lightweight REST API using Node built-in `http` (zero new deps)
- **Port:** `3001` (override with `API_PORT`); binds to `127.0.0.1` by default (set `API_HOST=0.0.0.0` for LAN access)
- **GET endpoints:** `/api/health`, `/api/status`, `/api/groups`, `/api/groups/:folder/messages`, `/api/groups/:folder/usage`, `/api/groups/:folder/tasks`, `/api/tasks`, `/api/audit`
- **POST endpoints:** `/api/groups/:folder/message` (chat), `/api/tasks` (create), `/api/tasks/:id/pause`, `/api/tasks/:id/resume`
- **DELETE endpoint:** `/api/tasks/:id` (cancel)
- `readBody(req)` — parses POST JSON body
- `calculateNextRun(type, value)` — cron-parser logic mirroring ipc.ts
- `readActivityEvents(folder?)` — reads `groups/{folder}/.activity.jsonl`, last 500 lines, merged with DB audit events

**`ui/`**
- Angular 17 standalone app, served on `:4200` (`cd ui && npm start`)
- **Dashboard** — group cards with live chat input (Enter to send), pulsing green dot + typing indicator when agent is thinking (polls `/api/status` every 5s), auto-refreshes messages
- **KEB Ops** — branch network, token usage stats, tasks, message history
- **Tasks** — task table with pause/resume/cancel buttons, `scheduleLabel()` converts cron/ms/once to plain English; "+ New Task" form with preset schedule dropdown (14 cron, 8 interval presets + datetime-local picker for once; "Custom…" reveals raw input)
- **Audit Log** — messages + task runs + tool activity, live 5s refresh; bot + task rows show model tag (e.g. `sonnet-4.6`) in the type column
- Proxies `/api` to `:3001` via `proxy.conf.json` — **must use `npm start`**, not `npx ng serve`

### Utilities

**`src/logger.ts` (463 bytes)**
- Pino logger with pretty printing
- Level: `process.env.LOG_LEVEL` or `info`

---

## 3. CONTAINER SYSTEM

### Container Image

**`container/Dockerfile` (69 lines)**
- Base: `node:22-slim`
- Installed: Chromium + deps, git, curl, `agent-browser`, `@anthropic-ai/claude-code`
- **Entrypoint:**
  1. Recompile agent-runner from writable copy
  2. Read stdin JSON to `/tmp/input.json`
  3. Run agent: `node /tmp/dist/index.js < /tmp/input.json`
- Workspace: `/workspace/group/` (working directory)
- User: `node` (non-root, uid 1000)

**`container/build.sh` (24 lines)**
- Build `nanoclaw-agent:latest`
- Supports Docker and Apple Container

### Agent Runner

**`src/group-queue.ts`** — updated: `registerProcess()` calls `setAgentStatus(folder, 'thinking')`; `finally` blocks in `runForGroup()` and `runTask()` call `clearAgentStatus(folder)` before nulling groupFolder.

**`container/agent-runner/src/index.ts` (827 lines)**
- Container-side agent executor
- **Input:** Stdin JSON (`ContainerInput`) with prompt, sessionId, secrets
- **Output:** Sentinel-wrapped JSON for streaming
- **Query Loop:**
  1. Parse stdin → build SDK env → drain IPC messages
  2. Run `query()` with `MessageStream` (async iterable)
  3. Poll IPC during query, pipe new messages
  4. Emit results via `writeOutput()`
  5. Wait for next IPC or `_close` sentinel
  6. Repeat until `_close`
- **Hooks:**
  - `PreCompact` - Archive transcript to `conversations/`
  - `PreToolUse (Bash matcher)` - Strip secrets from subprocess env
  - `PreToolUse (all tools)` - `createActivityLogHook()` appends JSONL to `/workspace/group/.activity.jsonl`
- **Activity Log:** `describeToolUse()` maps each tool + input to a human-readable string (e.g. "Searching web: Dubai weather", "Fetching: https://...")
- **Session:** Tracks `newSessionId`, `lastAssistantUuid`
- **Global Memory:** Loads `/workspace/global/CLAUDE.md` for non-main
- **Usage:** Written after every query turn (not just on clean exit — survives SIGKILL)

**`container/agent-runner/src/ipc-mcp-stdio.ts` (286 lines)**
- Stdio MCP server for NanoClaw tools
- **Context:** Reads `NANOCLAW_CHAT_JID`, `NANOCLAW_GROUP_FOLDER`, `NANOCLAW_IS_MAIN`
- **Tools:**
  - `send_message` - Immediate message delivery
  - `schedule_task` - Cron/interval/once with context mode
  - `list_tasks` - View tasks (main: all, others: own)
  - `pause_task` / `resume_task` / `cancel_task` - Lifecycle
  - `register_group` - Add group (main only)
- **IPC:** Writes to `/workspace/ipc/{messages,tasks}/`

### Container Skills

**`container/skills/agent-browser/SKILL.md` (160 lines)**
- Browser automation via `agent-browser` CLI
- **Workflow:**
  1. `agent-browser open <url>`
  2. `agent-browser snapshot -i` → get refs (@e1, @e2)
  3. `agent-browser click @e1`, `agent-browser fill @e2 "text"`
  4. Re-snapshot after navigation
- **Commands:** Navigate, snapshot, interact, screenshot, wait, cookies, eval
- **Auth:** Save/load browser state

---

## 4. DATA PERSISTENCE

### Database Schema (`store/messages.db`)

| Table | Purpose | Key Columns | Indexes |
|-------|---------|-------------|---------|
| `chats` | All chats (discovery) | jid, name, last_message_time, channel, is_group | last_message_time DESC |
| `messages` | Full content (registered only) | id, jid, sender, content, timestamp, is_from_bot | timestamp DESC |
| `scheduled_tasks` | Cron/interval/once tasks | id, group_folder, chat_jid, prompt, schedule_type, schedule_value, next_run, last_run, last_result, status, context_mode, created_at | next_run, status |
| `task_run_logs` | Execution history | id, task_id, started_at, completed_at, status, result_text | task_id, started_at |
| `router_state` | Key-value state | key, value (JSON) | key |
| `sessions` | Claude session IDs | jid, session_id, last_updated | jid |
| `registered_groups` | Group configs | jid, group_folder, trigger_pattern, container_image, additional_mounts, created_at, updated_at | jid UNIQUE |

### Memory System

**Global Memory:**
- `groups/global/CLAUDE.md` - Shared read-only context
- Mounted at `/workspace/global/` (ro for non-main)

**Per-Group Memory:**
- `groups/{folder}/SOUL.md` - Static personality, identity, instructions (new in Phase 1)
- `groups/{folder}/CLAUDE.md` - Dynamic memory, conversation state
- Mounted at `/workspace/group/` (rw)

**Conversation Archives:**
- `groups/{folder}/conversations/` - PreCompact hook saves transcripts

**Activity Log:**
- `groups/{folder}/.activity.jsonl` - Append-only JSONL; one entry per tool call `{ts, tool, description}`
- Written by `createActivityLogHook()` inside the container on every tool invocation
- Read by `src/api.ts` `readActivityEvents()` and merged into `/api/audit` response
- Capped to last 500 lines when reading (unbounded write, bounded read)

**SOUL.md Loading:**
- Loaded by `container/agent-runner/src/index.ts` at startup
- Combined with `global/CLAUDE.md` (if non-main)
- Appended to Claude Code system prompt
- Example groups: `keb-ops` (retail operations), `personal` (general assistant)

---

## 5. SKILLS SYSTEM

### Skills Engine (`skills-engine/`)
- `apply.ts` - Apply skill manifest (add/modify files)
- `manifest.ts` - Parse YAML manifest
- `structured.ts` - Structured skills (add/modify/tests sections)
- `uninstall.ts` - Remove installed skills
- `update.ts` - Pull upstream, merge customizations
- `rebase.ts` - Rebase customizations onto new upstream

### Host Skills (`.claude/skills/`)

| Skill | Purpose | Triggers |
|-------|---------|----------|
| `/setup` | Full installation | First-time setup, deps, auth, service |
| `/customize` | Interactive customization | Add channels, integrations, behavior changes |
| `/update` | Upstream sync | Pull changes, merge customizations, migrations |
| `/debug` | Troubleshooting | Container issues, logs, common problems |
| `/add-gmail` | Gmail integration | Tool or channel mode |
| `/add-telegram` | Telegram channel | Replace or supplement WhatsApp |
| `/add-telegram-swarm` | Agent Swarm for Telegram | Multi-bot group support |
| `/add-discord` | Discord channel | Discord integration |
| `/add-voice-transcription` | Whisper transcription | Voice note support |
| `/convert-to-apple-container` | Apple Container switch | macOS native containers |
| `/x-integration` | X (Twitter) integration | Post, like, reply, retweet |
| `/get-qodo-rules` | Qodo rules loader | Load coding standards |
| `/qodo-pr-resolver` | Qodo PR reviewer | Fetch and fix PR issues |

---

## 6. CONFIGURATION

### Environment Variables (`.env`)
```
# Slack Bot Tokens
SLACK_BOT_TOKEN=xoxb-...               # Production Bot User OAuth Token (Intel Mac)
SLACK_APP_TOKEN=xapp-...               # Production App-Level Token (Intel Mac)
DEV_SLACK_BOT_TOKEN=xoxb-...           # Development Bot Token (M1 Mac)
DEV_SLACK_APP_TOKEN=xapp-...           # Development App Token (M1 Mac)

# Assistant Configuration
ASSISTANT_NAME=StellarBot                    # Trigger word
ASSISTANT_HAS_OWN_NUMBER=true          # Always true for Slack bots

# Container Configuration
CONTAINER_IMAGE=nanoclaw-agent:latest  # Container image name
CONTAINER_TIMEOUT=1800000              # 30min max runtime
IDLE_TIMEOUT=1800000                   # 30min idle timeout
MAX_CONCURRENT_CONTAINERS=5            # Concurrency limit (2 for Intel Mac)

# Other Settings
LOG_LEVEL=info                         # Pino log level
TZ=Africa/Johannesburg                 # Timezone for tasks
ANTHROPIC_API_KEY=sk-ant-...           # API key auth
CLAUDE_CODE_OAUTH_TOKEN=...            # OAuth auth
```

### Service Management

**macOS (launchd):**
```bash
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # restart
```

**Linux (systemd):**
```bash
systemctl --user start nanoclaw
systemctl --user stop nanoclaw
systemctl --user restart nanoclaw
systemctl --user status nanoclaw
```

---

## 7. ARCHITECTURE PATTERNS

### Startup Sequence
1. `main()` → init DB, load state
2. Create channels → connect
3. Start IPC watcher (1s)
4. Start scheduler (60s)
5. Start message loop (2s)
6. Recover pending messages

### Message Processing
1. **Inbound:** Channel → `onMessage` → `storeMessage(db)`
2. **Poll:** `getNewMessages()` → filter trigger/registration
3. **Queue:** `enqueueMessageCheck()` → check concurrency
4. **Execute:** Spawn container, stream output, advance cursor
5. **Outbound:** Strip internal tags → prefix name → send

### Follow-up Messages
1. New message during active container
2. `queue.sendMessage()` → write IPC file
3. Container polls IPC → parse → pipe to MessageStream
4. Agent processes in same session
5. Result streamed back

### Task Execution
1. Scheduler poll → `getDueTasks()`
2. `queue.enqueueTask()`
3. Spawn container with `isScheduledTask: true`
4. Stream output → send result
5. Log run, calculate next_run

### IPC Processing
1. Poll 1s → scan `data/ipc/{groupFolder}/{messages,tasks}/`
2. Parse JSON, authorize
3. Execute (send message, task CRUD, group registration)
4. Delete processed files

---

## 8. SECURITY MODEL

### Container Isolation
- OS-level (Linux containers)
- Filesystem: Only mounted paths visible
- User: Non-root (uid 1000)
- Network: Full internet (WebSearch, agent-browser)

### Mount Security
- Allowlist: `~/.config/nanoclaw/mount-allowlist.json`
- Validation: Path expansion, symlink resolution, pattern blocking
- Enforcement: Main can have rw, others forced ro

### IPC Authorization
- Main: Send/schedule for any group, register groups
- Others: Send/schedule only for self

### Secret Handling
- Storage: `.env` (gitignored)
- Transmission: Stdin JSON (temp file deleted)
- SDK: Secrets only in SDK env, not `process.env`
- Bash: Strip keys from subprocess env

---

## 9. PROJECT STRUCTURE

```
nanoclaw/
├── src/                          # Main application
│   ├── index.ts                  # Orchestrator (entry point)
│   ├── config.ts                 # Configuration
│   ├── db.ts                     # SQLite
│   ├── channels/slack.ts         # Slack channel
│   ├── container-runner.ts       # Agent spawner
│   ├── group-queue.ts            # Concurrency
│   ├── ipc.ts                    # IPC watcher
│   └── task-scheduler.ts         # Scheduler
├── container/                    # Container image
│   ├── Dockerfile                # Image definition
│   ├── agent-runner/             # Container-side agent
│   │   ├── src/index.ts          # Query loop
│   │   └── src/ipc-mcp-stdio.ts  # MCP server
│   └── skills/agent-browser/     # Browser skill
├── .claude/skills/               # Host skills (15)
├── skills-engine/                # Skills engine
├── setup/                        # Setup system
├── groups/                       # Group data (isolated)
│   ├── global/CLAUDE.md          # Shared memory (ro)
│   ├── keb-ops/                  # KEB Ops channel
│   │   ├── SOUL.md               # Retail ops personality
│   │   ├── CLAUDE.md             # Memory
│   │   └── conversations/        # Archives
│   ├── personal/                 # Personal channel
│   │   ├── SOUL.md               # General assistant personality
│   │   ├── CLAUDE.md             # Memory
│   │   └── conversations/        # Archives
│   └── main/                     # Main group
│       ├── CLAUDE.md             # Memory
│       └── conversations/        # Archives
├── data/                         # Runtime data
│   ├── ipc/{groupFolder}/        # Per-group IPC
│   └── sessions/{groupFolder}/   # Per-group .claude
├── store/                        # Persistent state
│   ├── backups/                  # Database backups (deploy.sh)
│   └── messages.db               # Database
├── logs/                         # Application logs
├── docs/                         # Documentation
├── SLACK_SETUP.md                # Slack bot setup guide
├── INTEL_SETUP.md                # Intel Mac production setup
├── deploy.sh                     # Deployment script (git pull, backup, restart)
├── package.json
└── .env                          # Secrets (gitignored)
```

---

## 10. DEVELOPMENT COMMANDS

```bash
# Development
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container

# Service (macOS)
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl kickstart -k gui/$(id -u)/com.nanoclaw

# Service (Linux)
systemctl --user restart nanoclaw
systemctl --user status nanoclaw

# Container cleanup
docker ps -a | grep nanoclaw
docker stop $(docker ps -q --filter name=nanoclaw)
```

---

## 11. KEY INSIGHTS

### Why It's Fast
- **Polling:** 2s message loop (vs webhook latency)
- **Streaming:** Results stream as agent generates
- **Concurrency:** 5 parallel groups
- **Isolation:** No shared state between groups

### Why It's Secure
- **Container isolation:** OS-level, not app-level
- **Mount validation:** External allowlist, tamper-proof
- **Secret handling:** Never written to disk, stripped from subprocesses
- **IPC authorization:** Main/other permission model

### Why It's Small
- **35k tokens:** Entire codebase fits in context
- **No frameworks:** Direct libraries (Baileys, better-sqlite3)
- **Skills-based:** Extensions via skills, not core bloat
- **Single process:** One Node process, no microservices

### Why It's Customizable
- **Skills engine:** Add features without core changes
- **Group isolation:** Different behavior per group
- **CLAUDE.md:** Per-group memory and instructions
- **Readable code:** TypeScript, clear patterns, well-documented

---

## 12. ANTI-PATTERNS TO AVOID

❌ **Don't:**
- Add configuration sprawl (modify code instead)
- Create abstractions for hypothetical features
- Add frameworks or heavy dependencies
- Build for multi-user (it's designed for one)
- Bypass security (mount validation, IPC authorization)

✅ **Do:**
- Keep codebase under 40k tokens
- Use skills for extensions
- Follow existing patterns
- Test with direct invocation where possible
- Update this index when making changes

---

**End of Index**
