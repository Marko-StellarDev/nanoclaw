import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Group {
  jid: string;
  name: string;
  folder: string;
  trigger: string;
  added_at: string;
  requiresTrigger: boolean;
}

export interface Message {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me: number;
  is_bot_message: number;
}

export interface MonthlyUsage {
  month: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  runs: number;
  budget: number;
  budget_used_pct: number;
  last_updated: string;
  model?: string;
}

export interface Task {
  id: string;
  group_folder: string;
  chat_jid: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  context_mode: 'group' | 'isolated';
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
}

export interface Health {
  status: string;
  uptime: number;
  ts: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  health(): Observable<Health> {
    return this.http.get<Health>('/api/health');
  }

  groups(): Observable<Group[]> {
    return this.http.get<Group[]>('/api/groups');
  }

  messages(folder: string, limit = 50): Observable<Message[]> {
    return this.http.get<Message[]>(`/api/groups/${folder}/messages?limit=${limit}`);
  }

  usage(folder: string, month?: string): Observable<MonthlyUsage | MonthlyUsage[]> {
    const q = month ? `?month=${month}` : '';
    return this.http.get<MonthlyUsage | MonthlyUsage[]>(`/api/groups/${folder}/usage${q}`);
  }

  groupTasks(folder: string): Observable<Task[]> {
    return this.http.get<Task[]>(`/api/groups/${folder}/tasks`);
  }

  allTasks(): Observable<Task[]> {
    return this.http.get<Task[]>('/api/tasks');
  }

  audit(limit = 100, group?: string): Observable<AuditEvent[]> {
    const q = group ? `?limit=${limit}&group=${group}` : `?limit=${limit}`;
    return this.http.get<AuditEvent[]>(`/api/audit${q}`);
  }

  agentStatus(): Observable<Record<string, string>> {
    return this.http.get<Record<string, string>>('/api/status');
  }

  sendMessage(folder: string, text: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`/api/groups/${folder}/message`, { text });
  }

  pauseTask(id: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`/api/tasks/${id}/pause`, {});
  }

  resumeTask(id: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`/api/tasks/${id}/resume`, {});
  }

  cancelTask(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`/api/tasks/${id}`);
  }

  createTask(task: NewTask): Observable<{ ok: boolean; id: string }> {
    return this.http.post<{ ok: boolean; id: string }>('/api/tasks', task);
  }
}

export interface NewTask {
  group_folder: string;
  prompt: string;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  context_mode: 'group' | 'isolated';
}

export interface AuditEvent {
  id: string;
  ts: string;
  group_folder: string;
  group_name: string;
  type: 'user' | 'bot' | 'task' | 'activity';
  summary: string;
  detail: string;
  status?: string;
  tool?: string;
  model?: string;
}
