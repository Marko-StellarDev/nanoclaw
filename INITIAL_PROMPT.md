I have forked NanoClaw (https://github.com/qwibitai/nanoclaw) and 
I want to build a custom personal AI operations assistant. 

FIRST - before doing anything else:
Please index the entire codebase. Create a compact index of all 
files, their purpose, key functions, and how they connect to each 
other. Save this as CODEBASE_INDEX.md in the root. Use this index 
as your primary reference throughout our sessions rather than 
re-reading full files each time. This will save tokens and make 
you faster.

Once indexed, confirm you understand the architecture, then we begin.

Here is my full context:

ABOUT ME:
- I'm a Retail Operations Specialist at KEB Stores, a South African 
  retail chain
- I conduct branch audits across Cape Town DC, Caledon, Boksburg, 
  Cloverdene, Fourways, Bloemfontein, Witbank
- I specialise in inventory management, stock adjustment analysis, 
  phantom stock investigation using IQ Retail as our inventory system
- I have a software development background in Angular and Firebase

TWO MACHINE SETUP - IMPORTANT:
- Machine 1 (THIS MACHINE - DEVELOPMENT): 
  M1 MacBook Pro - use Apple Container (not Docker)
  This is where all development and testing happens
  Uses a separate DEV Slack workspace/token for testing
  
- Machine 2 (PRODUCTION/ALWAYS-ON):
  2016 Intel MacBook Pro i5 - uses Docker Desktop (2 CPU / 4GB limit)
  This machine runs the assistant 24/7 via launchd
  Uses the live production Slack token
  Deployed via git pull from the same repo

CRITICAL FOR CONTAINERS:
- Write all container configs to be multi-arch compatible
- Must work on Apple Container arm64 (M1 dev machine) AND 
  Docker amd64 (Intel production machine)
- Use multi-arch base images throughout (e.g. node:22 not 
  node:22-alpine which can have arch issues)
- Never hardcode architecture-specific dependencies

MESSAGING CHANNEL - SLACK:
- NOTE: Slack was chosen over Telegram (original plan) because 
  it better fits existing workflow. The Telegram integration 
  should be noted as a future option in code comments in case 
  I want to switch back later.
- Use Slack as the sole messaging channel (Bolt SDK)
- Replace NanoClaw's WhatsApp/Baileys layer entirely with Slack
- Channel structure:
  #andy-personal = my private personal channel (DM or private channel)
  #andy-keb = KEB Ops work channel
- Each Slack channel maps to an isolated NanoClaw group with its 
  own container, CLAUDE.md, filesystem, and SOUL.md
- Slack app setup: I will provide SLACK_BOT_TOKEN and 
  SLACK_APP_TOKEN when ready - document exactly what I need 
  to configure in Slack's developer portal
- Support two token modes:
  DEV_SLACK_BOT_TOKEN + DEV_SLACK_APP_TOKEN = used on M1 for testing
  SLACK_BOT_TOKEN + SLACK_APP_TOKEN = used on Intel Mac for production
- Trigger word should remain configurable (default @StellarBot)
- Use Socket Mode for Slack (no public URL needed - works on 
  local machine without exposing ports)

1. SOUL.md FILES (Phase 1 - do this first)
   - Create a KEB-specific SOUL.md for the KEB Ops channel
   - Create a personal SOUL.md for my private channel
   - KEB agent should be: direct, analytical, no fluff, focused on 
     stock variance detection and retail operations
   - KEB SOUL.md must include context about: branch names (Cape Town DC, 
     Caledon, Boksburg, Cloverdene, Fourways, Bloemfontein, Witbank), 
     IQ Retail system, phantom stock patterns, high-value watch products
   - Inject SOUL.md into the system prompt at agent startup per group

2. SLACK INTEGRATION + KEB vs PERSONAL SEPARATION (Phase 1)
   - Implement full Slack integration using Bolt SDK with Socket Mode
   - #andy-personal = personal channel (isolated container + SOUL.md)
   - #andy-keb = KEB Ops channel (isolated container + SOUL.md)
   - Each channel completely isolated: container, CLAUDE.md, filesystem
   - Add code comments where Telegram could be swapped in as 
     an alternative channel in future

3. PERSISTENT MEMORY ENHANCEMENT (Phase 2)
   - Extend the basic CLAUDE.md approach with auto-summarisation
   - Add structured memory sections: ongoing tasks, key facts, decisions
   - Implement a /compact command that summarises and compresses 
     conversation history into CLAUDE.md
   - Memory should persist correctly across agent restarts

4. TOKEN OPTIMISATION (Phase 3)
   - Use Anthropic SDK directly throughout - no model switching providers
   - Default model: claude-sonnet-4-6 for most tasks
   - Use claude-opus-4-6 only for complex multi-step audit reasoning 
     and Agent Swarms - triggered explicitly, not automatically
   - Use claude-haiku-4-5 for simple quick lookups and status checks
   - Context pruning: automatically trim old conversation history 
     before hitting context window limits
   - Keep CLAUDE.md and SOUL.md files lean and within size limits
   - Implement prompt caching for system prompts and SOUL.md content 
     that repeats every message
   - Per-group token budgets to prevent runaway costs
   - Usage tracking so I can see spend per group

5. BROWSER SUPPORT (Phase 4)
   - Create a /add-browser skill following NanoClaw's skills pattern
   - Install Playwright + Chromium inside the container
   - Expose these tools to the agent: navigate, page snapshot, 
     click element, fill form, fetch page content
   - Must work on both Apple Container (M1) and Docker (Intel Mac)
   - Use multi-arch compatible Chromium build

6. WEB UI DASHBOARD (Phase 5)
   - Expose a lightweight REST API from NanoClaw's main Node process
   - API should surface: message history, agent activity, scheduled 
     tasks, group status, token usage per group
   - Build an Angular frontend (I know Angular well)
   - KEB-specific views: branch status, audit report history, 
     variance alerts
   - Dashboard should be accessible from both machines on local network

TESTING APPROACH:
   - Use direct agent invocation (no Slack) for unit testing 
     where possible
   - NanoClaw already has vitest configured - use it for skill tests
   - Test each phase before moving to the next
   - For Slack testing use DEV_SLACK_BOT_TOKEN on M1 in a 
     separate dev Slack workspace
   - Never use production Slack tokens during development

DEPLOYMENT WORKFLOW:
   - All development happens on M1 MacBook (this machine)
   - Changes pushed to GitHub via git push
   - Intel Mac deploys via git pull + service restart
   - Create a deploy.sh script that handles the Intel Mac 
     deployment automatically:
     git pull
     npm install
     restart launchd service
   - Document the one-time Intel Mac setup steps in INTEL_SETUP.md

TECHNICAL CONSTRAINTS:
- M1 dev: Apple Container (arm64)
- Intel production: Docker Desktop (amd64, 2 CPU / 4GB RAM limit)
- All containers must be multi-arch compatible (arm64 + amd64)
- Node 22
- TypeScript throughout (matches NanoClaw's codebase)
- Anthropic SDK only - no third party AI providers
- Slack Bolt SDK for messaging layer
- Follow NanoClaw's existing patterns - don't add unnecessary abstraction
- Keep the codebase small and auditable - that's why I chose NanoClaw

IMPORTANT PHILOSOPHY:
- New capabilities should be added as skills where possible 
  (e.g. /add-browser) not baked into core
- No configuration sprawl - if I want different behaviour I'll 
  modify code
- Keep it working for one user (me) not a generic framework
- The codebase must stay small enough that I can understand it
- Update CODEBASE_INDEX.md as you make changes so it stays 
  accurate for future sessions

Please start by:
1. Indexing the full codebase and creating CODEBASE_INDEX.md
2. Confirming you understand the architecture and what we're building
3. Confirming the multi-arch container approach is clear
4. Flagging any conflicts between NanoClaw's WhatsApp-native design 
   and our Slack swap
5. Noting where Telegram hooks could be added in future as comments
6. Then beginning Phase 1: SOUL.md files and Slack integration

Ask me any clarifying questions before you start coding.