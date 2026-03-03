import { Component, AfterViewInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; opacity: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <canvas #bgCanvas class="bg-canvas"></canvas>

    <div class="mobile-topbar">
      <button class="hamburger" (click)="toggleSidebar()" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
      <div class="mobile-logo">
        <span class="mobile-logo-glyph">◈</span>
        <span class="mobile-logo-name">NANOCLAW</span>
      </div>
    </div>

    <div class="overlay" [class.active]="sidebarOpen" (click)="closeSidebar()"></div>

    <nav class="sidebar" [class.open]="sidebarOpen">
      <div class="logo">
        <div class="logo-glyph">◈</div>
        <div class="logo-text">
          <div class="logo-name">NANOCLAW</div>
          <div class="logo-sub">NEURAL INTERFACE</div>
        </div>
      </div>

      <div class="nav-section-label">NAVIGATION</div>

      <a routerLink="/dashboard" routerLinkActive="active" (click)="closeSidebar()">
        <span class="nav-icon">⬡</span>
        <span class="nav-label">SYSTEM</span>
      </a>
      <a routerLink="/keb" routerLinkActive="active" class="keb-link" (click)="closeSidebar()">
        <span class="nav-icon">◉</span>
        <span class="nav-label">KEB OPS</span>
      </a>
      <a routerLink="/tasks" routerLinkActive="active" (click)="closeSidebar()">
        <span class="nav-icon">◈</span>
        <span class="nav-label">TASKS</span>
      </a>
      <a routerLink="/audit" routerLinkActive="active" (click)="closeSidebar()">
        <span class="nav-icon">▣</span>
        <span class="nav-label">AUDIT</span>
      </a>
      <a routerLink="/analytics" routerLinkActive="active" (click)="closeSidebar()">
        <span class="nav-icon">◎</span>
        <span class="nav-label">ANALYTICS</span>
      </a>

      <div class="sidebar-footer">
        <div class="node-status">
          <span class="status-dot"></span>
          <span class="status-label">NODE ACTIVE</span>
        </div>
      </div>
    </nav>

    <main class="content">
      <router-outlet />
    </main>
  `,
  styles: [`
    :host { display: flex; height: 100vh; overflow: hidden; position: relative; }

    .bg-canvas {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: 0;
    }

    /* ── Mobile top bar (hidden on desktop) ── */
    .mobile-topbar { display: none; }

    .hamburger {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      width: 22px; height: 16px;
      background: none;
      border: none;
      cursor: pointer;
      padding: 0;
      flex-shrink: 0;

      span {
        display: block;
        width: 100%; height: 2px;
        background: var(--cyan);
        border-radius: 1px;
        transition: opacity 0.2s;
      }

      &:hover span { opacity: 0.7; }
    }

    .mobile-logo {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .mobile-logo-glyph {
      font-size: 18px;
      color: var(--cyan);
      text-shadow: 0 0 12px var(--cyan);
    }

    .mobile-logo-name {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.18em;
      color: #fff;
    }

    /* ── Overlay ── */
    .overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      z-index: 90;

      &.active { display: block; }
    }

    .sidebar {
      position: relative;
      z-index: 10;
      width: 220px;
      min-width: 220px;
      background: rgba(3, 12, 28, 0.92);
      border-right: 1px solid rgba(0, 200, 255, 0.12);
      display: flex;
      flex-direction: column;
      padding: 0;
      backdrop-filter: blur(20px);
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 24px 20px 20px;
      border-bottom: 1px solid rgba(0, 200, 255, 0.1);
      margin-bottom: 8px;
    }

    .logo-glyph {
      font-size: 24px;
      color: var(--cyan);
      text-shadow: 0 0 16px var(--cyan), 0 0 32px rgba(0,200,255,0.4);
      animation: glyph-pulse 3s ease-in-out infinite;
    }

    @keyframes glyph-pulse {
      0%, 100% { opacity: 1; text-shadow: 0 0 16px var(--cyan), 0 0 32px rgba(0,200,255,0.4); }
      50%       { opacity: 0.7; text-shadow: 0 0 8px var(--cyan); }
    }

    .logo-name {
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.18em;
      color: #fff;
    }

    .logo-sub {
      font-size: 9px;
      font-family: 'JetBrains Mono', monospace;
      letter-spacing: 0.15em;
      color: var(--text-muted);
      margin-top: 2px;
    }

    .nav-section-label {
      font-size: 9px;
      font-family: 'JetBrains Mono', monospace;
      letter-spacing: 0.18em;
      color: var(--text-muted);
      padding: 8px 20px 6px;
      opacity: 0.6;
    }

    a {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 11px 20px;
      color: var(--text-muted);
      text-decoration: none;
      border-left: 2px solid transparent;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.12em;
      transition: all 0.2s;
      position: relative;

      &:hover {
        color: var(--text);
        background: rgba(0,200,255,0.04);
        border-left-color: rgba(0,200,255,0.3);
      }

      &.active {
        color: var(--cyan);
        border-left-color: var(--cyan);
        background: rgba(0,200,255,0.07);

        &::after {
          content: '';
          position: absolute;
          right: 0; top: 0; bottom: 0;
          width: 1px;
          background: rgba(0,200,255,0.3);
        }

        .nav-icon { text-shadow: 0 0 10px var(--cyan); }
      }
    }

    .keb-link.active {
      color: var(--keb);
      border-left-color: var(--keb);
      background: rgba(255,106,0,0.07);

      &::after { background: rgba(255,106,0,0.3); }
      .nav-icon { text-shadow: 0 0 10px var(--keb); }
    }

    .nav-icon { font-size: 14px; width: 18px; text-align: center; flex-shrink: 0; }
    .nav-label { font-family: 'JetBrains Mono', monospace; font-size: 11px; }

    .sidebar-footer {
      margin-top: auto;
      padding: 16px 20px;
      border-top: 1px solid rgba(0,200,255,0.08);
    }

    .node-status {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 8px var(--green);
      animation: status-breathe 2.5s ease-in-out infinite;
    }

    @keyframes status-breathe {
      0%, 100% { opacity: 1; box-shadow: 0 0 8px var(--green); }
      50%       { opacity: 0.5; box-shadow: 0 0 4px var(--green); }
    }

    .status-label {
      font-size: 10px;
      font-family: 'JetBrains Mono', monospace;
      letter-spacing: 0.12em;
      color: var(--green);
      opacity: 0.8;
    }

    .content {
      position: relative;
      z-index: 10;
      flex: 1;
      overflow-y: auto;
      padding: 28px 32px;
    }

    /* ── Mobile breakpoint ── */
    @media (max-width: 768px) {
      .mobile-topbar {
        display: flex;
        align-items: center;
        gap: 14px;
        position: fixed;
        top: 0; left: 0; right: 0;
        height: 52px;
        z-index: 110;
        background: rgba(3, 12, 28, 0.96);
        border-bottom: 1px solid rgba(0, 200, 255, 0.15);
        padding: 0 16px;
        backdrop-filter: blur(20px);
      }

      .sidebar {
        position: fixed;
        top: 0; left: -240px; bottom: 0;
        z-index: 100;
        transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);

        &.open { left: 0; }
      }

      .content {
        width: 100%;
        padding: 68px 14px 20px;
      }
    }
  `],
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('bgCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private animFrame = 0;
  sidebarOpen = false;

  toggleSidebar(): void { this.sidebarOpen = !this.sidebarOpen; }
  closeSidebar(): void { this.sidebarOpen = false; }

  ngAfterViewInit(): void {
    this.initCanvas();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.animFrame);
  }

  private initCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const COUNT = 70;
    const MAX_DIST = 140;

    const particles: Particle[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      size: Math.random() * 1.2 + 0.4,
      opacity: Math.random() * 0.45 + 0.1,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 200, 255, ${p.opacity})`;
        ctx.fill();
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MAX_DIST) {
            const alpha = (1 - dist / MAX_DIST) * 0.12;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 200, 255, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      this.animFrame = requestAnimationFrame(draw);
    };

    draw();
  }
}
