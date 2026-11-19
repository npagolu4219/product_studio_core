import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { BuddyItem, BuddyPriority, CommitmentDirection } from '../models/pm-buddy.models';
import { PmBuddyService } from '../services/pm-buddy.service';
import { BuddyItemCardComponent } from '../components/buddy-item-card.component';
import { PscIllustrationComponent } from '../../../components/psc-illustration/psc-illustration.component';
import { BUDDY_PROJECTS, STAKEHOLDERS } from '../data/pm-buddy.mock-data';
import { isoDay } from '../data/pm-buddy.dates';

/** What I promised others, and what others promised me — with per-person filtering. */
@Component({
  selector: 'app-buddy-commitments',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, BuddyItemCardComponent, PscIllustrationComponent],
  template: `
    <div class="pmb-page pmb-page--narrow">
      <div class="pmb-page-head">
        <div>
          <h1 class="pmb-page-title">My Commitments</h1>
          <p class="pmb-page-sub">Promises you made and things you’re waiting on — so nothing quietly slips.</p>
        </div>
        <button type="button" class="pmb-btn pmb-btn--primary" (click)="adding.set(!adding())" [attr.aria-expanded]="adding()">
          <lucide-icon [name]="adding() ? 'x' : 'plus'" [size]="15"></lucide-icon>{{ adding() ? 'Close' : 'Add commitment' }}
        </button>
      </div>

      <form class="pmb-card pmb-section" *ngIf="adding()" (ngSubmit)="add()" aria-label="Add commitment">
        <div class="dir" role="radiogroup" aria-label="Direction">
          <button type="button" role="radio" [attr.aria-checked]="form.direction === 'i-owe'" [class.active]="form.direction === 'i-owe'" (click)="form.direction = 'i-owe'">
            <lucide-icon name="handshake" [size]="15"></lucide-icon>I promised someone
          </button>
          <button type="button" role="radio" [attr.aria-checked]="form.direction === 'owed-to-me'" [class.active]="form.direction === 'owed-to-me'" (click)="form.direction = 'owed-to-me'">
            <lucide-icon name="hourglass" [size]="15"></lucide-icon>I’m waiting on someone
          </button>
        </div>
        <div class="pmb-form-grid">
          <label class="pmb-field wide"><span>{{ form.direction === 'i-owe' ? 'What did you promise?' : 'What are you waiting for?' }}</span>
            <input class="pmb-input" name="title" [(ngModel)]="form.title" required autocomplete="off" [placeholder]="form.direction === 'i-owe' ? 'Send updated PRD' : 'Final onboarding mockups'" />
          </label>
          <label class="pmb-field"><span>{{ form.direction === 'i-owe' ? 'To' : 'From' }}</span>
            <input class="pmb-input" name="stakeholder" [(ngModel)]="form.stakeholder" list="pmb-cm-people" required placeholder="Name or team" />
            <datalist id="pmb-cm-people"><option *ngFor="let s of stakeholders" [value]="s"></option></datalist>
          </label>
          <label class="pmb-field"><span>Due</span><input class="pmb-input" type="date" name="due" [(ngModel)]="form.dueDate" /></label>
          <label class="pmb-field"><span>Project</span>
            <select class="pmb-select" name="project" [(ngModel)]="form.project"><option [ngValue]="undefined">None</option><option *ngFor="let p of projects" [ngValue]="p">{{ p }}</option></select>
          </label>
        </div>
        <div class="actions">
          <button type="button" class="pmb-btn pmb-btn--ghost" (click)="adding.set(false)">Cancel</button>
          <button type="submit" class="pmb-btn pmb-btn--primary" [disabled]="!form.title.trim() || !form.stakeholder.trim()"><lucide-icon name="check" [size]="14"></lucide-icon>Add</button>
        </div>
      </form>

      <div class="people" aria-label="Filter by person">
        <button type="button" class="pmb-filter" [class.active]="!person()" (click)="person.set('')">Everyone</button>
        <button type="button" class="pmb-filter" *ngFor="let p of people()" [class.active]="person() === p.name" (click)="person.set(p.name)">
          <span class="avatar">{{ p.name.charAt(0) }}</span>{{ p.name }} <span class="pmb-filter-n">{{ p.count }}</span>
        </button>
        <label class="show-done"><input type="checkbox" [ngModel]="showDone()" (ngModelChange)="showDone.set($event)" /> Show delivered</label>
      </div>

      <div class="cols">
        <section class="pmb-card pmb-section" aria-labelledby="owe-title">
          <div class="pmb-section-head">
            <h2 class="pmb-section-title" id="owe-title"><lucide-icon name="handshake" [size]="16"></lucide-icon>I promised <span class="pmb-count">{{ iOwe().length }}</span></h2>
            <span class="overdue-note" *ngIf="overdueIOwe()">{{ overdueIOwe() }} overdue</span>
          </div>
          <app-buddy-item-card *ngFor="let i of iOwe(); trackBy: trackById" [item]="i" [showSource]="true"></app-buddy-item-card>
          <div class="pmb-empty" *ngIf="!iOwe().length"><app-psc-illustration name="product-memory"></app-psc-illustration><strong>No open promises</strong>Nice — you’re all caught up.</div>
        </section>

        <section class="pmb-card pmb-section" aria-labelledby="wait-title">
          <div class="pmb-section-head">
            <h2 class="pmb-section-title" id="wait-title"><lucide-icon name="hourglass" [size]="16"></lucide-icon>Waiting on others <span class="pmb-count">{{ owed().length }}</span></h2>
          </div>
          <app-buddy-item-card *ngFor="let i of owed(); trackBy: trackById" [item]="i" [showSource]="true"></app-buddy-item-card>
          <div class="pmb-empty" *ngIf="!owed().length"><app-psc-illustration name="dependencies"></app-psc-illustration><strong>Nobody owes you anything</strong>Track what you’re waiting on here.</div>
        </section>
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }
    .dir { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .dir button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 42px; border-radius: 10px; border: 1.5px solid var(--psc-line); background: var(--psc-surface); color: var(--psc-text-body); font: 700 13px 'Mulish', sans-serif; cursor: pointer; }
    .dir button.active { border-color: var(--psc-primary); color: var(--psc-primary-text); background: rgb(var(--psc-primary-rgb) / .06); }
    .dir button:focus-visible { outline: 2px solid var(--psc-primary); outline-offset: 2px; }
    .wide { grid-column: 1 / -1; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    .people { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .avatar { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; font-size: 10px; font-weight: 800; color: #fff; background: var(--psc-gradient-brand); }
    .show-done { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; font-size: 12.5px; font-weight: 600; color: var(--psc-text-subtle); cursor: pointer; }
    .show-done input { accent-color: var(--psc-primary); }
    .cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
    .overdue-note { font-size: 12px; font-weight: 800; color: var(--psc-on-tint-red); }
    @media (max-width: 900px) { .cols { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 560px) { .dir { grid-template-columns: 1fr; } .show-done { margin-left: 0; } }
  `]
})
export class BuddyCommitmentsComponent {
  readonly buddy = inject(PmBuddyService);
  readonly projects = BUDDY_PROJECTS;
  readonly stakeholders = STAKEHOLDERS;

  readonly adding = signal(false);
  readonly person = signal('');
  readonly showDone = signal(false);
  form = this.emptyForm();

  constructor() {
    // ?focus=<id>: clear the person filter and show delivered items if needed, so the linked card is visible.
    inject(ActivatedRoute).queryParamMap.pipe(takeUntilDestroyed()).subscribe(q => {
      const item = q.get('focus') ? this.buddy.find(q.get('focus')!) : undefined;
      if (!item) return;
      this.person.set('');
      if (item.status !== 'pending') this.showDone.set(true);
    });
  }

  private visible(list: BuddyItem[]): BuddyItem[] {
    return list
      .filter(i => (this.showDone() || i.status === 'pending') && (!this.person() || i.stakeholder === this.person()))
      .sort((a, b) => (a.status === b.status ? (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') : a.status === 'pending' ? -1 : 1));
  }

  readonly iOwe = computed(() => this.visible(this.buddy.commitmentsIOwe()));
  readonly owed = computed(() => this.visible(this.buddy.commitmentsOwed()));
  readonly overdueIOwe = computed(() => this.buddy.overdueCommitments().filter(i => i.direction === 'i-owe' && (!this.person() || i.stakeholder === this.person())).length);

  readonly people = computed(() => {
    const counts = new Map<string, number>();
    for (const i of [...this.buddy.commitmentsIOwe(), ...this.buddy.commitmentsOwed()].filter(x => x.status === 'pending' && x.stakeholder)) {
      counts.set(i.stakeholder!, (counts.get(i.stakeholder!) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  });

  add(): void {
    if (!this.form.title.trim() || !this.form.stakeholder.trim()) return;
    const f = this.form;
    this.buddy.addItem({
      kind: 'commitment', direction: f.direction, stakeholder: f.stakeholder.trim(), title: f.title.trim(),
      dueDate: f.dueDate || undefined, project: f.project, priority: f.priority
    });
    this.form = this.emptyForm(f.direction);
  }

  trackById(_: number, x: { id: string }): string {
    return x.id;
  }

  private emptyForm(direction: CommitmentDirection = 'i-owe') {
    return { direction, title: '', stakeholder: '', dueDate: isoDay(2), project: undefined as string | undefined, priority: 'medium' as BuddyPriority };
  }
}
