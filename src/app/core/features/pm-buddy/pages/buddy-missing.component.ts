import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { BuddyInsight, InsightKind } from '../models/pm-buddy.models';
import { PmBuddyService } from '../services/pm-buddy.service';
import { BuddyInsightCardComponent } from '../components/buddy-insight-card.component';
import { PscIllustrationComponent } from '../../../components/psc-illustration/psc-illustration.component';

const FILTERS: { id: 'all' | InsightKind; label: string; icon: string }[] = [
  { id: 'all', label: 'Everything', icon: 'radar' },
  { id: 'overdue-commitment', label: 'Overdue commitments', icon: 'handshake' },
  { id: 'meeting-action', label: 'Meeting actions', icon: 'list-checks' },
  { id: 'stakeholder-response', label: 'Waiting on others', icon: 'hourglass' },
  { id: 'upcoming-deadline', label: 'Deadlines', icon: 'calendar-clock' },
  { id: 'unreviewed-idea', label: 'Unreviewed ideas', icon: 'lightbulb' },
  { id: 'open-question', label: 'Open questions', icon: 'circle-help' }
];

/** Proactive AI Buddy — everything that might be slipping, with one-click resolution. */
@Component({
  selector: 'app-buddy-missing',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, BuddyInsightCardComponent, PscIllustrationComponent],
  template: `
    <div class="pmb-page pmb-page--narrow">
      <div class="pmb-page-head">
        <div>
          <h1 class="pmb-page-title">What am I missing?</h1>
          <p class="pmb-page-sub">I scan your commitments, meetings and ideas for anything that’s slipping.</p>
        </div>
        <button type="button" class="pmb-btn pmb-btn--ghost" (click)="rescan()" [disabled]="scanning()">
          <lucide-icon [name]="scanning() ? 'loader' : 'scan-search'" [size]="14"></lucide-icon>{{ scanning() ? 'Scanning…' : 'Rescan' }}
        </button>
      </div>

      <section class="summary" aria-label="Attention summary">
        <div class="sev" data-sev="high"><span class="sev-n">{{ count('high') }}</span><span>Needs action now</span></div>
        <div class="sev" data-sev="medium"><span class="sev-n">{{ count('medium') }}</span><span>Coming up</span></div>
        <div class="sev" data-sev="low"><span class="sev-n">{{ count('low') }}</span><span>Worth a look</span></div>
      </section>

      <div class="pmb-filters" role="tablist" aria-label="Insight type">
        <button type="button" class="pmb-filter" *ngFor="let f of filters()" role="tab" [attr.aria-selected]="filter() === f.id" [class.active]="filter() === f.id" (click)="filter.set(f.id)">
          <lucide-icon [name]="f.icon" [size]="13"></lucide-icon>{{ f.label }} <span class="pmb-filter-n">{{ f.count }}</span>
        </button>
      </div>

      <ng-container *ngIf="!scanning(); else scanTpl">
        <div class="list">
          <app-buddy-insight-card *ngFor="let ins of visible(); trackBy: trackById" [insight]="ins"></app-buddy-insight-card>
        </div>
        <div class="pmb-card pmb-empty" *ngIf="!visible().length">
          <app-psc-illustration name="ai-decision-context"></app-psc-illustration>
          <strong>{{ filter() === 'all' ? 'You’re on top of everything' : 'Nothing in this category' }}</strong>
          I’ll keep watching your commitments, meetings and ideas.
        </div>
      </ng-container>
      <ng-template #scanTpl>
        <div class="pmb-card pmb-section" aria-busy="true">
          <span class="pmb-thinking"><span></span><span></span><span></span> Checking {{ buddy.items().length }} items, {{ buddy.pastMeetings().length }} meetings and {{ buddy.ideas().length }} ideas…</span>
          <div class="pmb-skeleton" style="height:64px"></div><div class="pmb-skeleton" style="height:64px"></div><div class="pmb-skeleton" style="height:64px"></div>
        </div>
      </ng-template>
    </div>
  `,
  styles: [`
    :host { display: contents; }
    .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .sev { --sev: #F59E0B; display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 14px; background: var(--psc-surface); border: 1px solid var(--psc-line); border-left: 4px solid var(--sev); font-size: 13px; font-weight: 700; color: var(--psc-text-subtle); }
    .sev[data-sev='high'] { --sev: #EF4444; } .sev[data-sev='low'] { --sev: #60A5FA; }
    .sev-n { font-size: 24px; font-weight: 800; color: var(--psc-text-strong); }
    .list { display: flex; flex-direction: column; gap: 10px; }
    @media (max-width: 560px) { .summary { gap: 8px; } .sev { flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px 12px; font-size: 11.5px; } .sev-n { font-size: 20px; } }
  `]
})
export class BuddyMissingComponent {
  readonly buddy = inject(PmBuddyService);
  readonly filter = signal<'all' | InsightKind>('all');
  readonly scanning = signal(false);

  readonly filters = computed(() => {
    const all = this.buddy.insights();
    return FILTERS.map(f => ({ ...f, count: f.id === 'all' ? all.length : all.filter(i => i.kind === f.id).length })).filter(f => f.id === 'all' || f.count);
  });

  readonly visible = computed(() => {
    const f = this.filter();
    return this.buddy.insights().filter(i => f === 'all' || i.kind === f);
  });

  count(sev: BuddyInsight['severity']): number {
    return this.buddy.insights().filter(i => i.severity === sev).length;
  }

  rescan(): void {
    this.scanning.set(true);
    window.setTimeout(() => {
      this.scanning.set(false);
      const n = this.buddy.insights().length;
      this.buddy.toast('info', n ? `Scan complete — ${n} thing${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} attention` : 'Scan complete — nothing slipping');
    }, 1100);
  }

  trackById(_: number, x: { id: string }): string {
    return x.id;
  }
}
