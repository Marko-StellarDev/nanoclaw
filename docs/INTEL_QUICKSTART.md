# Production Setup — Ubuntu Desktop on Intel Mac

Getting StellarBot running on Ubuntu 24.04 LTS Desktop (Intel Mac). Two phases: manual prerequisites, then hand off to Claude Code.

---

## Phase 1 — Manual (Terminal on Ubuntu)

### 1. Install Ubuntu 24.04 LTS Desktop

Download the ISO from https://ubuntu.com/download/desktop and flash it to a USB drive (use Balena Etcher on your M1).

Boot the Intel Mac from USB: hold **Option** at startup, select the USB drive.

During install:
- Check **"Install third-party software for graphics and Wi-Fi"** — this handles Broadcom Wi-Fi automatically
- Create user `marko` (or whatever you prefer — just be consistent)
- Enable **automatic login** if this will be a headless-ish machine

After install, open **Terminal** (Ctrl+Alt+T).

---

### 2. Install Docker

No Docker Desktop needed on Linux — just the engine:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

**Log out and back in** (or reboot) so the group membership takes effect. Then verify:

```bash
docker ps  # should show empty list, no "permission denied"
```

---

### 3. Install Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # should print v22.x.x
```

---

### 4. Install Git and clone the repo

```bash
sudo apt-get install -y git
cd ~
git clone https://github.com/YOUR_USERNAME/nanoclaw.git
cd nanoclaw
```

---

### 5. Create the `.env` file

```bash
nano .env
```

Paste in (fill in your real values):

```
SLACK_BOT_TOKEN=xoxb-YOUR_PRODUCTION_BOT_TOKEN
SLACK_APP_TOKEN=xapp-YOUR_PRODUCTION_APP_TOKEN
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY
ASSISTANT_NAME=StellarBot
TZ=Africa/Johannesburg
MAX_CONCURRENT_CONTAINERS=2
```

Save: `Ctrl+O`, `Enter`, `Ctrl+X`.

```bash
chmod 600 .env
```

---

### 6. Install Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

---

## Phase 2 — Claude Code Session

Open Terminal and start Claude Code in the project directory:

```bash
cd ~/nanoclaw
claude
```

---

### Step 1 — Run setup

**Say exactly:**
```
/setup
```

Claude Code will run preflight checks automatically. Let it work through them.

---

### Step 2 — Container runtime question

When asked which container runtime to use:

**Say:**
```
Docker
```

---

### Step 3 — Claude authentication

When asked about Claude authentication method:

**Say:**
```
API key
```

Then paste your `ANTHROPIC_API_KEY` when prompted (or confirm it's already in `.env`).

---

### Step 4 — Skip WhatsApp auth

The setup skill may ask about WhatsApp authentication — this project uses **Slack**, not WhatsApp. If it comes up:

**Say:**
```
Skip WhatsApp — this project uses Slack. The tokens are already in the .env file. Please proceed to channel registration.
```

---

### Step 5 — Channel registration

Get your Slack channel ID first: in Slack, right-click your KEB ops channel → **View channel details** → scroll to the bottom — it shows `Channel ID: C0123ABCDEF`.

Then say:

```
Register the keb-ops group with my production Slack channel. Channel ID is C0123ABCDEF, folder is keb-ops, no trigger prefix required, assistant name is StellarBot.
```

*(Replace `C0123ABCDEF` with your actual channel ID.)*

---

### Step 6 — Start the service

When setup asks about starting the background service:

**Say:**
```
Yes, set up the systemd service to start on boot
```

The `/setup` skill detects Linux automatically and uses systemd instead of launchd.

---

### Step 7 — Watchdog

Once the main service is running:

**Say:**
```
Set up the watchdog on Linux using a systemd timer. The watchdog script is at scripts/watchdog.sh and should run every 5 minutes.
```

---

## Phase 3 — Verify

Once everything is set up, say:

```
Check service status and show me the last 20 lines of the log
```

Then go to Slack and send a message in your KEB ops channel. You should get a response within a few seconds.

If no response after 30 seconds, say:

```
The bot isn't responding to Slack messages. Check the logs and diagnose what's wrong.
```

---

## Phase 4 — Register Personal Channel (Optional)

Get that channel ID from Slack the same way, then say:

```
Register the personal group. Channel ID is C0123XXXXXX, folder is personal, no trigger prefix required, assistant name is StellarBot.
```

---

## Quick Reference (day-to-day)

```bash
# Restart bot
systemctl --user restart nanoclaw

# Stop bot
systemctl --user stop nanoclaw

# Start bot
systemctl --user start nanoclaw

# Watch logs live
journalctl --user -u nanoclaw -f
# or
tail -f ~/nanoclaw/logs/nanoclaw.log

# Deploy an update pushed from M1
cd ~/nanoclaw && ./deploy.sh
```

---

## If Things Go Wrong

**Docker permission denied after install:**
```bash
# Make sure you logged out and back in after: sudo usermod -aG docker $USER
# Or run: newgrp docker
```

**Container build fails:**
```
The container build failed. Prune the Docker builder and do a clean rebuild.
```

**Service won't start:**
```
The systemd service won't start. Check the unit file, the Node.js path, and the journal logs to diagnose.
```

**Bot connects to Slack but doesn't respond:**
```
The bot connects but isn't responding to messages in the keb-ops channel. Check the channel registration in the database and the trigger settings.
```

**Wi-Fi not working after install:**
```bash
sudo ubuntu-drivers autoinstall
sudo reboot
```
