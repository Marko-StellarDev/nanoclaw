import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, Task, Group, NewTask } from '../../services/api.service';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Header -->
    <div class="header-row">
      <h1 class="page-title">Scheduled Tasks</h1>
      <button class="new-btn" (click)="showForm = !showForm">
        {{ showForm ? '✕ Cancel' : '＋ New Task' }}
      </button>
    </div>

    <!-- Create form -->
    <div class="card form-card" *ngIf="showForm">
      <div class="form-title">Create Scheduled Task</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Group</label>
          <select (change)="form.group_folder = $any($event.target).value">
            <option value="">Select group…</option>
            <option *ngFor="let g of groups" [value]="g.folder">{{ g.name }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>Context Mode</label>
          <select (change)="form.context_mode = $any($event.target).value">
            <option value="isolated">isolated (fresh session)</option>
            <option value="group">group (with history)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Repeat</label>
          <select (change)="onScheduleTypeChange($any($event.target).value)">
            <option value="cron">Recurring (cron)</option>
            <option value="interval">Recurring (every X)</option>
            <option value="once">One-time</option>
          </select>
        </div>
        <div class="form-group">
          <label>When to run</label>
          <!-- cron or interval: preset dropdown -->
          <select *ngIf="form.schedule_type !== 'once'"
                  (change)="onPresetChange($any($event.target).value)">
            <option value="">Choose…</option>
            <option *ngFor="let p of schedulePresets" [value]="p.value">{{ p.label }}</option>
          </select>
          <!-- custom free-text fallback -->
          <input *ngIf="showCustomInput"
                 type="text"
                 class="custom-input"
                 [placeholder]="form.schedule_type === 'cron' ? 'e.g. 0 9 * * 1-5' : 'milliseconds, e.g. 3600000'"
                 [value]="form.schedule_value"
                 (input)="form.schedule_value = $any($event.target).value" />
          <!-- once: date+time picker -->
          <input *ngIf="form.schedule_type === 'once'"
                 type="datetime-local"
                 [min]="minDateTime"
                 (change)="onDateTimeChange($any($event.target).value)" />
        </div>
        <div class="form-group full-width">
          <label>Prompt</label>
          <textarea
            rows="3"
            placeholder="What should the agent do?"
            [value]="form.prompt"
            (input)="form.prompt = $any($event.target).value"
          ></textarea>
        </div>
      </div>
      <div class="form-actions">
        <span class="form-error" *ngIf="formError">{{ formError }}</span>
        <button class="submit-btn" (click)="submitForm()" [disabled]="submitting">
          {{ submitting ? 'Creating…' : 'Create Task' }}
        </button>
      </div>
    </div>

    <!-- Tasks table -->
    <div *ngIf="loading" class="loading">Loading tasks...</div>

    <div *ngIf="!loading && tasks.length === 0" class="card empty">
      No scheduled tasks yet. Create one above.
    </div>

    <div *ngIf="!loading && tasks.length > 0" class="card">
      <table>
        <thead>
          <tr>
            <th>Group</th>
            <th>Prompt</th>
            <th>Schedule</th>
            <th>Next Run</th>
            <th>Last Run</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let t of tasks">
            <td><span class="tag">{{ t.group_folder }}</span></td>
            <td class="prompt-cell" [title]="t.prompt">{{ t.prompt | slice:0:80 }}{{ t.prompt.length > 80 ? '…' : '' }}</td>
            <td class="schedule-cell">
              <span class="schedule-english">{{ scheduleLabel(t) }}</span>
              <span class="tag small">{{ t.schedule_type }}</span>
            </td>
            <td class="mono small">{{ t.next_run ? (t.next_run | date:'dd MMM HH:mm') : '—' }}</td>
            <td class="mono small">{{ t.last_run ? (t.last_run | date:'dd MMM HH:mm') : '—' }}</td>
            <td><span class="badge" [class]="t.status">{{ t.status }}</span></td>
            <td class="actions-cell">
              <button class="action-btn pause" *ngIf="t.status === 'active'" (click)="pause(t)" title="Pause">⏸</button>
              <button class="action-btn resume" *ngIf="t.status === 'paused'" (click)="resume(t)" title="Resume">▶</button>
              <button class="action-btn cancel" (click)="cancel(t)" title="Delete">✕</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="summary" *ngIf="!loading && tasks.length > 0">
      <span class="tag">{{ activeTasks }} active</span>
      <span class="tag">{{ pausedTasks }} paused</span>
      <span class="tag">{{ tasks.length }} total</span>
    </div>

    <!-- Last result expand -->
    <div class="card result-card" *ngIf="selectedTask">
      <div class="result-header">
        <span class="section-title">Last Result — {{ selectedTask.group_folder }}</span>
        <button class="close-btn" (click)="selectedTask = null">✕</button>
      </div>
      <pre class="result-text">{{ selectedTask.last_result || 'No result yet.' }}</pre>
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

    .new-btn {
      background: var(--accent);
      border: none;
      color: #fff;
      padding: 7px 14px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      transition: opacity 0.15s;
      &:hover { opacity: 0.85; }
    }

    /* Create form */
    .form-card { margin-bottom: 20px; }
    .form-title { font-size: 14px; font-weight: 600; margin-bottom: 16px; }

    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 5px;

      &.full-width { grid-column: 1 / -1; }

      label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }

      input, select, textarea {
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 5px;
        color: var(--text);
        font-size: 13px;
        padding: 6px 10px;
        font-family: inherit;
        &:focus { outline: none; border-color: var(--accent); }
      }
      textarea { resize: vertical; }
      .custom-input { margin-top: 6px; }

      input[type="datetime-local"] {
        color-scheme: dark;
      }
    }

    .form-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
    }

    .form-error { font-size: 12px; color: var(--danger); }

    .submit-btn {
      background: var(--accent);
      border: none;
      color: #fff;
      padding: 7px 16px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      &:disabled { opacity: 0.5; cursor: default; }
      &:hover:not(:disabled) { opacity: 0.85; }
    }

    /* Table */
    .prompt-cell { max-width: 220px; font-size: 13px; color: var(--text-muted); cursor: default; }
    .small { font-size: 11px; }

    .schedule-cell { white-space: nowrap; }
    .schedule-english { display: block; font-size: 13px; margin-bottom: 4px; }
    .summary { display: flex; gap: 8px; margin-top: 16px; }

    /* Action buttons */
    .actions-cell { white-space: nowrap; }

    .action-btn {
      background: none;
      border: 1px solid var(--border);
      border-radius: 4px;
      color: var(--text-muted);
      font-size: 12px;
      padding: 3px 7px;
      cursor: pointer;
      margin-right: 4px;
      transition: all 0.15s;

      &.pause:hover  { border-color: var(--warn); color: var(--warn); }
      &.resume:hover { border-color: var(--success); color: var(--success); }
      &.cancel:hover { border-color: var(--danger); color: var(--danger); }
    }

    /* Last result panel */
    .result-card { margin-top: 16px; }
    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .close-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 14px;
      &:hover { color: var(--text); }
    }
    .result-text {
      font-size: 12px;
      color: var(--text);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 300px;
      overflow-y: auto;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 5px;
      padding: 10px;
      margin: 0;
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

    // Every minute
    if (min === '*' && hr === '*' && dom === '*' && mon === '*' && dow === '*')
      return 'Every minute';

    // Every N minutes: */N * * * *
    const minStep = min.match(/^\*\/(\d+)$/);
    if (minStep && hr === '*' && dom === '*' && mon === '*' && dow === '*')
      return `Every ${minStep[1]} min`;

    // Every hour: 0 * * * *
    if (min === '0' && hr === '*' && dom === '*' && mon === '*' && dow === '*')
      return 'Every hour';

    // Every N hours: 0 */N * * *
    const hrStep = hr.match(/^\*\/(\d+)$/);
    if (hrStep && dom === '*' && mon === '*' && dow === '*') {
      const m = parseInt(min);
      const suffix = !isNaN(m) && m > 0 ? ` at :${String(m).padStart(2, '0')}` : '';
      return `Every ${hrStep[1]} hr${suffix}`;
    }

    // Has a fixed time: X Y ...
    const h = parseInt(hr), m = parseInt(min);
    if (!isNaN(h) && !isNaN(m) && mon === '*') {
      const time = this.fmtTime(h, m);

      // Monthly: X Y D * *
      if (dow === '*' && dom !== '*') {
        const d = parseInt(dom);
        return !isNaN(d) ? `Monthly on the ${this.ordinal(d)} at ${time}` : cron;
      }

      // Day-of-week patterns
      if (dom === '*') {
        if (dow === '*')                                    return `Daily at ${time}`;
        if (dow === '1-5' || dow === '1,2,3,4,5')          return `Weekdays at ${time}`;
        if (dow === '6,0' || dow === '0,6' || dow === '6') return `Weekends at ${time}`;
        const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        // Single day
        const d = parseInt(dow);
        if (!isNaN(d) && d >= 0 && d <= 7) return `${names[d % 7]}s at ${time}`;
        // Comma list of days
        const days = dow.split(',').map(Number);
        if (days.every(n => !isNaN(n) && n >= 0 && n <= 7))
          return `${days.map(n => names[n % 7]).join(', ')} at ${time}`;
      }
    }

    return cron; // fall back to raw for unusual expressions
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
    if (!this.form.group_folder) { this.formError = 'Select a group.'; return; }
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
        this.formError = err?.error?.error || 'Failed to create task.';
      },
    });
  }
}
