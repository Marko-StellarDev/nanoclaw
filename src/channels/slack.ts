// Channel: Slack (Bolt SDK, Socket Mode)
// Future: To swap Telegram in, replace this file with a Telegram channel implementation
// that satisfies the Channel interface (src/types.ts). Key differences:
//   - Telegram uses bot tokens (TELEGRAM_BOT_TOKEN), no App token needed
//   - Telegram has native typing indicators (sendChatAction 'typing')
//   - Telegram JID format: 'tg:{chatId}' (already supported in db.ts)
//   - Use telegraf or node-telegram-bot-api instead of @slack/bolt
//   - Message events: bot.on('text', ...) instead of app.event('message', ...)
//   - No Socket Mode equivalent needed — Telegram uses long-polling or webhooks
// See: https://github.com/qwibitai/nanoclaw for community channel implementations

import pkg from '@slack/bolt';
const { App, LogLevel } = pkg;
type AppType = InstanceType<typeof App>;
import { logger } from '../logger.js';
import { Channel, OnInboundMessage, OnChatMetadata, RegisteredGroup } from '../types.js';
import { ASSISTANT_NAME } from '../config.js';

export interface SlackChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  botToken: string;     // Bot User OAuth Token (xoxb-...)
  appToken: string;     // App-Level Token (xapp-...) for Socket Mode
  // Future Telegram equivalent: botToken only (no appToken needed)
}

export class SlackChannel implements Channel {
  name = 'slack';

  private app!: AppType;
  private connected = false;
  private outgoingQueue: Array<{ jid: string; text: string }> = [];
  private flushing = false;
  private opts: SlackChannelOpts;
  private botUserId: string = '';
  // Dedup: when a user @mentions the bot, Slack fires both app_mention AND message.
  // Track recent mention timestamps so the message handler skips them.
  private recentMentionTs = new Set<string>();

  constructor(opts: SlackChannelOpts) {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    logger.info('Connecting to Slack...');

    // Create Slack app with Socket Mode (no public URL needed)
    // Future Telegram: Replace with `new Telegraf(botToken)` and bot.launch()
    // No App-level token required; Telegram uses long-polling by default
    this.app = new App({
      token: this.opts.botToken,
      appToken: this.opts.appToken,
      socketMode: true,
      logLevel: LogLevel.DEBUG,
    });

    logger.info('Slack App instance created with Socket Mode');

    // Get bot user info
    try {
      const authResult = await this.app.client.auth.test();
      this.botUserId = authResult.user_id as string;
      logger.info({
        userId: this.botUserId,
        team: authResult.team,
        user: authResult.user
      }, 'Slack bot authenticated');
    } catch (err) {
      logger.error({ err }, 'Failed to authenticate Slack bot');
      throw new Error(`Slack authentication failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Listen for app_mention events (when someone @mentions the bot in a channel)
    logger.info('Registering app_mention event handler');
    this.app.event('app_mention', async ({ event }: any) => {
      logger.info({ event }, 'Received app_mention event');
      try {
        // Track this ts so the message handler skips it (Slack fires both events)
        this.recentMentionTs.add(event.ts);
        setTimeout(() => this.recentMentionTs.delete(event.ts), 10_000);
        await this.handleMessage(event, true);
      } catch (err) {
        logger.error({ err, event }, 'Error handling Slack app_mention');
      }
    });

    // Listen for all messages — DMs and channel messages.
    // Groups with requiresTrigger=false respond to everything;
    // groups with requiresTrigger=true only respond to @mentions (handled above).
    // Future Telegram: bot.on('text', ...) replaces this handler
    logger.info('Registering message event handler');
    this.app.event('message', async ({ event }: any) => {
      logger.info({ event, channel_type: (event as any).channel_type }, 'Received message event');
      try {
        // Skip subtypes (message_changed, message_deleted, bot_message, etc.)
        if ((event as any).subtype) return;
        // Skip if already handled as an app_mention (dedup)
        if (this.recentMentionTs.has(event.ts)) return;
        await this.handleMessage(event);
      } catch (err) {
        logger.error({ err, event }, 'Error handling Slack message');
      }
    });

    // Catch-all for debugging - listen to ALL events
    this.app.event(/.*/,async ({ event }: any) => {
      logger.info({ eventType: event.type, event }, 'Received ANY Slack event (catch-all)');
    });

    // Start the app (connects to Socket Mode)
    await this.app.start();
    this.connected = true;

    // Flush any queued messages
    await this.flushOutgoingQueue();

    logger.info('Slack channel connected successfully via Socket Mode');
  }

  private async handleMessage(event: any, isMention = false): Promise<void> {
    // Skip bot messages
    if (event.bot_id || event.subtype === 'bot_message') {
      return;
    }

    // Skip messages from the bot itself
    if (event.user === this.botUserId) {
      return;
    }

    const channelId = event.channel;
    const chatJid = this.channelIdToJid(channelId);
    const timestamp = new Date(parseFloat(event.ts) * 1000).toISOString();

    // Get channel info to determine if it's a DM or channel
    let isGroup = false;
    let chatName = '';

    try {
      if (channelId.startsWith('D')) {
        // Direct message
        isGroup = false;
        const userInfo = await this.app.client.users.info({ user: event.user });
        chatName = `DM with ${userInfo.user?.real_name || userInfo.user?.name || 'Unknown'}`;
      } else {
        // Channel
        isGroup = true;
        const channelInfo = await this.app.client.conversations.info({ channel: channelId });
        chatName = `#${channelInfo.channel?.name || channelId}`;
      }
    } catch (err) {
      logger.warn({ err, channelId }, 'Failed to get channel info');
      chatName = channelId;
    }

    // Always notify about chat metadata for group discovery
    this.opts.onChatMetadata(chatJid, timestamp, chatName, 'slack', isGroup);

    // Only deliver full message for registered groups
    const groups = this.opts.registeredGroups();
    if (!groups[chatJid]) {
      return;
    }

    // Get message text
    let text = event.text || '';

    // Remove bot mention from text (Slack format: <@U123456>)
    // For app_mention events, re-add the trigger word so processGroupMessages
    // recognises it as triggered (Slack's event system is the trigger mechanism)
    text = text.replace(/<@[A-Z0-9]+>/g, '').trim();
    if (isMention) {
      text = `@${ASSISTANT_NAME} ${text}`;
    }

    const sender = event.user;
    let senderName = sender;

    // Get user's display name
    try {
      const userInfo = await this.app.client.users.info({ user: sender });
      senderName = userInfo.user?.real_name || userInfo.user?.name || sender;
    } catch (err) {
      logger.debug({ err, sender }, 'Failed to get user info');
    }

    this.opts.onMessage(chatJid, {
      id: event.ts,
      chat_jid: chatJid,
      sender,
      sender_name: senderName,
      content: text,
      timestamp,
      is_from_me: false,
      is_bot_message: false,
    });
  }

  private channelIdToJid(channelId: string): string {
    // Use Slack channel ID as JID
    // Format: slack:{channelId}
    // Examples: slack:C1234567890 (channel), slack:D1234567890 (DM)
    return `slack:${channelId}`;
  }

  private jidToChannelId(jid: string): string {
    // Extract channel ID from JID
    // Format: slack:{channelId}
    if (!jid.startsWith('slack:')) {
      throw new Error(`Invalid Slack JID: ${jid}`);
    }
    return jid.substring(6);
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    // Slack bots are always separate entities, but we keep prefix for consistency
    const prefixed = `${ASSISTANT_NAME}: ${text}`;

    if (!this.connected) {
      this.outgoingQueue.push({ jid, text: prefixed });
      logger.info({ jid, length: prefixed.length, queueSize: this.outgoingQueue.length }, 'Slack disconnected, message queued');
      return;
    }

    try {
      const channelId = this.jidToChannelId(jid);

      // Slack has a 40,000 character limit per message
      // But we'll split at reasonable boundaries for readability
      const chunks = this.splitMessage(prefixed, 4000);

      for (const chunk of chunks) {
        await this.app.client.chat.postMessage({
          channel: channelId,
          text: chunk,
          // Enable markdown-style formatting (mrkdwn)
          mrkdwn: true,
        });
      }

      logger.info({ jid, channelId, length: prefixed.length, chunks: chunks.length }, 'Slack message sent');
    } catch (err) {
      // If send fails, queue it for retry
      this.outgoingQueue.push({ jid, text: prefixed });
      logger.warn({ jid, err, queueSize: this.outgoingQueue.length }, 'Failed to send Slack message, queued');
      throw err;
    }
  }

  private splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        chunks.push(remaining);
        break;
      }

      // Try to split at a newline or space near the limit
      let splitIndex = maxLength;
      const newlineIndex = remaining.lastIndexOf('\n', maxLength);
      const spaceIndex = remaining.lastIndexOf(' ', maxLength);

      if (newlineIndex > maxLength * 0.8) {
        splitIndex = newlineIndex + 1;
      } else if (spaceIndex > maxLength * 0.8) {
        splitIndex = spaceIndex + 1;
      }

      chunks.push(remaining.substring(0, splitIndex));
      remaining = remaining.substring(splitIndex);
    }

    return chunks;
  }

  private async flushOutgoingQueue(): Promise<void> {
    if (this.flushing || this.outgoingQueue.length === 0) return;

    this.flushing = true;
    logger.info({ queueSize: this.outgoingQueue.length }, 'Flushing Slack outgoing queue');

    while (this.outgoingQueue.length > 0) {
      const { jid, text } = this.outgoingQueue.shift()!;
      try {
        const channelId = this.jidToChannelId(jid);
        const chunks = this.splitMessage(text, 4000);

        for (const chunk of chunks) {
          await this.app.client.chat.postMessage({
            channel: channelId,
            text: chunk,
            mrkdwn: true,
          });
        }

        logger.info({ jid, channelId }, 'Queued Slack message sent');
      } catch (err) {
        logger.error({ jid, err }, 'Failed to send queued Slack message');
        // Put it back at the front and stop flushing
        this.outgoingQueue.unshift({ jid, text });
        break;
      }
    }

    this.flushing = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  ownsJid(jid: string): boolean {
    // Slack JIDs start with 'slack:'
    return jid.startsWith('slack:');
  }

  async disconnect(): Promise<void> {
    logger.info('Disconnecting from Slack');
    this.connected = false;

    if (this.app) {
      await this.app.stop();
    }

    logger.info('Slack channel disconnected');
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!this.connected || !isTyping) return;

    try {
      const channelId = this.jidToChannelId(jid);

      // Slack doesn't have a built-in typing indicator API for bots
      // Future Telegram: bot.telegram.sendChatAction(chatId, 'typing')
      logger.debug({ jid }, 'Slack typing indicator not implemented');
    } catch (err) {
      logger.debug({ jid, err }, 'Failed to set Slack typing indicator');
    }
  }
}
