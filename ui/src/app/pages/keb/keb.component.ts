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
    <div class="page-header">
      <div class="page-title-block">
        <span class="page-prefix">// 02</span>
        <h1 class="page-title">KEB OPS</h1>
      </div>
      <span class="ops-badge">RETAIL OPERATIONS</span>
    </div>

    <div class="keb-grid">

      <!-- Branch network -->
      <div class="card">
        <div class="section-title">NODE NETWORK</div>
        <div class="branch-list">
          <div *ngFor="let branch of branches; let i = index" class="branch-row">
            <div class="branch-index">N{{ (i + 1).toString().padStart(2, '0') }}</div>
            <span class="branch-name">{{ branch }}</span>
            <div class="branch-status">
              <span class="online-dot"></span>
              <span class="online-label">MONITORED</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Token usage -->
      <div class="card">
        <div class="section-title">TOKEN TELEMETRY &nbsp;·&nbsp; {{ currentMonth }}</div>
        <div *ngIf="usage" class="usage-stats">
          <div class="stat-row">
            <span class="stat-key">INPUT TOKENS</span>
            <span class="stat-val">{{ usage.input_tokens | number }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-key">OUTPUT TOKENS</span>
            <span class="stat-val">{{ usage.output_tokens | number }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-key">CACHE READS</span>
            <span class="stat-val">{{ usage.cache_read_input_tokens | number }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-key">RUNS THIS CYCLE</span>
            <span class="stat-val accent">{{ usage.runs }}</span>
          </div>
          <div class="budget-block">
            <div class="budget-header">
              <span class="budget-label">BUDGET CONSUMED</span>
              <span class="budget-pct" [class.warn]="usage.budget_used_pct > 75" [class.danger]="usage.budget_used_pct > 95">
                {{ usage.budget_used_pct }}%
              </span>
            </div>
            <div class="budget-track">
              <div class="budget-fill"
                   [style.width.%]="usage.budget_used_pct"
                   [class.warn]="usage.budget_used_pct > 75"
                   [class.danger]="usage.budget_used_pct > 95"></div>
              <!-- Segment markers -->
              <div class="seg" style="left:25%"></div>
              <div class="seg" style="left:50%"></div>
              <div class="seg" style="left:75%"></div>
            </div>
            <div class="budget-sub">
              {{ (usage.input_tokens + usage.output_tokens) | number }} / {{ usage.budget | number }} tokens
            </div>
          </div>
        </div>
        <div *ngIf="!usage" class="empty">NO TELEMETRY DATA</div>
      </div>

      <!-- Scheduled tasks -->
      <div class="card full-width">
        <div class="section-title">SCHEDULED DIRECTIVES</div>
        <div *ngIf="tasks.length === 0" class="empty">NO ACTIVE DIRECTIVES</div>
        <table *ngIf="tasks.length > 0">
          <thead>
            <tr>
              <th>DIRECTIVE</th>
              <th>SCHEDULE</th>
              <th>NEXT EXEC</th>
              <th>STATE</th>
              <th>LAST OUTPUT</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let t of tasks">
              <td class="prompt-cell">{{ t.prompt | slice:0:80 }}{{ t.prompt.length > 80 ? '…' : '' }}</td>
              <td>
                <span class="tag">{{ t.schedule_type }}</span>
                <span class="sched-val">{{ t.schedule_value }}</span>
              </td>
              <td class="mono">{{ t.next_run ? (t.next_run | date:'dd MMM HH:mm') : '—' }}</td>
              <td><span class="badge" [class]="t.status">{{ t.status }}</span></td>
              <td class="result-cell">{{ (t.last_result || '—') | slice:0:60 }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Conversation history -->
      <div class="card full-width">
        <div class="section-title">TRANSMISSION HISTORY</div>
        <div *ngIf="loadingMessages" class="stream-loading">&gt; loading transmissions...</div>
        <div *ngIf="!loadingMessages && messages.length === 0" class="empty">NO TRANSMISSIONS RECORDED</div>
        <table *ngIf="!loadingMessages && messages.length > 0">
          <thead>
            <tr>
              <th style="width:140px">TIMESTAMP</th>
              <th style="width:130px">ORIGIN</th>
              <th>CONTENT</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let m of messages" [class.bot-row]="m.is_bot_message">
              <td class="mono time-col">{{ m.timestamp | date:'dd MMM HH:mm:ss' }}</td>
              <td>
                <span class="badge" [class.bot]="m.is_bot_message" [class.user]="!m.is_bot_message">
                  {{ m.is_bot_message ? 'STELLARBOT' : (m.sender_name || 'USER') }}
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
    .page-header {
      display: flex;
      align-items: center;
      gap: 16px;
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
      color: var(--keb);
      opacity: 0.7;
      letter-spacing: 0.08em;
    }

    .page-title {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.15em;
      color: #fff;
    }

    .ops-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.14em;
      padding: 4px 10px;
      background: rgba(255,106,0,0.1);
      border: 1px solid rgba(255,106,0,0.25);
      border-radius: 2px;
      color: var(--keb);
    }

    .keb-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;

      .full-width { grid-column: 1 / -1; }
    }

    /* Branch network */
    .branch-list { display: flex; flex-direction: column; gap: 0; }

    .branch-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);

      &:last-child { border-bottom: none; }
    }

    .branch-index {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: var(--cyan);
      opacity: 0.5;
      width: 28px;
      flex-shrink: 0;
    }

    .branch-name { flex: 1; font-weight: 500; font-size: 13px; }

    .branch-status {
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .online-dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 6px var(--green);
      animation: breathe 2.5s ease-in-out infinite;
    }

    @keyframes breathe {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.4; }
    }

    .online-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      color: var(--green);
      letter-spacing: 0.1em;
      opacity: 0.7;
    }

    /* Usage stats */
    .usage-stats { display: flex; flex-direction: column; gap: 0; }

    .stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 9px 0;
      border-bottom: 1px solid var(--border);

      &:last-child { border-bottom: none; }
    }

    .stat-key {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.1em;
      color: var(--text-muted);
    }

    .stat-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 500;
      color: var(--text);
      letter-spacing: 0.04em;

      &.accent { color: var(--cyan); }
    }

    .budget-block { margin-top: 14px; }

    .budget-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .budget-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.1em;
      color: var(--text-muted);
    }

    .budget-pct {
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 600;
      color: var(--cyan);

      &.warn   { color: var(--warn); }
      &.danger { color: var(--danger); }
    }

    .budget-track {
      position: relative;
      height: 6px;
      background: rgba(0,200,255,0.08);
      border-radius: 1px;
      overflow: hidden;
    }

    .budget-fill {
      height: 100%;
      background: linear-gradient(90deg, rgba(0,200,255,0.6), var(--cyan));
      border-radius: 1px;
      transition: width 0.4s ease;
      box-shadow: 0 0 8px rgba(0,200,255,0.4);

      &.warn   { background: linear-gradient(90deg, var(--warn-dim), var(--warn)); box-shadow: 0 0 8px rgba(255,170,0,0.3); }
      &.danger { background: linear-gradient(90deg, var(--danger-dim), var(--danger)); box-shadow: 0 0 8px rgba(255,51,102,0.3); }
    }

    .seg {
      position: absolute;
      top: 0; bottom: 0;
      width: 1px;
      background: rgba(4,13,24,0.8);
    }

    .budget-sub {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: var(--text-muted);
      margin-top: 5px;
      letter-spacing: 0.04em;
    }

    /* Table */
    .prompt-cell { max-width: 300px; font-size: 12px; color: var(--text-muted); }
    .result-cell { max-width: 200px; font-size: 11px; color: var(--text-muted); }
    .sched-val   { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-muted); margin-left: 6px; }
    .time-col    { white-space: nowrap; color: var(--text-muted); font-size: 11px; }
    .msg-content { font-size: 13px; max-width: 600px; white-space: pre-wrap; word-break: break-word; }

    .bot-row td {
      background: rgba(0,200,255,0.03);
      border-left: 2px solid rgba(0,200,255,0.25);
    }

    .stream-loading {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-muted);
      padding: 16px 0;
    }
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
