import { AfterViewChecked, Component, ElementRef, Input, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { BuddyMessage, BuddyPriority, ProposedItem } from '../models/pm-buddy.models';
import { PmBuddyService } from '../services/pm-buddy.service';
import { BUDDY_PROJECTS } from '../data/pm-buddy.mock-data';
import { RelativeDayPipe } from './relative-day.pipe';

const CATEGORY_META: Record<ProposedItem['category'], { icon: string; label: string; chip: string }> = {
  task: { icon: 'check-square', label: 'Task', chip: 'pmb-chip--violet' },
  commitment: { icon: 'handshake', label: 'Commitment', chip: 'pmb-chip--blue' },
  'follow-up': { icon: 'repeat', label: 'Follow-up', chip: 'pmb-chip--green' },
  reminder: { icon: 'bell', label: 'Reminder', chip: 'pmb-chip--violet' },
  idea: { icon: 'lightbulb', label: 'Idea', chip: 'pmb-chip--amber' },
  note: { icon: 'sticky-note', label: 'Note', chip: 'pmb-chip--amber' }
};

/** Conversation thread: user messages, Buddy replies, editable proposal cards and memory answers. */
@Component({
  selector: 'app-buddy-conversation',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule, RelativeDayPipe],
  template: `
    <div class="conv" #scroller aria-live="polite" [style.max-height]="maxHeight">
      <div class="msg" *ngFor="let m of messages; trackBy: trackById" [class.msg--user]="m.role === 'user'">
        <span class="msg-avatar" *ngIf="m.role === 'buddy'" aria-hidden="true"><lucide-icon name="sparkles" [size]="14"></lucide-icon></span>
        <div class="msg-body">
          <div class="bubble" *ngIf="!m.pending; else thinkingTpl">{{ m.text }}</div>

          <!-- Proposed items (editable) -->
          <div class="proposals" *ngIf="m.proposals?.length">
            <div class="proposal" *ngFor="let p of m.proposals; trackBy: trackById" [attr.data-state]="p.state">
              <ng-container *ngIf="p.state !== 'editing'; else editTpl">
                <div class="proposal-main">
                  <span class="pmb-chip" [ngClass]="meta(p).chip"><lucide-icon [name]="meta(p).icon" [size]="11"></lucide-icon>{{ meta(p).label }}{{ p.direction === 'owed-to-me' ? ' · waiting on' : '' }}</span>
                  <div class="proposal-title">{{ p.title }}</div>
                  <div class="pmb-item-meta">
                    <span class="pmb-due" *ngIf="p.dueDate"><lucide-icon name="calendar" [size]="11"></lucide-icon>{{ p.dueDate | relativeDay }}</span>
                    <span *ngIf="p.category !== 'idea' && p.category !== 'note'"><span class="pmb-prio" [attr.data-p]="p.priority"></span> {{ p.priority | titlecase }}</span>
                    <span *ngIf="p.stakeholder" class="pmb-chip"><lucide-icon name="user" [size]="11"></lucide-icon>{{ p.stakeholder }}</span>
                    <span *ngIf="p.project" class="pmb-chip">{{ p.project }}</span>
                  </div>
                </div>
                <div class="proposal-actions" *ngIf="p.state === 'proposed'">
                  <button type="button" class="pmb-btn pmb-btn--primary pmb-btn--sm" (click)="buddy.confirmProposal(m.id, p.id)"><lucide-icon name="check" [size]="13"></lucide-icon>Confirm</button>
                  <button type="button" class="pmb-btn pmb-btn--ghost pmb-btn--sm" (click)="edit(m, p)"><lucide-icon name="pencil" [size]="13"></lucide-icon>Edit</button>
                  <button type="button" class="pmb-btn pmb-btn--ghost pmb-btn--sm" (click)="buddy.cancelProposal(m.id, p.id)" [attr.aria-label]="'Cancel ' + p.title">Cancel</button>
                </div>
                <div class="proposal-done" *ngIf="p.state === 'confirmed'"><lucide-icon name="circle-check" [size]="14"></lucide-icon>Saved</div>
                <div class="proposal-done cancelled" *ngIf="p.state === 'cancelled'">Discarded
                  <button type="button" class="pmb-link" (click)="buddy.updateProposal(m.id, p.id, { state: 'proposed' })">Restore</button>
                </div>
              </ng-container>
              <ng-template #editTpl>
                <form class="proposal-edit" (ngSubmit)="saveEdit(m, p)" (keydown.escape)="buddy.updateProposal(m.id, p.id, { state: 'proposed' })">
                  <label class="pmb-field"><span>Title</span><input class="pmb-input" name="title" [(ngModel)]="draft.title" required /></label>
                  <div class="pmb-form-grid">
                    <label class="pmb-field"><span>Category</span>
                      <select class="pmb-select" name="category" [(ngModel)]="draft.category">
                        <option *ngFor="let c of categories" [ngValue]="c">{{ categoryLabel(c) }}</option>
                      </select>
                    </label>
                    <label class="pmb-field" *ngIf="draft.category !== 'idea' && draft.category !== 'note'"><span>Due</span><input class="pmb-input" type="date" name="due" [(ngModel)]="draft.dueDate" /></label>
                    <label class="pmb-field" *ngIf="draft.category !== 'idea' && draft.category !== 'note'"><span>Priority</span>
                      <select class="pmb-select" name="priority" [(ngModel)]="draft.priority"><option *ngFor="let pr of priorities" [ngValue]="pr">{{ pr | titlecase }}</option></select>
                    </label>
                    <label class="pmb-field"><span>Project</span>
                      <select class="pmb-select" name="project" [(ngModel)]="draft.project"><option [ngValue]="undefined">None</option><option *ngFor="let pj of projects" [ngValue]="pj">{{ pj }}</option></select>
                    </label>
                  </div>
                  <div class="proposal-actions">
                    <button type="submit" class="pmb-btn pmb-btn--primary pmb-btn--sm" [disabled]="!draft.title?.trim()"><lucide-icon name="check" [size]="13"></lucide-icon>Save & confirm</button>
                    <button type="button" class="pmb-btn pmb-btn--ghost pmb-btn--sm" (click)="buddy.updateProposal(m.id, p.id, { state: 'proposed' })">Back</button>
                  </div>
                </form>
              </ng-template>
            </div>
            <button type="button" class="pmb-link confirm-all" *ngIf="pendingCount(m) > 1" (click)="confirmAll(m)">
              <lucide-icon name="check-check" [size]="13"></lucide-icon>Confirm all {{ pendingCount(m) }}
            </button>
          </div>

          <!-- Memory answer -->
          <div class="memory" *ngIf="m.memory as mem">
            <ul *ngIf="mem.bullets.length"><li *ngFor="let b of mem.bullets">{{ b }}</li></ul>
            <div class="refs" *ngIf="mem.references.length">
              <span class="refs-label">Sources</span>
              <a class="ref" *ngFor="let r of mem.references" [routerLink]="r.link" [title]="r.label">
                <lucide-icon [name]="refIcon(r.kind)" [size]="12"></lucide-icon>
                <span class="ref-label">{{ r.label }}</span>
                <span class="ref-meta">{{ r.date | relativeDay }}{{ r.project ? ' · ' + r.project : '' }}</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
    <ng-template #thinkingTpl>
      <div class="bubble bubble--thinking"><span class="pmb-thinking"><span></span><span></span><span></span> Thinking…</span></div>
    </ng-template>
  `,
  styles: [`
    :host { display: block; }
    .conv { display: flex; flex-direction: column; gap: 14px; overflow-y: auto; padding: 2px 4px 2px 0; scroll-behavior: smooth; overscroll-behavior: contain; }
    .msg { display: flex; gap: 10px; align-items: flex-start; animation: pmb-fade-up .25s ease both; }
    .msg--user { justify-content: flex-end; }
    .msg-avatar { flex: 0 0 28px; height: 28px; display: grid; place-items: center; border-radius: 9px; color: #fff; background: var(--psc-gradient-brand); }
    .msg-body { min-width: 0; max-width: min(100%, 680px); display: flex; flex-direction: column; gap: 8px; }
    .msg--user .msg-body { align-items: flex-end; max-width: 80%; }
    .bubble { padding: 10px 14px; border-radius: 4px 14px 14px 14px; background: var(--psc-surface-3); color: var(--psc-text-body); font-size: 13.5px; line-height: 1.55; overflow-wrap: anywhere; }
    .msg--user .bubble { border-radius: 14px 4px 14px 14px; color: #fff; background: var(--psc-gradient-brand); }
    .bubble--thinking { padding: 10px 14px; }
    .proposals { display: flex; flex-direction: column; gap: 8px; }
    .proposal { display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--psc-surface); border: 1px solid var(--psc-line); border-radius: 12px; transition: opacity .2s, border-color .2s; }
    .proposal[data-state='confirmed'] { border-color: rgba(16, 185, 129, .45); background: color-mix(in srgb, #10B981 6%, var(--psc-surface)); }
    .proposal[data-state='cancelled'] { opacity: .55; }
    .proposal[data-state='editing'] { border-color: var(--psc-primary); box-shadow: 0 0 0 3px rgb(var(--psc-primary-rgb) / .1); }
    .proposal-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
    .proposal-title { font-size: 14px; font-weight: 800; color: var(--psc-text-strong); line-height: 1.35; }
    .proposal-actions { display: flex; gap: 6px; flex-wrap: wrap; flex-shrink: 0; }
    .proposal-done { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; font-size: 12px; font-weight: 800; color: var(--psc-on-tint-green); }
    .proposal-done.cancelled { color: var(--psc-text-subtle); }
    .proposal-edit { flex: 1; display: flex; flex-direction: column; gap: 10px; }
    .confirm-all { align-self: flex-start; }
    .memory { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; background: var(--psc-surface); border: 1px solid var(--psc-line); border-radius: 12px; }
    .memory ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; font-size: 13px; line-height: 1.5; color: var(--psc-text-body); }
    .refs { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .refs-label { font-size: 10.5px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: var(--psc-text-subtle); margin-right: 2px; }
    .ref { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; padding: 4px 9px; border-radius: 8px; background: var(--psc-surface-3); color: var(--psc-text-body); font-size: 11.5px; text-decoration: none; border: 1px solid transparent; }
    .ref:hover { border-color: rgb(var(--psc-primary-rgb) / .35); color: var(--psc-primary-text); }
    .ref lucide-icon { color: var(--psc-primary-text); flex-shrink: 0; }
    .ref-label { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
    .ref-meta { color: var(--psc-text-subtle); white-space: nowrap; }
    @media (max-width: 640px) {
      .proposal { flex-direction: column; align-items: stretch; }
      .msg--user .msg-body { max-width: 90%; }
      .ref-label { max-width: 160px; }
    }
  `]
})
export class BuddyConversationComponent implements AfterViewChecked {
  @Input({ required: true }) messages: BuddyMessage[] = [];
  @Input() maxHeight = 'none';

  @ViewChild('scroller', { static: true }) private scroller!: ElementRef<HTMLElement>;

  readonly buddy = inject(PmBuddyService);
  readonly projects = BUDDY_PROJECTS;
  readonly priorities: BuddyPriority[] = ['high', 'medium', 'low'];
  readonly categories: ProposedItem['category'][] = ['task', 'commitment', 'follow-up', 'reminder', 'idea', 'note'];
  draft: Partial<ProposedItem> = {};
  private lastCount = 0;
  private lastSignature = '';

  meta(p: ProposedItem) {
    return CATEGORY_META[p.category];
  }

  categoryLabel(c: ProposedItem['category']): string {
    return CATEGORY_META[c].label;
  }

  refIcon(kind: string): string {
    return { meeting: 'calendar', task: 'check-square', commitment: 'handshake', idea: 'lightbulb', feedback: 'message-square', capture: 'zap' }[kind] ?? 'file-text';
  }

  edit(m: BuddyMessage, p: ProposedItem): void {
    this.draft = { ...p };
    this.buddy.updateProposal(m.id, p.id, { state: 'editing' });
  }

  saveEdit(m: BuddyMessage, p: ProposedItem): void {
    if (!this.draft.title?.trim()) return;
    const isNote = this.draft.category === 'idea' || this.draft.category === 'note';
    this.buddy.updateProposal(m.id, p.id, {
      title: this.draft.title.trim(), category: this.draft.category, dueDate: isNote ? undefined : this.draft.dueDate || undefined,
      priority: this.draft.priority, project: this.draft.project,
      direction: this.draft.category === 'commitment' ? p.direction ?? 'i-owe' : undefined, state: 'proposed'
    });
    this.buddy.confirmProposal(m.id, p.id);
  }

  pendingCount(m: BuddyMessage): number {
    return m.proposals?.filter(p => p.state === 'proposed').length ?? 0;
  }

  confirmAll(m: BuddyMessage): void {
    m.proposals?.filter(p => p.state === 'proposed').forEach(p => this.buddy.confirmProposal(m.id, p.id));
  }

  trackById(_: number, x: { id: string }): string {
    return x.id;
  }

  ngAfterViewChecked(): void {
    // Auto-scroll when a message arrives or Buddy finishes thinking.
    const sig = this.messages.map(m => `${m.id}${m.pending ? 'p' : ''}`).join();
    if (this.messages.length !== this.lastCount || sig !== this.lastSignature) {
      this.lastCount = this.messages.length;
      this.lastSignature = sig;
      const el = this.scroller.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }
}
