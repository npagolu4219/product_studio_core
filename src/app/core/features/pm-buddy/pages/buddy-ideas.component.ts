import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { BuddyIdea, IdeaKind } from '../models/pm-buddy.models';
import { PmBuddyService } from '../services/pm-buddy.service';
import { RelativeDayPipe } from '../components/relative-day.pipe';
import { PscIllustrationComponent } from '../../../components/psc-illustration/psc-illustration.component';
import { BUDDY_PROJECTS } from '../data/pm-buddy.mock-data';

const KIND_META: Record<IdeaKind, { icon: string; label: string; tone: string }> = {
  idea: { icon: 'lightbulb', label: 'Idea', tone: '#F59E0B' },
  note: { icon: 'sticky-note', label: 'Note', tone: '#3B82F6' },
  feedback: { icon: 'message-square', label: 'Customer feedback', tone: '#EC4899' }
};

/** Product ideas, notes and captured customer feedback. */
@Component({
  selector: 'app-buddy-ideas',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, RelativeDayPipe, PscIllustrationComponent],
  template: `
    <div class="pmb-page pmb-page--narrow">
      <div class="pmb-page-head">
        <div>
          <h1 class="pmb-page-title">Ideas &amp; Notes</h1>
          <p class="pmb-page-sub">Half-formed ideas, observations and customer feedback — reviewed when you’re ready.</p>
        </div>
      </div>

      <form class="pmb-card quick" (ngSubmit)="add()" aria-label="Add idea or note">
        <div class="kinds" role="radiogroup" aria-label="Type">
          <button type="button" *ngFor="let k of kinds" role="radio" [attr.aria-checked]="form.kind === k" [class.active]="form.kind === k" (click)="form.kind = k">
            <lucide-icon [name]="meta(k).icon" [size]="14"></lucide-icon>{{ meta(k).label }}
          </button>
        </div>
        <input class="pmb-input title" name="title" [(ngModel)]="form.title" [placeholder]="placeholder" autocomplete="off" aria-label="Title" />
        <textarea class="pmb-textarea" name="body" rows="2" [(ngModel)]="form.body" placeholder="Details (optional)" aria-label="Details"></textarea>
        <div class="quick-row">
          <select class="pmb-select" name="project" [(ngModel)]="form.project" aria-label="Project"><option [ngValue]="undefined">No project</option><option *ngFor="let p of projects" [ngValue]="p">{{ p }}</option></select>
          <input class="pmb-input" name="tags" [(ngModel)]="form.tags" placeholder="Tags, comma separated" aria-label="Tags" />
          <button type="submit" class="pmb-btn pmb-btn--primary" [disabled]="!form.title.trim()"><lucide-icon name="plus" [size]="14"></lucide-icon>Save</button>
        </div>
      </form>

      <div class="toolbar">
        <div class="pmb-search">
          <lucide-icon name="search" [size]="14"></lucide-icon>
          <input [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Search ideas, notes, tags…" aria-label="Search ideas and notes" />
        </div>
        <div class="pmb-filters">
          <button type="button" class="pmb-filter" *ngFor="let f of filters()" [class.active]="filter() === f.id" (click)="filter.set(f.id)">{{ f.label }} <span class="pmb-filter-n">{{ f.count }}</span></button>
        </div>
      </div>

      <div class="grid">
        <article class="idea" *ngFor="let d of visible(); trackBy: trackById" [style.--tone]="meta(d.kind).tone" [class.reviewed]="d.status !== 'new'">
          <div class="idea-top">
            <span class="idea-kind"><lucide-icon [name]="meta(d.kind).icon" [size]="13"></lucide-icon>{{ meta(d.kind).label }}</span>
            <span class="pmb-chip" [ngClass]="d.status === 'new' ? 'pmb-chip--amber' : d.status === 'promoted' ? 'pmb-chip--green' : ''">{{ d.status === 'new' ? 'New' : d.status === 'promoted' ? 'Promoted' : 'Reviewed' }}</span>
          </div>
          <h2 class="idea-title">{{ d.title }}</h2>
          <p class="idea-body" *ngIf="d.body">{{ d.body }}</p>
          <div class="pmb-item-meta">
            <span *ngIf="d.project" class="pmb-chip">{{ d.project }}</span>
            <span class="pmb-chip pmb-chip--violet" *ngFor="let t of d.tags">#{{ t }}</span>
            <span>{{ d.createdAt.slice(0, 10) | relativeDay }}</span>
          </div>
          <div class="idea-actions">
            <button type="button" class="pmb-btn pmb-btn--ghost pmb-btn--sm" *ngIf="d.status === 'new'" (click)="buddy.updateIdea(d.id, { status: 'reviewed' })"><lucide-icon name="eye" [size]="13"></lucide-icon>Mark reviewed</button>
            <button type="button" class="pmb-btn pmb-btn--soft pmb-btn--sm" *ngIf="d.status !== 'promoted'" (click)="buddy.ideaToTask(d.id)"><lucide-icon name="list-plus" [size]="13"></lucide-icon>Promote to task</button>
            <span class="spacer"></span>
            <button type="button" class="pmb-icon-btn danger" (click)="buddy.deleteIdea(d.id)" [attr.aria-label]="'Delete ' + d.title" title="Delete"><lucide-icon name="trash-2" [size]="14"></lucide-icon></button>
          </div>
        </article>
      </div>

      <div class="pmb-card pmb-empty" *ngIf="!visible().length">
        <app-psc-illustration name="brainstorm"></app-psc-illustration>
        <strong>{{ query() || filter() !== 'all' ? 'Nothing matches' : 'No ideas yet' }}</strong>
        Capture one above, or say “Idea: …” to Buddy.
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }
    .quick { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .kinds { display: flex; gap: 6px; flex-wrap: wrap; }
    .kinds button { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--psc-line); background: var(--psc-surface); color: var(--psc-text-body); font: 700 12px 'Mulish', sans-serif; cursor: pointer; }
    .kinds button.active { color: var(--psc-on-tint-violet); background: var(--psc-tint-violet); border-color: transparent; }
    .kinds button:focus-visible { outline: 2px solid var(--psc-primary); outline-offset: 1px; }
    .title { height: 40px; font-size: 14px; font-weight: 600; }
    .quick-row { display: flex; gap: 8px; flex-wrap: wrap; }
    .quick-row .pmb-select, .quick-row .pmb-input { flex: 1 1 180px; }
    .toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; justify-content: space-between; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
    .idea { display: flex; flex-direction: column; gap: 8px; padding: 14px; background: var(--psc-surface); border: 1px solid var(--psc-line); border-top: 3px solid var(--tone); border-radius: 14px; animation: pmb-fade-up .2s ease both; transition: box-shadow .15s, transform .15s; }
    .idea:hover { transform: translateY(-2px); box-shadow: 0 10px 22px rgba(0, 0, 0, .06); }
    .idea.reviewed { opacity: .85; }
    .idea-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .idea-kind { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase; color: var(--tone); }
    .idea-title { margin: 0; font-size: 14.5px; font-weight: 800; line-height: 1.35; color: var(--psc-text-strong); }
    .idea-body { margin: 0; font-size: 13px; line-height: 1.5; color: var(--psc-text-body); }
    .idea-actions { display: flex; align-items: center; gap: 6px; margin-top: auto; padding-top: 4px; }
    .spacer { flex: 1; }
  `]
})
export class BuddyIdeasComponent {
  readonly buddy = inject(PmBuddyService);
  readonly projects = BUDDY_PROJECTS;
  readonly kinds: IdeaKind[] = ['idea', 'note', 'feedback'];
  readonly query = signal('');
  readonly filter = signal<'all' | IdeaKind | 'new'>('all');
  form = this.emptyForm();

  meta(k: IdeaKind) {
    return KIND_META[k];
  }

  get placeholder(): string {
    return { idea: 'What if we…', note: 'Something worth remembering…', feedback: 'What did the customer say?' }[this.form.kind];
  }

  private readonly searched = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.buddy.ideas().filter(d => !q || `${d.title} ${d.body ?? ''} ${d.tags.join(' ')} ${d.project ?? ''}`.toLowerCase().includes(q));
  });

  readonly filters = computed(() => {
    const list = this.searched();
    return [
      { id: 'all' as const, label: 'All', count: list.length },
      { id: 'new' as const, label: 'Needs review', count: list.filter(d => d.status === 'new').length },
      { id: 'idea' as const, label: 'Ideas', count: list.filter(d => d.kind === 'idea').length },
      { id: 'note' as const, label: 'Notes', count: list.filter(d => d.kind === 'note').length },
      { id: 'feedback' as const, label: 'Feedback', count: list.filter(d => d.kind === 'feedback').length }
    ];
  });

  readonly visible = computed(() => {
    const f = this.filter();
    return this.searched().filter(d => f === 'all' || (f === 'new' ? d.status === 'new' : d.kind === f));
  });

  add(): void {
    if (!this.form.title.trim()) return;
    this.buddy.addIdea({
      kind: this.form.kind, title: this.form.title.trim(), body: this.form.body.trim() || undefined, project: this.form.project,
      tags: this.form.tags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean)
    } as Partial<BuddyIdea> & Pick<BuddyIdea, 'title' | 'kind'>);
    this.form = this.emptyForm(this.form.kind);
  }

  trackById(_: number, x: { id: string }): string {
    return x.id;
  }

  private emptyForm(kind: IdeaKind = 'idea') {
    return { kind, title: '', body: '', project: undefined as string | undefined, tags: '' };
  }
}
