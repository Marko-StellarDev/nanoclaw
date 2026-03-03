import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, Group, MonthlyUsage } from '../../services/api.service';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

// ── Anthropic pricing per 1M tokens (2025) ───────────────────────────────────
interface ModelPrice { input: number; output: number; cacheRead: number; cacheWrite: number; }

const PRICING: Record<string, ModelPrice> = {
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00,  cacheRead: 0.08, cacheWrite: 1.00  },
  'claude-sonnet-4-6':          { input: 3.00,  output: 15.00, cacheRead: 0.30, cacheWrite: 3.75  },
  'claude-opus-4-6':            { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 },
};
const DEFAULT_PRICE: ModelPrice = PRICING['claude-haiku-4-5-20251001'];
const GROUP_COLORS = ['#00c8ff', '#00ff88', '#7b2fff', '#ff6a00', '#ff3366'];

interface GroupData {
  folder: string;
  name: string;
  months: MonthlyUsage[];
}

interface ChartMonth {
  key: string;     // YYYY-MM
  label: string;   // "Mar '26"
  groups: { folder: string; cost: number }[];
  totalCost: number;
  totalTokens: number;
  totalRuns: number;
  usage: MonthlyUsage[];
}

interface HistoryRow {
  month: string;
  folder: string;
  groupName: string;
  model: string;
  runs: number;
  input_tokens: number;
  output_tokens: number;
  cache_read: number;
  cache_write: number;
  cost: number;
  budget_pct: number;
}

function price(u: MonthlyUsage): ModelPrice {
  return PRICING[u.model ?? ''] ?? DEFAULT_PRICE;
}

function calcCost(u: MonthlyUsage): number {
  const p = price(u);
  return (u.input_tokens / 1e6) * p.input
       + (u.output_tokens / 1e6) * p.output
       + ((u.cache_read_input_tokens || 0) / 1e6) * p.cacheRead
       + ((u.cache_creation_input_tokens || 0) / 1e6) * p.cacheWrite;
}

function modelShort(model?: string): string {
  if (!model) return 'haiku';
  if (model.includes('opus'))   return 'opus';
  if (model.includes('sonnet')) return 'sonnet';
  if (model.includes('haiku'))  return 'haiku';
  return model;
}

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-header">
      <div class="page-title-block">
        <span class="page-prefix">// 05</span>
        <h1 class="page-title">ANALYTICS</h1>
      </div>
      <select (change)="onGroupChange($any($event.target).value)">
        <option value="">ALL NODES</option>
        <option *ngFor="let g of groups" [value]="g.folder">{{ g.name }}</option>
      </select>
    </div>

    <div *ngIf="loading" class="stream-loading">&gt; loading telemetry data...</div>

    <ng-container *ngIf="!loading">

      <!-- ── Stat cards ──────────────────────────────────────────────────── -->
      <div class="stats-row">
        <div class="card stat-card">
          <div class="stat-label">COST THIS MONTH</div>
          <div class="stat-value cyan">{{ fmtDollar(totalCostThisMonth) }}</div>
          <div class="stat-sub">{{ currentMonth }}</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">TOKENS USED</div>
          <div class="stat-value">{{ fmtTokens(totalTokensThisMonth) }}</div>
          <div class="stat-sub">input + output</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">CACHE HIT RATE</div>
          <div class="stat-value green">{{ cacheHitRate | number:'1.1-1' }}%</div>
          <div class="stat-sub">cache reads / total reads</div>
        </div>
        <div class="card stat-card">
          <div class="stat-label">AVG COST / RUN</div>
          <div class="stat-value">{{ fmtDollar(avgCostPerRun) }}</div>
          <div class="stat-sub">{{ totalRunsThisMonth }} runs</div>
        </div>
      </div>

      <!-- ── Cost trend chart ────────────────────────────────────────────── -->
      <div class="card chart-card">
        <div class="chart-header">
          <div class="section-title">MONTHLY COST TREND</div>
          <div class="chart-legend">
            <span *ngFor="let g of filteredGroupData; let i = index" class="legend-item">
              <span class="legend-dot" [style.background]="groupColor(i)"></span>
              <span class="legend-name">{{ g.name }}</span>
            </span>
          </div>
        </div>
        <canvas id="cost-chart" class="chart-canvas"></canvas>
        <div class="chart-empty" *ngIf="totalCostAllTime === 0">&gt; no cost data recorded yet</div>
      </div>

      <!-- ── Token breakdown ─────────────────────────────────────────────── -->
      <div class="card">
        <div class="chart-header">
          <div class="section-title">TOKEN BREAKDOWN — LAST 6 MONTHS</div>
          <div class="chart-legend">
            <span class="legend-item"><span class="legend-dot" style="background:#00c8ff"></span>INPUT</span>
            <span class="legend-item"><span class="legend-dot" style="background:#00ff88"></span>OUTPUT</span>
            <span class="legend-item"><span class="legend-dot" style="background:#7b2fff"></span>CACHE WRITE</span>
            <span class="legend-item"><span class="legend-dot" style="background:rgba(140,190,215,0.4)"></span>CACHE READ</span>
          </div>
        </div>
        <div class="breakdown-list">
          <div *ngFor="let cm of chartMonths" class="breakdown-row">
            <div class="breakdown-label">{{ cm.label }}</div>
            <div class="breakdown-track-wrap">
              <div class="breakdown-track" [title]="tokenBreakdownTitle(cm)">
                <ng-container *ngIf="cm.totalTokens > 0 || tokenCacheTotal(cm) > 0; else emptyTrack">
                  <div class="seg seg-input"
                       [style.width.%]="tokenSegPct(cm, 'input')"
                       [title]="'Input: ' + fmtTokens(sumField(cm.usage, 'input_tokens'))"></div>
                  <div class="seg seg-output"
                       [style.width.%]="tokenSegPct(cm, 'output')"
                       [title]="'Output: ' + fmtTokens(sumField(cm.usage, 'output_tokens'))"></div>
                  <div class="seg seg-cwrite"
                       [style.width.%]="tokenSegPct(cm, 'cwrite')"
                       [title]="'Cache write: ' + fmtTokens(sumField(cm.usage, 'cache_creation_input_tokens'))"></div>
                  <div class="seg seg-cread"
                       [style.width.%]="tokenSegPct(cm, 'cread')"
                       [title]="'Cache read: ' + fmtTokens(sumField(cm.usage, 'cache_read_input_tokens'))"></div>
                </ng-container>
                <ng-template #emptyTrack>
                  <div class="seg-empty">no data</div>
                </ng-template>
              </div>
            </div>
            <div class="breakdown-cost">{{ fmtDollar(cm.totalCost) }}</div>
            <div class="breakdown-runs">{{ cm.totalRuns }} runs</div>
          </div>
        </div>
      </div>

      <!-- ── Model pricing reference ─────────────────────────────────────── -->
      <div class="card pricing-card">
        <div class="section-title">MODEL PRICING REFERENCE — USD PER 1M TOKENS</div>
        <div class="pricing-grid">
          <div *ngFor="let tier of pricingTiers" class="pricing-row"
               [class.active-model]="isActiveModel(tier.key)">
            <div class="tier-name">
              <span class="tier-tag" [class]="'tier-' + tier.slug">{{ tier.label }}</span>
              <span class="active-badge" *ngIf="isActiveModel(tier.key)">ACTIVE</span>
            </div>
            <div class="tier-prices">
              <div class="price-item">
                <span class="price-key">INPUT</span>
                <span class="price-val">{{ fmtPrice(tier.prices.input) }}</span>
              </div>
              <div class="price-item">
                <span class="price-key">OUTPUT</span>
                <span class="price-val">{{ fmtPrice(tier.prices.output) }}</span>
              </div>
              <div class="price-item">
                <span class="price-key">CACHE READ</span>
                <span class="price-val">{{ fmtPrice(tier.prices.cacheRead) }}</span>
              </div>
              <div class="price-item">
                <span class="price-key">CACHE WRITE</span>
                <span class="price-val">{{ fmtPrice(tier.prices.cacheWrite) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── History table ───────────────────────────────────────────────── -->
      <div class="card">
        <div class="section-title">USAGE HISTORY</div>
        <div *ngIf="historyRows.length === 0" class="empty">NO HISTORY RECORDED</div>
        <div class="table-wrap">
        <table *ngIf="historyRows.length > 0">
          <thead>
            <tr>
              <th>MONTH</th>
              <th>NODE</th>
              <th>MODEL</th>
              <th>RUNS</th>
              <th>INPUT</th>
              <th>OUTPUT</th>
              <th>CACHE RD</th>
              <th>CACHE WR</th>
              <th>COST</th>
              <th>BUDGET</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let r of historyRows" [class.current-month-row]="r.month === currentMonth">
              <td class="mono">{{ r.month }}</td>
              <td><span class="tag">{{ r.folder }}</span></td>
              <td>
                <span class="model-badge" [class]="'model-' + r.model">{{ r.model }}</span>
              </td>
              <td class="mono num">{{ r.runs }}</td>
              <td class="mono num">{{ fmtTokens(r.input_tokens) }}</td>
              <td class="mono num">{{ fmtTokens(r.output_tokens) }}</td>
              <td class="mono num muted">{{ fmtTokens(r.cache_read) }}</td>
              <td class="mono num muted">{{ fmtTokens(r.cache_write) }}</td>
              <td class="mono num cyan-text">{{ fmtDollar(r.cost) }}</td>
              <td>
                <div class="bgt-bar-wrap">
                  <div class="bgt-track">
                    <div class="bgt-fill"
                         [style.width.%]="r.budget_pct"
                         [class.bgt-warn]="r.budget_pct > 75"
                         [class.bgt-danger]="r.budget_pct > 95"></div>
                  </div>
                  <span class="bgt-label">{{ r.budget_pct }}%</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>

      <!-- ── Total footer ─────────────────────────────────────────────────── -->
      <div class="total-footer" *ngIf="historyRows.length > 0">
        <span class="total-label">ALL-TIME COST</span>
        <span class="total-value">{{ fmtDollar(totalCostAllTime) }}</span>
        <span class="total-sep">·</span>
        <span class="total-label">TOTAL RUNS</span>
        <span class="total-value">{{ totalRunsAllTime }}</span>
        <span class="total-sep">·</span>
        <span class="total-label">TOTAL TOKENS</span>
        <span class="total-value">{{ fmtTokens(totalTokensAllTime) }}</span>
      </div>

    </ng-container>
  `,
  styles: [`
    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 28px;
      gap: 20px;
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

    /* ── Stat cards ── */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 20px;
    }

    .stat-card {
      text-align: center;
      padding: 20px 16px;
    }

    .stat-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      letter-spacing: 0.16em;
      color: var(--text-muted);
      margin-bottom: 10px;
    }

    .stat-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 26px;
      font-weight: 500;
      color: var(--text);
      letter-spacing: 0.02em;
      line-height: 1;
      margin-bottom: 6px;

      &.cyan  { color: var(--cyan); text-shadow: 0 0 20px rgba(0,200,255,0.4); }
      &.green { color: var(--green); text-shadow: 0 0 20px rgba(0,255,136,0.3); }
    }

    .stat-sub {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: var(--text-muted);
      letter-spacing: 0.06em;
    }

    /* ── Chart card ── */
    .chart-card {
      margin-bottom: 20px;
    }

    .chart-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
    }

    .chart-header .section-title { margin-bottom: 0; }

    .chart-legend {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: var(--text-muted);
      letter-spacing: 0.08em;
    }

    .legend-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .legend-name { font-size: 10px; }

    .chart-canvas {
      display: block;
      width: 100%;
      height: 200px;
    }

    .chart-empty {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-muted);
      padding: 40px 0;
      text-align: center;
    }

    /* ── Token breakdown ── */
    .breakdown-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .breakdown-row {
      display: grid;
      grid-template-columns: 68px 1fr 80px 60px;
      align-items: center;
      gap: 12px;
    }

    .breakdown-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: var(--text-muted);
      letter-spacing: 0.06em;
    }

    .breakdown-track-wrap { flex: 1; }

    .breakdown-track {
      height: 14px;
      background: rgba(0,200,255,0.05);
      border-radius: 2px;
      overflow: hidden;
      display: flex;
    }

    .seg {
      height: 100%;
      min-width: 1px;
      transition: width 0.4s ease;
    }

    .seg-input  { background: rgba(0,200,255,0.7); box-shadow: 0 0 6px rgba(0,200,255,0.3); }
    .seg-output { background: rgba(0,255,136,0.6); box-shadow: 0 0 6px rgba(0,255,136,0.2); }
    .seg-cwrite { background: rgba(123,47,255,0.6); }
    .seg-cread  { background: rgba(140,190,215,0.25); }

    .seg-empty {
      width: 100%;
      display: flex;
      align-items: center;
      padding-left: 8px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: var(--text-muted);
    }

    .breakdown-cost {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      color: var(--cyan);
      text-align: right;
    }

    .breakdown-runs {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: var(--text-muted);
      text-align: right;
    }

    /* ── Pricing reference ── */
    .pricing-card { margin-top: 0; }

    .pricing-grid {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .pricing-row {
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 12px 14px;
      background: rgba(0,0,0,0.2);
      border: 1px solid var(--border);
      border-radius: 2px;
      transition: border-color 0.2s;

      &.active-model { border-color: rgba(0,200,255,0.3); background: rgba(0,200,255,0.04); }
    }

    .tier-name {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 120px;
    }

    .tier-tag {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.1em;
      padding: 3px 8px;
      border-radius: 2px;
      text-transform: uppercase;

      &.tier-haiku  { background: rgba(0,200,255,0.1);  color: var(--cyan);   border: 1px solid rgba(0,200,255,0.2); }
      &.tier-sonnet { background: rgba(0,255,136,0.1);  color: var(--green);  border: 1px solid rgba(0,255,136,0.2); }
      &.tier-opus   { background: rgba(123,47,255,0.1); color: var(--purple); border: 1px solid rgba(123,47,255,0.2); }
    }

    .active-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      letter-spacing: 0.1em;
      color: var(--green);
      background: rgba(0,255,136,0.08);
      border: 1px solid rgba(0,255,136,0.2);
      padding: 2px 6px;
      border-radius: 2px;
      animation: badge-glow 2s ease-in-out infinite;
    }

    @keyframes badge-glow {
      0%, 100% { box-shadow: none; }
      50%       { box-shadow: 0 0 8px rgba(0,255,136,0.2); }
    }

    .tier-prices {
      display: flex;
      gap: 24px;
      flex: 1;
    }

    .price-item { display: flex; flex-direction: column; gap: 2px; }

    .price-key {
      font-family: 'JetBrains Mono', monospace;
      font-size: 9px;
      letter-spacing: 0.1em;
      color: var(--text-muted);
    }

    .price-val {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      font-weight: 500;
      color: var(--text);
    }

    /* ── History table ── */
    .num   { text-align: right; font-size: 12px; }
    .muted { color: var(--text-muted); }
    .cyan-text { color: var(--cyan); }

    .current-month-row td { background: rgba(0,200,255,0.03); }

    .model-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.08em;
      padding: 2px 7px;
      border-radius: 2px;

      &.model-haiku  { background: rgba(0,200,255,0.08);  color: var(--cyan);   border: 1px solid rgba(0,200,255,0.15); }
      &.model-sonnet { background: rgba(0,255,136,0.08);  color: var(--green);  border: 1px solid rgba(0,255,136,0.15); }
      &.model-opus   { background: rgba(123,47,255,0.08); color: var(--purple); border: 1px solid rgba(123,47,255,0.15); }
    }

    /* Budget bar inside table */
    .bgt-bar-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .bgt-track {
      flex: 1;
      height: 4px;
      background: rgba(0,200,255,0.08);
      border-radius: 1px;
      overflow: hidden;
    }

    .bgt-fill {
      height: 100%;
      background: rgba(0,200,255,0.5);
      border-radius: 1px;
      transition: width 0.3s;

      &.bgt-warn   { background: rgba(255,170,0,0.6); }
      &.bgt-danger { background: rgba(255,51,102,0.6); }
    }

    .bgt-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      color: var(--text-muted);
      min-width: 28px;
      text-align: right;
    }

    /* ── Footer totals ── */
    .total-footer {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
    }

    .total-label { color: var(--text-muted); letter-spacing: 0.1em; }
    .total-value { color: var(--cyan); font-weight: 500; }
    .total-sep   { color: var(--border); }

    /* ── Loading ── */
    .stream-loading {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: var(--text-muted);
      padding: 20px 0;
    }

    @media (max-width: 768px) {
      .page-header { flex-wrap: wrap; gap: 10px; }
      .stats-row { grid-template-columns: repeat(2, 1fr); }
      .chart-header { flex-direction: column; align-items: flex-start; gap: 10px; }
      .chart-legend { flex-wrap: wrap; gap: 8px; }
      .breakdown-row { grid-template-columns: 58px 1fr 56px; }
      .breakdown-runs { display: none; }
      .pricing-row { flex-direction: column; align-items: flex-start; gap: 10px; }
      .tier-name { min-width: unset; }
      .tier-prices { gap: 12px; flex-wrap: wrap; }
      .total-footer { flex-wrap: wrap; row-gap: 4px; }
    }
  `],
})
export class AnalyticsComponent implements OnInit {
  private api = inject(ApiService);

  groups: Group[] = [];
  groupData: GroupData[] = [];
  selectedFolder = '';
  loading = true;

  readonly currentMonth = new Date().toISOString().slice(0, 7);

  readonly pricingTiers = [
    { key: 'claude-haiku-4-5-20251001', slug: 'haiku',  label: 'HAIKU',  prices: PRICING['claude-haiku-4-5-20251001'] },
    { key: 'claude-sonnet-4-6',          slug: 'sonnet', label: 'SONNET', prices: PRICING['claude-sonnet-4-6'] },
    { key: 'claude-opus-4-6',            slug: 'opus',   label: 'OPUS',   prices: PRICING['claude-opus-4-6'] },
  ];

  // ── Filtered data ────────────────────────────────────────────────────────

  get filteredGroupData(): GroupData[] {
    if (!this.selectedFolder) return this.groupData;
    return this.groupData.filter(g => g.folder === this.selectedFolder);
  }

  // ── This-month aggregates ─────────────────────────────────────────────────

  private thisMonthUsages(): MonthlyUsage[] {
    return this.filteredGroupData.flatMap(g => g.months.filter(m => m.month === this.currentMonth));
  }

  get totalCostThisMonth(): number {
    return this.thisMonthUsages().reduce((s, u) => s + calcCost(u), 0);
  }

  get totalTokensThisMonth(): number {
    return this.thisMonthUsages().reduce((s, u) => s + u.input_tokens + u.output_tokens, 0);
  }

  get totalRunsThisMonth(): number {
    return this.thisMonthUsages().reduce((s, u) => s + u.runs, 0);
  }

  get cacheHitRate(): number {
    const usages = this.thisMonthUsages();
    const reads = usages.reduce((s, u) => s + (u.cache_read_input_tokens || 0), 0);
    const total = reads + usages.reduce((s, u) => s + u.input_tokens, 0);
    return total > 0 ? (reads / total) * 100 : 0;
  }

  get avgCostPerRun(): number {
    const runs = this.totalRunsThisMonth;
    return runs > 0 ? this.totalCostThisMonth / runs : 0;
  }

  // ── All-time aggregates ───────────────────────────────────────────────────

  get totalCostAllTime(): number {
    return this.filteredGroupData.flatMap(g => g.months).reduce((s, u) => s + calcCost(u), 0);
  }

  get totalRunsAllTime(): number {
    return this.filteredGroupData.flatMap(g => g.months).reduce((s, u) => s + u.runs, 0);
  }

  get totalTokensAllTime(): number {
    return this.filteredGroupData.flatMap(g => g.months).reduce((s, u) => s + u.input_tokens + u.output_tokens, 0);
  }

  // ── Chart months (last 6) ─────────────────────────────────────────────────

  get chartMonths(): ChartMonth[] {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = d.toISOString().slice(0, 7);
      const shortMonth = d.toLocaleString('en-GB', { month: 'short' });
      const yr = String(d.getFullYear()).slice(2);
      const label = `${shortMonth} '${yr}`;

      const usages = this.filteredGroupData.flatMap(g => g.months.filter(m => m.month === key));
      const groups = this.filteredGroupData.map(g => {
        const u = g.months.find(m => m.month === key);
        return { folder: g.folder, cost: u ? calcCost(u) : 0 };
      });

      return {
        key, label, groups,
        totalCost: usages.reduce((s, u) => s + calcCost(u), 0),
        totalTokens: usages.reduce((s, u) => s + u.input_tokens + u.output_tokens, 0),
        totalRuns: usages.reduce((s, u) => s + u.runs, 0),
        usage: usages,
      };
    });
  }

  // ── History rows ──────────────────────────────────────────────────────────

  get historyRows(): HistoryRow[] {
    const rows: HistoryRow[] = [];
    for (const g of this.filteredGroupData) {
      for (const u of g.months) {
        rows.push({
          month: u.month,
          folder: g.folder,
          groupName: g.name,
          model: modelShort(u.model),
          runs: u.runs,
          input_tokens: u.input_tokens,
          output_tokens: u.output_tokens,
          cache_read: u.cache_read_input_tokens || 0,
          cache_write: u.cache_creation_input_tokens || 0,
          cost: calcCost(u),
          budget_pct: u.budget_used_pct,
        });
      }
    }
    return rows.sort((a, b) => b.month.localeCompare(a.month) || a.folder.localeCompare(b.folder));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  groupColor(i: number): string { return GROUP_COLORS[i % GROUP_COLORS.length]; }

  isActiveModel(key: string): boolean {
    return this.filteredGroupData.some(g =>
      g.months.some(m => m.month === this.currentMonth && m.model === key)
    );
  }

  sumField(usages: MonthlyUsage[], field: keyof MonthlyUsage): number {
    return usages.reduce((s, u) => s + ((u[field] as number) || 0), 0);
  }

  tokenCacheTotal(cm: ChartMonth): number {
    return this.sumField(cm.usage, 'cache_read_input_tokens') + this.sumField(cm.usage, 'cache_creation_input_tokens');
  }

  tokenSegPct(cm: ChartMonth, seg: 'input' | 'output' | 'cwrite' | 'cread'): number {
    const total = cm.totalTokens + this.tokenCacheTotal(cm);
    if (total === 0) return 0;
    const vals: Record<string, number> = {
      input:  this.sumField(cm.usage, 'input_tokens'),
      output: this.sumField(cm.usage, 'output_tokens'),
      cwrite: this.sumField(cm.usage, 'cache_creation_input_tokens'),
      cread:  this.sumField(cm.usage, 'cache_read_input_tokens'),
    };
    return (vals[seg] / total) * 100;
  }

  tokenBreakdownTitle(cm: ChartMonth): string {
    return [
      `Input: ${this.fmtTokens(this.sumField(cm.usage, 'input_tokens'))}`,
      `Output: ${this.fmtTokens(this.sumField(cm.usage, 'output_tokens'))}`,
      `Cache write: ${this.fmtTokens(this.sumField(cm.usage, 'cache_creation_input_tokens'))}`,
      `Cache read: ${this.fmtTokens(this.sumField(cm.usage, 'cache_read_input_tokens'))}`,
    ].join(' · ');
  }

  fmtPrice(n: number): string { return '$' + n.toFixed(2); }

  fmtDollar(n: number): string {
    if (n === 0) return '$0.00';
    if (n < 0.0001) return `$${n.toExponential(2)}`;
    if (n < 0.01) return `$${n.toFixed(4)}`;
    if (n < 1)    return `$${n.toFixed(3)}`;
    return `$${n.toFixed(2)}`;
  }

  fmtTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.api.groups().subscribe({
      next: groups => {
        this.groups = groups;
        if (!groups.length) { this.loading = false; return; }

        const requests = groups.map(g =>
          this.api.usage(g.folder).pipe(
            map(data => ({
              folder: g.folder,
              name: g.name,
              months: (Array.isArray(data) ? data : [data]).filter(m => m.runs > 0),
            })),
            catchError(() => of({ folder: g.folder, name: g.name, months: [] })),
          )
        );

        forkJoin(requests).subscribe(groupData => {
          this.groupData = groupData;
          this.loading = false;
          setTimeout(() => this.drawCostChart(), 50);
        });
      },
      error: () => { this.loading = false; },
    });
  }

  onGroupChange(folder: string): void {
    this.selectedFolder = folder;
    setTimeout(() => this.drawCostChart(), 50);
  }

  // ── Canvas cost-trend chart ───────────────────────────────────────────────

  private drawCostChart(): void {
    const canvas = document.getElementById('cost-chart') as HTMLCanvasElement | null;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || canvas.offsetWidth || 800;
    const H = canvas.clientHeight || 200;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const months = this.chartMonths;
    const maxCost = Math.max(...months.map(m => m.totalCost), 0.000001);

    const PAD = { top: 28, right: 20, bottom: 36, left: 64 };
    const cW = W - PAD.left - PAD.right;
    const cH = H - PAD.top - PAD.bottom;
    const colW = cW / months.length;

    // Grid lines & Y labels
    const gridSteps = 4;
    for (let i = 0; i <= gridSteps; i++) {
      const val = (maxCost / gridSteps) * i;
      const y = PAD.top + cH - (cH / gridSteps) * i;

      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = 'rgba(0,200,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(PAD.left + cW, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(140,190,215,0.4)';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(this.fmtDollar(val), PAD.left - 6, y + 3);
    }

    // Bars
    const groups = this.filteredGroupData;
    const barTotalW = colW * 0.65;
    const barW = groups.length > 1 ? barTotalW / groups.length : barTotalW;
    const barOffsetStart = (colW - barTotalW) / 2;

    months.forEach((month, mi) => {
      const xBase = PAD.left + colW * mi;

      if (groups.length <= 1) {
        // Single group: one glowing bar
        const cost = month.totalCost;
        const barH = (cost / maxCost) * cH;
        const x = xBase + barOffsetStart;
        const y = PAD.top + cH - barH;

        if (barH > 0) {
          const grad = ctx.createLinearGradient(0, y, 0, y + barH);
          grad.addColorStop(0, 'rgba(0,200,255,0.9)');
          grad.addColorStop(1, 'rgba(0,200,255,0.2)');
          ctx.shadowBlur = 12;
          ctx.shadowColor = 'rgba(0,200,255,0.5)';
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, barTotalW, barH);
          ctx.shadowBlur = 0;

          // Top cap
          ctx.strokeStyle = 'rgba(0,200,255,1)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + barTotalW, y); ctx.stroke();

          // Value label
          ctx.fillStyle = 'rgba(0,200,255,0.9)';
          ctx.font = '9px JetBrains Mono, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(this.fmtDollar(cost), x + barTotalW / 2, y - 5);
        }
      } else {
        // Multi-group: side-by-side bars
        month.groups.forEach((gCost, gi) => {
          const cost = gCost.cost;
          const barH = (cost / maxCost) * cH;
          const x = xBase + barOffsetStart + gi * barW;
          const y = PAD.top + cH - barH;
          const color = GROUP_COLORS[gi % GROUP_COLORS.length];

          if (barH > 0) {
            ctx.shadowBlur = 8;
            ctx.shadowColor = color + '88';
            ctx.fillStyle = color + 'aa';
            ctx.fillRect(x, y, barW - 1, barH);
            ctx.shadowBlur = 0;

            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + barW - 1, y); ctx.stroke();
          }
        });

        // Combined value label
        if (month.totalCost > 0) {
          const totalH = (month.totalCost / maxCost) * cH;
          ctx.fillStyle = 'rgba(140,190,215,0.7)';
          ctx.font = '9px JetBrains Mono, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(this.fmtDollar(month.totalCost), xBase + colW / 2, PAD.top + cH - totalH - 5);
        }
      }

      // X label
      ctx.fillStyle = 'rgba(140,190,215,0.45)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(month.label, xBase + colW / 2, H - PAD.bottom + 14);

      // Highlight current month
      if (month.key === this.currentMonth) {
        ctx.strokeStyle = 'rgba(0,200,255,0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(xBase + 2, PAD.top, colW - 4, cH);
        ctx.setLineDash([]);
      }
    });
  }
}
