import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, AuditEvent, Group } from '../../services/api.service';

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="header-row">
      <h1 class="page-title">Audit Log</h1>
      <div class="controls">
        <select (change)="onGroupChange($event)">
          <option value="">All groups</option>
          <option *ngFor="let g of groups" [value]="g.folder">{{ g.name }}</option>
        </select>
        <button (click)="load()" class="refresh-btn">Refresh</button>
        <span class="live-dot" [class.active]="liveMode" title="Auto-refresh every 5s">Live</span>
      </div>
    </div>

    <div *ngIf="loading" class="loading">Loading...</div>

    <div *ngIf="!loading && events.length === 0" class="card empty">
      No activity recorded yet.
    </div>

    <div *ngIf="!loading && events.length > 0" class="card">
      <table>
        <thead>
          <tr>
            <th style="width:130px">Time</th>
            <th style="width:110px">Group</th>
            <th style="width:100px">Type</th>
            <th>Activity</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let e of events" [class]="'row-' + e.type">
            <td class="mono time-cell" [title]="e.ts">{{ e.ts | date:'dd MMM HH:mm:ss' }}</td>
            <td><span class="tag">{{ e.group_folder }}</span></td>
            <td><span class="badge" [class]="typeBadgeClass(e)">{{ typeLabel(e) }}</span></td>
            <td class="activity-cell" [title]="e.detail">
              <span *ngIf="e.type === 'activity'" class="tool-icon">{{ toolIcon(e.tool) }}</span>
              {{ e.summary }}{{ e.summary.length >= 100 ? '…' : '' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="footer" *ngIf="events.length > 0">
      Showing {{ events.length }} events &middot;
      <span class="tag">{{ userCount }} user</span>
      <span class="tag">{{ botCount }} bot</span>
      <span class="tag">{{ taskCount }} task</span>
      <span class="tag">{{ activityCount }} steps</span>
    </div>
  `,
  styles: [`
    .header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .page-title { font-size: 20px; font-weight: 700; }

    .controls {
      display: flex;
      align-items: center;
      gap: 10px;

      select {
        background: var(--surface);
        border: 1px solid var(--border);
        color: var(--text);
        padding: 5px 10px;
        border-radius: 5px;
        font-size: 13px;
        cursor: pointer;
      }
    }

    .refresh-btn {
      background: var(--border);
      border: none;
      color: var(--text-muted);
      padding: 5px 12px;
      border-radius: 5px;
      font-size: 13px;
      cursor: pointer;
      &:hover { background: var(--accent-dim); color: var(--text); }
    }

    .live-dot {
      font-size: 11px;
      color: var(--text-muted);
      padding: 4px 8px;
      border-radius: 10px;
      border: 1px solid var(--border);
      cursor: default;
      &.active { color: var(--success); border-color: var(--success); background: rgba(34,197,94,0.08); }
    }

    .time-cell { color: var(--text-muted); white-space: nowrap; }

    .activity-cell {
      font-size: 13px;
      max-width: 0;        /* forces truncation inside table */
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: default;
    }

    /* row tints */
    .row-bot td      { background: rgba(99,102,241,0.04); }
    .row-task td     { background: rgba(249,115,22,0.04); }
    .row-activity td {
      opacity: 0.65;
      font-style: italic;
      font-size: 12px;
    }

    .tool-icon {
      font-style: normal;
      margin-right: 4px;
    }

    /* activity badge */
    .badge.activity { background: rgba(148,163,184,0.15); color: var(--text-muted); }

    .footer {
      margin-top: 12px;
      font-size: 12px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* task badge colour */
    .badge.task { background: rgba(249,115,22,0.15); color: var(--keb); }
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
    if (e.type === 'user')     return 'User';
    if (e.type === 'bot')      return 'Bot';
    if (e.type === 'activity') return e.tool || 'Step';
    return e.status === 'error' ? 'Task ✗' : 'Task ✓';
  }

  typeBadgeClass(e: AuditEvent): string {
    if (e.type === 'user')     return 'user';
    if (e.type === 'bot')      return 'bot';
    if (e.type === 'activity') return 'activity';
    return e.status === 'error' ? 'paused task' : 'active task';
  }

  toolIcon(tool?: string): string {
    const icons: Record<string, string> = {
      Bash: '⚙', WebFetch: '🌐', WebSearch: '🔍',
      Read: '📄', Write: '✏', Edit: '✏', Glob: '📁', Grep: '🔎',
      Task: '🤖', TodoWrite: '✓',
    };
    return tool ? (icons[tool] || '▸') : '▸';
  }

  ngOnInit(): void {
    this.api.groups().subscribe({ next: g => this.groups = g, error: () => {} });
    this.load();
    // Auto-refresh every 5 seconds
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
