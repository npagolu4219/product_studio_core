import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { BuddyMeeting } from '../models/pm-buddy.models';
import { PmBuddyService } from '../services/pm-buddy.service';
import { MeetingExtraction } from '../services/pm-buddy-ai';
import { RelativeDayPipe } from '../components/relative-day.pipe';
import { PscIllustrationComponent } from '../../../components/psc-illustration/psc-illustration.component';
import { BUDDY_PROJECTS, ME } from '../data/pm-buddy.mock-data';
import { isoDay } from '../data/pm-buddy.dates';

const SAMPLE_NOTES = `Reviewed onboarding funnel with Priya and Marcus. Drop-off is 40% at step 3 (company details).
We decided to remove the phone number field and make company size optional.
Priya to share updated onboarding designs by Friday.
Marcus will add funnel events for each step tomorrow.
I will update the onboarding PRD with the new success metrics.
Should we A/B test the shorter flow or ship it to everyone?
Open question: who owns onboarding emails after launch?`;

/** Meeting history with AI summaries, decisions, actions and open questions — plus manual note capture. */
@Component({
  selector: 'app-buddy-meetings',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, RelativeDayPipe, PscIllustrationComponent],
  template: `
    <div class="pmb-page">
      <div class="pmb-page-head">
        <div>
          <h1 class="pmb-page-title">Meeting Memory</h1>
          <p class="pmb-page-sub">Every discussion, decision and action — summarised and searchable.</p>
        </div>
        <button type="button" class="pmb-btn pmb-btn--primary" (click)="startAdd()"><lucide-icon name="plus" [size]="15"></lucide-icon>Add meeting notes</button>
      </div>

      <div class="layout">
        <aside class="list" aria-label="Meetings">
          <div class="pmb-search">
            <lucide-icon name="search" [size]="14"></lucide-icon>
            <input [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Search meetings…" aria-label="Search meetings" />
          </div>
          <ng-container *ngIf="upcoming().length">
            <h2 class="list-label">Today &amp; upcoming</h2>
            <button type="button" class="row" *ngFor="let m of upcoming(); trackBy: trackById" [class.active]="selectedId() === m.id && mode() === 'view'" (click)="select(m.id)">
              <span class="row-time">{{ m.time }}<small>{{ m.date | relativeDay }}</small></span>
              <span class="row-body"><span class="row-title">{{ m.title }}</span><span class="row-sub">{{ m.participants.join(', ') }}</span></span>
            </button>
          </ng-container>
          <h2 class="list-label">History</h2>
          <button type="button" class="row" *ngFor="let m of past(); trackBy: trackById" [class.active]="selectedId() === m.id && mode() === 'view'" (click)="select(m.id)">
            <span class="row-time row-time--past">{{ m.date | relativeDay }}</span>
            <span class="row-body">
              <span class="row-title">{{ m.title }}</span>
              <span class="row-sub">
                <span *ngIf="openActions(m) as n" class="pmb-chip pmb-chip--amber">{{ n }} open action{{ n === 1 ? '' : 's' }}</span>
                <span *ngIf="!openActions(m)">{{ m.decisions.length }} decision{{ m.decisions.length === 1 ? '' : 's' }}</span>
              </span>
            </span>
          </button>
          <p class="list-empty" *ngIf="!past().length && !upcoming().length">No meetings match “{{ query() }}”.</p>
        </aside>

        <!-- Detail -->
        <section class="pmb-card detail" *ngIf="mode() === 'view' && selected() as m" [attr.aria-label]="m.title">
          <header class="d-head">
            <div>
              <div class="d-meta"><lucide-icon name="calendar" [size]="13"></lucide-icon>{{ m.date | relativeDay }} · {{ m.time }} · {{ m.durationMin }} min<span *ngIf="m.project"> · {{ m.project }}</span></div>
              <h2 class="d-title">{{ m.title }}</h2>
              <div class="people"><span class="avatar" *ngFor="let p of m.participants" [title]="p">{{ p.charAt(0) }}</span><span class="people-names">{{ m.participants.join(', ') }}</span></div>
            </div>
            <button type="button" class="pmb-icon-btn danger" (click)="remove(m)" [attr.aria-label]="'Delete ' + m.title" title="Delete meeting"><lucide-icon name="trash-2" [size]="15"></lucide-icon></button>
          </header>

          <ng-container *ngIf="m.upcoming; else pastTpl">
            <div class="upcoming-note">
              <lucide-icon name="calendar-clock" [size]="18"></lucide-icon>
              <div><strong>Not happened yet.</strong> After the meeting, add your notes and I’ll extract the summary, decisions and action items.</div>
              <button type="button" class="pmb-btn pmb-btn--soft pmb-btn--sm" (click)="startAdd(m)">Add notes</button>
            </div>
          </ng-container>
          <ng-template #pastTpl>
            <div class="block">
              <h3><lucide-icon name="sparkles" [size]="14"></lucide-icon>AI summary</h3>
              <p class="summary">{{ m.summary }}</p>
            </div>
            <div class="block" *ngIf="m.decisions.length">
              <h3><lucide-icon name="circle-check" [size]="14"></lucide-icon>Decisions</h3>
              <ul class="decisions"><li *ngFor="let d of m.decisions">{{ d }}</li></ul>
            </div>
            <div class="block">
              <h3><lucide-icon name="list-checks" [size]="14"></lucide-icon>Action items <span class="pmb-count">{{ m.actionItems.length }}</span></h3>
              <div class="action" *ngFor="let a of m.actionItems; trackBy: trackById" [class.done]="a.done">
                <button type="button" class="pmb-check" [class.checked]="a.done" (click)="buddy.toggleActionDone(m.id, a.id)" [attr.aria-label]="(a.done ? 'Reopen: ' : 'Mark done: ') + a.text">
                  <lucide-icon *ngIf="a.done" name="check" [size]="13"></lucide-icon>
                </button>
                <div class="action-body">
                  <span class="action-text">{{ a.text }}</span>
                  <span class="pmb-item-meta"><span class="pmb-chip"><lucide-icon name="user" [size]="11"></lucide-icon>{{ a.owner === me ? 'You' : a.owner }}</span><span *ngIf="a.dueDate" class="pmb-due"><lucide-icon name="calendar" [size]="11"></lucide-icon>{{ a.dueDate | relativeDay }}</span></span>
                </div>
                <span class="pmb-chip pmb-chip--green" *ngIf="a.taskId"><lucide-icon name="link" [size]="11"></lucide-icon>Tracked</span>
                <button type="button" class="pmb-btn pmb-btn--soft pmb-btn--sm" *ngIf="!a.taskId && !a.done" (click)="buddy.convertAction(m.id, a.id)">
                  <lucide-icon name="list-plus" [size]="13"></lucide-icon>Track
                </button>
              </div>
              <p class="muted" *ngIf="!m.actionItems.length">No action items.</p>
            </div>
            <div class="block" *ngIf="m.questions.length">
              <h3><lucide-icon name="circle-help" [size]="14"></lucide-icon>Unanswered questions</h3>
              <div class="question" *ngFor="let q of m.questions; let qi = index">
                <span>{{ q }}</span>
                <span class="q-actions">
                  <button type="button" class="pmb-btn pmb-btn--ghost pmb-btn--sm" (click)="questionToTask(m, q)"><lucide-icon name="list-plus" [size]="13"></lucide-icon>Task</button>
                  <button type="button" class="pmb-btn pmb-btn--ghost pmb-btn--sm" (click)="answer(m, qi)"><lucide-icon name="check" [size]="13"></lucide-icon>Answered</button>
                </span>
              </div>
            </div>
          </ng-template>
        </section>

        <!-- Add notes -->
        <section class="pmb-card detail" *ngIf="mode() === 'add'" aria-label="Add meeting notes">
          <header class="d-head"><h2 class="d-title">{{ draft.updatingId ? 'Notes for ' + draft.title : 'Add meeting notes' }}</h2>
            <button type="button" class="pmb-icon-btn" (click)="mode.set('view')" aria-label="Cancel"><lucide-icon name="x" [size]="16"></lucide-icon></button></header>
          <div class="pmb-form-grid">
            <label class="pmb-field wide"><span>Title</span><input class="pmb-input" [(ngModel)]="draft.title" placeholder="e.g. Onboarding funnel review" /></label>
            <label class="pmb-field"><span>Date</span><input class="pmb-input" type="date" [(ngModel)]="draft.date" /></label>
            <label class="pmb-field"><span>Time</span><input class="pmb-input" type="time" [(ngModel)]="draft.time" /></label>
            <label class="pmb-field"><span>Project</span><select class="pmb-select" [(ngModel)]="draft.project"><option [ngValue]="undefined">None</option><option *ngFor="let p of projects" [ngValue]="p">{{ p }}</option></select></label>
            <label class="pmb-field wide"><span>Participants (comma separated)</span><input class="pmb-input" [(ngModel)]="draft.participants" placeholder="Priya, Marcus" /></label>
          </div>
          <label class="pmb-field"><span>Notes</span>
            <textarea class="pmb-textarea" rows="8" [(ngModel)]="draft.notes" placeholder="Type or paste raw notes — decisions, who will do what, open questions…"></textarea>
          </label>
          <div class="add-actions">
            <button type="button" class="pmb-link" (click)="useSample()"><lucide-icon name="file-text" [size]="13"></lucide-icon>Use sample notes</button>
            <span class="spacer"></span>
            <button type="button" class="pmb-btn pmb-btn--soft" (click)="generate()" [disabled]="!draft.notes.trim() || generating()">
              <lucide-icon [name]="generating() ? 'loader' : 'sparkles'" [size]="14"></lucide-icon>{{ generating() ? 'Analysing…' : 'Generate summary' }}
            </button>
          </div>

          <div class="extract" *ngIf="generating()">
            <div class="pmb-skeleton" style="height:14px;width:40%"></div>
            <div class="pmb-skeleton" style="height:12px;width:95%"></div>
            <div class="pmb-skeleton" style="height:12px;width:80%"></div>
            <div class="pmb-skeleton" style="height:12px;width:60%"></div>
          </div>

          <div class="extract" *ngIf="extraction() as x">
            <div class="extract-head"><lucide-icon name="sparkles" [size]="14"></lucide-icon>Here’s what I found — remove anything that’s wrong, then save.</div>
            <div class="block"><h3>Summary</h3><p class="summary">{{ x.summary }}</p></div>
            <div class="block" *ngIf="x.decisions.length"><h3>Decisions</h3>
              <div class="chip-row" *ngFor="let d of x.decisions; let i = index"><span>{{ d }}</span><button type="button" class="pmb-icon-btn" (click)="removeFrom('decisions', i)" aria-label="Remove decision"><lucide-icon name="x" [size]="13"></lucide-icon></button></div>
            </div>
            <div class="block" *ngIf="x.actionItems.length"><h3>Action items</h3>
              <div class="chip-row" *ngFor="let a of x.actionItems; let i = index"><span>{{ a.text }} <em>— {{ a.owner === me ? 'You' : a.owner }}{{ a.dueDate ? ', ' + (a.dueDate | relativeDay) : '' }}</em></span><button type="button" class="pmb-icon-btn" (click)="removeFrom('actionItems', i)" aria-label="Remove action"><lucide-icon name="x" [size]="13"></lucide-icon></button></div>
            </div>
            <div class="block" *ngIf="x.questions.length"><h3>Open questions</h3>
              <div class="chip-row" *ngFor="let q of x.questions; let i = index"><span>{{ q }}</span><button type="button" class="pmb-icon-btn" (click)="removeFrom('questions', i)" aria-label="Remove question"><lucide-icon name="x" [size]="13"></lucide-icon></button></div>
            </div>
            <label class="track-mine"><input type="checkbox" [(ngModel)]="trackMine" /> Add my action items to My Tasks</label>
            <div class="add-actions"><span class="spacer"></span>
              <button type="button" class="pmb-btn pmb-btn--primary" (click)="save()" [disabled]="!draft.title.trim()"><lucide-icon name="check" [size]="14"></lucide-icon>Save meeting</button>
            </div>
          </div>
        </section>

        <section class="pmb-card detail pmb-empty" *ngIf="mode() === 'view' && !selected()">
          <app-psc-illustration name="empty-chats"></app-psc-illustration>
          <strong>No meeting selected</strong>Pick a meeting or add notes from your last one.
        </section>
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }
    .layout { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 16px; align-items: start; }
    .list { display: flex; flex-direction: column; gap: 6px; position: sticky; top: 0; }
    .list .pmb-search { max-width: none; margin-bottom: 4px; }
    .list-label { margin: 10px 4px 2px; font-size: 11px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; color: var(--psc-text-subtle); }
    .row { display: flex; gap: 10px; align-items: flex-start; width: 100%; padding: 10px 12px; text-align: left; font: inherit; color: inherit; cursor: pointer; border-radius: 12px; border: 1px solid transparent; background: transparent; transition: background .15s, border-color .15s; }
    .row:hover { background: var(--psc-surface); border-color: var(--psc-line); }
    .row.active { background: var(--psc-surface); border-color: var(--psc-primary); box-shadow: 0 0 0 3px rgb(var(--psc-primary-rgb) / .1); }
    .row:focus-visible { outline: 2px solid var(--psc-primary); outline-offset: 1px; }
    .row-time { flex: 0 0 64px; display: flex; flex-direction: column; font-size: 13px; font-weight: 800; color: var(--psc-primary-text); }
    .row-time small { font-size: 10.5px; font-weight: 700; color: var(--psc-text-subtle); }
    .row-time--past { font-size: 11.5px; color: var(--psc-text-subtle); }
    .row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .row-title { font-size: 13px; font-weight: 800; color: var(--psc-text-strong); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row-sub { font-size: 11.5px; color: var(--psc-text-subtle); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .list-empty { font-size: 12.5px; color: var(--psc-text-subtle); padding: 8px; }
    .detail { padding: 20px; display: flex; flex-direction: column; gap: 16px; min-width: 0; animation: pmb-fade-up .2s ease both; }
    .d-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .d-meta { display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; color: var(--psc-text-subtle); }
    .d-title { margin: 4px 0 8px; font-size: 18px; font-weight: 800; color: var(--psc-text-strong); }
    .people { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .avatar { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; font-size: 10.5px; font-weight: 800; color: #fff; background: var(--psc-gradient-brand); box-shadow: 0 0 0 2px var(--psc-surface); }
    .people-names { margin-left: 6px; font-size: 12px; color: var(--psc-text-subtle); }
    .block { display: flex; flex-direction: column; gap: 8px; }
    .block h3 { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 12px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase; color: var(--psc-text-subtle); }
    .block h3 lucide-icon { color: var(--psc-primary-text); }
    .summary { margin: 0; font-size: 14px; line-height: 1.6; color: var(--psc-text-body); }
    .decisions { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
    .decisions li { position: relative; padding: 8px 12px 8px 30px; border-radius: 10px; background: var(--psc-tint-green); color: var(--psc-on-tint-green); font-size: 13px; font-weight: 600; }
    .decisions li::before { content: '✓'; position: absolute; left: 12px; font-weight: 800; }
    .action { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--psc-line); border-radius: 10px; }
    .action.done .action-text { text-decoration: line-through; color: var(--psc-text-subtle); }
    .action-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .action-text { font-size: 13px; font-weight: 700; color: var(--psc-text-strong); }
    .question { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border-radius: 10px; background: var(--psc-tint-blue); color: var(--psc-on-tint-blue); font-size: 13px; font-weight: 600; }
    .q-actions { display: flex; gap: 6px; flex-shrink: 0; }
    .muted { margin: 0; font-size: 12.5px; color: var(--psc-text-subtle); }
    .upcoming-note { display: flex; align-items: center; gap: 12px; padding: 14px; border-radius: 12px; background: var(--psc-tint-violet); color: var(--psc-on-tint-violet); font-size: 13px; line-height: 1.5; }
    .upcoming-note > div { flex: 1; }
    .wide { grid-column: 1 / -1; }
    .add-actions { display: flex; align-items: center; gap: 8px; }
    .spacer { flex: 1; }
    .extract { display: flex; flex-direction: column; gap: 12px; padding: 14px; border-radius: 12px; background: var(--psc-surface-2); border: 1px dashed rgb(var(--psc-primary-rgb) / .35); animation: pmb-fade-up .2s ease both; }
    .extract-head { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: var(--psc-primary-text); }
    .chip-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 6px 6px 12px; border-radius: 9px; background: var(--psc-surface); border: 1px solid var(--psc-line); font-size: 13px; color: var(--psc-text-body); }
    .chip-row em { color: var(--psc-text-subtle); font-style: normal; }
    .track-mine { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--psc-text-body); }
    .track-mine input { accent-color: var(--psc-primary); }
    @media (max-width: 900px) {
      .layout { grid-template-columns: minmax(0, 1fr); }
      .list { position: static; }
      .question { flex-direction: column; align-items: flex-start; }
    }
  `]
})
export class BuddyMeetingsComponent implements OnInit {
  readonly buddy = inject(PmBuddyService);
  private readonly route = inject(ActivatedRoute);
  readonly me = ME;
  readonly projects = BUDDY_PROJECTS;

  readonly query = signal('');
  readonly selectedId = signal<string | null>(null);
  readonly mode = signal<'view' | 'add'>('view');
  readonly generating = signal(false);
  readonly extraction = signal<MeetingExtraction | null>(null);
  trackMine = true;
  draft = this.emptyDraft();

  private readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.buddy.meetings().filter(m => !q || `${m.title} ${m.summary} ${m.participants.join(' ')} ${m.project ?? ''} ${m.decisions.join(' ')}`.toLowerCase().includes(q));
  });
  readonly upcoming = computed(() => this.filtered().filter(m => m.upcoming).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)));
  readonly past = computed(() => this.filtered().filter(m => !m.upcoming));
  readonly selected = computed(() => this.buddy.meetings().find(m => m.id === this.selectedId()) ?? null);

  ngOnInit(): void {
    const focus = this.route.snapshot.queryParamMap.get('focus');
    const first = this.buddy.pastMeetings()[0]?.id ?? null;
    this.selectedId.set(focus && this.buddy.meetings().some(m => m.id === focus) ? focus : first);
  }

  select(id: string): void {
    this.selectedId.set(id);
    this.mode.set('view');
  }

  openActions(m: BuddyMeeting): number {
    return m.actionItems.filter(a => !a.done).length;
  }

  startAdd(from?: BuddyMeeting): void {
    this.draft = from
      ? { ...this.emptyDraft(), updatingId: from.id, title: from.title, date: from.date, time: from.time, project: from.project, participants: from.participants.filter(p => p !== ME).join(', ') }
      : this.emptyDraft();
    this.extraction.set(null);
    this.mode.set('add');
  }

  useSample(): void {
    this.draft = { ...this.draft, title: this.draft.title || 'Onboarding funnel review', participants: this.draft.participants || 'Priya, Marcus', project: this.draft.project ?? 'Aava Commerce Platform', notes: SAMPLE_NOTES };
  }

  async generate(): Promise<void> {
    this.generating.set(true);
    this.extraction.set(null);
    const x = await this.buddy.summarizeNotes(this.draft.notes, this.participants());
    this.extraction.set(x);
    this.generating.set(false);
  }

  removeFrom(key: 'decisions' | 'actionItems' | 'questions', index: number): void {
    const x = this.extraction();
    if (!x) return;
    this.extraction.set({ ...x, [key]: (x[key] as unknown[]).filter((_, i) => i !== index) } as MeetingExtraction);
  }

  save(): void {
    const x = this.extraction();
    if (!x || !this.draft.title.trim()) return;
    const meeting = {
      title: this.draft.title.trim(), date: this.draft.date, time: this.draft.time || '10:00', durationMin: 30,
      participants: [...this.participants(), ME], project: this.draft.project, notes: this.draft.notes,
      summary: x.summary, decisions: x.decisions, actionItems: x.actionItems, questions: x.questions, upcoming: false
    };
    let id: string;
    if (this.draft.updatingId) {
      this.buddy.updateMeeting(this.draft.updatingId, meeting);
      this.buddy.toast('success', `Notes saved — ${x.actionItems.length} action item${x.actionItems.length === 1 ? '' : 's'} captured`);
      id = this.draft.updatingId;
    } else {
      id = this.buddy.addMeeting(meeting).id;
    }
    if (this.trackMine) {
      for (const a of x.actionItems.filter(a => a.owner === ME)) this.buddy.convertAction(id, a.id);
    }
    this.selectedId.set(id);
    this.mode.set('view');
    this.extraction.set(null);
  }

  questionToTask(m: BuddyMeeting, q: string): void {
    this.buddy.addItem({ kind: 'task', title: `Get an answer: ${q}`, project: m.project, dueDate: isoDay(2), source: { kind: 'meeting', refId: m.id, label: m.title } });
  }

  answer(m: BuddyMeeting, index: number): void {
    const questions = m.questions;
    const q = questions[index];
    this.buddy.updateMeeting(m.id, { questions: questions.filter((_, i) => i !== index) });
    this.buddy.toast('success', 'Marked as answered', 'Undo', () => this.buddy.updateMeeting(m.id, { questions: [...questions.slice(0, index), q, ...questions.slice(index)] }));
  }

  remove(m: BuddyMeeting): void {
    this.buddy.deleteMeeting(m.id);
    this.selectedId.set(this.buddy.pastMeetings()[0]?.id ?? null);
  }

  trackById(_: number, x: { id: string }): string {
    return x.id;
  }

  private participants(): string[] {
    return this.draft.participants.split(',').map(p => p.trim()).filter(Boolean);
  }

  private emptyDraft() {
    return { updatingId: '' as string, title: '', date: isoDay(0), time: '', project: undefined as string | undefined, participants: '', notes: '' };
  }
}
