# Intel Mac Production Setup Guide

This guide covers the one-time setup required for your **2016 Intel MacBook Pro i5** to run NanoClaw 24/7 as a production deployment.

## Overview

Your production setup:
- **Machine:** 2016 Intel MacBook Pro i5
- **Container Runtime:** Docker Desktop (2 CPU / 4GB RAM limit)
- **Architecture:** amd64 (x86_64)
- **Purpose:** Production 24/7 deployment via launchd
- **Tokens:** SLACK_BOT_TOKEN and SLACK_APP_TOKEN (production bot)

## Prerequisites

Before starting, ensure you have:
- [ ] macOS installed and updated
- [ ] Admin access to the machine
- [ ] GitHub credentials (to pull the repo)
- [ ] Slack production bot tokens (Bot Token and App Token - see SLACK_SETUP.md)
- [ ] Anthropic API key

---

## Step 1: Install Homebrew

Homebrew is needed for installing Node.js and other dependencies.

```bash
# Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Verify installation
brew --version
```

---

## Step 2: Install Node.js

NanoClaw requires Node.js 20 or later.

```bash
# Install Node.js via Homebrew
brew install node@22

# Verify installation
node --version  # Should show v22.x.x
npm --version   # Should show 10.x.x or later

# If node command not found, add to PATH:
echo 'export PATH="/usr/local/opt/node@22/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

---

## Step 3: Install and Configure Docker Desktop

### Install Docker Desktop

1. **Download Docker Desktop for Mac (Intel chip):**
   - Visit: https://www.docker.com/products/docker-desktop
   - Download the **Intel chip** version
   - Open the .dmg and drag Docker to Applications

2. **Start Docker Desktop:**
   - Open Docker from Applications
   - Wait for it to start (whale icon in menu bar)
   - Accept the service agreement

### Configure Docker Resource Limits

Your Intel Mac has limited resources, so we'll set conservative limits:

1. **Open Docker Desktop preferences:**
   - Click the whale icon in menu bar
   - Click "Settings" or "Preferences"

2. **Go to "Resources":**
   - **CPUs:** Set to **2** (as specified)
   - **Memory:** Set to **4 GB** (as specified)
   - **Swap:** 1 GB (default)
   - **Disk image size:** 60 GB (default, adjust if needed)

3. **Click "Apply & Restart"**

4. **Verify Docker is running:**
   ```bash
   docker --version
   docker ps  # Should show empty list (no containers yet)
   ```

---

## Step 4: Clone the Repository

```bash
# Navigate to your preferred location
cd ~

# Clone the repository
git clone https://github.com/qwibitai/nanoclaw.git

# Or if you're using your fork:
# git clone https://github.com/YOUR_USERNAME/nanoclaw.git

# Navigate into the directory
cd nanoclaw

# Verify you're on the main branch
git branch  # Should show: * main
```

---

## Step 5: Install Dependencies

```bash
# Install Node dependencies
npm install

# This will install all packages from package.json
# including @slack/bolt and other dependencies
```

---

## Step 6: Configure Environment Variables

Create your `.env` file with production configuration:

```bash
# Create .env file
nano .env
```

Add the following configuration:

```bash
# ============================================================================
# PRODUCTION CONFIGURATION FOR INTEL MAC
# ============================================================================

# Slack Tokens (PRODUCTION bot)
# Get these from https://api.slack.com/apps - see SLACK_SETUP.md
SLACK_BOT_TOKEN=xoxb-YOUR_PRODUCTION_BOT_TOKEN_HERE
SLACK_APP_TOKEN=xapp-YOUR_PRODUCTION_APP_TOKEN_HERE

# Assistant Configuration
ASSISTANT_NAME=StellarBot
ASSISTANT_HAS_OWN_NUMBER=true

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-api03-YOUR_KEY_HERE

# Container Configuration
CONTAINER_IMAGE=nanoclaw-agent:latest
CONTAINER_TIMEOUT=1800000       # 30 minutes
IDLE_TIMEOUT=1800000            # 30 minutes
MAX_CONCURRENT_CONTAINERS=2     # Lower for Intel Mac resources

# Timezone
TZ=Africa/Johannesburg

# Logging
LOG_LEVEL=info
```

**Important:**
- Use `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` (not DEV_* versions) for production
- Set `MAX_CONCURRENT_CONTAINERS=2` (not 5) due to resource limits
- Replace `YOUR_PRODUCTION_BOT_TOKEN_HERE` with your Bot User OAuth Token (xoxb-...)
- Replace `YOUR_PRODUCTION_APP_TOKEN_HERE` with your App-Level Token (xapp-...)
- Replace `YOUR_KEY_HERE` with your Anthropic API key

Save and exit (Ctrl+O, Enter, Ctrl+X in nano).

---

## Step 7: Build the Container

Build the multi-arch container image:

```bash
# Build the container
./container/build.sh

# This will:
# - Build the nanoclaw-agent:latest image for amd64
# - Install Chromium and dependencies
# - Set up the agent runtime

# Build takes 5-10 minutes on first run
# Verify the image is built:
docker images | grep nanoclaw
```

Expected output:
```
nanoclaw-agent   latest   abc123def456   2 minutes ago   1.2GB
```

---

## Step 8: Initialize Database and Groups

NanoClaw needs to initialize its database and group folders:

```bash
# Compile TypeScript
npm run build

# Initialize groups (this creates directories)
mkdir -p groups/keb-ops groups/personal groups/global

# Copy SOUL.md files if not already present
# (They should be in the repo already from development)

# Verify group structure:
ls -la groups/
# Should show: global, keb-ops, personal, main
```

---

## Step 9: Test Run (Optional but Recommended)

Before setting up the service, do a test run:

```bash
# Run in development mode
npm run dev

# You should see:
# [INFO] Connecting to Slack...
# [INFO] Slack bot authenticated: userId=U123456, team=YourWorkspace, user=andy
# [INFO] Slack channel connected successfully via Socket Mode
```

**Test from Slack:**
1. Open Slack and find your production bot
2. In a channel: Invite the bot (`/invite @StellarBot`), then send: `@StellarBot hello`
3. In a DM: Open a DM with the bot and send: `@StellarBot hello`
4. You should get a response

Press Ctrl+C to stop after testing.

---

## Step 10: Set Up launchd Service (Auto-Start)

Configure NanoClaw to run automatically on boot via launchd:

### Create the plist file:

```bash
# Create LaunchAgents directory if it doesn't exist
mkdir -p ~/Library/LaunchAgents

# Create the plist file
nano ~/Library/LaunchAgents/com.nanoclaw.plist
```

Add the following content (replace `/Users/marko` with your actual username):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.nanoclaw</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/marko/nanoclaw/dist/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/marko/nanoclaw</string>
    <key>StandardOutPath</key>
    <string>/Users/marko/nanoclaw/logs/nanoclaw.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/marko/nanoclaw/logs/nanoclaw.error.log</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>
```

Save and exit.

### Create logs directory:

```bash
mkdir -p logs
```

### Load the service:

```bash
# Load the service
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist

# Verify it's running
launchctl list | grep nanoclaw
# Should show: com.nanoclaw

# Check logs
tail -f logs/nanoclaw.log
```

---

## Step 11: Verify Production Deployment

### Check Service Status:

```bash
# List running services
launchctl list | grep nanoclaw

# View logs
tail -f logs/nanoclaw.log

# Check for errors
tail -f logs/nanoclaw.error.log
```

### Test from Slack:

1. Send message to production bot: `@StellarBot status`
2. Verify response
3. Check logs to see message processing

### Verify Groups:

Send from your KEB Ops channel:
```
@StellarBot which group am I in?
```

Send from personal DM:
```
@StellarBot which group am I in?
```

Each should correctly identify its group (keb-ops vs personal).

---

## Step 12: Enable Automatic Restart on Reboot

The launchd service is already configured to start on boot (RunAtLoad=true), but verify:

```bash
# Restart the Mac
sudo reboot

# After reboot, check if service started:
launchctl list | grep nanoclaw

# Check logs to see startup
tail -f logs/nanoclaw.log
```

---

## Ongoing Maintenance

### Deploy Updates from M1 Dev Machine:

When you push changes from your M1:

```bash
# On Intel Mac, run deployment script:
./deploy.sh

# This will:
# 1. Backup database
# 2. Pull latest code
# 3. Install dependencies
# 4. Rebuild container if Dockerfile changed
# 5. Restart service
```

### Manual Service Control:

```bash
# Stop service
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist

# Start service
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist

# Restart service
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist

# Or use the kickstart shortcut:
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

### View Logs:

```bash
# Live tail all logs
tail -f logs/nanoclaw.log

# Live tail errors only
tail -f logs/nanoclaw.error.log

# View last 100 lines
tail -n 100 logs/nanoclaw.log

# Search logs
grep "ERROR" logs/nanoclaw.log
```

### Monitor Resources:

```bash
# Check Docker resource usage
docker stats

# Check system resources
top
# Press 'q' to quit
```

---

## Troubleshooting

### Service won't start

1. **Check plist syntax:**
   ```bash
   plutil -lint ~/Library/LaunchAgents/com.nanoclaw.plist
   ```

2. **Check Node.js path:**
   ```bash
   which node
   # Update path in plist if different from /usr/local/bin/node
   ```

3. **Check working directory:**
   ```bash
   ls /Users/marko/nanoclaw
   # Ensure directory exists and path in plist is correct
   ```

4. **Run manually to see errors:**
   ```bash
   cd ~/nanoclaw
   npm run build
   node dist/index.js
   ```

### Docker issues

1. **Docker not running:**
   ```bash
   # Open Docker Desktop manually
   open -a Docker

   # Wait for it to start, then retry
   ```

2. **Container build fails:**
   ```bash
   # Check Docker resources in settings
   # Ensure at least 2 CPU / 4GB RAM allocated

   # Rebuild without cache:
   docker system prune -a
   ./container/build.sh
   ```

### Bot not responding

1. **Check logs:**
   ```bash
   tail -f logs/nanoclaw.log
   ```

2. **Verify tokens:**
   ```bash
   # Check .env has correct production tokens
   cat .env | grep SLACK_BOT_TOKEN
   cat .env | grep SLACK_APP_TOKEN
   ```

3. **Test connection:**
   ```bash
   # Stop service
   launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist

   # Run manually
   npm run dev

   # Try sending message
   # Check output for errors
   ```

### Out of memory

If containers are crashing due to memory:

1. **Lower MAX_CONCURRENT_CONTAINERS:**
   ```bash
   # Edit .env
   MAX_CONCURRENT_CONTAINERS=1
   ```

2. **Restart service:**
   ```bash
   launchctl kickstart -k gui/$(id -u)/com.nanoclaw
   ```

---

## Security Checklist

- [ ] .env file is not committed to git
- [ ] Slack bot tokens are secure
- [ ] Anthropic API key is secure
- [ ] File permissions on .env are restrictive (600)
- [ ] No sensitive data in SOUL.md or CLAUDE.md files
- [ ] Logs directory is excluded from any sync services

```bash
# Set correct permissions
chmod 600 .env
chmod 700 ~/nanoclaw
```

---

## Next Steps

Once production is running:

1. **Monitor for 24 hours** - check logs, verify stability
2. **Test both groups** - KEB Ops and Personal channels
3. **Verify auto-restart** - reboot the Mac and ensure service starts
4. **Set up backup schedule** - deploy.sh already backs up DB, consider additional backups
5. **Document your workflow** - how you'll push changes from M1 to Intel

---

## Quick Reference

### Useful Commands

```bash
# Service management
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl kickstart -k gui/$(id -u)/com.nanoclaw

# Logs
tail -f logs/nanoclaw.log
tail -f logs/nanoclaw.error.log

# Docker
docker ps                    # List running containers
docker images                # List images
docker stats                 # Resource usage

# Deployment
./deploy.sh                  # Deploy from git
./container/build.sh         # Rebuild container

# Manual run (for testing)
npm run build
npm start
# or
npm run dev
```

### File Locations

- **Project:** `~/nanoclaw/`
- **Service plist:** `~/Library/LaunchAgents/com.nanoclaw.plist`
- **Logs:** `~/nanoclaw/logs/`
- **Database:** `~/nanoclaw/store/messages.db`
- **Groups:** `~/nanoclaw/groups/`
- **Environment:** `~/nanoclaw/.env`

---

You're all set! Your Intel Mac should now be running NanoClaw 24/7 in production mode.
