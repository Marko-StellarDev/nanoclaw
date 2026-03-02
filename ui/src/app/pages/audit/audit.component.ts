import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, AuditEvent, Group } from '../../services/api.service';

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-header">
      <div class="page-title-block">
        <span class="page-prefix">// 04</span>
        <h1 class="page-title">AUDIT STREAM</h1>
      </div>
      <div class="controls">
        <select (change)="onGroupChange($event)">
          <option value="">ALL NODES</option>
          <option *ngFor="let g of groups" [value]="g.folder">{{ g.name }}</option>
        </select>
        <button (click)="load()" class="refresh-btn">⟳ REFRESH</button>
        <div class="live-indicator" [class.active]="liveMode">
          <span class="live-dot"></span>
          <span class="live-label">LIVE</span>
        </div>
      </div>
    </div>

    <div *ngIf="loading" class="stream-loading">&gt; reading event stream...</div>

    <div *ngIf="!loading && events.length === 0" class="card">
      <div class="empty">NO EVENTS RECORDED</div>
    </div>

    <div *ngIf="!loading && events.length > 0" class="card event-card">
      <table>
        <thead>
          <tr>
            <th style="width:140px">TIMESTAMP</th>
            <th style="width:110px">NODE</th>
            <th style="width:130px">TYPE</th>
            <th>EVENT</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let e of events" [class]="'row-' + e.type">
            <td class="mono time-cell" [title]="e.ts">{{ e.ts | date:'dd MMM HH:mm:ss' }}</td>
            <td><span class="tag">{{ e.group_folder }}</span></td>
            <td class="type-cell">
              <span class="badge" [class]="typeBadgeClass(e)">{{ typeLabel(e) }}</span>
              <span *ngIf="(e.type === 'task' || e.type === 'bot') && e.model" class="model-tag">{{ shortModel(e.model) }}</span>
            </td>
            <td class="activity-cell" [title]="e.detail">
              <span *ngIf="e.type === 'activity'" class="tool-glyph">{{ toolIcon(e.tool) }}</span>
              {{ e.summary }}{{ e.summary.length >= 100 ? '…' : '' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="stream-footer" *ngIf="events.length > 0">
      <span class="footer-label">{{ events.length }} EVENTS</span>
      <span class="footer-sep">·</span>
      <span class="footer-stat user-stat">{{ userCount }} USER</span>
      <span class="footer-sep">·</span>
      <span class="footer-stat bot-stat">{{ botCount }} BOT</span>
      <span class="footer-sep">·</span>
      <span class="footer-stat task-stat">{{ taskCount }} TASK</span>
      <span class="footer-sep">·</span>
      <span class="footer-stat">{{ activityCount }} STEPS</span>
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

    .controls {
      display: flex;
      align-items: center;
      gap: 10px;

      select { min-width: 130px; }
    }

    .refresh-btn {
      background: rgba(0,200,255,0.06);
      border: 1px solid var(--border);
      border-radius: 2px;
      color: var(--text-muted);
      padding: 6px 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      letter-spacing: 0.08em;
      cursor: pointer;
      transition: all 0.15s;

      &:hover {
        background: rgba(0,200,255,0.12);
        border-color: rgba(0,200,255,0.3);
        color: var(--cyan);
      }
    }

    .live-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border: 1px solid var(--border);
      border-radius: 2px;
      background: rgba(4,22,46,0.6);

      .live-dot {
        width: 6px; height: 6px;
        border-radius: 50%;
        background: var(--text-muted);
        flex-shrink: 0;
      }

      .live-label {
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        letter-spacing: 0.14em;
        color: var(--text-muted);
      }

      &.active {
        border-color: rgba(0,255,136,0.2);
        background: rgba(0,255,136,0.05);

        .live-dot {
          background: var(--green);
          box-shadow: 0 0 8px var(--green);
          animation: live-pulse 2s ease-in-out infinite;
        }

        .live-label { color: var(--green); }
      }
    }

    @keyframes live-pulse {
      0%, 100% { box-shadow: 0 0 8px var(--green); }
      50%       { box-shadow: 0 0 16px var(--green), 0 0 24px rgba(0,255,136,0.2); }
    }

    /* Event card */
    .event-card { padding: 0; overflow: hidden; }

    /* Time */
    .time-cell {
      color: var(--text-muted);
      white-space: nowrap;
      font-size: 11px;
    }

    /* Activity cell */
    .activity-cell {
      font-size: 12px;
      max-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: default;
      font-family: 'JetBrains Mono', monospace;
    }

    .tool-glyph {
      font-style: normal;
      margin-right: 6px;
      opacity: 0.7;
    }

    /* Row tints */
    .row-user td     { border-left: 2px solid rgba(140,190,215,0.2); }
    .row-bot td      { border-left: 2px solid rgba(0,200,255,0.3); background: rgba(0,200,255,0.02); }
    .row-task td     { border-left: 2px solid rgba(255,106,0,0.3); background: rgba(255,106,0,0.02); }
    .row-activity td {
      border-left: 2px solid transparent;
      opacity: 0.55;
      font-size: 11px;
    }

    /* Type cell */
    .type-cell { white-space: nowrap; vertical-align: middle; }

    .model-tag {
      display: block;
      margin-top: 3px;
      font-size: 9px;
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-muted);
      background: rgba(0,200,255,0.06);
      border: 1px solid var(--border);
      border-radius: 2px;
      padding: 1px 5px;
      letter-spacing: 0.04em;
    }

    /* Footer */
    .stream-footer {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 14px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.1em;
    }

    .footer-label { color: var(--text-muted); }
    .footer-sep   { color: var(--border); }
    .footer-stat  { color: var(--text-muted); }
    .user-stat    { color: rgba(140,190,215,0.7); }
    .bot-stat     { color: rgba(0,200,255,0.7); }
    .task-stat    { color: rgba(255,106,0,0.7); }

    /* Loading */
    .stream-loading {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-muted);
      padding: 20px 0;
    }
  `],
})
export class AuditComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);

  events: AuditEvent[] = [];
  groups: Group[] = [];
  loading = true;
  liveMode = true;
  private selectedGroup = '';
  private timer: ReturnType<typeof setInterval> | null = null;

  get userCount()     { return this.events.filter(e => e.type === 'user').length; }
  get botCount()      { return this.events.filter(e => e.type === 'bot').length; }
  get taskCount()     { return this.events.filter(e => e.type === 'task').length; }
  get activityCount() { return this.events.filter(e => e.type === 'activity').length; }

  typeLabel(e: AuditEvent): string {
    if (e.type === 'user')     return 'USER';
    if (e.type === 'bot')      return 'BOT';
    if (e.type === 'activity') return e.tool || 'STEP';
    return e.status === 'error' ? 'TASK ✗' : 'TASK ✓';
  }

  typeBadgeClass(e: AuditEvent): string {
    if (e.type === 'user')     return 'user';
    if (e.type === 'bot')      return 'bot';
    if (e.type === 'activity') return 'activity';
    return e.status === 'error' ? 'paused task' : 'active task';
  }

  shortModel(model?: string): string {
    if (!model) return '';
    return model.replace(/^claude-/, '').replace(/-(\d+)-(\d+).*$/, '-$1.$2');
  }

  toolIcon(tool?: string): string {
    const icons: Record<string, string> = {
      Bash: '⚙', WebFetch: '◎', WebSearch: '◉',
      Read: '▤', Write: '▦', Edit: '▦', Glob: '▣', Grep: '◈',
      Task: '◈', TodoWrite: '✓',
    };
    return tool ? (icons[tool] || '▸') : '▸';
  }

  ngOnInit(): void {
    this.api.groups().subscribe({ next: g => this.groups = g, error: () => {} });
    this.load();
    this.timer = setInterval(() => this.load(false), 5000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  load(showSpinner = true): void {
    if (showSpinner) this.loading = true;
    const group = this.selectedGroup || undefined;
    this.api.audit(200, group).subscribe({
      next: events => { this.events = events; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  onGroupChange(event: Event): void {
    this.selectedGroup = (event.target as HTMLSelectElement).value;
    this.load();
  }
}
