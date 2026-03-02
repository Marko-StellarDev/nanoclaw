# NanoClaw Project Status

**Last Updated:** 2026-03-02 (Session 5 Complete)
**Session Recovery Document** - Read this first when reopening terminal

---

## ⚡ CURRENT STATE — ALL PHASES COMPLETE ✅

**StellarBot is fully operational.**

### What's Running
- Slack bot live via Socket Mode — **no @mention required**, responds to all messages
- `#testing` registered as `keb-ops` group — KEB Ops SOUL.md active
- Main DM (`slack:D0AHNS5EP2P`) registered as `main` group
- REST API on `:3001` — live and responding
- Angular UI on `:4200` — Dashboard (chat input + live status), KEB Ops, Tasks (controls + create form), Audit Log

### When You Open Terminal Next Time
1. Check if bot is still running: `ps aux | grep "src/index.ts"`
2. If not, restart: `npm run dev`
3. UI is optional — `cd ui && npm start` (http://localhost:4200)
4. **Do NOT start a background bot** — it will steal port 3001 from your terminal bot

---

## QUICK CONTEXT

**User:** Marko — Retail Operations Specialist at KEB Stores (South Africa)
**Use Case:** Personal AI operations assistant for retail audits and personal tasks
**Original Repo:** Forked from https://github.com/qwibitai/nanoclaw

### Two Machine Setup
1. **M1 MacBook Pro (Development/This Machine)**
   - Apple Container (arm64)
   - `DEV_SLACK_BOT_TOKEN` + `DEV_SLACK_APP_TOKEN`

2. **Intel MacBook Pro i5 2016 (Production/Always-On)**
   - Docker Desktop (amd64, 2 CPU / 4GB RAM limit)
   - `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN`
   - Runs 24/7 via launchd
   - Deploy with `./deploy.sh`

### Registered Groups
| JID | Name | Folder | Trigger |
|-----|------|--------|---------|
| `slack:D0AHNS5EP2P` | Main DM | `main` | `@StellarBot` (no trigger req) |
| `slack:C0AHDPW926B` | #testing | `keb-ops` | `@StellarBot` |

---

## COMPLETED PHASES ✅

### Phase 1: Slack Integration
- ✅ Replaced WhatsApp/Baileys with Slack Bolt SDK (Socket Mode)
- ✅ `src/channels/slack.ts` — two-token dev/prod mode, multi-arch
- ✅ **Bug fixed:** `app_mention` strips `<@U...>` before trigger check
  - Fix: `handleMessage(event, isMention=false)` — prepends `@StellarBot` when mention
- ✅ SOUL.md files created for `keb-ops` and `personal` groups
- ✅ End-to-end tested: message → container → response

### Phase 2: Persistent Memory
- ✅ Structured CLAUDE.md templates (keb-ops + personal): Ongoing Tasks, Key Facts, Recent Decisions, Recent Sessions
- ✅ `groups/global/CLAUDE.md` — memory management instructions, `/compact` instructions, Slack formatting rules
- ✅ PreCompact hook: auto-appends session summary to CLAUDE.md "Recent Sessions" (keeps last 10)
- ✅ `/compact` works via existing file tools — no new MCP tool needed

### Phase 3: Token Optimisation
- ✅ Default model: `claude-sonnet-4-6` via `ANTHROPIC_MODEL` in sdkEnv
- ✅ Model constants in `src/config.ts`: `MODEL_DEFAULT`, `MODEL_COMPLEX` (opus), `MODEL_FAST` (haiku)
- ✅ Usage tracking: token counts from SDK result messages, written to `groups/{folder}/.usage/YYYY-MM.json`
- ✅ Budget warning at 500k tokens/month (configurable via `MONTHLY_TOKEN_BUDGET`)
- ✅ `groups/global/CLAUDE.md` updated: agent knows usage file location

### Phase 4: Browser Support (was already baked in)
- ✅ `container/Dockerfile` installs Chromium + `agent-browser` globally
- ✅ `container/skills/agent-browser/SKILL.md` documents usage
- ✅ Works on both arm64 (M1) and amd64 (Intel)

### Phase 5: Web UI Dashboard
- ✅ `src/api.ts` — REST API (Node built-in `http`, zero new deps), port 3001
- ✅ `src/db.ts` — added `getRecentMessages(folder, limit)` for API
- ✅ Endpoints: `/api/health`, `/api/groups`, `/api/groups/:folder/messages`, `/api/groups/:folder/usage`, `/api/groups/:folder/tasks`, `/api/tasks`
- ✅ Angular 17 standalone app in `ui/`
- ✅ Dashboard page — all groups, recent messages, usage bars
- ✅ KEB Ops page — 7 branches, token usage stats, tasks, message history
- ✅ Tasks page — all tasks across groups
- ✅ Dev proxy: `ui/proxy.conf.json` → `/api` → `:3001`
- ✅ **Start with `cd ui && npm start`** (NOT `npx ng serve` — proxy won't load)

---

## SESSION 4 ADDITIONS ✅ (2026-03-02)

### Security Audit
- ✅ Path traversal fixed: `isValidGroupFolder()` validation on `:folder` URL param
- ✅ Month param validated against `YYYY-MM` pattern
- ✅ CORS changed from `*` to `http://localhost:4200` (wildcard when `API_HOST=0.0.0.0`)
- ✅ API bind changed from `0.0.0.0` to `127.0.0.1` (LAN access via `API_HOST` env var)

### INITIAL_PROMPT Gap Fixes
- ✅ Added Telegram swap comments to `src/channels/slack.ts`
- ✅ Added haiku model option to `groups/global/CLAUDE.md`
- ✅ Fixed `CODEBASE_INDEX.md` stale references (WhatsApp flow, whatsapp-auth.ts)
- ✅ Added `API_HOST` env var to `.env.example` with security note

### UI Fixes
- ✅ Bot responses stored in DB: `storeMessageDirect()` called after `channel.sendMessage()`
- ✅ Usage tracking: `updateMonthlyUsage()` moved inside query loop (survives SIGKILL)
- ✅ Container rebuilt and session copies updated

### Remove @mention Requirement
- ✅ `src/channels/slack.ts`: `message` event processes ALL messages (not just DMs)
- ✅ Dedup Set `recentMentionTs` prevents double-processing @mentions (10s auto-expire)
- ✅ DB: both groups set to `requires_trigger = 0`

### Audit Log UI
- ✅ `src/db.ts`: `AuditEvent` interface + `getAuditEvents(limit, folder?)` — SQL UNION of messages + task_run_logs
- ✅ `src/api.ts`: `/api/audit?limit=N&group=folder` endpoint
- ✅ `ui/.../audit/audit.component.ts`: chronological table, group filter, 5s live refresh, row tints, type badges
- ✅ `/audit` route + sidebar link added

### Activity Log (Tool-Use Visibility)
- ✅ `container/agent-runner/src/index.ts`: `createActivityLogHook()` — fires for every tool call, appends JSONL to `groups/{folder}/.activity.jsonl`
- ✅ `describeToolUse()` generates human-readable descriptions: "Searching web: Dubai weather", "Fetching: https://..."
- ✅ `src/api.ts`: `readActivityEvents()` reads `.activity.jsonl`, merges with DB events in `/api/audit`
- ✅ Audit UI: activity rows show muted/italic with tool emoji + tool name badge

---

## FILE STRUCTURE

```
nanoclaw/
├── src/
│   ├── index.ts              # Orchestrator — starts API + message loop
│   ├── api.ts                # REST API (Phase 5)
│   ├── channels/slack.ts     # Slack Bolt, Socket Mode, mention fix
│   ├── config.ts             # MODEL_DEFAULT, MODEL_COMPLEX, MODEL_FAST
│   ├── db.ts                 # SQLite — getRecentMessages() added
│   ├── container-runner.ts   # Agent spawner — passes model to container
│   └── task-scheduler.ts     # Scheduled tasks
├── container/
│   ├── Dockerfile            # Multi-arch, Chromium + agent-browser
│   └── agent-runner/src/
│       ├── index.ts          # Model env, usage tracking, PreCompact hook
│       └── ipc-mcp-stdio.ts  # MCP tools
├── groups/
│   ├── global/CLAUDE.md      # Shared: Slack formatting, memory, usage docs
│   ├── keb-ops/
│   │   ├── SOUL.md           # KEB Ops personality (direct, analytical)
│   │   └── CLAUDE.md         # Structured memory template
│   ├── personal/
│   │   ├── SOUL.md           # Personal assistant personality
│   │   └── CLAUDE.md         # Structured memory template
│   └── main/                 # Main DM group
├── ui/                       # Angular 17 dashboard
│   ├── proxy.conf.json       # /api → localhost:3001
│   ├── src/app/
│   │   ├── services/api.service.ts
│   │   └── pages/
│   │       ├── dashboard/    # All groups overview
│   │       ├── keb/          # KEB Ops detail
│   │       ├── tasks/        # All scheduled tasks
│   │       └── audit/        # Audit log (messages + tasks + tool activity)
├── CODEBASE_INDEX.md         # Architecture reference
├── SLACK_SETUP.md            # Slack bot setup guide
├── INTEL_SETUP.md            # Production deployment guide
└── deploy.sh                 # Intel Mac deployment script
```

---

## KNOWN GOTCHAS

### Port 3001 conflict
If you accidentally start a second bot instance (e.g. via Claude Code background process), it steals port 3001. The second instance silently loses the API and keeps running without it.
- Symptom: dashboard shows "Cannot reach API on :3001"
- Fix: kill all bot instances (`pkill -f "src/index.ts"`), then `npm run dev`

### UI must use `npm start` not `npx ng serve`
`npm start` includes `--proxy-config proxy.conf.json`. Without the proxy, `/api` calls go nowhere.

### Container agent-runner local build errors
Pre-existing — `@anthropic-ai/claude-agent-sdk` only installs inside Docker, not locally.
Container build (`./container/build.sh`) works correctly.

---

## TECHNICAL CONSTRAINTS

- **M1 dev:** Apple Container (arm64)
- **Intel prod:** Docker Desktop (amd64, 2 CPU / 4GB RAM)
- All containers must be multi-arch compatible
- Node 22, TypeScript throughout
- Anthropic SDK only — no third-party AI providers
- Slack Bolt SDK for messaging
- Keep codebase small and auditable

---

## PHILOSOPHY

> "New capabilities should be added as skills where possible — not baked into core"

> "No configuration sprawl — if I want different behaviour I'll modify code"

> "Keep it working for one user (me), not a generic framework"

> "The codebase must stay small enough that I can understand it"

> "Update CODEBASE_INDEX.md as you make changes so it stays accurate for future sessions"

---

## KEY ENVIRONMENT VARIABLES

```bash
# Development (M1)
DEV_SLACK_BOT_TOKEN=xoxb-...
DEV_SLACK_APP_TOKEN=xapp-...

# Production (Intel)
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...

# Shared
ASSISTANT_NAME=StellarBot
ANTHROPIC_API_KEY=sk-ant-api03-...
CONTAINER_IMAGE=nanoclaw-agent:latest
MAX_CONCURRENT_CONTAINERS=5       # 2 for Intel Mac
TZ=Africa/Johannesburg
LOG_LEVEL=info
MONTHLY_TOKEN_BUDGET=500000
```

---

## TROUBLESHOOTING

### Bot not responding
```bash
ps aux | grep "src/index.ts"   # is it running?
npm run dev                     # restart if not
```

### Dashboard "Cannot reach API"
```bash
pkill -f "src/index.ts"        # kill all instances
npm run dev                     # clean restart
```

### Container issues (M1)
```bash
pgrep -f "nanoclaw-agent"
./container/build.sh           # rebuild if needed
```

### Container issues (Intel)
```bash
docker ps
docker images | grep nanoclaw
./deploy.sh                    # full redeploy
```

### Build fails
```bash
npm install && npm run build
```

---

## SESSIONS LOG

### Session 1 (2026-03-01)
- Created CODEBASE_INDEX.md, migrated WhatsApp → Slack
- Created SLACK_SETUP.md, INTEL_SETUP.md, deploy.sh
- Multi-arch container support verified, build passing

### Session 2 (2026-03-01)
- Fixed ESM import issue with @slack/bolt
- Built Docker container image
- Fixed env var loading, registered Main DM in DB
- StellarBot live and responding on Slack

### Session 3 (2026-03-02)
- Phase 1D: registered #testing as keb-ops, fixed app_mention trigger bug
- Phase 2: structured CLAUDE.md templates, PreCompact auto-summary hook
- Phase 3: model selection, usage tracking, budget warnings
- Phase 4: confirmed already complete (browser baked into container)
- Phase 5: REST API (src/api.ts) + Angular 17 UI (ui/) — dashboard live
- Fixed port 3001 conflict (background vs terminal bot)
- Fixed Angular proxy (must use `npm start` not `npx ng serve`)

### Session 4 (2026-03-02)
- Security audit: path traversal fix, CORS restrict, 127.0.0.1 bind, API_HOST opt-in
- Gap analysis: Telegram swap comments, haiku in global CLAUDE.md, stale index fixes
- UI: bot responses in DB, usage tracking fixed (moved inside query loop)
- Removed @mention requirement: all messages processed, dedup for @mentions
- Added Audit Log UI page with live auto-refresh
- Added tool-use activity logging: .activity.jsonl hook + API merge + UI display

### Session 5 (2026-03-02)
- Chat input per group on Dashboard (Enter to send, Shift+Enter newline, optimistic UI)
- Live agent status: src/agent-status.ts + GroupQueue integration + pulsing dot + typing animation
- Task controls: pause/resume/cancel buttons on every task row
- Task creation form: "+ New Task" with group, schedule type/value, context mode, prompt
- New API endpoints: GET /api/status, POST /api/groups/:folder/message, POST/DELETE /api/tasks/*

---

**END OF PROJECT STATUS**
