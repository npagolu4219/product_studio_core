import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PmBuddyService } from '../services/pm-buddy.service';
import { BuddyComposerComponent } from '../components/buddy-composer.component';
import { BuddyConversationComponent } from '../components/buddy-conversation.component';
import { BuddyItemCardComponent } from '../components/buddy-item-card.component';
import { BuddyInsightCardComponent } from '../components/buddy-insight-card.component';
import { RelativeDayPipe } from '../components/relative-day.pipe';
import { PscIllustrationComponent } from '../../../components/psc-illustration/psc-illustration.component';
import { CURRENT_USER } from '../../../constants/current-user';
import { daysFromToday } from '../data/pm-buddy.dates';

interface MemoryTile {
  id: string;
  kind: 'capture' | 'meeting' | 'decision' | 'idea';
  title: string;
  sub: string;
  date: string;
  link: string[];
}

@Component({
  selector: 'app-buddy-home',
  standalone: true,
  imports: [CommonModule, RouterLink, LucideAngularModule, BuddyComposerComponent, BuddyConversationComponent, BuddyItemCardComponent, BuddyInsightCardComponent, RelativeDayPipe, PscIllustrationComponent],
  template: `
    <div class="pmb-page pmb-page--narrow">
      <section class="hero">
        <h1 class="hero-title">{{ greeting }}, <span>{{ userName }}</span></h1>
        <p class="hero-sub">{{ heroLine() }}</p>
        <app-buddy-composer [showExamples]="!hasConversation()" inputId="pmb-home-composer"></app-buddy-composer>
      </section>

      <section class="pmb-card pmb-section conv-card" *ngIf="hasConversation()" aria-labelledby="conv-title">
        <div class="pmb-section-head">
          <h2 class="pmb-section-title" id="conv-title"><lucide-icon name="messages-square" [size]="16"></lucide-icon>Conversation</h2>
          <button type="button" class="pmb-link" (click)="buddy.clearConversation()"><lucide-icon name="eraser" [size]="13"></lucide-icon>Clear</button>
        </div>
        <app-buddy-conversation [messages]="recentMessages()" maxHeight="420px"></app-buddy-conversation>
      </section>

      <section class="stats" aria-label="Summary">
        <a class="stat" *ngFor="let s of stats()" [routerLink]="s.link" [attr.data-tone]="s.tone">
          <span class="stat-icon"><lucide-icon [name]="s.icon" [size]="18"></lucide-icon></span>
          <span class="stat-body">
            <span class="stat-value">{{ s.value }}</span>
            <span class="stat-label">{{ s.label }}</span>
          </span>
          <span class="stat-hint">{{ s.hint }}</span>
        </a>
      </section>

      <div class="cols">
        <section class="pmb-card pmb-section" aria-labelledby="prio-title">
          <div class="pmb-section-head">
            <h2 class="pmb-section-title" id="prio-title"><lucide-icon name="target" [size]="16"></lucide-icon>Today’s priorities <span class="pmb-count">{{ buddy.todayPriorities().length }}</span></h2>
            <a class="pmb-link" routerLink="tasks">All tasks<lucide-icon name="arrow-right" [size]="12"></lucide-icon></a>
          </div>
          <app-buddy-item-card *ngFor="let i of buddy.todayPriorities(); trackBy: trackById" [item]="i"></app-buddy-item-card>
          <div class="pmb-empty" *ngIf="!buddy.todayPriorities().length">
            <app-psc-illustration name="goal"></app-psc-illustration>
            <strong>All clear for today</strong>
            Capture something above and I’ll line it up here.
          </div>
        </section>

        <section class="pmb-card pmb-section" aria-labelledby="miss-title">
          <div class="pmb-section-head">
            <h2 class="pmb-section-title" id="miss-title"><lucide-icon name="radar" [size]="16"></lucide-icon>What am I missing? <span class="pmb-count">{{ buddy.insights().length }}</span></h2>
            <a class="pmb-link" routerLink="missing">See all<lucide-icon name="arrow-right" [size]="12"></lucide-icon></a>
          </div>
          <app-buddy-insight-card *ngFor="let ins of buddy.insights().slice(0, 4); trackBy: trackById" [insight]="ins" [compact]="true"></app-buddy-insight-card>
          <div class="pmb-empty" *ngIf="!buddy.insights().length">
            <app-psc-illustration name="ai-decision-context"></app-psc-illustration>
            <strong>Nothing slipping through the cracks</strong>
            I’ll flag overdue promises and open actions here.
          </div>
        </section>
      </div>

      <section class="pmb-card pmb-section" aria-labelledby="mem-title">
        <div class="pmb-section-head">
          <h2 class="pmb-section-title" id="mem-title"><lucide-icon name="brain" [size]="16"></lucide-icon>Recent memory</h2>
          <a class="pmb-link" routerLink="meetings">Meeting memory<lucide-icon name="arrow-right" [size]="12"></lucide-icon></a>
        </div>
        <div class="memory-grid">
          <a class="mem" *ngFor="let m of memoryTiles(); trackBy: trackById" [routerLink]="m.link" [attr.data-kind]="m.kind">
            <span class="mem-kind"><lucide-icon [name]="memIcon(m.kind)" [size]="12"></lucide-icon>{{ memLabel(m.kind) }}</span>
            <span class="mem-title">{{ m.title }}</span>
            <span class="mem-sub">{{ m.sub }}</span>
            <span class="mem-date">{{ m.date | relativeDay }}</span>
          </a>
        </div>
      </section>
    </div>
  `,
  styles: [`
    :host { display: contents; }
    .hero { display: flex; flex-direction: column; gap: 6px; padding-top: 8px; }
    .hero-title { margin: 0; font-size: clamp(22px, 3vw, 28px); font-weight: 800; color: var(--psc-text-strong); letter-spacing: -.3px; }
    .hero-title span { background: var(--psc-gradient-brand); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .hero-sub { margin: 0 0 10px; font-size: 14px; color: var(--psc-text-subtle); }
    .conv-card { animation: pmb-fade-up .25s ease both; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .stat { --tone: var(--psc-primary); display: flex; align-items: center; gap: 12px; padding: 14px; text-decoration: none; background: var(--psc-surface); border: 1px solid var(--psc-line); border-radius: 14px; position: relative; transition: transform .15s, box-shadow .15s, border-color .15s; }
    .stat:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--tone) 40%, transparent); box-shadow: 0 8px 20px rgba(0, 0, 0, .06); }
    .stat:focus-visible { outline: 2px solid var(--psc-primary); outline-offset: 2px; }
    .stat[data-tone='red'] { --tone: #EF4444; } .stat[data-tone='amber'] { --tone: #F59E0B; } .stat[data-tone='green'] { --tone: #10B981; }
    .stat-icon { flex: 0 0 40px; height: 40px; display: grid; place-items: center; border-radius: 11px; color: var(--tone); background: color-mix(in srgb, var(--tone) 13%, transparent); }
    .stat-body { display: flex; flex-direction: column; min-width: 0; }
    .stat-value { font-size: 22px; font-weight: 800; line-height: 1.1; color: var(--psc-text-strong); }
    .stat-label { font-size: 12px; font-weight: 700; color: var(--psc-text-subtle); }
    .stat-hint { position: absolute; top: 10px; right: 12px; font-size: 10.5px; font-weight: 700; color: var(--psc-text-faint); }
    .cols { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    .memory-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
    .mem { --tone: var(--psc-primary); display: flex; flex-direction: column; gap: 5px; padding: 12px; min-height: 112px; text-decoration: none; border-radius: 12px; background: var(--psc-surface-2); border: 1px solid var(--psc-line); border-top: 3px solid var(--tone); transition: transform .15s, border-color .15s; }
    .mem:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--tone) 45%, transparent); }
    .mem:focus-visible { outline: 2px solid var(--psc-primary); outline-offset: 2px; }
    .mem[data-kind='meeting'] { --tone: #3B82F6; } .mem[data-kind='decision'] { --tone: #10B981; } .mem[data-kind='idea'] { --tone: #F59E0B; }
    .mem-kind { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase; color: var(--tone); }
    .mem-title { font-size: 13px; font-weight: 800; color: var(--psc-text-strong); line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .mem-sub { font-size: 12px; color: var(--psc-text-subtle); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .mem-date { margin-top: auto; font-size: 11px; font-weight: 700; color: var(--psc-text-faint); }
    @media (max-width: 1100px) { .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .cols { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 480px) { .stat { padding: 12px; } .stat-hint { display: none; } }
  `]
})
export class BuddyHomeComponent {
  readonly buddy = inject(PmBuddyService);
  readonly userName = CURRENT_USER.firstName;

  get greeting(): string {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  readonly hasConversation = computed(() => this.buddy.messages().some(m => m.role === 'user'));
  readonly recentMessages = computed(() => this.buddy.messages().slice(-14));

  readonly heroLine = computed(() => {
    const o = this.buddy.overdue().length;
    const t = this.buddy.dueToday().length;
    const m = this.buddy.todaysMeetings().length;
    if (o) return `${o} overdue, ${t} due today and ${m} meeting${m === 1 ? '' : 's'}. Let’s get ahead of it.`;
    return `${t} due today and ${m} meeting${m === 1 ? '' : 's'} on your calendar. What’s on your mind?`;
  });

  readonly stats = computed(() => {
    const b = this.buddy;
    const followUps = b.active().filter(i => (i.kind === 'follow-up' || (i.kind === 'commitment' && i.direction === 'owed-to-me')) && i.dueDate && daysFromToday(i.dueDate) <= 7);
    return [
      { label: 'Pending tasks', value: b.pendingTasks().length, icon: 'list-checks', tone: 'violet', hint: `${b.dueToday().filter(i => i.kind === 'task').length} today`, link: ['tasks'] },
      { label: 'Upcoming follow-ups', value: followUps.length, icon: 'repeat', tone: 'green', hint: 'next 7 days', link: ['commitments'] },
      { label: 'Overdue commitments', value: b.overdueCommitments().length, icon: 'handshake', tone: 'red', hint: 'needs action', link: ['commitments'] },
      { label: 'Important reminders', value: b.reminders().length, icon: 'bell', tone: 'amber', hint: 'high priority', link: ['tasks'] }
    ];
  });

  readonly memoryTiles = computed<MemoryTile[]>(() => {
    const b = this.buddy;
    const captures = b.items().filter(i => i.source.kind === 'capture').sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(0, 2)
      .map<MemoryTile>(i => ({ id: `c-${i.id}`, kind: 'capture', title: i.title, sub: b.kindLabel(i) + (i.project ? ` · ${i.project}` : ''), date: i.createdAt.slice(0, 10), link: ['tasks'] }));
    const meetings = b.pastMeetings().slice(0, 2)
      .map<MemoryTile>(m => ({ id: `m-${m.id}`, kind: 'meeting', title: m.title, sub: m.summary, date: m.date, link: ['meetings'] }));
    const decisions = b.pastMeetings().filter(m => m.decisions.length).slice(0, 2)
      .map<MemoryTile>(m => ({ id: `d-${m.id}`, kind: 'decision', title: m.decisions[0], sub: `From “${m.title}”`, date: m.date, link: ['meetings'] }));
    const ideas = b.ideas().filter(d => d.kind === 'idea').slice(0, 2)
      .map<MemoryTile>(d => ({ id: `i-${d.id}`, kind: 'idea', title: d.title, sub: d.body ?? (d.project ?? 'Product idea'), date: d.createdAt.slice(0, 10), link: ['ideas'] }));
    return [...captures, ...meetings, ...decisions, ...ideas].sort((x, y) => y.date.localeCompare(x.date));
  });

  memIcon(kind: MemoryTile['kind']): string {
    return { capture: 'zap', meeting: 'calendar', decision: 'circle-check', idea: 'lightbulb' }[kind];
  }

  memLabel(kind: MemoryTile['kind']): string {
    return { capture: 'Capture', meeting: 'Meeting', decision: 'Decision', idea: 'Idea' }[kind];
  }

  trackById(_: number, x: { id: string }): string {
    return x.id;
  }
}
