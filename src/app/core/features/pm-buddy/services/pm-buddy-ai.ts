import {
  BuddyIdea, BuddyItem, BuddyMeeting, BuddyPriority, BuddyState, MeetingActionItem, MemoryAnswer, MemoryReference, ProposedItem
} from '../models/pm-buddy.models';
import { CLIENTS, ME, PROJECT_KEYWORDS, STAKEHOLDERS } from '../data/pm-buddy.mock-data';
import { daysFromToday, isoDay, relativeDay } from '../data/pm-buddy.dates';

/**
 * Deterministic, rule-based "AI" for the PM Buddy POC. No network calls — every result is derived
 * from the input text and local state, so the demo behaves the same way every time.
 */

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const ACTION_VERBS = 'send|share|discuss|follow|remind|call|email|ping|review|prepare|draft|write|schedule|book|update|check|ask|create|fix|sync|meet|finish|plan|get|talk|present|confirm|chase|nudge';

let seq = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

// ── Dates ─────────────────────────────────────────────────────────────────

interface DateHit { offset: number; match: RegExp }

function findDate(text: string): DateHit | null {
  const lower = text.toLowerCase();
  const rules: [RegExp, (m: RegExpMatchArray) => number][] = [
    [/\b(?:by\s+|on\s+)?(?:the\s+)?day after tomorrow\b/i, () => 2],
    [/\b(?:by\s+)?(?:today|tonight|eod|end of (?:the )?day)\b/i, () => 0],
    [/\b(?:by\s+)?tomorrow\b/i, () => 1],
    [/\b(?:by\s+)?next week\b/i, () => 7],
    [/\bin\s+(\d{1,2})\s+days?\b/i, m => Number(m[1])],
    [/\b(?:by\s+|on\s+|this\s+|next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i, m => {
      const target = WEEKDAYS.indexOf(m[1].toLowerCase());
      const now = new Date().getDay();
      let diff = (target - now + 7) % 7;
      if (diff === 0) diff = 7;
      if (/next\s+/i.test(m[0]) && diff < 7) diff += 7;
      return diff;
    }]
  ];
  for (const [re, fn] of rules) {
    const m = lower.match(re);
    if (m) return { offset: fn(m), match: re };
  }
  return null;
}

// ── Classification ────────────────────────────────────────────────────────

function findProject(text: string): string | undefined {
  const lower = text.toLowerCase();
  const key = Object.keys(PROJECT_KEYWORDS).find(k => new RegExp(`\\b${k}\\b`).test(lower));
  return key ? PROJECT_KEYWORDS[key] : undefined;
}

function findStakeholder(text: string): string | undefined {
  const m = text.match(/\b(?:to|with|from|for|by|ask|ping|chase|nudge)\s+(?:the\s+)?([A-Za-z]+(?:\s+team)?)/gi) ?? [];
  for (const hit of m) {
    const name = hit.replace(/^\w+\s+(?:the\s+)?/i, '').trim();
    const known = STAKEHOLDERS.find(s => s.toLowerCase() === name.toLowerCase());
    if (known) return known;
    if (/^[A-Z][a-z]{2,}$/.test(name) && !findProject(name) && !/^(The|My|Our|API|PRD)$/.test(name)) return name;
  }
  return undefined;
}

function findPriority(text: string): BuddyPriority | undefined {
  if (/\b(urgent|asap|critical|important|high priority|blocker|top priority)\b/i.test(text)) return 'high';
  if (/\b(low priority|someday|whenever|nice to have|no rush)\b/i.test(text)) return 'low';
  return undefined;
}

function cleanTitle(raw: string, dateRe?: RegExp): string {
  let t = raw;
  if (dateRe) t = t.replace(dateRe, ' ');
  t = t
    .replace(/^\s*(?:idea|note|fyi|todo|task|reminder)\s*[:\-–]\s*/i, '')
    .replace(/^\s*(?:also|then|and|plus)\s+/i, '')
    .replace(/^\s*(?:waiting (?:for|on)|expecting)\s+/i, '')
    .replace(/^\s*(?:please\s+)?(?:remind me to|remember to|don'?t forget to|i need to|i have to|i must|i should|i'?ll|i will|we need to|need to|make sure (?:i|to)|let'?s)\s+/i, '')
    .replace(/\b(urgent|asap|high priority|low priority|no rush)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.;:–-]+|[\s,.;:!–-]+$/g, '')
    .trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : raw.trim();
}

function categorize(clause: string): Pick<ProposedItem, 'category' | 'direction'> {
  if (/^\s*(?:idea\b|what if\b|maybe we (?:could|should)\b|we could\b|it would be (?:nice|great)\b)/i.test(clause) || /\bidea\s*:/i.test(clause)) {
    return { category: 'idea' };
  }
  if (/^\s*(?:note|fyi|noted|observation)\b/i.test(clause) || /\b(customer|user)s? (?:said|asked|told|complained|mentioned)\b/i.test(clause)) {
    return { category: 'note' };
  }
  if (/\b(waiting (?:for|on)|expecting|owes? me)\b/i.test(clause)) return { category: 'commitment', direction: 'owed-to-me' };
  if (/\bremind me\b|\bremember to\b|\bdon'?t forget\b/i.test(clause)) return { category: 'reminder' };
  if (/\b(follow[\s-]?up|ping|chase|nudge|check (?:in )?with|check back)\b/i.test(clause)) return { category: 'follow-up' };
  if (/\b(promised?|committed)\b/i.test(clause) || /\b(send|share|deliver|give|get back to|hand over)\b.*\b(?:to|with)\s+(?:the\s+)?[A-Za-z]+/i.test(clause)) {
    return { category: 'commitment', direction: 'i-owe' };
  }
  return { category: 'task' };
}

/** Splits a brain dump into clauses: sentences, ";", "and then / and also", and "and <action verb>". */
const CLAUSE_SPLIT = new RegExp(
  String.raw`(?<=[.!?])\s+|;\s*|\n+|\s+(?:and then|and also)\s+|\s+and\s+(?=(?:then\s+)?(?:${ACTION_VERBS})\b)`,
  'i'
);

function splitClauses(text: string): string[] {
  return text
    .split(CLAUSE_SPLIT)
    .map(s => s.trim())
    .filter(s => s.replace(/[\s.,;!?]/g, '').length > 2);
}

export function isQuestion(text: string): boolean {
  const t = text.trim();
  return /\?\s*$/.test(t) || /^(what|which|who|when|where|did|do|does|have|has|how|show me|list|find|any)\b/i.test(t);
}

/** Turns a brain dump into editable proposals (tasks, commitments, follow-ups, reminders, ideas, notes). */
export function parseCapture(text: string): ProposedItem[] {
  const clauses = splitClauses(text);
  // A date (or urgency) in the first clause sets context for the rest: "Tomorrow discuss X and send Y".
  const leadingDate = clauses.length ? findDate(clauses[0]) : null;
  const singlePriority = clauses.length === 1 ? findPriority(text) : undefined;
  return clauses.map(clause => {
    const own = findDate(clause);
    const date = own ?? leadingDate;
    const { category, direction } = categorize(clause);
    const isNote = category === 'idea' || category === 'note';
    const dueDate = date && !isNote ? isoDay(date.offset) : undefined;
    const stakeholder = isNote ? undefined : findStakeholder(clause);
    const explicit = findPriority(clause) ?? singlePriority;
    const priority: BuddyPriority = explicit
      ?? (category === 'commitment' && direction === 'i-owe' && dueDate && daysFromToday(dueDate) <= 1 ? 'high' : category === 'reminder' ? 'medium' : 'medium');
    return {
      id: uid('p'),
      category,
      direction,
      title: cleanTitle(clause, own?.match ?? (date ? date.match : undefined)),
      dueDate,
      priority,
      project: findProject(clause) ?? findProject(text),
      stakeholder,
      state: 'proposed'
    } satisfies ProposedItem;
  });
}

export function proposalsSummary(proposals: ProposedItem[]): string {
  if (!proposals.length) return 'I couldn’t find anything actionable in that — try adding what needs to happen and when.';
  const label = (p: ProposedItem) => (p.category === 'follow-up' ? 'follow-up' : p.category);
  if (proposals.length === 1) {
    const c = label(proposals[0]);
    return `I’ve identified ${/^[aeiou]/.test(c) ? 'an' : 'a'} ${c}. Review it below and confirm.`;
  }
  const counts = proposals.reduce<Record<string, number>>((acc, p) => ((acc[label(p)] = (acc[label(p)] ?? 0) + 1), acc), {});
  const parts = Object.entries(counts).map(([k, n]) => `${n} ${k}${n > 1 ? 's' : ''}`);
  return `I’ve identified ${proposals.length} items — ${parts.join(', ')}. Review and confirm what you want to keep.`;
}

// ── Personal Product Memory ───────────────────────────────────────────────

const ALIASES: Record<string, string[]> = {
  design: ['Priya', 'Design team'],
  engineering: ['Marcus', 'Anita', 'Mahesh', 'Engineering'],
  legal: ['Legal'],
  security: ['InfoSec'],
  infosec: ['InfoSec'],
  finance: ['Rachel']
};

const itemRef = (i: BuddyItem): MemoryReference => ({
  label: i.title, date: i.dueDate ?? i.createdAt.slice(0, 10), project: i.project,
  kind: i.kind === 'commitment' ? 'commitment' : 'task', link: ['/psc', 'pm-buddy', i.kind === 'commitment' ? 'commitments' : 'tasks']
});
const meetingRef = (m: BuddyMeeting): MemoryReference => ({
  label: m.title, date: m.date, project: m.project, kind: 'meeting', link: ['/psc', 'pm-buddy', 'meetings']
});
const ideaRef = (d: BuddyIdea): MemoryReference => ({
  label: d.title, date: d.createdAt.slice(0, 10), project: d.project, kind: d.kind === 'feedback' ? 'feedback' : 'idea', link: ['/psc', 'pm-buddy', 'ideas']
});
const due = (i: BuddyItem) => (i.dueDate ? ` — due ${relativeDay(i.dueDate).toLowerCase()}` : '');

function peopleIn(q: string): string[] {
  const lower = q.toLowerCase();
  const direct = STAKEHOLDERS.filter(s => lower.includes(s.toLowerCase()));
  const aliased = Object.entries(ALIASES).filter(([k]) => lower.includes(k)).flatMap(([, v]) => v);
  return [...new Set([...direct, ...aliased])];
}

export function answerMemory(question: string, state: BuddyState): MemoryAnswer {
  const q = question.toLowerCase();
  const people = peopleIn(question);
  const pastMeetings = state.meetings.filter(m => !m.upcoming).sort((a, b) => b.date.localeCompare(a.date));
  // Client accounts (KPMG, SFI…): anything on a client project or with the client itself counts as "with the client".
  const clients = CLIENTS.filter(c => new RegExp(`\\b${c.toLowerCase()}\\b`).test(q));
  const onClient = (project?: string, who?: string) => clients.some(c => (project ?? '').startsWith(c) || who === c);
  const matchesWho = (who?: string, project?: string) => (!people.length && !clients.length) || people.includes(who ?? '') || onClient(project, who);

  // "What did I promise Mahesh?"
  if (/\b(promise|promised|owe|committed|commitments?)\b/.test(q) && !/\bowe me\b/.test(q)) {
    const mine = state.items.filter(i => i.kind === 'commitment' && i.direction === 'i-owe' && matchesWho(i.stakeholder, i.project));
    const open = mine.filter(i => i.status === 'pending');
    const done = mine.filter(i => i.status === 'completed');
    const who = clients[0] ?? people[0] ?? 'your stakeholders';
    if (!mine.length) return { answer: `I don’t have any commitments to ${who} on record.`, bullets: [], references: [] };
    const meetings = state.meetings.filter(m => mine.some(i => i.source.refId === m.id));
    return {
      answer: `You have ${open.length} open commitment${open.length === 1 ? '' : 's'} to ${who}${done.length ? ` (and ${done.length} already delivered)` : ''}.`,
      bullets: [...open.map(i => `${i.title}${due(i)}${i.dueDate && daysFromToday(i.dueDate) < 0 ? ' · overdue' : ''}`), ...done.map(i => `✓ ${i.title}`)],
      references: [...mine.map(itemRef), ...meetings.map(meetingRef)]
    };
  }

  // "What am I waiting for from the design team?"
  if (/\b(waiting|owe me|owed|expecting|pending from)\b/.test(q)) {
    const owed = state.items.filter(i => i.kind === 'commitment' && i.direction === 'owed-to-me' && i.status === 'pending' && matchesWho(i.stakeholder, i.project));
    const actions = pastMeetings.flatMap(m => m.actionItems.filter(a => !a.done && !a.taskId && a.owner !== ME && matchesWho(a.owner, m.project)).map(a => ({ a, m })));
    if (!owed.length && !actions.length) return { answer: 'Nothing outstanding — nobody owes you anything right now.', bullets: [], references: [] };
    return {
      answer: `You’re waiting on ${owed.length + actions.length} thing${owed.length + actions.length === 1 ? '' : 's'}${clients.length ? ` from ${clients.join(' / ')}` : people.length ? ` from ${people.slice(0, 2).join(' / ')}` : ''}.`,
      bullets: [...owed.map(i => `${i.title} (${i.stakeholder})${due(i)}`), ...actions.map(({ a, m }) => `${a.text} — ${a.owner}, from “${m.title}”`)],
      references: [...owed.map(itemRef), ...[...new Set(actions.map(x => x.m))].map(meetingRef)]
    };
  }

  // "What did we discuss in the last engineering meeting?"
  if (/\b(meeting|discuss|discussed|sync|standup|review|call)\b/.test(q)) {
    const topic = ['kpmg', 'sfi', 'esg', 'claims', 'audit', 'portal', 'engineering', 'design', 'sprint', 'stakeholder', 'pricing', 'api', 'checkout'].find(k => q.includes(k));
    const m = pastMeetings.find(x => !topic || x.title.toLowerCase().includes(topic) || x.summary.toLowerCase().includes(topic)) ?? pastMeetings[0];
    if (!m) return { answer: 'I don’t have any meeting notes yet.', bullets: [], references: [] };
    return {
      answer: `In “${m.title}” (${relativeDay(m.date).toLowerCase()}) — ${m.summary}`,
      bullets: [...m.decisions.map(d => `Decision: ${d}`), ...m.actionItems.map(a => `Action: ${a.text} (${a.owner})${a.done ? ' ✓' : ''}`)],
      references: [meetingRef(m)]
    };
  }

  // "Which features are awaiting approval?"
  if (/\b(approval|approve|sign[\s-]?off|awaiting)\b/.test(q)) {
    const pending = state.items.filter(i => i.status === 'pending' && /approv|sign-?off/i.test(i.title));
    const ideas = state.ideas.filter(d => d.kind === 'idea' && d.status === 'new');
    return {
      answer: `${pending.length} item${pending.length === 1 ? ' is' : 's are'} awaiting approval, and ${ideas.length} new idea${ideas.length === 1 ? ' hasn’t' : 's haven’t'} been reviewed yet.`,
      bullets: [...pending.map(i => `${i.title}${i.stakeholder ? ` — with ${i.stakeholder}` : ''}${due(i)}`), ...ideas.map(d => `Idea awaiting review: ${d.title}`)],
      references: [...pending.map(itemRef), ...ideas.map(ideaRef)]
    };
  }

  // "What customer feedback did I capture?"
  if (/\b(feedback|customers?|users? said|complain)/.test(q)) {
    const fb = state.ideas.filter(d => d.kind === 'feedback' || (d.kind === 'note' && /customer|user/i.test(`${d.title} ${d.body ?? ''}`)));
    if (!fb.length) return { answer: 'You haven’t captured any customer feedback yet.', bullets: [], references: [] };
    return {
      answer: `You’ve captured ${fb.length} piece${fb.length === 1 ? '' : 's'} of customer feedback.`,
      bullets: fb.map(d => `${d.title}${d.project ? ` (${d.project})` : ''}${d.body ? ` — ${d.body}` : ''}`),
      references: fb.map(ideaRef)
    };
  }

  // "What is pending for SFI?" — a client account overview.
  if (clients.length) {
    const open = state.items.filter(i => i.status === 'pending' && onClient(i.project, i.stakeholder))
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
    const next = state.meetings.filter(m => m.upcoming && onClient(m.project)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const late = open.filter(i => i.dueDate && daysFromToday(i.dueDate) < 0).length;
    const name = clients.join(' & ');
    if (!open.length && !next.length) return { answer: `Nothing open for ${name} right now.`, bullets: [], references: [] };
    return {
      answer: `${name}: ${open.length} open item${open.length === 1 ? '' : 's'}${late ? ` (${late} overdue)` : ''}${next[0] ? ` — next up is “${next[0].title}” ${relativeDay(next[0].date).toLowerCase()} at ${next[0].time}` : ''}.`,
      bullets: open.map(i => `${i.kind === 'commitment' ? (i.direction === 'owed-to-me' ? `Waiting on ${i.stakeholder}: ` : `Promised ${i.stakeholder}: `) : ''}${i.title}${due(i)}${i.dueDate && daysFromToday(i.dueDate) < 0 ? ' · overdue' : ''}`),
      references: [...open.map(itemRef), ...next.map(meetingRef)]
    };
  }

  // Fallback: keyword search across everything.
  const words = q.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !['what', 'which', 'when', 'where', 'did', 'about', 'have', 'there', 'that', 'with', 'from', 'this', 'show', 'find', 'list'].includes(w));
  const score = (s: string) => words.reduce((n, w) => n + (s.toLowerCase().includes(w) ? 1 : 0), 0);
  const hits = [
    ...state.items.map(i => ({ s: score(`${i.title} ${i.notes ?? ''} ${i.stakeholder ?? ''} ${i.project ?? ''}`), ref: itemRef(i), text: `${i.title}${due(i)}` })),
    ...state.meetings.map(m => ({ s: score(`${m.title} ${m.summary} ${m.decisions.join(' ')}`), ref: meetingRef(m), text: `${m.title} — ${relativeDay(m.date).toLowerCase()}` })),
    ...state.ideas.map(d => ({ s: score(`${d.title} ${d.body ?? ''} ${d.tags.join(' ')}`), ref: ideaRef(d), text: d.title }))
  ].filter(h => h.s > 0).sort((a, b) => b.s - a.s).slice(0, 5);
  if (!hits.length) {
    return { answer: 'I couldn’t find anything about that yet. Capture it and I’ll remember it for next time.', bullets: [], references: [] };
  }
  return { answer: `Here’s what I found in your memory:`, bullets: hits.map(h => h.text), references: hits.map(h => h.ref) };
}

// ── Meeting notes → summary / decisions / actions / questions ─────────────

export interface MeetingExtraction {
  summary: string;
  decisions: string[];
  actionItems: MeetingActionItem[];
  questions: string[];
}

export function summarizeMeeting(notes: string, participants: string[]): MeetingExtraction {
  const lines = notes
    .split(/\n|(?<=[.!?])\s+/)
    .map(l => l.replace(/^\s*[-*•\d.)]+\s*/, '').trim())
    .filter(l => l.length > 3);
  const decisions: string[] = [];
  const questions: string[] = [];
  const actionItems: MeetingActionItem[] = [];
  const other: string[] = [];
  for (const line of lines) {
    if (/\?\s*$/.test(line) || /^(open question|question|q)\s*[:\-]/i.test(line)) {
      questions.push(line.replace(/^(open question|question|q)\s*[:\-]\s*/i, ''));
    } else if (/\b(decided|agreed|decision|we will go with|approved|chose|going with)\b/i.test(line)) {
      decisions.push(cleanTitle(line.replace(/^(we\s+)?(decided|agreed)\s+(to|that|on)\s+/i, '')));
    } else if (/\b(action|todo|to do|will|needs? to|follow[\s-]?up|send|share|owner|by (monday|tuesday|wednesday|thursday|friday|tomorrow))\b/i.test(line)) {
      const ownerMatch = line.match(/^([A-Z][a-z]+)\s+(?:to|will|should|needs to)\b/);
      const owner = ownerMatch && (participants.includes(ownerMatch[1]) || STAKEHOLDERS.includes(ownerMatch[1])) ? ownerMatch[1] : /\b(i|me|I'll|I will)\b/.test(line) ? ME : ownerMatch?.[1] ?? ME;
      const date = findDate(line);
      actionItems.push({
        id: uid('a'),
        text: cleanTitle(line.replace(/^(action( item)?|todo)\s*[:\-]\s*/i, '').replace(/^[A-Z][a-z]+\s+(to|will|should|needs to)\s+/, ''), date?.match),
        owner,
        dueDate: date ? isoDay(date.offset) : undefined
      });
    } else {
      other.push(line);
    }
  }
  const summarySource = other.length ? other : lines;
  const summary = summarySource.slice(0, 3).join(' ').replace(/\s+/g, ' ').trim()
    || 'Discussion captured. No summary-worthy statements found — add a few sentences of context next time.';
  return { summary, decisions, actionItems, questions };
}
