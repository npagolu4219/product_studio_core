import { Injectable, computed, signal } from '@angular/core';
import {
  BuddyIdea, BuddyInsight, BuddyItem, BuddyMeeting, BuddyMessage, BuddyState, BuddyToast, ProposedItem
} from '../models/pm-buddy.models';
import { BUDDY_STATE_VERSION, ME, buildSeedState } from '../data/pm-buddy.mock-data';
import { daysFromToday, isoDay, nowIso, relativeDay, today } from '../data/pm-buddy.dates';
import { answerMemory, isQuestion, parseCapture, proposalsSummary, summarizeMeeting } from './pm-buddy-ai';

const STORAGE_KEY = 'psc.pm-buddy.state';
/** Simulated AI "thinking" time — long enough to see the indicator, short enough not to annoy. */
const THINK_MS = 900;

let seq = 0;
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * Single source of truth for PM Buddy (frontend-only POC).
 * Signals hold the state; every mutation is persisted to localStorage so the demo survives refreshes.
 */
@Injectable({ providedIn: 'root' })
export class PmBuddyService {
  private readonly state = signal<BuddyState>(this.load());
  private toastSeq = 0;

  constructor() {
    // Keep every open tab in sync, so background tabs alert on the latest data.
    try {
      window.addEventListener('storage', e => {
        if (e.key !== STORAGE_KEY) return;
        const pending = this.state().messages.filter(m => m.pending);
        this.state.set({ ...this.load(), messages: [...this.load().messages, ...pending] });
      });
    } catch { /* non-browser */ }
  }

  readonly items = computed(() => this.state().items);
  readonly meetings = computed(() => [...this.state().meetings].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)));
  readonly ideas = computed(() => [...this.state().ideas].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  readonly messages = computed(() => this.state().messages);
  readonly toasts = signal<BuddyToast[]>([]);
  readonly thinking = signal(false);

  // ── Derived views ───────────────────────────────────────────────────────

  /** Pending and not currently snoozed. */
  readonly active = computed(() => this.items().filter(i => i.status === 'pending' && !this.isSnoozed(i)));
  readonly overdue = computed(() => this.active().filter(i => i.dueDate && daysFromToday(i.dueDate) < 0));
  readonly dueToday = computed(() => this.active().filter(i => i.dueDate && daysFromToday(i.dueDate) === 0));
  readonly upcoming = computed(() =>
    this.active().filter(i => i.dueDate && daysFromToday(i.dueDate) > 0 && daysFromToday(i.dueDate) <= 7)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
  );
  readonly pendingTasks = computed(() => this.active().filter(i => i.kind === 'task' || i.kind === 'reminder'));
  readonly followUps = computed(() => this.active().filter(i => i.kind === 'follow-up'));
  readonly commitmentsIOwe = computed(() => this.items().filter(i => i.kind === 'commitment' && i.direction === 'i-owe'));
  readonly commitmentsOwed = computed(() => this.items().filter(i => i.kind === 'commitment' && i.direction === 'owed-to-me'));
  readonly overdueCommitments = computed(() => this.overdue().filter(i => i.kind === 'commitment'));
  readonly reminders = computed(() => this.active().filter(i => i.kind === 'reminder' || i.priority === 'high'));
  readonly completedToday = computed(() => this.items().filter(i => i.status === 'completed' && i.completedAt && daysFromToday(i.completedAt.slice(0, 10)) === 0));

  /** Ranked list for "Today's priorities": overdue first, then due today, then high priority this week. */
  readonly todayPriorities = computed(() => {
    const rank = (i: BuddyItem) => {
      const d = i.dueDate ? daysFromToday(i.dueDate) : 99;
      return (d < 0 ? 0 : d === 0 ? 100 : 200 + d * 10) + (i.priority === 'high' ? 0 : i.priority === 'medium' ? 3 : 6) + (i.kind === 'commitment' ? -1 : 0);
    };
    return [...this.active()].filter(i => !i.direction || i.direction === 'i-owe').sort((a, b) => rank(a) - rank(b)).slice(0, 6);
  });

  readonly todaysMeetings = computed(() => this.state().meetings.filter(m => m.date === today()).sort((a, b) => a.time.localeCompare(b.time)));
  readonly pastMeetings = computed(() => this.meetings().filter(m => !m.upcoming));

  /** "What am I missing?" — recomputed from live state; snoozed/resolved insights are filtered out. */
  readonly insights = computed<BuddyInsight[]>(() => {
    const s = this.state();
    const out: BuddyInsight[] = [];
    const open = this.active();

    for (const i of open.filter(x => x.kind === 'commitment' && x.direction === 'i-owe' && x.dueDate && daysFromToday(x.dueDate) < 0)) {
      out.push({
        id: `ins-c-${i.id}`, kind: 'overdue-commitment', severity: 'high',
        title: `Overdue promise to ${i.stakeholder ?? 'a stakeholder'}`,
        message: `You promised to ${i.title.charAt(0).toLowerCase()}${i.title.slice(1)}${i.source.label ? ` (from “${i.source.label}”)` : ''}, but it is still pending — due ${relativeDay(i.dueDate).toLowerCase()}.`,
        project: i.project, date: i.dueDate, ref: { type: 'item', id: i.id }, canComplete: true, canConvert: false, link: ['/psc', 'pm-buddy', 'commitments']
      });
    }
    for (const i of open.filter(x => x.kind === 'commitment' && x.direction === 'owed-to-me' && x.dueDate && daysFromToday(x.dueDate) <= 0)) {
      out.push({
        id: `ins-w-${i.id}`, kind: 'stakeholder-response', severity: daysFromToday(i.dueDate!) < 0 ? 'high' : 'medium',
        title: `Waiting on ${i.stakeholder ?? 'someone'}`,
        message: `${i.title} was due ${relativeDay(i.dueDate).toLowerCase()} and hasn’t arrived. A quick nudge could unblock you.`,
        project: i.project, date: i.dueDate, ref: { type: 'item', id: i.id }, canComplete: true, canConvert: true, link: ['/psc', 'pm-buddy', 'commitments']
      });
    }
    for (const i of open.filter(x => x.kind === 'follow-up' && x.dueDate && daysFromToday(x.dueDate) < 0)) {
      out.push({
        id: `ins-f-${i.id}`, kind: 'stakeholder-response', severity: 'high',
        title: 'Overdue follow-up',
        message: `“${i.title}” slipped — it was due ${relativeDay(i.dueDate).toLowerCase()}.`,
        project: i.project, date: i.dueDate, ref: { type: 'item', id: i.id }, canComplete: true, canConvert: false, link: ['/psc', 'pm-buddy', 'tasks']
      });
    }
    for (const m of s.meetings.filter(x => !x.upcoming)) {
      for (const a of m.actionItems.filter(x => !x.done && !x.taskId)) {
        out.push({
          id: `ins-a-${a.id}`, kind: 'meeting-action', severity: a.dueDate && daysFromToday(a.dueDate) <= 0 ? 'high' : 'medium',
          title: 'Unresolved meeting action',
          message: `${a.owner === ME ? 'You' : a.owner} agreed to “${a.text}” in “${m.title}”${a.dueDate ? ` — due ${relativeDay(a.dueDate).toLowerCase()}` : ''}. It isn’t tracked anywhere yet.`,
          project: m.project, date: a.dueDate ?? m.date, ref: { type: 'meeting-action', id: a.id, meetingId: m.id }, canComplete: true, canConvert: true, link: ['/psc', 'pm-buddy', 'meetings']
        });
      }
      m.questions.forEach(q => {
        out.push({
          id: `ins-q-${m.id}-${slug(q)}`, kind: 'open-question', severity: 'low',
          title: 'Unanswered question',
          message: `“${q}” was raised in “${m.title}” and is still open.`,
          project: m.project, date: m.date, ref: { type: 'meeting-question', id: q, meetingId: m.id }, canComplete: true, canConvert: true, link: ['/psc', 'pm-buddy', 'meetings']
        });
      });
    }
    for (const i of open.filter(x => x.kind !== 'commitment' && x.priority === 'high' && x.dueDate && daysFromToday(x.dueDate) >= 0 && daysFromToday(x.dueDate) <= 2)) {
      out.push({
        id: `ins-d-${i.id}`, kind: 'upcoming-deadline', severity: 'medium',
        title: 'Deadline coming up',
        message: `“${i.title}” is due ${relativeDay(i.dueDate).toLowerCase()}.`,
        project: i.project, date: i.dueDate, ref: { type: 'item', id: i.id }, canComplete: true, canConvert: false, link: ['/psc', 'pm-buddy', 'tasks']
      });
    }
    for (const d of s.ideas.filter(x => x.status === 'new' && x.kind === 'idea')) {
      out.push({
        id: `ins-i-${d.id}`, kind: 'unreviewed-idea', severity: 'low',
        title: 'Idea waiting for review',
        message: `You captured “${d.title}” ${relativeDay(d.createdAt.slice(0, 10)).toLowerCase()} and haven’t reviewed it yet.`,
        project: d.project, date: d.createdAt.slice(0, 10), ref: { type: 'idea', id: d.id }, canComplete: true, canConvert: true, link: ['/psc', 'pm-buddy', 'ideas']
      });
    }

    const order = { high: 0, medium: 1, low: 2 };
    return out
      .filter(x => !s.resolvedInsights.includes(x.id) && !(s.snoozedInsights[x.id] && s.snoozedInsights[x.id] > today()))
      .sort((a, b) => order[a.severity] - order[b.severity] || (a.date ?? '').localeCompare(b.date ?? ''));
  });

  /** Daily briefing (simulated AI): computed from live state so it always matches the other screens. */
  readonly briefing = computed(() => {
    const overdue = this.overdue();
    const meetings = this.todaysMeetings();
    const deadlines = this.upcoming().filter(i => daysFromToday(i.dueDate!) <= 3);
    const commitments = this.active().filter(i => i.kind === 'commitment' && i.direction === 'i-owe');
    const priorities = this.todayPriorities().slice(0, 3);
    const headline = overdue.length
      ? `${overdue.length} thing${overdue.length === 1 ? ' is' : 's are'} overdue — clear ${overdue.length === 1 ? 'it' : 'those'} before your ${meetings[0]?.time ?? 'first'} meeting.`
      : meetings.length
        ? `A calm start: nothing overdue. ${meetings.length} meeting${meetings.length === 1 ? '' : 's'} on your calendar today.`
        : 'Nothing overdue and no meetings — a good day for deep work.';
    const focus = priorities.map((p, i) => `${i + 1}. ${p.title}${p.dueDate ? ` (${relativeDay(p.dueDate).toLowerCase()})` : ''}`);
    const done = this.completedToday();
    const remaining = this.dueToday().length + overdue.length;
    const eod = done.length
      ? `You’ve completed ${done.length} item${done.length === 1 ? '' : 's'} today${remaining ? `; ${remaining} still need attention before you wrap up` : ' and nothing urgent is left — nice work'}.`
      : `Nothing completed yet today. Finishing “${priorities[0]?.title ?? 'your top priority'}” would make the biggest difference.`;
    return { headline, meetings, overdue, deadlines, commitments, focus, eod };
  });

  // ── Items ───────────────────────────────────────────────────────────────

  addItem(input: Partial<BuddyItem> & Pick<BuddyItem, 'title' | 'kind'>, toast = true): BuddyItem {
    const item: BuddyItem = {
      id: uid('i'), priority: 'medium', status: 'pending', owner: input.direction === 'owed-to-me' ? input.stakeholder ?? 'Someone' : ME,
      source: { kind: 'manual' }, createdAt: nowIso(), ...input
    };
    this.patch(s => ({ ...s, items: [item, ...s.items] }));
    if (toast) this.toast('success', `${this.kindLabel(item)} added`);
    return item;
  }

  updateItem(id: string, patch: Partial<BuddyItem>): void {
    this.patch(s => ({ ...s, items: s.items.map(i => (i.id === id ? { ...i, ...patch } : i)) }));
  }

  toggleComplete(id: string): void {
    const item = this.find(id);
    if (!item) return;
    const completing = item.status === 'pending';
    this.updateItem(id, completing ? { status: 'completed', completedAt: nowIso(), snoozedUntil: undefined } : { status: 'pending', completedAt: undefined });
    this.syncMeetingAction(id, completing);
    if (completing) this.toast('success', `Done: ${item.title}`, 'Undo', () => this.toggleComplete(id));
  }

  snooze(id: string, days = 1): void {
    const item = this.find(id);
    if (!item) return;
    const until = isoDay(days);
    this.updateItem(id, { snoozedUntil: until });
    this.toast('info', `Snoozed until ${relativeDay(until).toLowerCase()}`, 'Undo', () => this.updateItem(id, { snoozedUntil: undefined }));
  }

  unsnooze(id: string): void {
    this.updateItem(id, { snoozedUntil: undefined });
  }

  deleteItem(id: string): void {
    const s = this.state();
    const index = s.items.findIndex(i => i.id === id);
    if (index < 0) return;
    const removed = s.items[index];
    this.patch(st => ({ ...st, items: st.items.filter(i => i.id !== id) }));
    this.toast('info', `Deleted “${removed.title}”`, 'Undo', () =>
      this.patch(st => ({ ...st, items: [...st.items.slice(0, index), removed, ...st.items.slice(index)] }))
    );
  }

  isSnoozed(i: BuddyItem): boolean {
    return !!i.snoozedUntil && i.snoozedUntil > today() && i.status === 'pending';
  }

  find(id: string): BuddyItem | undefined {
    return this.state().items.find(i => i.id === id);
  }

  // ── Meetings ────────────────────────────────────────────────────────────

  /** Simulates AI summary + action extraction for manually entered notes. */
  async summarizeNotes(notes: string, participants: string[]) {
    this.thinking.set(true);
    await this.wait(THINK_MS + 300);
    this.thinking.set(false);
    return summarizeMeeting(notes, participants);
  }

  addMeeting(meeting: Omit<BuddyMeeting, 'id'>): BuddyMeeting {
    const m: BuddyMeeting = { ...meeting, id: uid('m') };
    this.patch(s => ({ ...s, meetings: [m, ...s.meetings] }));
    this.toast('success', `Meeting saved — ${m.actionItems.length} action item${m.actionItems.length === 1 ? '' : 's'} captured`);
    return m;
  }

  updateMeeting(id: string, patch: Partial<BuddyMeeting>): void {
    this.patch(s => ({ ...s, meetings: s.meetings.map(m => (m.id === id ? { ...m, ...patch } : m)) }));
  }

  deleteMeeting(id: string): void {
    const s = this.state();
    const index = s.meetings.findIndex(m => m.id === id);
    if (index < 0) return;
    const removed = s.meetings[index];
    this.patch(st => ({ ...st, meetings: st.meetings.filter(m => m.id !== id) }));
    this.toast('info', `Deleted “${removed.title}”`, 'Undo', () =>
      this.patch(st => ({ ...st, meetings: [...st.meetings.slice(0, index), removed, ...st.meetings.slice(index)] }))
    );
  }

  /** Turns a meeting action into a tracked task (or a waiting-on commitment if someone else owns it). */
  convertAction(meetingId: string, actionId: string): BuddyItem | undefined {
    const m = this.state().meetings.find(x => x.id === meetingId);
    const a = m?.actionItems.find(x => x.id === actionId);
    if (!m || !a || a.taskId) return undefined;
    const mine = a.owner === ME;
    const item = this.addItem({
      kind: mine ? 'task' : 'commitment',
      direction: mine ? undefined : 'owed-to-me',
      stakeholder: mine ? undefined : a.owner,
      title: a.text,
      dueDate: a.dueDate ?? isoDay(2),
      project: m.project,
      priority: a.dueDate && daysFromToday(a.dueDate) <= 1 ? 'high' : 'medium',
      source: { kind: 'meeting', refId: m.id, label: m.title }
    }, false);
    this.updateMeeting(m.id, { actionItems: m.actionItems.map(x => (x.id === a.id ? { ...x, taskId: item.id } : x)) });
    this.toast('success', mine ? 'Added to My Tasks' : `Tracking “${a.text}” from ${a.owner}`);
    return item;
  }

  toggleActionDone(meetingId: string, actionId: string): void {
    const m = this.state().meetings.find(x => x.id === meetingId);
    const a = m?.actionItems.find(x => x.id === actionId);
    if (!m || !a) return;
    this.updateMeeting(m.id, { actionItems: m.actionItems.map(x => (x.id === a.id ? { ...x, done: !x.done } : x)) });
    if (a.taskId) {
      const task = this.find(a.taskId);
      if (task && (task.status === 'completed') === !!a.done) this.updateItem(a.taskId, a.done ? { status: 'pending', completedAt: undefined } : { status: 'completed', completedAt: nowIso() });
    }
  }

  // ── Ideas & notes ───────────────────────────────────────────────────────

  addIdea(input: Partial<BuddyIdea> & Pick<BuddyIdea, 'title' | 'kind'>, toast = true): BuddyIdea {
    const idea: BuddyIdea = { id: uid('d'), tags: [], status: 'new', createdAt: nowIso(), source: { kind: 'manual' }, ...input };
    this.patch(s => ({ ...s, ideas: [idea, ...s.ideas] }));
    if (toast) this.toast('success', `${idea.kind === 'idea' ? 'Idea' : idea.kind === 'feedback' ? 'Feedback' : 'Note'} saved`);
    return idea;
  }

  updateIdea(id: string, patch: Partial<BuddyIdea>): void {
    this.patch(s => ({ ...s, ideas: s.ideas.map(d => (d.id === id ? { ...d, ...patch } : d)) }));
  }

  deleteIdea(id: string): void {
    const s = this.state();
    const index = s.ideas.findIndex(d => d.id === id);
    if (index < 0) return;
    const removed = s.ideas[index];
    this.patch(st => ({ ...st, ideas: st.ideas.filter(d => d.id !== id) }));
    this.toast('info', `Deleted “${removed.title}”`, 'Undo', () =>
      this.patch(st => ({ ...st, ideas: [...st.ideas.slice(0, index), removed, ...st.ideas.slice(index)] }))
    );
  }

  ideaToTask(id: string): void {
    const d = this.state().ideas.find(x => x.id === id);
    if (!d) return;
    this.addItem({ kind: 'task', title: `Explore: ${d.title}`, project: d.project, dueDate: isoDay(7), priority: 'medium', source: { kind: 'idea', refId: d.id, label: d.title } }, false);
    this.updateIdea(id, { status: 'promoted' });
    this.toast('success', 'Promoted to a task in My Tasks');
  }

  // ── Conversation (Buddy Home) ───────────────────────────────────────────

  /** Sends a capture or a memory question; Buddy replies after a simulated thinking delay. */
  async send(text: string): Promise<void> {
    const t = text.trim();
    if (!t || this.thinking()) return;
    const user: BuddyMessage = { id: uid('u'), role: 'user', text: t, createdAt: nowIso() };
    const pendingId = uid('b');
    this.patch(s => ({ ...s, messages: [...s.messages, user, { id: pendingId, role: 'buddy', text: '', createdAt: nowIso(), pending: true }] }));
    this.thinking.set(true);
    await this.wait(THINK_MS);
    let reply: Partial<BuddyMessage>;
    if (isQuestion(t)) {
      const memory = answerMemory(t, this.state());
      reply = { text: memory.answer, memory };
    } else {
      const proposals = parseCapture(t);
      reply = { text: proposalsSummary(proposals), proposals };
    }
    this.patch(s => ({ ...s, messages: s.messages.map(m => (m.id === pendingId ? { ...m, ...reply, pending: false, createdAt: nowIso() } : m)) }));
    this.thinking.set(false);
  }

  updateProposal(messageId: string, proposalId: string, patch: Partial<ProposedItem>): void {
    this.patch(s => ({
      ...s,
      messages: s.messages.map(m => (m.id !== messageId ? m : { ...m, proposals: m.proposals?.map(p => (p.id === proposalId ? { ...p, ...patch } : p)) }))
    }));
  }

  confirmProposal(messageId: string, proposalId: string): void {
    const p = this.state().messages.find(m => m.id === messageId)?.proposals?.find(x => x.id === proposalId);
    if (!p || p.state === 'confirmed') return;
    let savedId: string;
    if (p.category === 'idea' || p.category === 'note') {
      const feedback = /\b(customer|user)s?\b/i.test(p.title);
      savedId = this.addIdea({ kind: p.category === 'idea' ? 'idea' : feedback ? 'feedback' : 'note', title: p.title, project: p.project, source: { kind: 'capture', refId: messageId, label: 'Quick capture' } }, false).id;
    } else {
      savedId = this.addItem({
        kind: p.category, title: p.title, dueDate: p.dueDate, priority: p.priority, project: p.project,
        stakeholder: p.stakeholder, direction: p.category === 'commitment' ? p.direction ?? 'i-owe' : undefined,
        source: { kind: 'capture', refId: messageId, label: 'Quick capture' }
      }, false).id;
    }
    this.updateProposal(messageId, proposalId, { state: 'confirmed', savedId });
    const where = p.category === 'idea' || p.category === 'note' ? 'Ideas & Notes' : p.category === 'commitment' ? 'My Commitments' : 'My Tasks';
    this.toast('success', `Saved to ${where}: ${p.title}`, 'Undo', () => {
      if (p.category === 'idea' || p.category === 'note') this.patch(s => ({ ...s, ideas: s.ideas.filter(d => d.id !== savedId) }));
      else this.patch(s => ({ ...s, items: s.items.filter(i => i.id !== savedId) }));
      this.updateProposal(messageId, proposalId, { state: 'proposed', savedId: undefined });
    });
  }

  cancelProposal(messageId: string, proposalId: string): void {
    this.updateProposal(messageId, proposalId, { state: 'cancelled' });
  }

  clearConversation(): void {
    this.patch(s => ({ ...s, messages: buildSeedState().messages }));
  }

  // ── Insights ────────────────────────────────────────────────────────────

  completeInsight(ins: BuddyInsight): void {
    if (ins.ref.type === 'item') this.toggleComplete(ins.ref.id);
    else if (ins.ref.type === 'meeting-action' && ins.ref.meetingId) this.toggleActionDone(ins.ref.meetingId, ins.ref.id);
    else if (ins.ref.type === 'idea') this.updateIdea(ins.ref.id, { status: 'reviewed' });
    else if (ins.ref.type === 'meeting-question' && ins.ref.meetingId) this.setQuestionOpen(ins.ref.meetingId, ins.ref.id, false);
    else this.resolve(ins.id);
    if (ins.ref.type !== 'item') this.toast('success', 'Marked as resolved', 'Undo', () => this.unresolve(ins));
  }

  snoozeInsight(ins: BuddyInsight, days = 1): void {
    const until = isoDay(days);
    this.patch(s => ({ ...s, snoozedInsights: { ...s.snoozedInsights, [ins.id]: until } }));
    this.toast('info', `Snoozed until ${relativeDay(until).toLowerCase()}`, 'Undo', () =>
      this.patch(s => {
        const { [ins.id]: _gone, ...rest } = s.snoozedInsights;
        return { ...s, snoozedInsights: rest };
      })
    );
  }

  convertInsight(ins: BuddyInsight): void {
    if (ins.ref.type === 'meeting-action' && ins.ref.meetingId) {
      this.convertAction(ins.ref.meetingId, ins.ref.id);
      return;
    }
    if (ins.ref.type === 'idea') {
      this.ideaToTask(ins.ref.id);
      return;
    }
    if (ins.ref.type === 'meeting-question' && ins.ref.meetingId) this.setQuestionOpen(ins.ref.meetingId, ins.ref.id, false);
    const title = ins.kind === 'stakeholder-response'
      ? `Nudge ${this.find(ins.ref.id)?.stakeholder ?? 'stakeholder'}: ${this.find(ins.ref.id)?.title ?? ''}`
      : ins.kind === 'open-question'
        ? `Get an answer: ${ins.message.match(/“(.+?)”/)?.[1] ?? 'open question'}`
        : ins.title;
    this.addItem({ kind: ins.kind === 'stakeholder-response' ? 'follow-up' : 'task', title, project: ins.project, dueDate: isoDay(1), priority: ins.severity === 'high' ? 'high' : 'medium', source: { kind: 'insight', refId: ins.id, label: 'What am I missing?' } }, false);
    this.resolve(ins.id);
    this.toast('success', 'Converted to a task in My Tasks');
  }

  // ── Toasts / misc ───────────────────────────────────────────────────────

  toast(type: BuddyToast['type'], text: string, actionLabel?: string, action?: () => void): void {
    const id = ++this.toastSeq;
    this.toasts.update(list => [...list.slice(-2), { id, type, text, actionLabel, action }]);
    window.setTimeout(() => this.dismissToast(id), actionLabel ? 6000 : 3500);
  }

  dismissToast(id: number): void {
    this.toasts.update(list => list.filter(t => t.id !== id));
  }

  runToastAction(t: BuddyToast): void {
    t.action?.();
    this.dismissToast(t.id);
  }

  resetDemo(): void {
    this.state.set(buildSeedState());
    this.save();
    this.toast('info', 'Demo data reset');
  }

  kindLabel(i: Pick<BuddyItem, 'kind' | 'direction'>): string {
    if (i.kind === 'commitment') return i.direction === 'owed-to-me' ? 'Waiting on' : 'Commitment';
    return { task: 'Task', 'follow-up': 'Follow-up', reminder: 'Reminder' }[i.kind];
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private resolve(id: string): void {
    this.patch(s => ({ ...s, resolvedInsights: [...new Set([...s.resolvedInsights, id])] }));
  }

  private unresolve(ins: BuddyInsight): void {
    if (ins.ref.type === 'meeting-action' && ins.ref.meetingId) this.toggleActionDone(ins.ref.meetingId, ins.ref.id);
    else if (ins.ref.type === 'idea') this.updateIdea(ins.ref.id, { status: 'new' });
    else if (ins.ref.type === 'meeting-question' && ins.ref.meetingId) this.setQuestionOpen(ins.ref.meetingId, ins.ref.id, true);
    this.patch(s => ({ ...s, resolvedInsights: s.resolvedInsights.filter(x => x !== ins.id) }));
  }

  /** Answering a question removes it from the meeting; undo puts it back. */
  private setQuestionOpen(meetingId: string, question: string, open: boolean): void {
    const m = this.state().meetings.find(x => x.id === meetingId);
    if (!m) return;
    const has = m.questions.includes(question);
    if (open && !has) this.updateMeeting(m.id, { questions: [...m.questions, question] });
    if (!open && has) this.updateMeeting(m.id, { questions: m.questions.filter(q => q !== question) });
  }

  /** Completing a task that came from a meeting action also ticks the action (and vice versa). */
  private syncMeetingAction(itemId: string, done: boolean): void {
    const s = this.state();
    const m = s.meetings.find(x => x.actionItems.some(a => a.taskId === itemId));
    if (m) this.updateMeeting(m.id, { actionItems: m.actionItems.map(a => (a.taskId === itemId ? { ...a, done } : a)) });
  }

  private patch(fn: (s: BuddyState) => BuddyState): void {
    this.state.update(fn);
    this.save();
  }

  private save(): void {
    try {
      // Pending (thinking) messages are transient — never persist them.
      const s = this.state();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, messages: s.messages.filter(m => !m.pending).slice(-60) }));
    } catch { /* storage unavailable — keep in-memory state */ }
  }

  private load(): BuddyState {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (raw && raw.version === BUDDY_STATE_VERSION && Array.isArray(raw.items)) return raw as BuddyState;
    } catch { /* fall through to seed */ }
    return buildSeedState();
  }

  private wait(ms: number): Promise<void> {
    return new Promise(r => window.setTimeout(r, ms));
  }
}
