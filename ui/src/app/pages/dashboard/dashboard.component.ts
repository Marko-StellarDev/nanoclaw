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
    <div class="page-header">
      <div class="page-title-block">
        <span class="page-prefix">// 01</span>
        <h1 class="page-title">SYSTEM STATUS</h1>
      </div>
      <div class="status-bar" [class.ok]="health?.status === 'ok'" [class.error]="healthError">
        <span class="status-pip"></span>
        <span class="status-text" *ngIf="health">
          UPLINK NOMINAL &nbsp;·&nbsp; {{ formatUptime(health.uptime) }}
        </span>
        <span class="status-text" *ngIf="!health && !healthError">ESTABLISHING UPLINK...</span>
        <span class="status-text error-text" *ngIf="healthError">UPLINK FAILED — API:3001 UNREACHABLE</span>
      </div>
    </div>

    <div class="groups-grid">
      <div *ngFor="let gs of groupStates" class="card group-card">

        <div class="group-header">
          <div class="group-id-block">
            <div class="group-name-row">
              <span class="group-name">{{ gs.group.name }}</span>
              <span class="thinking-indicator" *ngIf="isThinking(gs.group.folder)">
                <span class="t-dot"></span>
                <span class="t-dot"></span>
                <span class="t-dot"></span>
                <span class="t-label">PROCESSING</span>
              </span>
            </div>
            <span class="group-folder-tag">{{ gs.group.folder }}</span>
          </div>
          <div class="usage-panel" *ngIf="gs.usage">
            <div class="usage-track">
              <div class="usage-fill" [style.width.%]="gs.usage.budget_used_pct"></div>
            </div>
            <div class="usage-label">{{ gs.usage.budget_used_pct }}% BUDGET &nbsp;·&nbsp; {{ gs.usage.runs }} RUNS</div>
          </div>
        </div>

        <div class="terminal-label">TRANSMISSION LOG</div>

        <div class="message-stream" *ngIf="!gs.loading">
          <div *ngIf="gs.messages.length === 0" class="stream-empty">
            &gt; awaiting transmissions...
          </div>
          <div *ngFor="let m of gs.messages.slice(-10)"
               class="message-entry"
               [class.is-bot]="m.is_bot_message">
            <div class="entry-header">
              <span class="entry-source" [class.bot-source]="m.is_bot_message">
                {{ m.is_bot_message ? '◈ STELLARBOT' : '▷ ' + (m.sender_name || 'USER') }}
              </span>
              <span class="entry-time">{{ m.timestamp | date:'HH:mm:ss' }}</span>
            </div>
            <div class="entry-body">{{ m.content }}</div>
          </div>
          <div class="message-entry is-bot thinking-entry" *ngIf="isThinking(gs.group.folder)">
            <div class="entry-header">
              <span class="entry-source bot-source">◈ STELLARBOT</span>
            </div>
            <div class="think-wave">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
          </div>
        </div>
        <div class="stream-loading" *ngIf="gs.loading">&gt; loading transmissions...</div>

        <div class="transmit-row">
          <textarea
            class="transmit-input"
            rows="2"
            [placeholder]="'> transmit to ' + gs.group.name + '...'"
            [value]="gs.input"
            (input)="gs.input = $any($event.target).value"
            (keydown.enter)="onEnter(gs, $event)"
            [disabled]="gs.sending"
          ></textarea>
          <button class="transmit-btn" (click)="send(gs)" [disabled]="gs.sending || !gs.input.trim()">
            <span *ngIf="!gs.sending">▶</span>
            <span *ngIf="gs.sending" class="sending-spin">◌</span>
          </button>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 28px;
      gap: 20px;
    }

    .page-title-block {
      display: flex;
      align-items: baseline;
      gap: 10px;
    }

    .page-prefix {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--cyan);
      opacity: 0.6;
      letter-spacing: 0.08em;
    }

    .page-title {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.15em;
      color: #fff;
    }

    .status-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 7px 14px;
      background: rgba(4, 22, 46, 0.7);
      border: 1px solid var(--border);
      border-radius: 2px;
      backdrop-filter: blur(8px);

      .status-pip {
        width: 7px; height: 7px;
        border-radius: 50%;
        background: var(--text-muted);
        flex-shrink: 0;
      }

      .status-text {
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        color: var(--text-muted);
        letter-spacing: 0.08em;
      }

      &.ok {
        border-color: rgba(0,255,136,0.2);
        .status-pip {
          background: var(--green);
          box-shadow: 0 0 8px var(--green);
          animation: pip-pulse 2s ease-in-out infinite;
        }
        .status-text { color: rgba(0,255,136,0.8); }
      }

      &.error {
        border-color: rgba(255,51,102,0.2);
        .status-pip { background: var(--danger); box-shadow: 0 0 8px var(--danger); }
      }

      .error-text { color: var(--danger); }
    }

    @keyframes pip-pulse {
      0%, 100% { box-shadow: 0 0 8px var(--green); }
      50%       { box-shadow: 0 0 16px var(--green), 0 0 24px rgba(0,255,136,0.3); }
    }

    .groups-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(500px, 1fr));
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
      margin-bottom: 16px;
    }

    .group-id-block { display: flex; flex-direction: column; gap: 6px; }

    .group-name-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .group-name {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: #fff;
    }

    .thinking-indicator {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      background: rgba(0,200,255,0.08);
      border: 1px solid rgba(0,200,255,0.2);
      border-radius: 2px;
    }

    .t-dot {
      width: 4px; height: 4px;
      border-radius: 50%;
      background: var(--cyan);
      animation: t-bounce 1.2s ease-in-out infinite;
      &:nth-child(2) { animation-delay: 0.15s; }
      &:nth-child(3) { animation-delay: 0.3s; }
    }

    @keyframes t-bounce {
      0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
      40%           { opacity: 1; transform: translateY(-3px); }
    }

    .t-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      color: var(--cyan);
      letter-spacing: 0.12em;
      margin-left: 2px;
    }

    .group-folder-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--text-muted);
      letter-spacing: 0.06em;

      &::before { content: '/ '; color: var(--cyan); opacity: 0.5; }
    }

    .usage-panel {
      text-align: right;
      min-width: 130px;
    }

    .usage-track {
      height: 3px;
      background: rgba(0,200,255,0.1);
      border-radius: 1px;
      margin-bottom: 5px;
      overflow: hidden;
    }

    .usage-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--cyan), rgba(0,200,255,0.6));
      border-radius: 1px;
      transition: width 0.4s ease;
      box-shadow: 0 0 6px rgba(0,200,255,0.4);
    }

    .usage-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      color: var(--text-muted);
      letter-spacing: 0.08em;
    }

    .terminal-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      letter-spacing: 0.16em;
      color: var(--text-muted);
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
    }

    .message-stream {
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 1;
      max-height: 320px;
      overflow-y: auto;
      margin-bottom: 12px;

      &::-webkit-scrollbar { width: 4px; }
      &::-webkit-scrollbar-track { background: transparent; }
      &::-webkit-scrollbar-thumb { background: rgba(0,200,255,0.2); border-radius: 2px; }
    }

    .stream-empty, .stream-loading {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-muted);
      padding: 12px 0;
    }

    .message-entry {
      padding: 8px 12px;
      background: rgba(0,0,0,0.2);
      border-left: 2px solid rgba(0,200,255,0.12);
      border-radius: 0 2px 2px 0;
      transition: border-color 0.2s;

      &.is-bot {
        border-left-color: rgba(0,200,255,0.5);
        background: rgba(0,200,255,0.04);
      }

      &:hover { border-left-color: rgba(0,200,255,0.4); }
    }

    .entry-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .entry-source {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: var(--text-muted);
      letter-spacing: 0.08em;

      &.bot-source { color: var(--cyan); }
    }

    .entry-time {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: var(--text-muted);
      opacity: 0.6;
    }

    .entry-body {
      font-size: 13px;
      color: var(--text);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 72px;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      line-height: 1.5;
    }

    .thinking-entry { border-left-color: var(--cyan) !important; }

    .think-wave {
      display: flex;
      gap: 3px;
      padding: 4px 0;

      span {
        width: 16px; height: 3px;
        background: var(--cyan);
        border-radius: 1px;
        animation: wave 1.4s ease-in-out infinite;
        opacity: 0.4;

        &:nth-child(1) { animation-delay: 0s; }
        &:nth-child(2) { animation-delay: 0.12s; }
        &:nth-child(3) { animation-delay: 0.24s; }
        &:nth-child(4) { animation-delay: 0.36s; }
        &:nth-child(5) { animation-delay: 0.48s; }
      }
    }

    @keyframes wave {
      0%, 60%, 100% { opacity: 0.2; transform: scaleY(1); }
      30%            { opacity: 1; transform: scaleY(2.5); }
    }

    .transmit-row {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }

    .transmit-input {
      flex: 1;
      background: rgba(0, 10, 22, 0.8);
      border: 1px solid var(--border);
      border-radius: 2px;
      color: var(--cyan);
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      padding: 8px 12px;
      resize: none;
      line-height: 1.5;
      caret-color: var(--cyan);

      &:focus {
        outline: none;
        border-color: rgba(0,200,255,0.5);
        box-shadow: 0 0 12px rgba(0,200,255,0.06);
      }

      &::placeholder { color: var(--text-muted); }
      &:disabled { opacity: 0.4; }
    }

    .transmit-btn {
      background: rgba(0,200,255,0.1);
      border: 1px solid rgba(0,200,255,0.3);
      border-radius: 2px;
      color: var(--cyan);
      font-size: 16px;
      width: 40px;
      height: 40px;
      cursor: pointer;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;

      &:hover:not(:disabled) {
        background: rgba(0,200,255,0.2);
        box-shadow: 0 0 16px rgba(0,200,255,0.2);
      }

      &:disabled { opacity: 0.3; cursor: default; }
    }

    .sending-spin {
      display: inline-block;
      animation: spin 1s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }
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
