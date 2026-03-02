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
          <label>Schedule Type</label>
          <select (change)="form.schedule_type = $any($event.target).value; form.schedule_value = ''">
            <option value="cron">cron</option>
            <option value="interval">interval (ms)</option>
            <option value="once">once (ISO date)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Schedule Value</label>
          <input
            type="text"
            [placeholder]="schedulePlaceholder"
            [value]="form.schedule_value"
            (input)="form.schedule_value = $any($event.target).value"
          />
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
            <td>
              <span class="tag">{{ t.schedule_type }}</span><br>
              <span class="mono small">{{ t.schedule_value }}</span>
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

  get activeTasks() { return this.tasks.filter(t => t.status === 'active').length; }
  get pausedTasks()  { return this.tasks.filter(t => t.status === 'paused').length; }

  get schedulePlaceholder(): string {
    if (this.form.schedule_type === 'cron')     return '0 9 * * 1-5  (weekdays 9am)';
    if (this.form.schedule_type === 'interval') return '3600000  (ms — every 1h)';
    return new Date(Date.now() + 3_600_000).toISOString().slice(0, 16);
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
