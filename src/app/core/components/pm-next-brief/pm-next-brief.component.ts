import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PmBuddyService } from '../../features/pm-buddy/services/pm-buddy.service';
import { BuddyItem, BuddyMeeting } from '../../features/pm-buddy/models/pm-buddy.models';
import { ME } from '../../features/pm-buddy/data/pm-buddy.mock-data';
import { daysFromToday, relativeDay, today } from '../../features/pm-buddy/data/pm-buddy.dates';

type Tone = 'red' | 'amber' | 'blue' | 'violet';

interface BriefRow {
  id: string;
  icon: string;
  tone: Tone;
  /** Short time cue on the left: "12 min", "Now", "2d late", "Today". */
  when: string;
  title: string;
  detail: string;
  link: string[];
  focus?: string;
  rank: number;
}

const COLLAPSE_KEY = 'psc.home.next-brief.collapsed';
const TICK_MS = 30_000;
const BUDDY = ['/psc', 'pm-buddy'];

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * "Up next" — a glanceable PM Buddy brief on Home: the next meeting with a live countdown, plus the
 * promises, reminders and follow-ups that need attention now. Every row opens the exact item in PM Buddy.
 */
@Component({
  selector: 'app-pm-next-brief',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule],
  template: `
    <section class="nb" [class.collapsed]="collapsed()" aria-labelledby="nb-title">
      <header class="nb-head">
        <a class="nb-brand" [routerLink]="buddy" title="Open PM Buddy">
          <span class="nb-logo"><lucide-icon name="bot" [size]="14"></lucide-icon></span>
          <span class="nb-titles">
            <span class="nb-title" id="nb-title">Up next</span>
            <span class="nb-sub">PM Buddy · {{ clock() }}</span>
          </span>
        </a>

        <!-- Collapsed: one-line brief of the most important thing -->
        <a class="nb-headline" *ngIf="collapsed() && rows()[0] as top" [routerLink]="top.link" [queryParams]="top.focus ? { focus: top.focus } : null"
          [attr.data-tone]="top.tone" [title]="top.title">
          <span class="nb-dot"></span><strong>{{ top.when }}</strong><span class="nb-headline-text">{{ top.title }}</span>
        </a>

        <div class="nb-stats" *ngIf="!collapsed()">
          <a class="nb-stat" data-tone="red" *ngIf="stats().overdue" [routerLink]="[ '/psc', 'pm-buddy', 'tasks' ]" [queryParams]="{ status: 'overdue' }">
            {{ stats().overdue }} overdue</a>
          <a class="nb-stat" data-tone="amber" *ngIf="stats().today" [routerLink]="[ '/psc', 'pm-buddy', 'tasks' ]" [queryParams]="{ status: 'today' }">
            {{ stats().today }} due today</a>
          <a class="nb-stat" data-tone="blue" *ngIf="stats().meetings" [routerLink]="[ '/psc', 'pm-buddy', 'meetings' ]">
            {{ plural(stats().meetings, 'meeting') }} left</a>
        </div>

        <span class="nb-spacer"></span>
        <a class="nb-link" *ngIf="!collapsed()" [routerLink]="[ '/psc', 'pm-buddy', 'briefing' ]">Full briefing<lucide-icon name="arrow-right" [size]="12"></lucide-icon></a>
        <button type="button" class="nb-toggle" (click)="toggle()" [attr.aria-expanded]="!collapsed()"
          [attr.aria-label]="collapsed() ? 'Expand Up next' : 'Collapse Up next'" [title]="collapsed() ? 'Show more' : 'Show less'">
          <lucide-icon [name]="collapsed() ? 'chevron-down' : 'chevron-up'" [size]="15"></lucide-icon>
        </button>
      </header>

      <ul class="nb-list" *ngIf="!collapsed()" role="list">
        <li *ngFor="let r of rows().slice(0, 4); trackBy: trackById">
          <a class="nb-row" [attr.data-tone]="r.tone" [routerLink]="r.link" [queryParams]="r.focus ? { focus: r.focus } : null"
            [attr.aria-label]="r.when + ': ' + r.title + '. ' + r.detail + '. Open in PM Buddy'">
            <span class="nb-when">{{ r.when }}</span>
            <span class="nb-icon"><lucide-icon [name]="r.icon" [size]="14"></lucide-icon></span>
            <span class="nb-text">
              <span class="nb-row-title">{{ r.title }}</span>
              <span class="nb-row-detail">{{ r.detail }}</span>
            </span>
            <lucide-icon class="nb-go" name="arrow-up-right" [size]="14"></lucide-icon>
          </a>
        </li>
        <li *ngIf="!rows().length" class="nb-clear">
          <lucide-icon name="check-circle" [size]="15"></lucide-icon>
          All clear — nothing urgent and no more meetings today. A good time for deep work.
        </li>
      </ul>
      <a class="nb-more" *ngIf="!collapsed() && rows().length > 4" [routerLink]="[ '/psc', 'pm-buddy', 'missing' ]">
        +{{ rows().length - 4 }} more need attention — see what you might be missing
      </a>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .nb {
      margin-top: 16px; padding: 10px 12px 12px; border: 1px solid var(--psc-line); border-radius: 16px;
      background: var(--psc-surface); box-shadow: 0 1px 2px rgba(20, 16, 60, .04);
    }
    .nb.collapsed { padding-bottom: 10px; }
    .nb-head { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .nb-brand { display: flex; align-items: center; gap: 8px; flex-shrink: 0; color: inherit; text-decoration: none; border-radius: 8px; }
    .nb-logo { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 9px; color: #fff; background: var(--psc-gradient-brand); }
    .nb-titles { display: flex; flex-direction: column; line-height: 1.15; }
    .nb-title { color: var(--psc-text-strong); font-size: 13px; font-weight: 800; }
    .nb-sub { color: var(--psc-text-subtle); font-size: 10.5px; font-weight: 700; }
    .nb-stats { display: flex; gap: 6px; flex-wrap: wrap; min-width: 0; }
    .nb-stat {
      --c: var(--psc-on-tint-blue, #2563EB); --bg: var(--psc-tint-blue, rgba(59,130,246,.1));
      padding: 3px 9px; border-radius: 999px; color: var(--c); background: var(--bg); font-size: 11px; font-weight: 800; text-decoration: none; white-space: nowrap;
      &:hover { filter: brightness(.96); text-decoration: underline; }
    }
    [data-tone='red'] { --c: var(--psc-on-tint-red, #B91C1C); --bg: var(--psc-tint-red, rgba(239,68,68,.1)); }
    [data-tone='amber'] { --c: var(--psc-on-tint-amber, #B45309); --bg: var(--psc-tint-amber, rgba(245,158,11,.12)); }
    [data-tone='blue'] { --c: var(--psc-on-tint-blue, #1D4ED8); --bg: var(--psc-tint-blue, rgba(59,130,246,.1)); }
    [data-tone='violet'] { --c: var(--psc-primary-text); --bg: rgb(var(--psc-primary-rgb) / .1); }
    .nb-spacer { flex: 1; }
    .nb-link {
      display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; padding: 4px 6px; border-radius: 6px;
      color: var(--psc-primary-text); font-size: 12px; font-weight: 700; text-decoration: none; white-space: nowrap;
      &:hover { background: rgb(var(--psc-primary-rgb) / .08); }
    }
    .nb-toggle {
      flex-shrink: 0; width: 28px; height: 28px; display: grid; place-items: center; border: 0; border-radius: 8px;
      color: var(--psc-text-body); background: transparent; cursor: pointer;
      &:hover { background: var(--psc-surface-3); color: var(--psc-text-strong); }
    }
    .nb-headline {
      display: flex; align-items: center; gap: 7px; min-width: 0; flex: 1 1 auto; padding: 5px 10px; border-radius: 10px;
      color: var(--psc-text-body); background: var(--bg); font-size: 12.5px; text-decoration: none;
      strong { color: var(--c); font-weight: 800; white-space: nowrap; }
      &:hover .nb-headline-text { text-decoration: underline; }
    }
    .nb-headline-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--psc-text-strong); font-weight: 700; }
    .nb-dot { width: 7px; height: 7px; flex-shrink: 0; border-radius: 50%; background: var(--c); animation: nb-pulse 2s ease-in-out infinite; }
    .nb-list > li { min-width: 0; }
    .nb-list { list-style: none; margin: 10px 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .nb-row {
      height: 100%; box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 12px;
      border: 1px solid var(--psc-line); background: var(--psc-surface-2); color: inherit; text-decoration: none;
      transition: border-color .15s, transform .15s, box-shadow .15s;
      &:hover { border-color: color-mix(in srgb, var(--c) 45%, transparent); transform: translateY(-1px); box-shadow: 0 6px 16px rgba(20, 16, 60, .08); }
      &:hover .nb-go { opacity: 1; color: var(--c); }
      &:focus-visible { outline: 2px solid var(--psc-primary); outline-offset: 2px; }
    }
    .nb-when {
      flex: 0 0 auto; min-width: 52px; padding: 4px 6px; border-radius: 8px; text-align: center;
      color: var(--c); background: var(--bg); font-size: 11px; font-weight: 800; white-space: nowrap;
    }
    .nb-icon { flex-shrink: 0; color: var(--c); display: grid; }
    .nb-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .nb-row-title { color: var(--psc-text-strong); font-size: 12.5px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nb-row-detail { color: var(--psc-text-subtle); font-size: 11.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nb-go { flex-shrink: 0; opacity: .35; color: var(--psc-text-subtle); transition: opacity .15s; }
    .nb-clear { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; padding: 10px; border-radius: 12px; color: var(--psc-on-tint-green, #047857); background: var(--psc-tint-green, rgba(16,185,129,.1)); font-size: 12.5px; font-weight: 700; }
    .nb-more { display: inline-block; margin: 8px 2px 0; color: var(--psc-primary-text); font-size: 12px; font-weight: 700; text-decoration: none; &:hover { text-decoration: underline; } }
    @keyframes nb-pulse { 50% { opacity: .35; } }
    @media (max-width: 720px) {
      .nb-list { grid-template-columns: minmax(0, 1fr); }
      .nb-head { flex-wrap: wrap; }
      .nb-stats { order: 5; flex-basis: 100%; }
      .nb-headline { order: 5; flex-basis: 100%; }
      .nb-link { display: none; }
    }
    @media (prefers-reduced-motion: reduce) { .nb-dot { animation: none; } .nb-row { transition: none; } }
  `]
})
export class PmNextBriefComponent {
  private readonly pm = inject(PmBuddyService);
  readonly buddy = BUDDY;
  readonly plural = plural;

  /** Ticks so countdowns ("in 12 min") stay accurate while Home is open. */
  private readonly now = signal(new Date());
  readonly collapsed = signal(this.readCollapsed());

  constructor() {
    const t = window.setInterval(() => this.now.set(new Date()), TICK_MS);
    inject(DestroyRef).onDestroy(() => window.clearInterval(t));
  }

  readonly clock = computed(() => this.now().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));

  /** Today's meetings that haven't ended yet. */
  private readonly meetingsLeft = computed(() => {
    const n = this.now();
    const nowMin = n.getHours() * 60 + n.getMinutes();
    return this.pm.todaysMeetings().filter(m => minutesOf(m.time) + m.durationMin > nowMin);
  });

  readonly stats = computed(() => ({
    overdue: this.pm.overdue().filter(i => i.kind !== 'commitment' || i.direction !== 'owed-to-me').length,
    today: this.pm.dueToday().length,
    meetings: this.meetingsLeft().length
  }));

  /** Ranked: imminent meeting → overdue promises → due today → later meeting → waiting on others → untracked actions. */
  readonly rows = computed<BriefRow[]>(() => {
    const n = this.now();
    const nowMin = n.getHours() * 60 + n.getMinutes();
    const out: BriefRow[] = [];
    const active = this.pm.active();

    // Next meeting (today, or the next one on the calendar).
    const next = this.meetingsLeft()[0] ?? this.nextFutureMeeting();
    if (next) {
      const isToday = next.date === today();
      const start = minutesOf(next.time);
      const until = start - nowMin;
      const live = isToday && until <= 0;
      const when = !isToday ? relativeDay(next.date).replace('Tomorrow', 'Tmrw') : live ? 'Now' : until < 60 ? `${until} min` : next.time;
      const owed = active.filter(i => i.kind === 'commitment' && i.stakeholder && next.participants.includes(i.stakeholder));
      const others = next.participants.filter(p => p !== ME);
      const detail = live
        ? `Ends in ${start + next.durationMin - nowMin} min`
        : owed.length
          ? `Prep: ${plural(owed.length, 'open commitment')} with ${owed[0].stakeholder}${owed.length > 1 ? ' & others' : ''}`
          : `${next.time} · ${next.durationMin} min${others.length ? ` · with ${others.slice(0, 2).join(', ')}` : ''}`;
      out.push({
        id: `m-${next.id}`, icon: live ? 'video' : 'calendar-clock', when, title: next.title, detail,
        tone: live || (isToday && until <= 15) ? 'red' : isToday && until <= 60 ? 'amber' : 'blue',
        link: [...BUDDY, 'meetings'], focus: next.id,
        rank: live || (isToday && until <= 15) ? 0 : isToday && until <= 60 ? 25 : 60
      });
    }

    for (const i of this.pm.overdue()) {
      const late = -daysFromToday(i.dueDate!);
      const waiting = i.kind === 'commitment' && i.direction === 'owed-to-me';
      out.push(this.itemRow(i, {
        when: `${late}d late`,
        tone: waiting ? 'violet' : 'red',
        rank: waiting ? 50 + late * -0.1 : 10 - Math.min(late, 9) * 0.1 + (i.priority === 'high' ? -1 : 0),
        detail: waiting ? `Waiting on ${i.stakeholder ?? 'someone'}${i.project ? ' · ' + i.project : ''}` : this.itemDetail(i)
      }));
    }

    for (const i of this.pm.dueToday()) {
      const waiting = i.kind === 'commitment' && i.direction === 'owed-to-me';
      out.push(this.itemRow(i, {
        when: 'Today', tone: waiting ? 'violet' : 'amber',
        rank: waiting ? 55 : 30 + (i.priority === 'high' ? -2 : i.priority === 'low' ? 2 : 0),
        detail: waiting ? `Expected from ${i.stakeholder ?? 'someone'} today` : this.itemDetail(i)
      }));
    }

    // Meeting actions nobody is tracking yet.
    for (const ins of this.pm.insights().filter(x => x.kind === 'meeting-action' && x.severity === 'high').slice(0, 2)) {
      out.push({
        id: ins.id, icon: 'list-checks', tone: 'amber', when: 'Action', title: ins.message.match(/“(.+?)”/)?.[1] ?? ins.title,
        detail: 'Untracked meeting action', link: [...BUDDY, 'meetings'], focus: ins.ref.meetingId, rank: 70
      });
    }

    return out.sort((a, b) => a.rank - b.rank);
  });

  toggle(): void {
    this.collapsed.update(c => !c);
    try { localStorage.setItem(COLLAPSE_KEY, String(this.collapsed())); } catch { /* ignore */ }
  }

  trackById(_: number, r: BriefRow): string {
    return r.id;
  }

  private itemRow(i: BuddyItem, o: Pick<BriefRow, 'when' | 'tone' | 'rank' | 'detail'>): BriefRow {
    const page = i.kind === 'commitment' ? 'commitments' : 'tasks';
    const icon = i.kind === 'commitment' ? (i.direction === 'owed-to-me' ? 'hourglass' : 'handshake') : i.kind === 'reminder' ? 'alarm-clock' : i.kind === 'follow-up' ? 'bell-ring' : 'list-checks';
    return { id: i.id, icon, title: i.title, link: [...BUDDY, page], focus: i.id, ...o };
  }

  private itemDetail(i: BuddyItem): string {
    const who = i.kind === 'commitment' && i.stakeholder ? `Promised to ${i.stakeholder}` : this.pm.kindLabel(i);
    return [who, i.project].filter(Boolean).join(' · ');
  }

  private nextFutureMeeting(): BuddyMeeting | undefined {
    return this.pm.meetings().filter(m => m.upcoming && m.date > today()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  }

  private readCollapsed(): boolean {
    try { return localStorage.getItem(COLLAPSE_KEY) === 'true'; } catch { return false; }
  }
}
