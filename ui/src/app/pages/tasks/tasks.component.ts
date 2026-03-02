import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, Task, Group, NewTask, TaskRun } from '../../services/api.service';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-header">
      <div class="page-title-block">
        <span class="page-prefix">// 03</span>
        <h1 class="page-title">TASK SCHEDULER</h1>
      </div>
      <button class="new-btn" (click)="showForm = !showForm">
        <span class="btn-icon">{{ showForm ? '✕' : '+' }}</span>
        <span>{{ showForm ? 'CANCEL' : 'NEW DIRECTIVE' }}</span>
      </button>
    </div>

    <!-- Create form -->
    <div class="card form-card" *ngIf="showForm">
      <div class="form-header">
        <span class="form-title-prefix">// NEW</span>
        <span class="form-title">SCHEDULED DIRECTIVE</span>
      </div>
      <div class="form-grid">
        <div class="form-group">
          <label>TARGET NODE</label>
          <select (change)="form.group_folder = $any($event.target).value">
            <option value="">Select group...</option>
            <option *ngFor="let g of groups" [value]="g.folder">{{ g.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>CONTEXT MODE</label>
          <select (change)="form.context_mode = $any($event.target).value">
            <option value="isolated">isolated — fresh session</option>
            <option value="group">group — with history</option>
          </select>
        </div>
        <div class="form-group">
          <label>REPEAT PATTERN</label>
          <select (change)="onScheduleTypeChange($any($event.target).value)">
            <option value="cron">Recurring (cron)</option>
            <option value="interval">Recurring (every X)</option>
            <option value="once">One-time</option>
          </select>
        </div>
        <div class="form-group">
          <label>EXECUTION TIME</label>
          <select *ngIf="form.schedule_type !== 'once'"
                  (change)="onPresetChange($any($event.target).value)">
            <option value="">Choose preset...</option>
            <option *ngFor="let p of schedulePresets" [value]="p.value">{{ p.label }}</option>
          </select>
          <input *ngIf="showCustomInput"
                 type="text"
                 class="custom-input"
                 [placeholder]="form.schedule_type === 'cron' ? 'e.g. 0 9 * * 1-5' : 'milliseconds, e.g. 3600000'"
                 [value]="form.schedule_value"
                 (input)="form.schedule_value = $any($event.target).value" />
          <input *ngIf="form.schedule_type === 'once'"
                 type="datetime-local"
                 [min]="minDateTime"
                 (change)="onDateTimeChange($any($event.target).value)" />
        </div>
        <div class="form-group full-width">
          <label>DIRECTIVE PROMPT</label>
          <textarea
            rows="3"
            placeholder="Describe what the agent should do..."
            [value]="form.prompt"
            (input)="form.prompt = $any($event.target).value"
          ></textarea>
        </div>
      </div>
      <div class="form-actions">
        <span class="form-error" *ngIf="formError">&gt; ERROR: {{ formError }}</span>
        <button class="submit-btn" (click)="submitForm()" [disabled]="submitting">
          <span *ngIf="!submitting">▶ QUEUE DIRECTIVE</span>
          <span *ngIf="submitting">◌ PROCESSING...</span>
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div *ngIf="loading" class="stream-loading">&gt; loading directives...</div>

    <!-- Empty -->
    <div *ngIf="!loading && tasks.length === 0" class="card">
      <div class="empty">NO ACTIVE DIRECTIVES &nbsp;·&nbsp; USE + NEW DIRECTIVE TO BEGIN</div>
    </div>

    <!-- Task table -->
    <div *ngIf="!loading && tasks.length > 0" class="card">
      <table>
        <thead>
          <tr>
            <th>NODE</th>
            <th>DIRECTIVE</th>
            <th>SCHEDULE</th>
            <th>NEXT EXEC</th>
            <th>LAST EXEC</th>
            <th>STATE</th>
            <th>CMD</th>
          </tr>
        </thead>
        <tbody>
          <ng-container *ngFor="let t of tasks">
            <tr [class.expanded]="expandedTaskId === t.id">
              <td><span class="tag">{{ t.group_folder }}</span></td>
              <td class="prompt-cell" [title]="t.prompt">{{ t.prompt | slice:0:80 }}{{ t.prompt.length > 80 ? '…' : '' }}</td>
              <td class="schedule-cell">
                <div class="schedule-label">{{ scheduleLabel(t) }}</div>
                <span class="tag small">{{ t.schedule_type }}</span>
              </td>
              <td class="mono small">{{ t.next_run ? (t.next_run | date:'dd MMM HH:mm') : '—' }}</td>
              <td class="mono small">{{ t.last_run ? (t.last_run | date:'dd MMM HH:mm') : '—' }}</td>
              <td><span class="badge" [class]="t.status">{{ t.status.toUpperCase() }}</span></td>
              <td class="actions-cell">
                <button class="cmd-btn pause-btn" *ngIf="t.status === 'active'" (click)="pause(t)" title="Pause">⏸</button>
                <button class="cmd-btn resume-btn" *ngIf="t.status === 'paused'" (click)="resume(t)" title="Resume">▶</button>
                <button class="cmd-btn history-btn" (click)="toggleHistory(t)" title="Run history">◷</button>
                <button class="cmd-btn cancel-btn" (click)="cancel(t)" title="Delete">✕</button>
              </td>
            </tr>
            <tr class="history-row" *ngIf="expandedTaskId === t.id">
              <td colspan="7">
                <div class="history-panel">
                  <div class="history-header">
                    <span class="history-prefix">// RUN HISTORY</span>
                    <span class="history-task">{{ t.group_folder }}</span>
                  </div>
                  <div class="history-loading" *ngIf="runsLoading">⠿ loading runs...</div>
                  <div class="history-empty" *ngIf="!runsLoading && taskRuns[t.id]?.length === 0">NO RUNS RECORDED YET</div>
                  <table class="history-table" *ngIf="!runsLoading && taskRuns[t.id]?.length">
                    <thead><tr>
                      <th>RUN AT</th><th>DURATION</th><th>STATUS</th><th>RESULT</th>
                    </tr></thead>
                    <tbody>
                      <tr *ngFor="let r of taskRuns[t.id]">
                        <td class="mono small">{{ r.run_at | date:'dd MMM HH:mm' }}</td>
                        <td class="mono small">{{ fmtDuration(r.duration_ms) }}</td>
                        <td><span class="run-badge" [class.run-success]="r.status === 'success'" [class.run-error]="r.status !== 'success'">{{ r.status }}</span></td>
                        <td class="run-result-cell" [title]="r.result || r.error || ''">{{ (r.result || r.error || '—') | slice:0:150 }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </td>
            </tr>
          </ng-container>
        </tbody>
      </table>
    </div>

    <!-- Summary -->
    <div class="summary-bar" *ngIf="!loading && tasks.length > 0">
      <span class="sum-item active-sum">{{ activeTasks }} ACTIVE</span>
      <span class="sum-sep">·</span>
      <span class="sum-item paused-sum">{{ pausedTasks }} PAUSED</span>
      <span class="sum-sep">·</span>
      <span class="sum-item">{{ tasks.length }} TOTAL</span>
    </div>

    <!-- Last result panel -->
    <div class="card result-card" *ngIf="selectedTask">
      <div class="result-header">
        <div class="result-title">
          <span class="result-prefix">// LAST RESULT</span>
          <span class="result-node">{{ selectedTask.group_folder }}</span>
        </div>
        <button class="close-btn" (click)="selectedTask = null">✕</button>
      </div>
      <pre class="result-text">{{ selectedTask.last_result || '> no result recorded.' }}</pre>
    </div>
  `,
  styles: [`
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 28px;
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

    .new-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(0,200,255,0.08);
      border: 1px solid rgba(0,200,255,0.3);
      border-radius: 2px;
      color: var(--cyan);
      padding: 8px 16px;
      font-size: 11px;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 500;
      letter-spacing: 0.1em;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        background: rgba(0,200,255,0.15);
        box-shadow: 0 0 16px rgba(0,200,255,0.15);
      }
    }

    .btn-icon { font-size: 14px; }

    /* Form */
    .form-card { margin-bottom: 20px; }

    .form-header {
      display: flex;
      align-items: baseline;
      gap: 10px;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }

    .form-title-prefix {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--cyan);
      opacity: 0.6;
    }

    .form-title {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.12em;
      color: var(--text);
    }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 16px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;

      &.full-width { grid-column: 1 / -1; }

      label {
        font-family: 'JetBrains Mono', monospace;
        font-size: 9px;
        letter-spacing: 0.16em;
        color: var(--text-muted);
      }

      select, input, textarea {
        width: 100%;
        &:focus { border-color: var(--cyan); }
      }

      textarea { resize: vertical; min-height: 72px; }
      .custom-input { margin-top: 6px; }
    }

    .form-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 14px;
    }

    .form-error {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--danger);
      letter-spacing: 0.04em;
    }

    .submit-btn {
      background: rgba(0,200,255,0.12);
      border: 1px solid rgba(0,200,255,0.35);
      border-radius: 2px;
      color: var(--cyan);
      padding: 8px 20px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.1em;
      cursor: pointer;
      transition: all 0.2s;

      &:disabled { opacity: 0.4; cursor: default; }

      &:hover:not(:disabled) {
        background: rgba(0,200,255,0.2);
        box-shadow: 0 0 12px rgba(0,200,255,0.15);
      }
    }

    /* Table */
    .prompt-cell { max-width: 220px; font-size: 12px; color: var(--text-muted); }
    .small       { font-size: 11px; }
    .schedule-cell { white-space: nowrap; }
    .schedule-label { font-size: 12px; margin-bottom: 4px; }

    /* Action buttons */
    .actions-cell { white-space: nowrap; }

    .cmd-btn {
      background: none;
      border: 1px solid var(--border);
      border-radius: 2px;
      color: var(--text-muted);
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      padding: 3px 8px;
      cursor: pointer;
      margin-right: 4px;
      transition: all 0.15s;
      letter-spacing: 0.04em;

      &.pause-btn:hover  { border-color: var(--warn);   color: var(--warn);   background: var(--warn-dim); }
      &.resume-btn:hover { border-color: var(--green);  color: var(--green);  background: var(--green-dim); }
      &.cancel-btn:hover { border-color: var(--danger); color: var(--danger); background: var(--danger-dim); }
    }

    /* Summary */
    .summary-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 14px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.1em;
    }

    .sum-item { color: var(--text-muted); }
    .active-sum { color: var(--green); }
    .paused-sum { color: var(--warn); }
    .sum-sep    { color: var(--border); }

    /* Loading */
    .stream-loading {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-muted);
      padding: 20px 0;
    }

    /* Result panel */
    .result-card { margin-top: 16px; }

    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border);
    }

    .result-title {
      display: flex;
      align-items: baseline;
      gap: 10px;
    }

    .result-prefix {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: var(--cyan);
      opacity: 0.6;
    }

    .result-node {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-muted);
    }

    .close-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 13px;
      padding: 2px 6px;
      transition: color 0.15s;
      &:hover { color: var(--danger); }
    }

    .result-text {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 300px;
      overflow-y: auto;
      background: rgba(0,0,0,0.3);
      border: 1px solid var(--border);
      border-radius: 2px;
      padding: 12px;
      margin: 0;
      line-height: 1.6;

      &::-webkit-scrollbar { width: 4px; }
      &::-webkit-scrollbar-thumb { background: rgba(0,200,255,0.2); border-radius: 2px; }
    }

    /* Run history */
    .history-btn { &:hover { border-color: var(--purple); color: var(--purple); background: rgba(123,47,255,0.1); } }

    tr.expanded td { border-bottom: none; }

    .history-row td {
      padding: 0;
      border-top: none;
      background: rgba(0,0,0,0.25);
    }

    .history-panel {
      padding: 14px 20px;
      border-top: 1px solid rgba(0,200,255,0.06);
    }

    .history-header {
      display: flex;
      align-items: baseline;
      gap: 10px;
      margin-bottom: 10px;
    }

    .history-prefix {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      letter-spacing: 0.14em;
      color: var(--cyan);
      opacity: 0.6;
    }

    .history-task {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: var(--text-muted);
    }

    .history-loading, .history-empty {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--text-muted);
      padding: 6px 0;
    }

    .history-table {
      width: 100%;
      font-size: 11px;
      th { font-size: 9px; letter-spacing: 0.12em; padding: 0 12px 6px 0; font-weight: 600; }
      td { padding: 4px 12px 4px 0; vertical-align: top; border: none; }
    }

    .run-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      padding: 2px 5px;
      border-radius: 2px;
      letter-spacing: 0.08em;
      &.run-success { background: rgba(0,255,136,0.1); color: var(--green); border: 1px solid rgba(0,255,136,0.2); }
      &.run-error   { background: rgba(255,51,102,0.1); color: var(--danger); border: 1px solid rgba(255,51,102,0.2); }
    }

    .run-result-cell {
      color: var(--text-muted);
      max-width: 500px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `],
})
export class TasksComponent implements OnInit {
  private api = inject(ApiService);

  tasks: Task[] = [];
  groups: Group[] = [];
  loading = true;
  showForm = false;
  submitting = false;
  formError = '';
  selectedTask: Task | null = null;
  expandedTaskId: string | null = null;
  taskRuns: Record<string, TaskRun[]> = {};
  runsLoading = false;

  form: NewTask = {
    group_folder: '',
    prompt: '',
    schedule_type: 'cron',
    schedule_value: '',
    context_mode: 'isolated',
  };
  showCustomInput = false;

  get minDateTime(): string {
    return new Date().toISOString().slice(0, 16);
  }

  get schedulePresets(): { label: string; value: string }[] {
    if (this.form.schedule_type === 'cron') {
      return [
        { label: 'Every minute',             value: '* * * * *' },
        { label: 'Every 15 minutes',         value: '*/15 * * * *' },
        { label: 'Every 30 minutes',         value: '*/30 * * * *' },
        { label: 'Every hour',               value: '0 * * * *' },
        { label: 'Every 4 hours',            value: '0 */4 * * *' },
        { label: 'Every 6 hours',            value: '0 */6 * * *' },
        { label: 'Daily at midnight',        value: '0 0 * * *' },
        { label: 'Daily at 8 AM',            value: '0 8 * * *' },
        { label: 'Daily at 9 AM',            value: '0 9 * * *' },
        { label: 'Daily at noon',            value: '0 12 * * *' },
        { label: 'Weekdays at 8 AM',         value: '0 8 * * 1-5' },
        { label: 'Weekdays at 9 AM',         value: '0 9 * * 1-5' },
        { label: 'Mondays at 9 AM',          value: '0 9 * * 1' },
        { label: 'Monthly on 1st at 9 AM',   value: '0 9 1 * *' },
        { label: 'Custom cron expression…',  value: '__custom__' },
      ];
    }
    return [
      { label: 'Every 15 minutes',  value: '900000' },
      { label: 'Every 30 minutes',  value: '1800000' },
      { label: 'Every 1 hour',      value: '3600000' },
      { label: 'Every 2 hours',     value: '7200000' },
      { label: 'Every 4 hours',     value: '14400000' },
      { label: 'Every 6 hours',     value: '21600000' },
      { label: 'Every 12 hours',    value: '43200000' },
      { label: 'Every day',         value: '86400000' },
      { label: 'Custom (ms)…',      value: '__custom__' },
    ];
  }

  onScheduleTypeChange(val: string): void {
    this.form.schedule_type = val as 'cron' | 'interval' | 'once';
    this.form.schedule_value = '';
    this.showCustomInput = false;
  }

  onPresetChange(val: string): void {
    if (val === '__custom__') {
      this.showCustomInput = true;
      this.form.schedule_value = '';
    } else {
      this.showCustomInput = false;
      this.form.schedule_value = val;
    }
  }

  onDateTimeChange(val: string): void {
    this.form.schedule_value = val ? new Date(val).toISOString() : '';
  }

  get activeTasks() { return this.tasks.filter(t => t.status === 'active').length; }
  get pausedTasks()  { return this.tasks.filter(t => t.status === 'paused').length; }

  scheduleLabel(t: Task): string {
    if (t.schedule_type === 'interval') return this.intervalLabel(parseInt(t.schedule_value));
    if (t.schedule_type === 'once')     return this.onceLabel(t.schedule_value);
    if (t.schedule_type === 'cron')     return this.cronLabel(t.schedule_value);
    return t.schedule_value;
  }

  private intervalLabel(ms: number): string {
    if (isNaN(ms) || ms <= 0) return 'Invalid interval';
    if (ms < 60_000)          return `Every ${ms / 1000}s`;
    if (ms < 3_600_000)       return `Every ${this.round(ms / 60_000)} min`;
    if (ms < 86_400_000)      return `Every ${this.round(ms / 3_600_000)} hr`;
    return `Every ${this.round(ms / 86_400_000)} day${ms >= 2 * 86_400_000 ? 's' : ''}`;
  }

  private onceLabel(value: string): string {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return `Once — ${d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
  }

  private cronLabel(cron: string): string {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return cron;
    const [min, hr, dom, mon, dow] = parts;

    if (min === '*' && hr === '*' && dom === '*' && mon === '*' && dow === '*')
      return 'Every minute';

    const minStep = min.match(/^\*\/(\d+)$/);
    if (minStep && hr === '*' && dom === '*' && mon === '*' && dow === '*')
      return `Every ${minStep[1]} min`;

    if (min === '0' && hr === '*' && dom === '*' && mon === '*' && dow === '*')
      return 'Every hour';

    const hrStep = hr.match(/^\*\/(\d+)$/);
    if (hrStep && dom === '*' && mon === '*' && dow === '*') {
      const m = parseInt(min);
      const suffix = !isNaN(m) && m > 0 ? ` at :${String(m).padStart(2, '0')}` : '';
      return `Every ${hrStep[1]} hr${suffix}`;
    }

    const h = parseInt(hr), m = parseInt(min);
    if (!isNaN(h) && !isNaN(m) && mon === '*') {
      const time = this.fmtTime(h, m);

      if (dow === '*' && dom !== '*') {
        const d = parseInt(dom);
        return !isNaN(d) ? `Monthly on the ${this.ordinal(d)} at ${time}` : cron;
      }

      if (dom === '*') {
        if (dow === '*')                                    return `Daily at ${time}`;
        if (dow === '1-5' || dow === '1,2,3,4,5')          return `Weekdays at ${time}`;
        if (dow === '6,0' || dow === '0,6' || dow === '6') return `Weekends at ${time}`;
        const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const d = parseInt(dow);
        if (!isNaN(d) && d >= 0 && d <= 7) return `${names[d % 7]}s at ${time}`;
        const days = dow.split(',').map(Number);
        if (days.every(n => !isNaN(n) && n >= 0 && n <= 7))
          return `${days.map(n => names[n % 7]).join(', ')} at ${time}`;
      }
    }

    return cron;
  }

  private fmtTime(h: number, m: number): string {
    const period = h >= 12 ? 'PM' : 'AM';
    const dh = h % 12 || 12;
    const dm = m > 0 ? `:${String(m).padStart(2, '0')}` : '';
    return `${dh}${dm} ${period}`;
  }

  private ordinal(n: number): string {
    const s = ['th','st','nd','rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  private round(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  toggleHistory(t: Task): void {
    if (this.expandedTaskId === t.id) {
      this.expandedTaskId = null;
      return;
    }
    this.expandedTaskId = t.id;
    if (!this.taskRuns[t.id]) {
      this.runsLoading = true;
      this.api.getTaskRuns(t.id).subscribe({
        next: (runs) => { this.taskRuns[t.id] = runs; this.runsLoading = false; },
        error: () => { this.taskRuns[t.id] = []; this.runsLoading = false; },
      });
    }
  }

  fmtDuration(ms: number): string {
    if (!ms || ms < 1000) return `${ms || 0}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  }

  ngOnInit(): void {
    this.load();
    this.api.groups().subscribe({ next: g => this.groups = g, error: () => {} });
  }

  load(): void {
    this.loading = true;
    this.api.allTasks().subscribe({
      next: t => { this.tasks = t; this.loading = false; },
      error: () => this.loading = false,
    });
  }

  pause(t: Task): void {
    this.api.pauseTask(t.id).subscribe({ next: () => this.load(), error: () => {} });
  }

  resume(t: Task): void {
    this.api.resumeTask(t.id).subscribe({ next: () => this.load(), error: () => {} });
  }

  cancel(t: Task): void {
    if (!confirm(`Delete task?\n\n"${t.prompt.slice(0, 120)}"`)) return;
    this.api.cancelTask(t.id).subscribe({ next: () => this.load(), error: () => {} });
  }

  submitForm(): void {
    this.formError = '';
    if (!this.form.group_folder) { this.formError = 'Select a target node.'; return; }
    if (!this.form.prompt.trim()) { this.formError = 'Prompt is required.'; return; }
    if (!this.form.schedule_value.trim()) { this.formError = 'Schedule value is required.'; return; }

    this.submitting = true;
    this.api.createTask({ ...this.form, prompt: this.form.prompt.trim() }).subscribe({
      next: () => {
        this.submitting = false;
        this.showForm = false;
        this.showCustomInput = false;
        this.form = { group_folder: '', prompt: '', schedule_type: 'cron', schedule_value: '', context_mode: 'isolated' };
        this.load();
      },
      error: (err) => {
        this.submitting = false;
        this.formError = err?.error?.error || 'Failed to create directive.';
      },
    });
  }
}
