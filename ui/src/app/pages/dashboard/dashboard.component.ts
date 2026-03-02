import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService, Group, Message, MonthlyUsage } from '../../services/api.service';

interface GroupState {
  group: Group;
  messages: Message[];
  usage: MonthlyUsage | null;
  loading: boolean;
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
        <div class="group-header">
          <div>
            <div class="group-name">{{ gs.group.name }}</div>
            <span class="tag">{{ gs.group.folder }}</span>
            <span class="tag mono">{{ gs.group.trigger }}</span>
          </div>
          <div class="usage-mini" *ngIf="gs.usage">
            <div class="usage-bar">
              <div class="usage-fill" [style.width.%]="gs.usage.budget_used_pct"></div>
            </div>
            <span class="usage-label">{{ gs.usage.budget_used_pct }}% budget &middot; {{ gs.usage.runs }} runs</span>
          </div>
        </div>

        <div class="section-title" style="margin-top:16px">Recent messages</div>
        <div *ngIf="gs.loading" class="loading">Loading...</div>
        <div *ngIf="!gs.loading && gs.messages.length === 0" class="empty">No messages yet</div>
        <div class="message-list" *ngIf="!gs.loading">
          <div *ngFor="let m of gs.messages.slice(-8)" class="message" [class.bot]="m.is_bot_message">
            <div class="msg-meta">
              <span class="badge" [class.bot]="m.is_bot_message" [class.user]="!m.is_bot_message">
                {{ m.is_bot_message ? 'StellarBot' : m.sender_name || 'User' }}
              </span>
              <span class="msg-time">{{ m.timestamp | date:'HH:mm' }}</span>
            </div>
            <div class="msg-content">{{ m.content }}</div>
          </div>
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

    .group-card { }

    .group-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 4px;

      .group-name { font-size: 16px; font-weight: 600; margin-bottom: 6px; }
      .tag { margin-right: 4px; }
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

    .message-list { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }

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
  `],
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);

  health: any = null;
  healthError = false;
  groupStates: GroupState[] = [];

  ngOnInit(): void {
    this.api.health().subscribe({
      next: h => this.health = h,
      error: () => this.healthError = true,
    });

    this.api.groups().subscribe(groups => {
      this.groupStates = groups.map(g => ({ group: g, messages: [], usage: null, loading: true }));
      for (const gs of this.groupStates) {
        this.loadGroup(gs);
      }
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

  formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
}
