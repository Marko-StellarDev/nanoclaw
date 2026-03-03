# Production Setup — Ubuntu Server 24.04 LTS on Intel MacBook Pro 13" (2016)

**Hardware:** MacBook Pro 13" 2016 — Core i5 2.3GHz, 8GB RAM, 512GB SSD
**OS:** Ubuntu Server 24.04 LTS (no desktop — lighter, more RAM for containers)
**Role:** Headless production server, SSH-managed from M1 Mac

Two phases: manual prerequisites (at the Intel Mac), then hand off to Claude Code.

---

## Phase 1 — Manual (at the Intel Mac, lid open for install — ~15 min, then SSH forever)

### 1. Install Ubuntu Server 24.04 LTS

Download the **Server** ISO (not Desktop) from https://ubuntu.com/download/server and flash to USB with Balena Etcher on your M1.

Do the install with the **MacBook lid open** — the built-in screen and keyboard are all you need. No external monitor required. Once SSH is set up you'll never need a screen again.

Boot the Intel Mac from USB: hold **Option** at startup, select the USB drive.

During install:
- Choose **Ubuntu Server (minimized)** — even lighter footprint
- **Network:** connect ethernet for install (Wi-Fi driver installs later if needed)
- **Storage:** use the full 512GB disk, guided LVM is fine
- Create user **`marko`** with a password you'll remember
- When asked about **OpenSSH server** — check **Install OpenSSH server** (required for remote access)
- Skip snaps (select Done without choosing any)

After install the machine reboots into a terminal login prompt — no GUI, that's correct.

---

### 2. Log in and get the IP address

Log in with username `marko` and your password. Then:

```bash
ip addr show | grep "inet " | grep -v 127.0.0.1
```

Note the IP address (e.g. `192.168.1.50`). From this point on you can SSH in from your M1 and close the monitor/keyboard:

```bash
# On your M1 Mac
ssh marko@192.168.1.50
```

---

### 3. Disable lid-close suspend

Without this, closing the MacBook lid will suspend the machine and kill the bot.

```bash
sudo nano /etc/systemd/logind.conf
```

Find and uncomment (or add) these three lines — change `suspend` to `ignore`:

```
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
```

Save: `Ctrl+O`, `Enter`, `Ctrl+X`. Apply immediately:

```bash
sudo systemctl restart systemd-logind
```

You can now close the lid and the machine keeps running.

---

### 4. Install Docker Engine

No Docker Desktop on Linux — just the engine:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

**Log out and back in** (or reboot) so the group membership takes effect:

```bash
exit
# SSH back in
ssh marko@192.168.1.50
```

Verify:

```bash
docker ps  # should show empty list, no "permission denied"
```

---

### 5. Install Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # should print v22.x.x
npm --version
```

---

### 6. Install nginx

nginx will serve the built Angular UI statically on port 80 — no Node dev server needed in production.

```bash
sudo apt-get install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

Verify: `curl http://localhost` — should return the default nginx page.

---

### 7. Install Git and clone the repo

```bash
sudo apt-get install -y git
cd ~
git clone https://github.com/YOUR_USERNAME/nanoclaw.git
cd nanoclaw
```

---

### 8. Create the `.env` file

```bash
nano ~/nanoclaw/.env
```

Paste in (fill in your real values):

```
SLACK_BOT_TOKEN=xoxb-YOUR_PRODUCTION_BOT_TOKEN
SLACK_APP_TOKEN=xapp-YOUR_PRODUCTION_APP_TOKEN
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY
ASSISTANT_NAME=StellarBot
TZ=Africa/Johannesburg
MAX_CONCURRENT_CONTAINERS=2
API_HOST=127.0.0.1
```

Save: `Ctrl+O`, `Enter`, `Ctrl+X`.

```bash
chmod 600 ~/nanoclaw/.env
```

---

### 9. Install Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

---

## Phase 2 — Claude Code Session (SSH from M1 or directly on Intel Mac)

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

Claude Code runs preflight checks automatically. Let it work through them.

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

If it asks about WhatsApp:

**Say:**
```
Skip WhatsApp — this project uses Slack. The tokens are already in the .env file. Please proceed to channel registration.
```

---

### Step 5 — Channel registration

Get your Slack channel ID: in Slack, right-click the KEB ops channel → **View channel details** → scroll to bottom → `Channel ID: C0123ABCDEF`.

**Say:**
```
Register the keb-ops group with my production Slack channel. Channel ID is C0123ABCDEF, folder is keb-ops, no trigger prefix required, assistant name is StellarBot.
```

*(Replace `C0123ABCDEF` with your actual channel ID.)*

---

### Step 6 — Start the systemd service

**Say:**
```
Yes, set up the systemd service to start on boot
```

The `/setup` skill detects Linux automatically and uses systemd instead of launchd.

---

### Step 7 — Watchdog timer

Once the main service is running:

**Say:**
```
Set up the watchdog on Linux using a systemd timer. The watchdog script is at scripts/watchdog.sh and should run every 5 minutes.
```

---

## Phase 3 — Build and Serve the UI

### 1. Build the Angular UI

```bash
cd ~/nanoclaw
npm install            # install bot dependencies

cd ~/nanoclaw/ui
npm install            # install UI dependencies
npm run build          # produces ui/dist/nanoclaw-ui/browser/
```

This takes 1–2 minutes. Output lands in `~/nanoclaw/ui/dist/nanoclaw-ui/browser/`.

---

### 2. Configure nginx

Create the nginx site config:

```bash
sudo nano /etc/nginx/sites-available/nanoclaw
```

Paste exactly:

```nginx
server {
    listen 80;
    server_name _;

    root /home/marko/nanoclaw/ui/dist/nanoclaw-ui/browser;
    index index.html;

    # Proxy API calls to the Node.js backend
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Angular router — all unmatched routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Save: `Ctrl+O`, `Enter`, `Ctrl+X`.

Enable the site and reload nginx:

```bash
sudo ln -s /etc/nginx/sites-available/nanoclaw /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default    # remove default placeholder page
sudo nginx -t                               # verify config — should say "ok"
sudo systemctl reload nginx
```

---

### 3. Access the UI

From any browser on your local network:

```
http://192.168.1.50
```

*(Use whatever IP you found in step 2. No port number needed — nginx serves on port 80.)*

The API calls (`/api/...`) are proxied transparently to the Node.js backend on port 3001.

---

## Phase 4 — Verify Everything

In the Claude Code session say:

```
Check service status and show me the last 20 lines of the log
```

Then go to Slack and send a message in the KEB ops channel. You should get a response within a few seconds.

If no response after 30 seconds:

```
The bot isn't responding to Slack messages. Check the logs and diagnose what's wrong.
```

---

## Phase 5 — Register Personal Channel (Optional)

```
Register the personal group. Channel ID is C0123XXXXXX, folder is personal, no trigger prefix required, assistant name is StellarBot.
```

---

## Quick Reference (day-to-day)

```bash
# SSH in from M1
ssh marko@192.168.1.50

# Bot service
systemctl --user restart nanoclaw
systemctl --user stop nanoclaw
systemctl --user start nanoclaw
systemctl --user status nanoclaw

# Watch logs live
journalctl --user -u nanoclaw -f

# Deploy an update pushed from M1
cd ~/nanoclaw && ./deploy.sh

# Rebuild UI after a UI code change
cd ~/nanoclaw/ui && npm run build
# nginx serves the new files immediately — no restart needed
```

---

## If Things Go Wrong

**Wi-Fi not working (if not using ethernet):**
```bash
sudo apt-get install -y linux-modules-extra-$(uname -r)
sudo reboot
```

**Docker permission denied after install:**
```bash
# Log out and back in after: sudo usermod -aG docker $USER
# Or immediately in the current session:
newgrp docker
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

**nginx 502 Bad Gateway on /api/ routes:**
```bash
# The Node.js API isn't running on port 3001
systemctl --user status nanoclaw
journalctl --user -u nanoclaw -f
```

**UI shows blank page after deploy:**
```bash
# Rebuild the UI
cd ~/nanoclaw/ui && npm run build
# Check nginx is pointing to the right path
sudo nginx -t && sudo systemctl reload nginx
```
