# Production Setup Guide — Ubuntu 24.04 LTS Desktop on Intel Mac

This guide covers the one-time setup for running NanoClaw 24/7 on the **2016 Intel MacBook Pro i5** running **Ubuntu 24.04 LTS Desktop**.

## Overview

| | |
|---|---|
| **Machine** | 2016 Intel MacBook Pro i5 (8GB RAM) |
| **OS** | Ubuntu 24.04 LTS Desktop |
| **Container Runtime** | Docker Engine (Linux, no Docker Desktop needed) |
| **Architecture** | amd64 (x86_64) |
| **Service Manager** | systemd |
| **Tokens** | `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` (production bot) |

## Prerequisites

Before starting, ensure you have:
- [ ] Ubuntu 24.04 LTS Desktop installed (see install notes below)
- [ ] Admin access to the machine
- [ ] GitHub credentials (to pull the repo)
- [ ] Slack production bot tokens (Bot Token and App Token — see SLACK_SETUP.md)
- [ ] Anthropic API key

---

## Ubuntu Install Notes

Download Ubuntu 24.04 LTS Desktop ISO from https://ubuntu.com/download/desktop and flash to USB (use Balena Etcher on your M1).

Boot Intel Mac from USB: hold **Option** at startup, select the USB drive.

During install:
- Check **"Install third-party software for graphics and Wi-Fi"** — handles Broadcom Wi-Fi automatically
- Enable automatic login if this machine won't have a keyboard/monitor permanently attached

After install, open Terminal (`Ctrl+Alt+T`).

---

## Step 1: Install Docker Engine

Docker Engine on Linux needs no Docker Desktop — it runs as a system service with no resource limits to configure manually.

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

**Log out and back in** (or reboot) so the group change takes effect. Then verify:

```bash
docker ps  # Should show empty list, no "permission denied"
```

---

## Step 2: Install Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # Should show v22.x.x
npm --version
```

---

## Step 3: Install Git and Clone the Repo

```bash
sudo apt-get install -y git
cd ~
git clone https://github.com/YOUR_USERNAME/nanoclaw.git
cd nanoclaw
```

---

## Step 4: Install Dependencies

```bash
npm install
```

---

## Step 5: Configure Environment Variables

```bash
nano .env
```

Add the following (fill in your real values):

```bash
# Slack Tokens (PRODUCTION bot)
SLACK_BOT_TOKEN=xoxb-YOUR_PRODUCTION_BOT_TOKEN
SLACK_APP_TOKEN=xapp-YOUR_PRODUCTION_APP_TOKEN

# Assistant Configuration
ASSISTANT_NAME=StellarBot

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY

# Container Configuration
CONTAINER_IMAGE=nanoclaw-agent:latest
CONTAINER_TIMEOUT=1800000
IDLE_TIMEOUT=1800000
MAX_CONCURRENT_CONTAINERS=2

# Timezone
TZ=Africa/Johannesburg

# Logging
LOG_LEVEL=info
```

Save: `Ctrl+O`, `Enter`, `Ctrl+X`.

```bash
chmod 600 .env
```

---

## Step 6: Build the Container

```bash
./container/build.sh
```

Build takes 5–10 minutes on first run. Verify:

```bash
docker images | grep nanoclaw
```

Expected output:
```
nanoclaw-agent   latest   abc123def456   2 minutes ago   1.2GB
```

---

## Step 7: Install Claude Code and Run Setup

```bash
npm install -g @anthropic-ai/claude-code
cd ~/nanoclaw
claude
```

In the Claude Code session, run:

```
/setup
```

The setup skill detects Linux and configures systemd automatically. See `docs/INTEL_QUICKSTART.md` for the full word-by-word guide to the setup conversation.

---

## Step 8: Verify Service

```bash
systemctl --user status nanoclaw
journalctl --user -u nanoclaw -f
```

Send a message in your KEB ops Slack channel — you should get a response.

---

## Watchdog Setup (Auto-Recovery)

The systemd `Restart=always` setting handles crashes. The watchdog handles hangs (process running, API not responding).

### Create the watchdog service files:

```bash
mkdir -p ~/.config/systemd/user
```

**Service unit** (`~/.config/systemd/user/nanoclaw-watchdog.service`):

```ini
[Unit]
Description=NanoClaw Watchdog
After=nanoclaw.service

[Service]
Type=oneshot
ExecStart=/bin/bash /home/YOUR_USERNAME/nanoclaw/scripts/watchdog.sh
```

**Timer unit** (`~/.config/systemd/user/nanoclaw-watchdog.timer`):

```ini
[Unit]
Description=Run NanoClaw watchdog every 5 minutes
Requires=nanoclaw-watchdog.service

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
```

Replace `YOUR_USERNAME` with your actual username.

### Load and enable:

```bash
systemctl --user daemon-reload
systemctl --user enable --now nanoclaw-watchdog.timer

# Verify timer is running
systemctl --user list-timers | grep watchdog
```

### How it works:
- Runs `scripts/watchdog.sh` every **5 minutes**
- Calls `GET /api/health` with a 5-second timeout
- Tracks consecutive failures in `logs/watchdog.state`
- After **3 consecutive failures** (~15 min), runs `systemctl --user restart nanoclaw`
- Logs to `logs/watchdog.log`

### Monitor the watchdog:

```bash
tail -f logs/watchdog.log
```

---

## Ongoing Maintenance

### Deploy updates pushed from M1:

```bash
cd ~/nanoclaw
./deploy.sh
```

This backs up the DB, pulls latest code, installs deps, rebuilds the container if the Dockerfile changed, and restarts the service.

### Manual service control:

```bash
# Start / stop / restart
systemctl --user start nanoclaw
systemctl --user stop nanoclaw
systemctl --user restart nanoclaw

# Status and logs
systemctl --user status nanoclaw
journalctl --user -u nanoclaw -f
tail -f ~/nanoclaw/logs/nanoclaw.log
```

### View logs:

```bash
# Live tail
tail -f logs/nanoclaw.log

# Errors only
tail -f logs/nanoclaw.error.log

# systemd journal
journalctl --user -u nanoclaw -n 100
journalctl --user -u nanoclaw --since "1 hour ago"
```

### Monitor Docker:

```bash
docker ps          # Running containers
docker images      # Built images
docker stats       # Live resource usage
```

---

## Troubleshooting

### Docker permission denied after install
```bash
# Ensure you logged out/in after the usermod step
# Or temporarily: newgrp docker
```

### Service won't start
```bash
systemctl --user status nanoclaw
journalctl --user -u nanoclaw --no-pager

# Run manually to see the actual error:
cd ~/nanoclaw && npm run build && node dist/index.js
```

### Container build fails
```bash
# Clean rebuild:
docker builder prune -f
./container/build.sh
```

### Bot not responding to Slack messages
```bash
# Check connection
tail -f logs/nanoclaw.log | grep -i slack

# Check channel registration
sqlite3 store/messages.db "SELECT * FROM registered_groups;"
```

### Wi-Fi not working after Ubuntu install
```bash
sudo ubuntu-drivers autoinstall
sudo reboot
```

### Out of memory (containers crashing)
```bash
# Lower concurrency in .env:
MAX_CONCURRENT_CONTAINERS=1
systemctl --user restart nanoclaw
```

---

## Security Checklist

- [ ] `.env` is not committed to git (`chmod 600 .env`)
- [ ] Slack bot tokens are secure
- [ ] Anthropic API key is secure
- [ ] Logs directory excluded from sync services

---

## Quick Reference

```bash
# Service management
systemctl --user start nanoclaw
systemctl --user stop nanoclaw
systemctl --user restart nanoclaw
systemctl --user status nanoclaw

# Logs
tail -f ~/nanoclaw/logs/nanoclaw.log
journalctl --user -u nanoclaw -f

# Docker
docker ps
docker images
docker stats

# Deploy from git
cd ~/nanoclaw && ./deploy.sh

# Rebuild container
./container/build.sh
```

### File Locations

| Path | Purpose |
|------|---------|
| `~/nanoclaw/` | Project root |
| `~/.config/systemd/user/nanoclaw.service` | Service unit |
| `~/.config/systemd/user/nanoclaw-watchdog.*` | Watchdog timer + service |
| `~/nanoclaw/logs/` | Application and watchdog logs |
| `~/nanoclaw/store/messages.db` | Database |
| `~/nanoclaw/groups/` | Group data |
| `~/nanoclaw/.env` | Secrets (never commit) |
