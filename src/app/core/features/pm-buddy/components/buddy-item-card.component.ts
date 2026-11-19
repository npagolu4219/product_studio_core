import { Component, DestroyRef, ElementRef, HostListener, Input, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { BuddyItem, BuddyItemKind, BuddyPriority } from '../models/pm-buddy.models';
import { PmBuddyService } from '../services/pm-buddy.service';
import { BUDDY_PROJECTS, STAKEHOLDERS } from '../data/pm-buddy.mock-data';
import { DueStatePipe, RelativeDayPipe } from './relative-day.pipe';

/** Task / commitment / follow-up / reminder card: complete, inline edit, snooze, delete — all local state. */
@Component({
  selector: 'app-buddy-item-card',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, RelativeDayPipe, DueStatePipe],
  template: `
    <article class="pmb-item" [class.is-focused]="focused" [attr.data-item-id]="item.id" [class.is-done]="item.status === 'completed'"
      [class.is-overdue]="item.status === 'pending' && (item.dueDate | dueState) === 'overdue'" *ngIf="!editing; else editTpl">
      <button type="button" class="pmb-check" [class.checked]="item.status === 'completed'" (click)="buddy.toggleComplete(item.id)"
        [attr.aria-label]="(item.status === 'completed' ? 'Mark as not done: ' : 'Mark as done: ') + item.title" [attr.aria-pressed]="item.status === 'completed'">
        <lucide-icon *ngIf="item.status === 'completed'" name="check" [size]="13"></lucide-icon>
      </button>
      <div class="pmb-item-body">
        <div class="pmb-item-title">{{ item.title }}</div>
        <div class="pmb-item-meta">
          <span class="pmb-prio" [attr.data-p]="item.priority" [title]="item.priority + ' priority'"></span>
          <span class="pmb-chip" [ngClass]="kindChip">
            <lucide-icon [name]="kindIcon" [size]="11"></lucide-icon>{{ buddy.kindLabel(item) }}
          </span>
          <span class="pmb-due" *ngIf="item.dueDate" [ngClass]="item.status === 'pending' ? (item.dueDate | dueState) : ''">
            <lucide-icon name="calendar" [size]="11"></lucide-icon>{{ item.dueDate | relativeDay }}
          </span>
          <span *ngIf="item.stakeholder" class="pmb-chip">
            <lucide-icon name="user" [size]="11"></lucide-icon>{{ item.direction === 'owed-to-me' ? 'from ' : '' }}{{ item.stakeholder }}
          </span>
          <span *ngIf="showProject && item.project" class="pmb-chip">{{ item.project }}</span>
          <span *ngIf="buddy.isSnoozed(item)" class="pmb-chip pmb-chip--blue"><lucide-icon name="alarm-clock" [size]="11"></lucide-icon>Snoozed · {{ item.snoozedUntil | relativeDay }}</span>
          <span *ngIf="showSource && item.source.label" class="pmb-source"><lucide-icon name="link" [size]="10"></lucide-icon>{{ item.source.label }}</span>
        </div>
      </div>
      <div class="pmb-item-actions">
        <button type="button" class="pmb-icon-btn" (click)="startEdit()" [attr.aria-label]="'Edit ' + item.title" title="Edit">
          <lucide-icon name="pencil" [size]="14"></lucide-icon>
        </button>
        <button type="button" class="pmb-icon-btn" (click)="menuOpen = !menuOpen" aria-haspopup="menu" [attr.aria-expanded]="menuOpen" [attr.aria-label]="'More actions for ' + item.title" title="More">
          <lucide-icon name="ellipsis" [size]="15"></lucide-icon>
        </button>
        <div class="pmb-menu" *ngIf="menuOpen" role="menu">
          <ng-container *ngIf="item.status === 'pending'">
            <button type="button" role="menuitem" (click)="snooze(1)"><lucide-icon name="alarm-clock" [size]="14"></lucide-icon>Snooze until tomorrow</button>
            <button type="button" role="menuitem" (click)="snooze(3)"><lucide-icon name="alarm-clock" [size]="14"></lucide-icon>Snooze 3 days</button>
            <button type="button" role="menuitem" (click)="snooze(7)"><lucide-icon name="alarm-clock" [size]="14"></lucide-icon>Snooze 1 week</button>
            <button type="button" role="menuitem" *ngIf="buddy.isSnoozed(item)" (click)="buddy.unsnooze(item.id); menuOpen = false"><lucide-icon name="bell-ring" [size]="14"></lucide-icon>Unsnooze</button>
            <hr />
          </ng-container>
          <button type="button" role="menuitem" class="danger" (click)="buddy.deleteItem(item.id); menuOpen = false"><lucide-icon name="trash-2" [size]="14"></lucide-icon>Delete</button>
        </div>
      </div>
    </article>

    <ng-template #editTpl>
      <form class="pmb-item pmb-item--edit" (ngSubmit)="save()" (keydown.escape)="editing = false">
        <div class="pmb-item-body">
          <label class="pmb-sr-only" [attr.for]="'t-' + item.id">Title</label>
          <input class="pmb-input pmb-edit-title" [id]="'t-' + item.id" name="title" [(ngModel)]="draft.title" required autocomplete="off" />
          <div class="pmb-form-grid">
            <label class="pmb-field"><span>Type</span>
              <select class="pmb-select" name="kind" [(ngModel)]="draft.kind">
                <option *ngFor="let k of kinds" [ngValue]="k.id">{{ k.label }}</option>
              </select>
            </label>
            <label class="pmb-field"><span>Due</span><input class="pmb-input" type="date" name="due" [(ngModel)]="draft.dueDate" /></label>
            <label class="pmb-field"><span>Priority</span>
              <select class="pmb-select" name="priority" [(ngModel)]="draft.priority">
                <option *ngFor="let p of priorities" [ngValue]="p">{{ p | titlecase }}</option>
              </select>
            </label>
            <label class="pmb-field"><span>Project</span>
              <select class="pmb-select" name="project" [(ngModel)]="draft.project">
                <option [ngValue]="undefined">None</option>
                <option *ngFor="let p of projects" [ngValue]="p">{{ p }}</option>
              </select>
            </label>
            <label class="pmb-field" *ngIf="draft.kind === 'commitment' || draft.kind === 'follow-up'"><span>{{ draft.direction === 'owed-to-me' ? 'From' : 'Stakeholder' }}</span>
              <input class="pmb-input" name="stakeholder" [(ngModel)]="draft.stakeholder" [attr.list]="'sh-' + item.id" />
              <datalist [id]="'sh-' + item.id"><option *ngFor="let s of stakeholders" [value]="s"></option></datalist>
            </label>
          </div>
          <div class="pmb-edit-actions">
            <button type="button" class="pmb-btn pmb-btn--ghost pmb-btn--sm" (click)="editing = false">Cancel</button>
            <button type="submit" class="pmb-btn pmb-btn--primary pmb-btn--sm" [disabled]="!draft.title?.trim()">Save</button>
          </div>
        </div>
      </form>
    </ng-template>
  `,
  styles: [`
    :host { display: block; }
    .pmb-source { display: inline-flex; align-items: center; gap: 3px; color: var(--psc-text-faint); }
    .pmb-item--edit { border-color: var(--psc-primary); box-shadow: 0 0 0 3px rgb(var(--psc-primary-rgb) / .1); }
    .pmb-edit-title { height: 38px; font-weight: 700; }
    .pmb-edit-actions { display: flex; justify-content: flex-end; gap: 8px; }
    /* Opened from a link (Home "Up next", alerts): draw the eye to this card for a moment. */
    .pmb-item.is-focused { border-color: var(--psc-primary); box-shadow: 0 0 0 3px rgb(var(--psc-primary-rgb) / .22); animation: pmb-focus-pulse 1.2s ease-out 2; }
    @keyframes pmb-focus-pulse { 0% { box-shadow: 0 0 0 0 rgb(var(--psc-primary-rgb) / .45); } 100% { box-shadow: 0 0 0 10px rgb(var(--psc-primary-rgb) / 0); } }
    @media (prefers-reduced-motion: reduce) { .pmb-item.is-focused { animation: none; } }
  `]
})
export class BuddyItemCardComponent implements OnInit {
  @Input({ required: true }) item!: BuddyItem;
  @Input() showProject = true;
  @Input() showSource = false;

  readonly buddy = inject(PmBuddyService);
  private readonly host = inject(ElementRef<HTMLElement>);

  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  menuOpen = false;
  editing = false;
  /** True when the page was opened with ?focus=<this item>. */
  focused = false;

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(q => {
      this.focused = q.get('focus') === this.item.id;
      if (!this.focused) return;
      setTimeout(() => this.host.nativeElement.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
      setTimeout(() => (this.focused = false), 6000);
    });
  }
  draft: Partial<BuddyItem> = {};

  readonly kinds: { id: BuddyItemKind; label: string }[] = [
    { id: 'task', label: 'Task' }, { id: 'commitment', label: 'Commitment' }, { id: 'follow-up', label: 'Follow-up' }, { id: 'reminder', label: 'Reminder' }
  ];
  readonly priorities: BuddyPriority[] = ['high', 'medium', 'low'];
  readonly projects = BUDDY_PROJECTS;
  readonly stakeholders = STAKEHOLDERS;

  get kindIcon(): string {
    return { task: 'check-square', commitment: this.item.direction === 'owed-to-me' ? 'hourglass' : 'handshake', 'follow-up': 'repeat', reminder: 'bell' }[this.item.kind];
  }

  get kindChip(): string {
    return { task: 'pmb-chip--violet', commitment: this.item.direction === 'owed-to-me' ? 'pmb-chip--amber' : 'pmb-chip--blue', 'follow-up': 'pmb-chip--green', reminder: 'pmb-chip--violet' }[this.item.kind];
  }

  startEdit(): void {
    this.draft = { ...this.item };
    this.menuOpen = false;
    this.editing = true;
    setTimeout(() => (this.host.nativeElement.querySelector('.pmb-edit-title') as HTMLInputElement | null)?.focus());
  }

  save(): void {
    if (!this.draft.title?.trim()) return;
    const { title, kind, dueDate, priority, project, stakeholder } = this.draft;
    this.buddy.updateItem(this.item.id, {
      title: title!.trim(), kind, dueDate: dueDate || undefined, priority, project, stakeholder: stakeholder || undefined,
      direction: kind === 'commitment' ? this.item.direction ?? 'i-owe' : undefined
    });
    this.editing = false;
    this.buddy.toast('success', 'Changes saved');
  }

  snooze(days: number): void {
    this.buddy.snooze(this.item.id, days);
    this.menuOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (this.menuOpen && !this.host.nativeElement.contains(e.target as Node)) this.menuOpen = false;
  }

  @HostListener('keydown.escape')
  onEsc(): void {
    this.menuOpen = false;
  }
}
