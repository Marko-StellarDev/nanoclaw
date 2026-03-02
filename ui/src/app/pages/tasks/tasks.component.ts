import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, Task } from '../../services/api.service';

@Component({
  selector: 'app-tasks',
  standalone: true,
  imports: [CommonModule],
  template: `
    <h1 class="page-title">Scheduled Tasks</h1>

    <div *ngIf="loading" class="loading">Loading tasks...</div>

    <div *ngIf="!loading && tasks.length === 0" class="card empty">
      No scheduled tasks across any group.
    </div>

    <div *ngIf="!loading && tasks.length > 0" class="card">
      <table>
        <thead>
          <tr>
            <th>Group</th>
            <th>Prompt</th>
            <th>Schedule</th>
            <th>Context</th>
            <th>Next Run</th>
            <th>Last Run</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let t of tasks">
            <td><span class="tag">{{ t.group_folder }}</span></td>
            <td class="prompt-cell">{{ t.prompt | slice:0:100 }}{{ t.prompt.length > 100 ? '...' : '' }}</td>
            <td>
              <span class="tag">{{ t.schedule_type }}</span><br>
              <span class="mono">{{ t.schedule_value }}</span>
            </td>
            <td><span class="tag">{{ t.context_mode }}</span></td>
            <td class="mono">{{ t.next_run ? (t.next_run | date:'dd MMM HH:mm') : '—' }}</td>
            <td class="mono">{{ t.last_run ? (t.last_run | date:'dd MMM HH:mm') : '—' }}</td>
            <td><span class="badge" [class]="t.status">{{ t.status }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="summary" *ngIf="!loading && tasks.length > 0">
      <span class="tag">{{ activeTasks }} active</span>
      <span class="tag">{{ pausedTasks }} paused</span>
      <span class="tag">{{ tasks.length }} total</span>
    </div>
  `,
  styles: [`
    .page-title { font-size: 20px; font-weight: 700; margin-bottom: 20px; }
    .prompt-cell { max-width: 280px; font-size: 13px; color: var(--text-muted); }
    .summary { display: flex; gap: 8px; margin-top: 16px; }
  `],
})
export class TasksComponent implements OnInit {
  private api = inject(ApiService);

  tasks: Task[] = [];
  loading = true;

  get activeTasks(): number { return this.tasks.filter(t => t.status === 'active').length; }
  get pausedTasks(): number  { return this.tasks.filter(t => t.status === 'paused').length; }

  ngOnInit(): void {
    this.api.allTasks().subscribe({
      next: t => { this.tasks = t; this.loading = false; },
      error: () => this.loading = false,
    });
  }
}
