import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav class="sidebar">
      <div class="logo">
        <span class="logo-icon">★</span>
        <span class="logo-text">NanoClaw</span>
      </div>
      <a routerLink="/dashboard" routerLinkActive="active">Dashboard</a>
      <a routerLink="/keb" routerLinkActive="active" class="keb-link">KEB Ops</a>
      <a routerLink="/tasks" routerLinkActive="active">Tasks</a>
      <a routerLink="/audit" routerLinkActive="active">Audit Log</a>
    </nav>
    <main class="content">
      <router-outlet />
    </main>
  `,
  styles: [`
    :host { display: flex; height: 100vh; overflow: hidden; }

    .sidebar {
      width: 200px;
      min-width: 200px;
      background: #12141f;
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      padding: 20px 0;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 20px 24px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 12px;
    }

    .logo-icon { font-size: 20px; }
    .logo-text { font-size: 16px; font-weight: 700; color: var(--text); }

    a {
      display: block;
      padding: 10px 20px;
      color: var(--text-muted);
      text-decoration: none;
      border-left: 3px solid transparent;
      transition: all 0.15s;

      &:hover { color: var(--text); background: rgba(255,255,255,0.03); }
      &.active { color: var(--text); border-left-color: var(--accent); background: rgba(99,102,241,0.08); }
    }

    .keb-link.active { border-left-color: var(--keb); background: rgba(249,115,22,0.08); color: var(--keb); }

    .content { flex: 1; overflow-y: auto; padding: 24px; }
  `],
})
export class AppComponent {}
