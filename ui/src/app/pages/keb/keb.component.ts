import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, Message, MonthlyUsage, Task } from '../../services/api.service';

const KEB_BRANCHES = ['Cape Town DC', 'Caledon', 'Boksburg', 'Cloverdene', 'Fourways', 'Bloemfontein', 'Witbank'];
const FOLDER = 'keb-ops';

@Component({
  selector: 'app-keb',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="keb-header">
      <h1 class="page-title">KEB Ops</h1>
      <span class="badge" style="background:#431407;color:var(--keb);font-size:12px">Retail Operations</span>
    </div>

    <div class="keb-grid">

      <!-- Branch status -->
      <div class="card">
        <div class="section-title">Branch Network</div>
        <div class="branch-list">
          <div *ngFor="let branch of branches" class="branch-row">
            <span class="branch-name">{{ branch }}</span>
            <span class="branch-status tag">monitored</span>
          </div>
        </div>
      </div>

      <!-- Usage -->
      <div class="card">
        <div class="section-title">Token Usage &mdash; {{ currentMonth }}</div>
        <div *ngIf="usage" class="usage-stats">
          <div class="stat-row">
            <span class="stat-label">Input tokens</span>
            <span class="stat-value">{{ usage.input_tokens | number }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Output tokens</span>
            <span class="stat-value">{{ usage.output_tokens | number }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Cache reads</span>
            <span class="stat-value">{{ usage.cache_read_input_tokens | number }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Runs this month</span>
            <span class="stat-value">{{ usage.runs }}</span>
          </div>
          <div class="budget-bar-wrap">
            <div class="budget-label">
              Budget: {{ usage.budget_used_pct }}% used ({{ (usage.input_tokens + usage.output_tokens) | number }} / {{ usage.budget | number }})
            </div>
            <div class="budget-bar">
              <div class="budget-fill"
                   [style.width.%]="usage.budget_used_pct"
                   [class.warn]="usage.budget_used_pct > 75"
                   [class.danger]="usage.budget_used_pct > 95"></div>
            </div>
          </div>
        </div>
        <div *ngIf="!usage" class="empty">No usage data yet</div>
      </div>

      <!-- Scheduled tasks -->
      <div class="card full-width">
        <div class="section-title">Scheduled Tasks</div>
        <div *ngIf="tasks.length === 0" class="empty">No scheduled tasks</div>
        <table *ngIf="tasks.length > 0">
          <thead>
            <tr>
              <th>Task</th>
              <th>Schedule</th>
              <th>Next Run</th>
              <th>Status</th>
              <th>Last Result</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let t of tasks">
              <td class="prompt-cell">{{ t.prompt | slice:0:80 }}{{ t.prompt.length > 80 ? '...' : '' }}</td>
              <td><span class="tag">{{ t.schedule_type }}</span> <span class="mono">{{ t.schedule_value }}</span></td>
              <td class="mono">{{ t.next_run ? (t.next_run | date:'dd MMM HH:mm') : '—' }}</td>
              <td><span class="badge" [class]="t.status">{{ t.status }}</span></td>
              <td class="result-cell">{{ (t.last_result || '—') | slice:0:60 }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Conversation history -->
      <div class="card full-width">
        <div class="section-title">Recent Messages</div>
        <div *ngIf="loadingMessages" class="loading">Loading...</div>
        <div *ngIf="!loadingMessages && messages.length === 0" class="empty">No messages yet</div>
        <table *ngIf="!loadingMessages && messages.length > 0">
          <thead>
            <tr>
              <th>Time</th>
              <th>From</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let m of messages" [class.bot-row]="m.is_bot_message">
              <td class="mono" style="white-space:nowrap">{{ m.timestamp | date:'dd MMM HH:mm' }}</td>
              <td>
                <span class="badge" [class.bot]="m.is_bot_message" [class.user]="!m.is_bot_message">
                  {{ m.is_bot_message ? 'StellarBot' : (m.sender_name || 'User') }}
                </span>
              </td>
              <td class="msg-content">{{ m.content }}</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  `,
  styles: [`
    .keb-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
    .page-title { font-size: 20px; font-weight: 700; }

    .keb-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;

      .full-width { grid-column: 1 / -1; }
    }

    .branch-list { display: flex; flex-direction: column; gap: 8px; }
    .branch-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
      &:last-child { border-bottom: none; }
    }
    .branch-name { font-weight: 500; }

    .usage-stats { display: flex; flex-direction: column; gap: 8px; }
    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid var(--border);
      &:last-child { border-bottom: none; }
    }
    .stat-label { color: var(--text-muted); }
    .stat-value { font-weight: 600; font-variant-numeric: tabular-nums; }

    .budget-bar-wrap { margin-top: 12px; }
    .budget-label { font-size: 12px; color: var(--text-muted); margin-bottom: 6px; }
    .budget-bar { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
    .budget-fill {
      height: 100%;
      background: var(--accent);
      border-radius: 3px;
      transition: width 0.3s;
      &.warn { background: var(--warn); }
      &.danger { background: var(--danger); }
    }

    .prompt-cell { max-width: 300px; color: var(--text-muted); font-size: 13px; }
    .result-cell { max-width: 200px; font-size: 12px; color: var(--text-muted); }
    .msg-content { font-size: 13px; max-width: 600px; white-space: pre-wrap; word-break: break-word; }
    .bot-row td { background: rgba(99,102,241,0.04); border-left: 2px solid var(--accent); }
  `],
})
export class KebComponent implements OnInit {
  private api = inject(ApiService);

  branches = KEB_BRANCHES;
  currentMonth = new Date().toISOString().slice(0, 7);
  usage: MonthlyUsage | null = null;
  tasks: Task[] = [];
  messages: Message[] = [];
  loadingMessages = true;

  ngOnInit(): void {
    this.api.usage(FOLDER, this.currentMonth).subscribe({
      next: u => this.usage = u as MonthlyUsage,
      error: () => {},
    });

    this.api.groupTasks(FOLDER).subscribe({
      next: t => this.tasks = t,
      error: () => {},
    });

    this.api.messages(FOLDER, 100).subscribe({
      next: msgs => { this.messages = msgs; this.loadingMessages = false; },
      error: () => this.loadingMessages = false,
    });
  }
}
