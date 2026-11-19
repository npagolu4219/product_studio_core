import { Injectable, computed, inject, signal } from '@angular/core';
import { d } from '../utils/date-utils';
import { PscMockDataService } from './psc-mock-data.service';
import {
  ContextSource, KnowledgeKind, KnowledgeRef, MeetingSummary, MemoryEntry, MemoryType, SourceType, WithProject
} from '../models/product-memory.models';

const STORAGE_KEY = 'psc.product-memory.v1';
/** Bump when the seed shape changes so old saves are replaced instead of half-migrated. */
const STORAGE_VERSION = 1;

/** Flat brand colour per seeded project (Product Memory's original palette). */
const PROJECT_COLORS: Record<string, string> = { p1: '#7C3AED', p2: '#0891B2', p3: '#059669', p4: '#D97706', p5: '#DC2626' };
const FALLBACK_COLORS = ['#2563EB', '#E25292', '#0284C7', '#7C3AED', '#059669'];

export const KNOWLEDGE_KIND_META: Record<KnowledgeKind, { label: string; plural: string; icon: string; color: string }> = {
  decision: { label: 'Decision', plural: 'Decisions', icon: 'check-circle', color: '#059669' },
  insight: { label: 'Insight', plural: 'Insights', icon: 'lightbulb', color: '#D97706' },
  context: { label: 'Context', plural: 'Context', icon: 'book-open', color: '#7C3AED' },
  meeting: { label: 'Meeting', plural: 'Meetings', icon: 'users', color: '#2563EB' },
  source: { label: 'Source', plural: 'Sources', icon: 'plug', color: '#0F766E' }
};

export const SOURCE_TYPES: { value: SourceType; label: string; icon: string; color: string; hint: string }[] = [
  { value: 'confluence', label: 'Confluence', icon: 'book-open', color: '#172B4D', hint: 'Ingests pages, PRDs and meeting notes as Context entries' },
  { value: 'sharepoint', label: 'SharePoint', icon: 'folder-open', color: '#0078D4', hint: 'Ingests Word docs, Excel and PowerPoint as Context entries' },
  { value: 'github', label: 'GitHub', icon: 'github', color: '#24292F', hint: 'Ingests ADRs, READMEs and closed issues as Decision & Insight entries' }
];

interface MemoryState {
  version: number;
  entries: MemoryEntry[];
  meetings: MeetingSummary[];
  sources: ContextSource[];
}

/**
 * Single source of truth for Product Memory (frontend-only, persisted to localStorage).
 * The Product Memory page manages it; Home offers the same items as Knowledge for a chat.
 */
@Injectable({ providedIn: 'root' })
export class ProductMemoryService {
  private readonly projects = inject(PscMockDataService);
  private readonly state = signal<MemoryState>(this.load());

  readonly entries = computed<(MemoryEntry & WithProject)[]>(() => this.state().entries.map(e => ({ ...e, ...this.projectInfo(e.projectId) })));
  readonly meetings = computed<(MeetingSummary & WithProject)[]>(() => this.state().meetings.map(m => ({ ...m, ...this.projectInfo(m.projectId) })));
  readonly sources = computed<(ContextSource & WithProject)[]>(() => this.state().sources.map(s => ({ ...s, ...this.projectInfo(s.projectId) })));

  /** Everything a chat can use as knowledge, newest first (pinned entries float up in pickers). */
  readonly knowledge = computed<KnowledgeRef[]>(() => {
    const entries: KnowledgeRef[] = this.entries().map(e => ({
      id: e.id, kind: e.type, title: e.title, detail: e.summary, projectId: e.projectId,
      project: e.project, projectColor: e.projectColor, pinned: !!e.pinned, updatedAt: e.createdAt
    }));
    const meetings: KnowledgeRef[] = this.meetings().map(m => ({
      id: m.id, kind: 'meeting', title: m.title,
      detail: `${m.keyDecisions.length} decisions · ${m.actionItems.length} action items · ${m.attendees.length} attendees`,
      projectId: m.projectId, project: m.project, projectColor: m.projectColor, pinned: false, updatedAt: m.date
    }));
    const sources: KnowledgeRef[] = this.sources().map(s => ({
      id: s.id, kind: 'source', title: s.name,
      detail: `${SOURCE_TYPES.find(t => t.value === s.type)?.label ?? s.type} · ${s.docsIngested} docs ingested`,
      projectId: s.projectId, project: s.project, projectColor: s.projectColor, pinned: false,
      unavailable: s.status === 'error' ? 'Auth error — reconnect it in Product Memory' : s.status === 'disconnected' ? 'Disconnected' : undefined,
      updatedAt: s.lastSync ?? ''
    }));
    return [...entries, ...meetings, ...sources].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });

  /** Items to pre-select when a chat is scoped to a project: all of its usable memory, most useful first. */
  defaultsFor(projectId: string | null): string[] {
    if (!projectId) return [];
    // Most useful first: pinned, then decisions → insights → context → meetings → whole sources.
    const order: KnowledgeKind[] = ['decision', 'insight', 'context', 'meeting', 'source'];
    return this.knowledge()
      .filter(k => k.projectId === projectId && !k.unavailable)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || order.indexOf(a.kind) - order.indexOf(b.kind))
      .map(k => k.id);
  }

  resolve(ids: string[]): KnowledgeRef[] {
    const all = this.knowledge();
    return ids.map(id => all.find(k => k.id === id)).filter((k): k is KnowledgeRef => !!k);
  }

  /** Short label used in prompts, replies and the generated artifact: "Decision — Adopt Stripe …". */
  label(k: KnowledgeRef): string {
    return `${KNOWLEDGE_KIND_META[k.kind].label} — ${k.title}`;
  }

  // ── Mutations (Product Memory page) ──
  addEntry(input: { type: MemoryType; title: string; summary: string; projectId: string; tags: string[]; pinned: boolean }): MemoryEntry {
    const entry: MemoryEntry = {
      id: `m${Date.now().toString(36)}`, ...input, createdAt: d(0), author: 'Me', authorInitials: 'ME'
    };
    this.patch(s => ({ ...s, entries: [entry, ...s.entries] }));
    return entry;
  }

  togglePin(id: string): void {
    this.patch(s => ({ ...s, entries: s.entries.map(e => (e.id === id ? { ...e, pinned: !e.pinned } : e)) }));
  }

  addSource(input: { type: SourceType; name: string; url: string; projectId: string }): ContextSource {
    const source: ContextSource = {
      id: `cs${Date.now().toString(36)}`, ...input, status: 'connected', lastSync: new Date().toISOString(), docsIngested: 0, entriesCreated: 0
    };
    this.patch(s => ({ ...s, sources: [...s.sources, source] }));
    return source;
  }

  /** Re-sync also repairs an errored source (the user re-authenticated). */
  syncSource(id: string): void {
    this.patch(s => ({
      ...s,
      sources: s.sources.map(x => x.id !== id ? x : {
        ...x, status: 'connected', lastSync: new Date().toISOString(),
        docsIngested: x.docsIngested + Math.floor(Math.random() * 3) + 1,
        entriesCreated: x.entriesCreated + Math.floor(Math.random() * 2) + 1
      })
    }));
  }

  removeSource(id: string): void {
    this.patch(s => ({ ...s, sources: s.sources.filter(x => x.id !== id) }));
  }

  /** Project options for pickers (id + name), from the shared project store. */
  projectOptions(): { id: string; name: string }[] {
    return this.projects.projects.map(p => ({ id: p.id, name: p.name }));
  }

  projectInfo(projectId: string): WithProject {
    const p = this.projects.findProject(projectId);
    if (!p) return { project: 'General', projectColor: '#6B7280' };
    let color = PROJECT_COLORS[p.id];
    if (!color) {
      let h = 0;
      for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      color = FALLBACK_COLORS[h % FALLBACK_COLORS.length];
    }
    return { project: p.name, projectColor: color };
  }

  // ── Internals ──
  private patch(fn: (s: MemoryState) => MemoryState): void {
    this.state.update(fn);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state())); } catch { /* keep in memory */ }
  }

  private load(): MemoryState {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (raw?.version === STORAGE_VERSION && Array.isArray(raw.entries)) return raw;
    } catch { /* fall through to seed */ }
    return seed();
  }
}

function seed(): MemoryState {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000).toISOString();
  return {
    version: STORAGE_VERSION,
    entries: [
      { id: 'm1', type: 'decision', title: 'Adopt Stripe as primary payment processor', summary: 'Stripe selected over Braintree and Adyen. Reduces integration effort by 60%. Approved by Sarah Chen, Marcus Rivera, and CFO on Jan 13.', projectId: 'p1', tags: ['payment', 'architecture', 'vendor'], createdAt: d(2), author: 'Sarah Chen', authorInitials: 'SC', pinned: true },
      { id: 'm2', type: 'insight', title: 'Mobile checkout abandonment at 68% on payment step', summary: 'Analytics show 68% of mobile users abandon at the payment step. Root cause: too many form fields and no saved payment methods. Competitor Shopify has 3-step checkout.', projectId: 'p1', tags: ['analytics', 'mobile', 'UX'], createdAt: d(3), author: 'Priya Nair', authorInitials: 'PN', pinned: true },
      { id: 'm3', type: 'context', title: 'FHIR R4 mandated for all patient data exchange', summary: 'FDA 21st Century Cures Act requires FHIR R4 compliance. Enables EHR integration with Epic, Cerner, Allscripts. Non-negotiable for launch.', projectId: 'p2', tags: ['compliance', 'FDA', 'architecture'], createdAt: d(26), author: 'Dr. James Park', authorInitials: 'JP', pinned: false },
      { id: 'm4', type: 'meeting', title: 'Q2 Roadmap Planning — Aava Commerce', summary: 'Agreed to prioritize checkout optimization over search redesign. Multi-currency deferred to Phase 2. Biometric checkout added to backlog pending security review.', projectId: 'p1', tags: ['roadmap', 'Q2', 'planning'], createdAt: d(1), author: 'Sarah Chen', authorInitials: 'SC', pinned: false },
      { id: 'm5', type: 'insight', title: 'FinFlow NPS dropped 3 points — billing confusion', summary: 'NPS fell from 55 to 52. Exit surveys cite confusing billing dashboard as top complaint. 34% of support tickets relate to invoice queries.', projectId: 'p3', tags: ['NPS', 'feedback', 'billing'], createdAt: d(5), author: 'Rachel Kim', authorInitials: 'RK', pinned: false },
      { id: 'm6', type: 'decision', title: 'Defer multi-currency to Phase 2', summary: 'Multi-currency adds 6 weeks of effort. Q2 deadline is fixed. 94% of users are in USD/EUR/GBP. Approved by Product Board Jan 14.', projectId: 'p1', tags: ['scope', 'phase-2', 'i18n'], createdAt: d(1), author: 'Sarah Chen', authorInitials: 'SC', pinned: false },
      { id: 'm7', type: 'context', title: 'EduPath target audience: K-12 teachers in US public schools', summary: 'Primary persona is a 35-45 year old teacher with limited tech literacy. Must work on Chromebooks. Offline mode is a hard requirement for rural schools.', projectId: 'p4', tags: ['persona', 'requirements', 'offline'], createdAt: d(6), author: 'Carlos Mendez', authorInitials: 'CM', pinned: false },
      { id: 'm8', type: 'insight', title: 'LogiTrack stockout rate reduced 62% post-launch', summary: 'Automated reordering reduced stockout rate from 1.05% to 0.4%. CSAT improved to 4.7/5. Orders automated at 94%. Key success: predictive disruption alerts.', projectId: 'p5', tags: ['adoption', 'KPI', 'success'], createdAt: d(10), author: 'Fatima Al-Hassan', authorInitials: 'FA', pinned: false }
    ],
    meetings: [
      {
        id: 'mt1', title: 'Q2 Roadmap Planning', date: d(1), duration: '90 min',
        attendees: ['Sarah Chen', 'Marcus Rivera', 'Priya Nair', 'Tom Walsh'],
        keyDecisions: ['Checkout optimization is Q2 priority #1', 'Multi-currency deferred to Phase 2', 'Biometric checkout added to backlog'],
        actionItems: [
          { owner: 'Marcus Rivera', task: 'Spike on Stripe BNPL integration', due: d(-3) },
          { owner: 'Priya Nair', task: 'Wireframes for 3-step checkout', due: d(-2) },
          { owner: 'Sarah Chen', task: 'Update PRD with scope changes', due: d(0) }
        ],
        projectId: 'p1'
      },
      {
        id: 'mt2', title: 'Sprint 4 Planning — HealthSync', date: d(2), duration: '60 min',
        attendees: ['Dr. James Park', 'Anita Sharma', 'Leo Zhang'],
        keyDecisions: ['Apple Watch support added to Sprint 4', 'SpO₂ bug is P0 — must fix before demo', 'FHIR R4 compliance checklist signed off'],
        actionItems: [
          { owner: 'Leo Zhang', task: 'Fix SpO₂ drop on poor network', due: d(0) },
          { owner: 'Anita Sharma', task: 'WatchOS pairing flow implementation', due: d(-5) },
          { owner: 'Dr. James Park', task: 'Schedule FDA compliance review', due: d(-3) }
        ],
        projectId: 'p2'
      },
      {
        id: 'mt3', title: 'FinFlow NPS Review', date: d(5), duration: '45 min',
        attendees: ['Rachel Kim', 'David Osei', 'Nina Patel'],
        keyDecisions: ['Billing dashboard redesign added to Q1 backlog', 'Support ticket analysis to be shared with UX team'],
        actionItems: [
          { owner: 'Nina Patel', task: 'UX audit of billing dashboard', due: d(-2) },
          { owner: 'David Osei', task: 'Export support ticket categories', due: d(2) }
        ],
        projectId: 'p3'
      }
    ],
    sources: [
      { id: 'cs1', type: 'confluence', name: 'Confluence — Aava Commerce', url: 'https://aava.atlassian.net/wiki', status: 'connected', lastSync: hoursAgo(1), docsIngested: 14, entriesCreated: 6, projectId: 'p1' },
      { id: 'cs2', type: 'github', name: 'GitHub — aava-commerce', url: 'https://github.com/aava/aava-commerce', status: 'connected', lastSync: hoursAgo(2), docsIngested: 8, entriesCreated: 3, projectId: 'p1' },
      { id: 'cs3', type: 'sharepoint', name: 'SharePoint — HealthSync Docs', url: 'https://aava.sharepoint.com/sites/healthsync', status: 'error', lastSync: hoursAgo(48), docsIngested: 5, entriesCreated: 2, projectId: 'p2' }
    ]
  };
}
