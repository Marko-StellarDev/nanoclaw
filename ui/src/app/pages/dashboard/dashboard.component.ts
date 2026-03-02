import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService, Group, Message, MonthlyUsage } from '../../services/api.service';

interface GroupState {
  group: Group;
  messages: Message[];
  usage: MonthlyUsage | null;
  loading: boolean;
  input: string;
  sending: boolean;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <h1 class="page-title">Dashboard</h1>

    <div class="status-bar" [class.ok]="health?.status === 'ok'">
      <span class="dot"></span>
      <span *ngIf="health">Bot running &mdash; uptime {{ formatUptime(health.uptime) }}</span>
      <span *ngIf="!health && !healthError">Connecting...</span>
      <span *ngIf="healthError" class="error">Cannot reach API on :3001 &mdash; is the bot running?</span>
    </div>

    <div class="groups-grid">
      <div *ngFor="let gs of groupStates" class="card group-card">

        <!-- Header -->
        <div class="group-header">
          <div class="group-meta">
            <div class="group-name-row">
              <span class="group-name">{{ gs.group.name }}</span>
              <span class="thinking-dot" *ngIf="isThinking(gs.group.folder)" title="Agent is thinking..."></span>
            </div>
            <span class="tag">{{ gs.group.folder }}</span>
          </div>
          <div class="usage-mini" *ngIf="gs.usage">
            <div class="usage-bar">
              <div class="usage-fill" [style.width.%]="gs.usage.budget_used_pct"></div>
            </div>
            <span class="usage-label">{{ gs.usage.budget_used_pct }}% budget &middot; {{ gs.usage.runs }} runs</span>
          </div>
        </div>

        <!-- Messages -->
        <div class="section-title" style="margin-top:16px">Conversation</div>
        <div *ngIf="gs.loading" class="loading">Loading...</div>
        <div *ngIf="!gs.loading && gs.messages.length === 0" class="empty">No messages yet — send one below</div>
        <div class="message-list" *ngIf="!gs.loading">
          <div *ngFor="let m of gs.messages.slice(-10)" class="message" [class.bot]="m.is_bot_message">
            <div class="msg-meta">
              <span class="badge" [class.bot]="m.is_bot_message" [class.user]="!m.is_bot_message">
                {{ m.is_bot_message ? 'StellarBot' : (m.sender_name || 'User') }}
              </span>
              <span class="msg-time">{{ m.timestamp | date:'HH:mm' }}</span>
            </div>
            <div class="msg-content">{{ m.content }}</div>
          </div>
          <!-- thinking indicator inside chat -->
          <div class="message thinking-row" *ngIf="isThinking(gs.group.folder)">
            <div class="msg-meta">
              <span class="badge bot">StellarBot</span>
            </div>
            <div class="thinking-dots"><span></span><span></span><span></span></div>
          </div>
        </div>

        <!-- Chat input -->
        <div class="chat-input-row">
          <textarea
            class="chat-input"
            rows="2"
            placeholder="Message {{ gs.group.name }}…"
            [value]="gs.input"
            (input)="gs.input = $any($event.target).value"
            (keydown.enter)="onEnter(gs, $event)"
            [disabled]="gs.sending"
          ></textarea>
          <button class="send-btn" (click)="send(gs)" [disabled]="gs.sending || !gs.input.trim()">
            {{ gs.sending ? '…' : '↑' }}
          </button>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .page-title { font-size: 20px; font-weight: 700; margin-bottom: 20px; }

    .status-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: #1e2030;
      border: 1px solid var(--border);
      border-radius: 6px;
      margin-bottom: 24px;
      font-size: 13px;
      color: var(--text-muted);

      .dot {
        width: 8px; height: 8px;
        border-radius: 50%;
        background: var(--text-muted);
      }

      &.ok .dot { background: var(--success); box-shadow: 0 0 6px var(--success); }
      .error { color: var(--danger); }
    }

    .groups-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(480px, 1fr));
      gap: 20px;
    }

    .group-card {
      display: flex;
      flex-direction: column;
    }

    .group-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 4px;
    }

    .group-meta { display: flex; flex-direction: column; gap: 6px; }

    .group-name-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .group-name { font-size: 16px; font-weight: 600; }

    /* Pulsing green dot when agent is thinking */
    .thinking-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 6px var(--success);
      animation: pulse 1.2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%       { opacity: 0.4; transform: scale(0.75); }
    }

    .usage-mini {
      text-align: right;
      min-width: 120px;

      .usage-bar {
        height: 4px;
        background: var(--border);
        border-radius: 2px;
        margin-bottom: 4px;
        overflow: hidden;
      }

      .usage-fill {
        height: 100%;
        background: var(--accent);
        border-radius: 2px;
        transition: width 0.3s;
      }

      .usage-label { font-size: 11px; color: var(--text-muted); }
    }

    .message-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
      flex: 1;
      max-height: 340px;
      overflow-y: auto;
    }

    .message {
      padding: 8px 10px;
      background: rgba(255,255,255,0.02);
      border-radius: 6px;
      border-left: 2px solid var(--border);

      &.bot { border-left-color: var(--accent); }

      .msg-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }

      .msg-time { font-size: 11px; color: var(--text-muted); }

      .msg-content {
        font-size: 13px;
        color: var(--text);
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 80px;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
      }
    }

    /* Animated typing dots */
    .thinking-row { border-left-color: var(--accent); }

    .thinking-dots {
      display: flex;
      gap: 4px;
      padding: 2px 0;

      span {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: var(--text-muted);
        animation: bounce 1.2s ease-in-out infinite;

        &:nth-child(2) { animation-delay: 0.2s; }
        &:nth-child(3) { animation-delay: 0.4s; }
      }
    }

    @keyframes bounce {
      0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
      40%           { transform: translateY(-5px); opacity: 1; }
    }

    /* Chat input */
    .chat-input-row {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      align-items: flex-end;
    }

    .chat-input {
      flex: 1;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-size: 13px;
      padding: 8px 10px;
      resize: none;
      font-family: inherit;
      line-height: 1.5;

      &:focus { outline: none; border-color: var(--accent); }
      &::placeholder { color: var(--text-muted); }
      &:disabled { opacity: 0.5; }
    }

    .send-btn {
      background: var(--accent);
      border: none;
      border-radius: 6px;
      color: #fff;
      font-size: 16px;
      width: 38px;
      height: 38px;
      cursor: pointer;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.15s;

      &:hover:not(:disabled) { opacity: 0.85; }
      &:disabled { opacity: 0.4; cursor: default; }
    }
  `],
})
export class DashboardComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);

  health: any = null;
  healthError = false;
  groupStates: GroupState[] = [];
  agentStatuses: Record<string, string> = {};

  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.api.health().subscribe({
      next: h => this.health = h,
      error: () => this.healthError = true,
    });

    this.api.groups().subscribe(groups => {
      this.groupStates = groups.map(g => ({
        group: g, messages: [], usage: null, loading: true, input: '', sending: false,
      }));
      for (const gs of this.groupStates) {
        this.loadGroup(gs);
      }
    });

    this.refreshStatus();
    this.timer = setInterval(() => this.refresh(), 5000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private refresh(): void {
    for (const gs of this.groupStates) {
      this.api.messages(gs.group.folder, 20).subscribe({
        next: msgs => gs.messages = msgs,
        error: () => {},
      });
    }
    this.refreshStatus();
  }

  private refreshStatus(): void {
    this.api.agentStatus().subscribe({
      next: s => this.agentStatuses = s,
      error: () => {},
    });
  }

  private loadGroup(gs: GroupState): void {
    this.api.messages(gs.group.folder, 20).subscribe({
      next: msgs => { gs.messages = msgs; gs.loading = false; },
      error: () => gs.loading = false,
    });

    const month = new Date().toISOString().slice(0, 7);
    this.api.usage(gs.group.folder, month).subscribe({
      next: u => gs.usage = u as MonthlyUsage,
      error: () => {},
    });
  }

  onEnter(gs: GroupState, event: Event): void {
    if ((event as KeyboardEvent).shiftKey) return;
    event.preventDefault();
    this.send(gs);
  }

  isThinking(folder: string): boolean {
    return this.agentStatuses[folder] === 'thinking';
  }

  send(gs: GroupState): void {
    const text = gs.input.trim();
    if (!text || gs.sending) return;

    gs.sending = true;

    // Optimistically add to list
    gs.messages = [...gs.messages, {
      id: `optimistic-${Date.now()}`,
      chat_jid: gs.group.jid,
      sender: 'web-ui',
      sender_name: 'You (Web)',
      content: text,
      timestamp: new Date().toISOString(),
      is_from_me: 0,
      is_bot_message: 0,
    }];
    gs.input = '';

    this.api.sendMessage(gs.group.folder, text).subscribe({
      next: () => { gs.sending = false; },
      error: () => { gs.sending = false; },
    });
  }

  formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
}
