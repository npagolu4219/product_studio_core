import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { BuddyInsight } from '../models/pm-buddy.models';
import { PmBuddyService } from '../services/pm-buddy.service';
import { RelativeDayPipe } from './relative-day.pipe';

const KIND_META: Record<BuddyInsight['kind'], { icon: string; label: string }> = {
  'overdue-commitment': { icon: 'handshake', label: 'Overdue commitment' },
  'meeting-action': { icon: 'list-checks', label: 'Meeting action' },
  'stakeholder-response': { icon: 'hourglass', label: 'Waiting on response' },
  'upcoming-deadline': { icon: 'calendar-clock', label: 'Upcoming deadline' },
  'unreviewed-idea': { icon: 'lightbulb', label: 'Unreviewed idea' },
  'open-question': { icon: 'circle-help', label: 'Open question' }
};

/** One proactive "What am I missing?" insight with Complete / Snooze / View / Convert actions. */
@Component({
  selector: 'app-buddy-insight-card',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, RelativeDayPipe],
  template: `
    <article class="ins" [attr.data-sev]="insight.severity">
      <span class="ins-icon"><lucide-icon [name]="meta.icon" [size]="16"></lucide-icon></span>
      <div class="ins-body">
        <div class="ins-top">
          <span class="ins-kind">{{ meta.label }}</span>
          <span class="ins-sev" [attr.data-sev]="insight.severity">{{ insight.severity }}</span>
        </div>
        <p class="ins-msg">{{ insight.message }}</p>
        <div class="ins-meta">
          <span *ngIf="insight.project">{{ insight.project }}</span>
          <span *ngIf="insight.date"><lucide-icon name="calendar" [size]="11"></lucide-icon>{{ insight.date | relativeDay }}</span>
        </div>
        <div class="ins-actions" *ngIf="!compact || expanded">
          <button type="button" class="pmb-btn pmb-btn--soft pmb-btn--sm" *ngIf="insight.canComplete" (click)="buddy.completeInsight(insight)">
            <lucide-icon name="check" [size]="13"></lucide-icon>{{ insight.ref.type === 'idea' ? 'Mark reviewed' : insight.ref.type === 'meeting-question' ? 'Resolved' : 'Complete' }}
          </button>
          <button type="button" class="pmb-btn pmb-btn--ghost pmb-btn--sm" (click)="buddy.snoozeInsight(insight, 1)">
            <lucide-icon name="alarm-clock" [size]="13"></lucide-icon>Snooze
          </button>
          <button type="button" class="pmb-btn pmb-btn--ghost pmb-btn--sm" *ngIf="insight.canConvert" (click)="buddy.convertInsight(insight)">
            <lucide-icon name="list-plus" [size]="13"></lucide-icon>Convert to task
          </button>
          <button type="button" class="pmb-link" (click)="view()">
            View details<lucide-icon name="arrow-right" [size]="12"></lucide-icon>
          </button>
        </div>
        <button type="button" class="pmb-link ins-more" *ngIf="compact && !expanded" (click)="expanded = true" [attr.aria-label]="'Show actions for: ' + insight.title">
          Actions<lucide-icon name="chevron-down" [size]="12"></lucide-icon>
        </button>
      </div>
    </article>
  `,
  styles: [`
    :host { display: block; animation: pmb-fade-up .25s ease both; }
    .ins { display: flex; gap: 12px; padding: 12px 14px; background: var(--psc-surface); border: 1px solid var(--psc-line); border-left: 3px solid var(--sev); border-radius: 12px; --sev: #F59E0B; }
    .ins[data-sev='high'] { --sev: #EF4444; }
    .ins[data-sev='low'] { --sev: #60A5FA; }
    .ins-icon { flex: 0 0 32px; height: 32px; display: grid; place-items: center; border-radius: 9px; color: var(--sev); background: color-mix(in srgb, var(--sev) 14%, transparent); }
    .ins-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
    .ins-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .ins-kind { font-size: 11px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase; color: var(--psc-text-subtle); }
    .ins-sev { padding: 1px 7px; border-radius: 999px; font-size: 10px; font-weight: 800; text-transform: uppercase; color: var(--psc-on-tint-amber); background: var(--psc-tint-amber); }
    .ins-sev[data-sev='high'] { color: var(--psc-on-tint-red); background: var(--psc-tint-red); }
    .ins-sev[data-sev='low'] { color: var(--psc-on-tint-blue); background: var(--psc-tint-blue); }
    .ins-msg { margin: 0; font-size: 13px; line-height: 1.5; color: var(--psc-text-body); }
    .ins-meta { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11.5px; color: var(--psc-text-subtle);
      span { display: inline-flex; align-items: center; gap: 4px; } }
    .ins-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
    .ins-more { align-self: flex-start; padding-left: 0; }
  `]
})
export class BuddyInsightCardComponent {
  @Input({ required: true }) insight!: BuddyInsight;
  /** Compact cards (Buddy Home) reveal actions on demand. */
  @Input() compact = false;

  readonly buddy = inject(PmBuddyService);
  private readonly router = inject(Router);
  expanded = false;

  get meta() {
    return KIND_META[this.insight.kind];
  }

  view(): void {
    const focus = this.insight.ref.meetingId ?? this.insight.ref.id;
    this.router.navigate(this.insight.link, { queryParams: { focus } });
  }
}
