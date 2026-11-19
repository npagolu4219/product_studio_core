import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { BuddyItem, BuddyItemKind, BuddyPriority } from '../models/pm-buddy.models';
import { PmBuddyService } from '../services/pm-buddy.service';
import { BuddyItemCardComponent } from '../components/buddy-item-card.component';
import { PscIllustrationComponent } from '../../../components/psc-illustration/psc-illustration.component';
import { BUDDY_PROJECTS, STAKEHOLDERS } from '../data/pm-buddy.mock-data';
import { daysFromToday, isoDay } from '../data/pm-buddy.dates';

type StatusFilter = 'pending' | 'today' | 'overdue' | 'upcoming' | 'snoozed' | 'completed' | 'all';

/** Smart Follow-up Tracker: every task, follow-up and reminder with search, filters and quick add. */
@Component({
  selector: 'app-buddy-tasks',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, BuddyItemCardComponent, PscIllustrationComponent],
  template: `
    <div class="pmb-page pmb-page--narrow">
      <div class="pmb-page-head">
        <div>
          <h1 class="pmb-page-title">My Tasks</h1>
          <p class="pmb-page-sub">Tasks, follow-ups and reminders — captured by you or extracted from meetings.</p>
        </div>
        <button type="button" class="pmb-btn pmb-btn--primary" (click)="adding.set(!adding())" [attr.aria-expanded]="adding()">
          <lucide-icon [name]="adding() ? 'x' : 'plus'" [size]="15"></lucide-icon>{{ adding() ? 'Close' : 'Add task' }}
        </button>
      </div>

      <form class="pmb-card pmb-section add" *ngIf="adding()" (ngSubmit)="add()" aria-label="Add task">
        <label class="pmb-field"><span>What needs doing?</span>
          <input class="pmb-input add-title" name="title" [(ngModel)]="form.title" placeholder="e.g. Review onboarding analytics with Priya" required autocomplete="off" />
        </label>
        <div class="pmb-form-grid">
          <label class="pmb-field"><span>Type</span>
            <select class="pmb-select" name="kind" [(ngModel)]="form.kind">
              <option ngValue="task">Task</option><option ngValue="follow-up">Follow-up</option><option ngValue="reminder">Reminder</option>
            </select>
          </label>
          <label class="pmb-field"><span>Due</span><input class="pmb-input" type="date" name="due" [(ngModel)]="form.dueDate" /></label>
          <label class="pmb-field"><span>Priority</span>
            <select class="pmb-select" name="priority" [(ngModel)]="form.priority"><option ngValue="high">High</option><option ngValue="medium">Medium</option><option ngValue="low">Low</option></select>
          </label>
          <label class="pmb-field"><span>Project</span>
            <select class="pmb-select" name="project" [(ngModel)]="form.project"><option [ngValue]="undefined">None</option><option *ngFor="let p of projects" [ngValue]="p">{{ p }}</option></select>
          </label>
          <label class="pmb-field" *ngIf="form.kind === 'follow-up'"><span>With</span>
            <input class="pmb-input" name="stakeholder" [(ngModel)]="form.stakeholder" list="pmb-task-people" placeholder="Who?" />
            <datalist id="pmb-task-people"><option *ngFor="let s of stakeholders" [value]="s"></option></datalist>
          </label>
        </div>
        <div class="add-actions">
          <button type="button" class="pmb-btn pmb-btn--ghost" (click)="adding.set(false)">Cancel</button>
          <button type="submit" class="pmb-btn pmb-btn--primary" [disabled]="!form.title.trim()"><lucide-icon name="check" [size]="14"></lucide-icon>Add</button>
        </div>
      </form>

      <div class="toolbar">
        <div class="pmb-search">
          <lucide-icon name="search" [size]="14"></lucide-icon>
          <input [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Search tasks, people, projects…" aria-label="Search tasks" />
        </div>
        <select class="pmb-select" [ngModel]="kind()" (ngModelChange)="kind.set($event)" aria-label="Filter by type">
          <option ngValue="">All types</option><option ngValue="task">Tasks</option><option ngValue="follow-up">Follow-ups</option><option ngValue="reminder">Reminders</option><option ngValue="commitment">Commitments</option>
        </select>
        <select class="pmb-select" [ngModel]="priority()" (ngModelChange)="priority.set($event)" aria-label="Filter by priority">
          <option ngValue="">Any priority</option><option ngValue="high">High</option><option ngValue="medium">Medium</option><option ngValue="low">Low</option>
        </select>
        <select class="pmb-select" [ngModel]="project()" (ngModelChange)="project.set($event)" aria-label="Filter by project">
          <option ngValue="">All projects</option><option *ngFor="let p of projects" [ngValue]="p">{{ p }}</option>
        </select>
      </div>

      <div class="pmb-filters" role="tablist" aria-label="Status">
        <button type="button" class="pmb-filter" *ngFor="let f of statusFilters()" role="tab" [attr.aria-selected]="status() === f.id" [class.active]="status() === f.id" (click)="status.set(f.id)">
          {{ f.label }} <span class="pmb-filter-n">{{ f.count }}</span>
        </button>
      </div>

      <ng-container *ngFor="let g of groups(); trackBy: trackGroup">
        <section class="group" *ngIf="g.items.length" [attr.aria-label]="g.label">
          <h2 class="group-title" [attr.data-tone]="g.tone">{{ g.label }} <span>{{ g.items.length }}</span></h2>
          <app-buddy-item-card *ngFor="let i of g.items; trackBy: trackById" [item]="i" [showSource]="true"></app-buddy-item-card>
        </section>
      </ng-container>

      <div class="pmb-card pmb-empty" *ngIf="!filtered().length">
        <app-psc-illustration name="acceptance-criteria"></app-psc-illustration>
        <strong>{{ query() || kind() || priority() || project() ? 'No tasks match these filters' : 'Nothing here' }}</strong>
        {{ query() || kind() || priority() || project() ? 'Try clearing a filter.' : 'Add a task or capture one with Quick capture.' }}
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }
    .add { animation: pmb-fade-up .2s ease both; }
    .add-title { height: 40px; font-size: 14px; font-weight: 600; }
    .add-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .group { display: flex; flex-direction: column; gap: 8px; }
    .group-title { display: flex; align-items: center; gap: 8px; margin: 6px 2px 0; font-size: 12px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: var(--psc-text-subtle); }
    .group-title span { font-weight: 700; color: var(--psc-text-faint); }
    .group-title[data-tone='red'] { color: var(--psc-on-tint-red); }
    .group-title[data-tone='amber'] { color: var(--psc-on-tint-amber); }
    @media (max-width: 640px) { .toolbar .pmb-select { flex: 1 1 140px; } }
  `]
})
export class BuddyTasksComponent {
  readonly buddy = inject(PmBuddyService);
  readonly projects = BUDDY_PROJECTS;
  readonly stakeholders = STAKEHOLDERS;

  readonly adding = signal(false);
  readonly query = signal('');
  readonly kind = signal<'' | BuddyItemKind>('');
  readonly priority = signal<'' | BuddyPriority>('');
  readonly project = signal('');
  readonly status = signal<StatusFilter>('pending');

  form = this.emptyForm();

  constructor() {
    // Deep links: ?status=overdue|today… picks the tab; ?focus=<id> makes sure that item is in view.
    inject(ActivatedRoute).queryParamMap.pipe(takeUntilDestroyed()).subscribe(q => {
      const st = q.get('status') as StatusFilter | null;
      if (st && ['pending', 'today', 'overdue', 'upcoming', 'snoozed', 'completed', 'all'].includes(st)) this.status.set(st);
      const focus = q.get('focus');
      const item = focus ? this.buddy.find(focus) : undefined;
      if (item) {
        this.query.set(''); this.priority.set(''); this.project.set('');
        this.kind.set(item.kind === 'commitment' ? 'commitment' : '');
        if (!this.matches(item, this.status())) this.status.set('all');
      }
    });
  }

  /** Search + type/priority/project filters (status applied separately so counts stay meaningful). */
  private readonly base = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.buddy.items().filter(i =>
      (!this.kind() ? i.kind !== 'commitment' : i.kind === this.kind()) &&
      (!this.priority() || i.priority === this.priority()) &&
      (!this.project() || i.project === this.project()) &&
      (!q || `${i.title} ${i.stakeholder ?? ''} ${i.project ?? ''} ${i.notes ?? ''}`.toLowerCase().includes(q))
    );
  });

  private matches(i: BuddyItem, s: StatusFilter): boolean {
    const snoozed = this.buddy.isSnoozed(i);
    const d = i.dueDate ? daysFromToday(i.dueDate) : null;
    switch (s) {
      case 'pending': return i.status === 'pending' && !snoozed;
      case 'today': return i.status === 'pending' && !snoozed && d === 0;
      case 'overdue': return i.status === 'pending' && !snoozed && d !== null && d < 0;
      case 'upcoming': return i.status === 'pending' && !snoozed && d !== null && d > 0;
      case 'snoozed': return snoozed;
      case 'completed': return i.status === 'completed';
      default: return true;
    }
  }

  readonly statusFilters = computed(() => {
    const base = this.base();
    const n = (s: StatusFilter) => base.filter(i => this.matches(i, s)).length;
    return ([['pending', 'Pending'], ['today', 'Today'], ['overdue', 'Overdue'], ['upcoming', 'Upcoming'], ['snoozed', 'Snoozed'], ['completed', 'Completed'], ['all', 'All']] as [StatusFilter, string][])
      .map(([id, label]) => ({ id, label, count: n(id) }));
  });

  readonly filtered = computed(() => this.base().filter(i => this.matches(i, this.status())));

  readonly groups = computed(() => {
    const items = [...this.filtered()].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || (a.priority === 'high' ? -1 : 1));
    if (this.status() === 'completed') return [{ id: 'done', label: 'Completed', tone: '', items: items.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')) }];
    if (this.status() === 'snoozed') return [{ id: 'snz', label: 'Snoozed', tone: '', items }];
    const pending = items.filter(i => i.status === 'pending');
    const d = (i: BuddyItem) => (i.dueDate ? daysFromToday(i.dueDate) : null);
    const groups = [
      { id: 'over', label: 'Overdue', tone: 'red', items: pending.filter(i => (d(i) ?? 1) < 0) },
      { id: 'today', label: 'Today', tone: 'amber', items: pending.filter(i => d(i) === 0) },
      { id: 'week', label: 'Next 7 days', tone: '', items: pending.filter(i => (d(i) ?? -1) > 0 && d(i)! <= 7) },
      { id: 'later', label: 'Later', tone: '', items: pending.filter(i => (d(i) ?? -1) > 7) },
      { id: 'nodate', label: 'No due date', tone: '', items: pending.filter(i => d(i) === null) }
    ];
    if (this.status() === 'all') groups.push({ id: 'done', label: 'Completed', tone: '', items: items.filter(i => i.status === 'completed') });
    return groups;
  });

  add(): void {
    if (!this.form.title.trim()) return;
    this.buddy.addItem({ ...this.form, title: this.form.title.trim(), dueDate: this.form.dueDate || undefined, stakeholder: this.form.stakeholder || undefined });
    this.form = this.emptyForm();
    this.status.set('pending');
  }

  trackById(_: number, x: { id: string }): string {
    return x.id;
  }

  trackGroup(_: number, g: { id: string }): string {
    return g.id;
  }

  private emptyForm() {
    return { title: '', kind: 'task' as BuddyItemKind, dueDate: isoDay(1), priority: 'medium' as BuddyPriority, project: undefined as string | undefined, stakeholder: '' };
  }
}
