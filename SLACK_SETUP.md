# Slack Setup Guide

This guide walks you through setting up NanoClaw to work with Slack.

## Overview

NanoClaw connects to Slack via Socket Mode, which means:
- No public URL or webhooks required
- Works behind firewalls
- Real-time bidirectional communication
- Perfect for personal/development use

## Prerequisites

- A Slack workspace (create one at https://slack.com/create if needed)
- Admin access to install apps in the workspace
- Anthropic API key

---

## Step 1: Create a Slack App

1. **Go to Slack API Dashboard:**
   - Visit: https://api.slack.com/apps
   - Click **"Create New App"**

2. **Choose "From scratch":**
   - App Name: `StellarBot` (or your preferred assistant name)
   - Pick your workspace
   - Click **"Create App"**

---

## Step 2: Configure Bot Token Scopes

Your bot needs permissions to read and send messages.

1. **Navigate to "OAuth & Permissions"** (left sidebar)

2. **Scroll to "Bot Token Scopes"**

3. **Add the following scopes:**
   - `app_mentions:read` - View messages that mention your app
   - `chat:write` - Send messages as the bot
   - `channels:history` - View messages in public channels
   - `groups:history` - View messages in private channels
   - `im:history` - View messages in direct messages
   - `mpim:history` - View messages in group DMs
   - `channels:read` - View basic channel info
   - `groups:read` - View basic private channel info
   - `im:read` - View basic DM info
   - `users:read` - View people in the workspace

---

## Step 3: Enable Socket Mode

Socket Mode allows your bot to receive events without a public URL.

1. **Navigate to "Socket Mode"** (left sidebar)

2. **Enable Socket Mode:**
   - Toggle "Enable Socket Mode" to **ON**
   - When prompted, give the token a name: `andy-app-token`
   - Click **"Generate"**

3. **Copy the App-Level Token:**
   - It starts with `xapp-...`
   - Save this for later (you'll use it as `SLACK_APP_TOKEN`)

---

## Step 4: Subscribe to Bot Events

Configure what events your bot listens to.

1. **Navigate to "Event Subscriptions"** (left sidebar)

2. **Enable Events:**
   - Toggle "Enable Events" to **ON**

3. **Subscribe to bot events:**
   - Click **"Subscribe to bot events"**
   - Add these events:
     - `app_mention` - When someone @mentions your bot
     - `message.im` - Direct messages to your bot
     - `message.channels` - Messages in channels (for context)
     - `message.groups` - Messages in private channels

4. **Save Changes** (button at bottom)

---

## Step 5: Install App to Workspace

1. **Navigate to "Install App"** (left sidebar)

2. **Click "Install to Workspace"**

3. **Review permissions and click "Allow"**

4. **Copy the Bot User OAuth Token:**
   - It starts with `xoxb-...`
   - Save this for later (you'll use it as `SLACK_BOT_TOKEN`)

---

## Step 6: Configure Environment Variables

Create or update your `.env` file:

```bash
# Development (M1 Mac / local testing)
DEV_SLACK_BOT_TOKEN=xoxb-your-bot-token-here
DEV_SLACK_APP_TOKEN=xapp-your-app-token-here

# Production (Intel Mac / always-on deployment)
SLACK_BOT_TOKEN=xoxb-your-production-bot-token-here
SLACK_APP_TOKEN=xapp-your-production-app-token-here

# Assistant Configuration
ASSISTANT_NAME=StellarBot
ASSISTANT_HAS_OWN_NUMBER=true

# Anthropic API
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here

# Container Configuration
CONTAINER_IMAGE=nanoclaw-agent:latest
CONTAINER_TIMEOUT=1800000
IDLE_TIMEOUT=1800000
MAX_CONCURRENT_CONTAINERS=5

# Timezone
TZ=Africa/Johannesburg

# Logging
LOG_LEVEL=info
```

**Token Priority:**
- NanoClaw uses `DEV_SLACK_BOT_TOKEN` / `DEV_SLACK_APP_TOKEN` if set (development)
- Falls back to `SLACK_BOT_TOKEN` / `SLACK_APP_TOKEN` (production)

This lets you test with a separate bot on your dev machine.

---

## Step 7: Test the Connection

1. **Start NanoClaw:**
   ```bash
   npm run dev
   ```

2. **You should see:**
   ```
   [INFO] Connecting to Slack...
   [INFO] Slack bot authenticated: userId=U123456, team=YourWorkspace, user=andy
   [INFO] Slack channel connected successfully via Socket Mode
   ```

3. **Test in Slack:**
   - **In a channel:** Invite your bot (`/invite @StellarBot`), then send: `@StellarBot hello`
   - **In a DM:** Open a DM with your bot and send: `@StellarBot hello`

4. **Verify response:** Your bot should reply with a greeting

---

## Group Registration

NanoClaw requires groups to be registered before it responds.

### Register a Slack Channel:

1. **Find the channel/DM where you sent a message**

2. **Run the registration command from your main group:**
   ```
   @StellarBot register group slack:C1234567890
   ```

   The `slack:C...` ID is shown in the logs when a message arrives.

3. **Alternatively, check logs:**
   ```bash
   tail -f logs/nanoclaw.log
   ```

   Look for lines like:
   ```
   [INFO] New group discovered: slack:C1234567890 (#general)
   ```

---

## Development vs Production Setup

### Development (M1 Mac):
- Use `DEV_SLACK_BOT_TOKEN` and `DEV_SLACK_APP_TOKEN`
- Create a separate test Slack workspace or bot
- Run with `npm run dev`

### Production (Intel Mac):
- Use `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN`
- Set up as a launchd service (see `INTEL_SETUP.md`)
- Runs 24/7 in the background

---

## Troubleshooting

### Bot doesn't respond

**Check logs:**
```bash
tail -f logs/nanoclaw.log
```

**Common issues:**
- Bot not invited to channel (run `/invite @StellarBot` in the channel)
- Group not registered (check `groups.json` or register manually)
- Incorrect token (verify tokens in `.env`)
- Socket Mode not enabled (check Slack app settings)

### "Both SLACK_BOT_TOKEN and SLACK_APP_TOKEN are required"

You need **both** tokens:
1. **Bot Token** (`xoxb-...`) - from "OAuth & Permissions" → "Bot User OAuth Token"
2. **App Token** (`xapp-...`) - from "Socket Mode" → "App-Level Tokens"

Make sure both are in your `.env` file.

### Messages show "slack:C123..." instead of channel name

This is normal. Slack provides channel names in events, so NanoClaw displays them in logs and metadata.

### Bot responds to all messages, not just @mentions

Check that your `TRIGGER_PATTERN` in `src/config.ts` is correctly set to require `@StellarBot` (or your bot name).

---

## Slack vs WhatsApp Differences

| Feature | Slack | WhatsApp |
|---------|-------|----------|
| **Setup** | App tokens, no phone | Phone number, QR code |
| **Channels** | Channels, DMs, private groups | Groups, individual chats |
| **Mentions** | `@StellarBot` in channel, direct in DM | `@StellarBot` everywhere |
| **Authentication** | OAuth tokens | QR code scan |
| **Always-on** | Works anywhere with internet | Requires phone connection |
| **Message format** | Markdown (mrkdwn) | Plain text |

---

## Next Steps

Once your bot is responding:

1. **Create group-specific personalities:**
   - Edit `groups/{group-name}/SOUL.md`
   - Each Slack channel can have different behavior

2. **Set up scheduled tasks:**
   - Add cron expressions to `groups/{group-name}/CLAUDE.md`

3. **Deploy to production:**
   - Follow `INTEL_SETUP.md` for 24/7 deployment

4. **Invite to multiple channels:**
   - Register each channel separately
   - Each gets isolated filesystem and memory

---

## Security Notes

- Keep your tokens secret (never commit `.env` to git)
- Use separate tokens for dev and production
- Restrict workspace access to trusted users
- Regularly rotate tokens if compromised
- Set `.env` file permissions: `chmod 600 .env`

---

You're all set! Your Slack bot should now be running with NanoClaw.
