import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { BuddyMeeting } from '../models/pm-buddy.models';
import { PmBuddyService } from '../services/pm-buddy.service';
import { BuddyItemCardComponent } from '../components/buddy-item-card.component';
import { PscIllustrationComponent } from '../../../components/psc-illustration/psc-illustration.component';
import { CURRENT_USER } from '../../../constants/current-user';
import { ME } from '../data/pm-buddy.mock-data';

/** Daily AI briefing — computed from live state; "Regenerate" simulates the AI pass. */
@Component({
  selector: 'app-buddy-briefing',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, BuddyItemCardComponent, PscIllustrationComponent],
  template: `
    <div class="pmb-page pmb-page--narrow">
      <div class="pmb-page-head">
        <div>
          <h1 class="pmb-page-title">Daily Briefing</h1>
          <p class="pmb-page-sub">{{ dateLabel }} · prepared for {{ name }} at {{ generatedAt() }}</p>
        </div>
        <button type="button" class="pmb-btn pmb-btn--ghost" (click)="regenerate()" [disabled]="loading()">
          <lucide-icon [name]="loading() ? 'loader' : 'refresh-cw'" [size]="14"></lucide-icon>{{ loading() ? 'Preparing…' : 'Regenerate' }}
        </button>
      </div>

      <ng-container *ngIf="!loading(); else skeleton">
        <section class="headline" aria-label="Summary">
          <span class="headline-icon"><lucide-icon name="sun" [size]="20"></lucide-icon></span>
          <div>
            <div class="headline-label">Your day at a glance</div>
            <p class="headline-text">{{ b().headline }}</p>
          </div>
        </section>

        <div class="cols">
          <section class="pmb-card pmb-section" aria-labelledby="bm-title">
            <h2 class="pmb-section-title" id="bm-title"><lucide-icon name="calendar" [size]="16"></lucide-icon>Today’s meetings <span class="pmb-count">{{ b().meetings.length }}</span></h2>
            <ol class="timeline">
              <li *ngFor="let m of b().meetings" [class.past]="isPast(m)">
                <span class="tl-time">{{ m.time }}</span>
                <div class="tl-body">
                  <span class="tl-title">{{ m.title }}</span>
                  <span class="tl-sub">{{ m.durationMin }} min · {{ others(m) }}</span>
                  <span class="tl-prep" *ngIf="prep(m) as p"><lucide-icon name="sparkles" [size]="11"></lucide-icon>{{ p }}</span>
                </div>
              </li>
            </ol>
            <div class="pmb-empty" *ngIf="!b().meetings.length"><strong>No meetings today</strong>Protect the time for deep work.</div>
          </section>

          <section class="pmb-card pmb-section" aria-labelledby="bp-title">
            <h2 class="pmb-section-title" id="bp-title"><lucide-icon name="target" [size]="16"></lucide-icon>Suggested priorities</h2>
            <ol class="focus"><li *ngFor="let f of b().focus">{{ f.replace(rx, '') }}</li></ol>
            <p class="why">Ranked by what’s overdue, due today, priority and whether someone is waiting on you.</p>
          </section>
        </div>

        <section class="pmb-card pmb-section" *ngIf="b().overdue.length" aria-labelledby="bo-title">
          <div class="pmb-section-head">
            <h2 class="pmb-section-title" id="bo-title"><lucide-icon name="triangle-alert" [size]="16"></lucide-icon>Overdue follow-ups &amp; commitments <span class="pmb-count">{{ b().overdue.length }}</span></h2>
            <a class="pmb-link" routerLink="../missing">What am I missing?<lucide-icon name="arrow-right" [size]="12"></lucide-icon></a>
          </div>
          <app-buddy-item-card *ngFor="let i of b().overdue" [item]="i"></app-buddy-item-card>
        </section>

        <div class="cols">
          <section class="pmb-card pmb-section" aria-labelledby="bd-title">
            <h2 class="pmb-section-title" id="bd-title"><lucide-icon name="calendar-clock" [size]="16"></lucide-icon>Important deadlines <span class="pmb-count">{{ b().deadlines.length }}</span></h2>
            <app-buddy-item-card *ngFor="let i of b().deadlines" [item]="i"></app-buddy-item-card>
            <div class="pmb-empty" *ngIf="!b().deadlines.length"><strong>Nothing due in the next 3 days</strong></div>
          </section>
          <section class="pmb-card pmb-section" aria-labelledby="bc-title">
            <h2 class="pmb-section-title" id="bc-title"><lucide-icon name="handshake" [size]="16"></lucide-icon>Pending commitments <span class="pmb-count">{{ b().commitments.length }}</span></h2>
            <app-buddy-item-card *ngFor="let i of b().commitments" [item]="i"></app-buddy-item-card>
            <div class="pmb-empty" *ngIf="!b().commitments.length"><strong>No open promises</strong></div>
          </section>
        </div>

        <section class="eod" aria-labelledby="be-title">
          <app-psc-illustration name="roadmap"></app-psc-illustration>
          <div>
            <h2 id="be-title"><lucide-icon name="moon" [size]="15"></lucide-icon>End-of-day summary</h2>
            <p>{{ b().eod }}</p>
            <ul *ngIf="buddy.completedToday().length"><li *ngFor="let i of buddy.completedToday()"><lucide-icon name="check" [size]="12"></lucide-icon>{{ i.title }}</li></ul>
          </div>
        </section>
      </ng-container>

      <ng-template #skeleton>
        <div class="pmb-card pmb-section" aria-busy="true" aria-label="Preparing your briefing">
          <span class="pmb-thinking"><span></span><span></span><span></span> Reviewing your meetings, tasks and commitments…</span>
          <div class="pmb-skeleton" style="height:18px;width:70%"></div>
          <div class="pmb-skeleton" style="height:14px;width:90%"></div>
          <div class="cols"><div class="pmb-skeleton" style="height:160px"></div><div class="pmb-skeleton" style="height:160px"></div></div>
          <div class="pmb-skeleton" style="height:90px"></div>
        </div>
      </ng-template>
    </div>
  `,
  styles: [`
    :host { display: contents; }
    .headline { display: flex; gap: 14px; align-items: flex-start; padding: 18px 20px; border-radius: 16px; color: #fff; background: var(--psc-gradient-brand); box-shadow: 0 14px 30px rgb(var(--psc-primary-rgb) / .28); animation: pmb-fade-up .25s ease both; }
    .headline-icon { flex: 0 0 40px; height: 40px; display: grid; place-items: center; border-radius: 12px; background: rgba(255, 255, 255, .2); }
    .headline-label { font-size: 11px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; opacity: .85; }
    .headline-text { margin: 4px 0 0; font-size: 16px; font-weight: 700; line-height: 1.5; }
    .cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
    .timeline { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
    .timeline li { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--psc-line-soft); }
    .timeline li:last-child { border-bottom: 0; }
    .timeline li.past { opacity: .55; }
    .tl-time { flex: 0 0 48px; font-size: 13px; font-weight: 800; color: var(--psc-primary-text); }
    .tl-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .tl-title { font-size: 13.5px; font-weight: 800; color: var(--psc-text-strong); }
    .tl-sub { font-size: 12px; color: var(--psc-text-subtle); }
    .tl-prep { display: inline-flex; align-items: center; gap: 5px; margin-top: 2px; padding: 3px 8px; align-self: flex-start; border-radius: 7px; font-size: 11.5px; font-weight: 700; color: var(--psc-on-tint-violet); background: var(--psc-tint-violet); }
    .focus { margin: 0; padding-left: 0; list-style: none; counter-reset: f; display: flex; flex-direction: column; gap: 8px; }
    .focus li { counter-increment: f; display: flex; gap: 10px; align-items: flex-start; font-size: 13.5px; font-weight: 700; color: var(--psc-text-strong); line-height: 1.45; }
    .focus li::before { content: counter(f); flex: 0 0 24px; height: 24px; display: grid; place-items: center; border-radius: 8px; font-size: 12px; color: #fff; background: var(--psc-gradient-brand); }
    .why { margin: 0; font-size: 12px; color: var(--psc-text-subtle); }
    .eod { display: flex; gap: 16px; align-items: center; padding: 18px 20px; border-radius: 16px; background: var(--psc-surface); border: 1px solid var(--psc-line); }
    .eod app-psc-illustration { flex: 0 0 120px; height: 80px; }
    .eod h2 { display: flex; align-items: center; gap: 6px; margin: 0 0 4px; font-size: 14px; font-weight: 800; color: var(--psc-text-strong); }
    .eod p { margin: 0; font-size: 13.5px; line-height: 1.55; color: var(--psc-text-body); }
    .eod ul { margin: 8px 0 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
    .eod li { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 700; color: var(--psc-on-tint-green); background: var(--psc-tint-green); }
    @media (max-width: 900px) { .cols { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 560px) { .eod { flex-direction: column; align-items: flex-start; } }
  `]
})
export class BuddyBriefingComponent {
  readonly buddy = inject(PmBuddyService);
  readonly b = this.buddy.briefing;
  readonly name = CURRENT_USER.firstName;
  readonly dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  readonly rx = /^\d+\.\s*/;
  readonly loading = signal(false);
  readonly generatedAt = signal('8:00 AM');

  regenerate(): void {
    this.loading.set(true);
    window.setTimeout(() => {
      this.generatedAt.set(new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
      this.loading.set(false);
      this.buddy.toast('success', 'Briefing updated with your latest changes');
    }, 1200);
  }

  isPast(m: BuddyMeeting): boolean {
    const [h, min] = m.time.split(':').map(Number);
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() > h * 60 + min + m.durationMin;
  }

  others(m: BuddyMeeting): string {
    return m.participants.filter(p => p !== ME).join(', ') || 'Just you';
  }

  /** Prep hint: open commitments involving someone in the meeting. */
  prep(m: BuddyMeeting): string | null {
    const open = this.buddy.active().filter(i => i.kind === 'commitment' && i.stakeholder && m.participants.includes(i.stakeholder));
    if (!open.length) return null;
    const mine = open.filter(i => i.direction === 'i-owe').length;
    const theirs = open.length - mine;
    return [mine ? `${mine} promise${mine === 1 ? '' : 's'} you owe` : '', theirs ? `${theirs} thing${theirs === 1 ? '' : 's'} they owe you` : ''].filter(Boolean).join(' · ');
  }
}
