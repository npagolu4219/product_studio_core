import { Injectable, inject } from '@angular/core';
import { PscMockDataService } from './psc-mock-data.service';
import { ContextAttachment, ContextSourceKind } from '../models/psc.models';
import { ProjectLifecycleService } from './project-lifecycle.service';
import { EVALUATION_CADENCES, pdlcPhase } from '../constants/pdlc';

export type { ContextAttachment, ContextSourceKind };

export interface ContextSourceMeta {
  id: ContextSourceKind | 'kb';
  label: string;
  hint: string;
  icon: string;
  group: 'Integrations' | 'Product' | 'Upload';
  /** Integration type in Settings → Integrations (for the connected check). */
  integration?: string;
  search: string;
}

export const CONTEXT_SOURCES: ContextSourceMeta[] = [
  { id: 'jira', label: 'Jira item', hint: 'Epics, stories and bugs', icon: 'layers', group: 'Integrations', integration: 'jira', search: 'Search by key or title…' },
  { id: 'confluence', label: 'Confluence page', hint: 'Specs and meeting notes', icon: 'book-open', group: 'Integrations', integration: 'confluence', search: 'Search pages…' },
  { id: 'ado', label: 'Azure DevOps', hint: 'Work items and repos', icon: 'git-branch', group: 'Integrations', integration: 'ado', search: 'Search work items and repos…' },
  { id: 'module', label: 'Module/Feature', hint: 'Areas of the product', icon: 'boxes', group: 'Product', search: 'Search modules and features…' },
  { id: 'pdlc', label: 'Lifecycle & evaluation', hint: 'Phase, exit gates, success metrics', icon: 'route', group: 'Product', search: 'Search lifecycle and evaluation plans…' },
  { id: 'kb', label: 'Knowledge base', hint: 'Team-scoped context', icon: 'book-open', group: 'Product', search: 'Search decisions, insights, meetings…' },
  { id: 'file', label: 'File', hint: 'PDF, Word, Markdown, CSV…', icon: 'paperclip', group: 'Upload', search: '' }
];

export const CONTEXT_KIND_ICON: Record<ContextSourceKind | 'kb', string> = {
  jira: 'layers', confluence: 'book-open', ado: 'git-branch', module: 'boxes', pdlc: 'route', file: 'file-text', kb: 'brain'
};

const PROJECT_CONTEXT_KEY = 'psc.project-context.v1';

const KEYS: Record<string, string> = { p1: 'ACP', p2: 'HSM', p3: 'FFA', p4: 'EDU', p5: 'LTS' };

/** Seed per project: [jira], [confluence], [ado], [modules]. Titles only — ids/keys are generated. */
const SEED: Record<string, { jira: [string, string, string][]; confluence: [string, string][]; ado: [string, string, string][]; modules: [string, string][] }> = {
  p1: {
    jira: [['Epic', 'One-click checkout with saved cards', 'In progress'], ['Story', 'As a shopper I can pay with a saved card', 'To do'], ['Story', 'Address autocomplete on checkout', 'In review'], ['Bug', 'Checkout API p95 above 1.8s', 'Open'], ['Epic', 'Buy now, pay later (BNPL)', 'Backlog'], ['Bug', 'Promo code not applied on mobile web', 'Open']],
    confluence: [['Page', 'Checkout redesign — product spec'], ['Meeting notes', 'Design review — checkout concepts'], ['Page', 'Payments architecture overview'], ['Meeting notes', 'Engineering sync — API performance']],
    ado: [['Work item', 'Async image-resizing worker', 'Active'], ['Repo', 'aava-commerce-web', 'main · 14 open PRs'], ['Work item', 'Pricing service caching', 'New']],
    modules: [['Checkout', 'Cart, payment, address and order confirmation'], ['Catalog & search', 'Product listing, filters and recommendations'], ['Loyalty', 'Points, tiers and rewards'], ['Payments', 'Cards, wallets and BNPL']]
  },
  p2: {
    jira: [['Epic', 'Real-time vitals streaming', 'In progress'], ['Story', 'Export vitals to PDF for clinicians', 'To do'], ['Bug', 'Heart-rate chart gaps on Android 14', 'Open'], ['Story', 'Apple Watch pairing', 'Backlog']],
    confluence: [['Page', 'HealthSync Sprint 5 goals'], ['Page', 'FHIR integration guide'], ['Meeting notes', 'Sprint planning — HealthSync']],
    ado: [['Work item', 'FHIR test environment access', 'Active'], ['Repo', 'healthsync-mobile', 'develop · 6 open PRs']],
    modules: [['Vitals', 'Live readings, alerts and history'], ['Care team', 'Clinician sharing and messaging'], ['Devices', 'Wearable pairing and sync']]
  },
  p3: {
    jira: [['Epic', 'Usage-based pricing tier', 'In progress'], ['Story', 'Invoice history in billing dashboard', 'To do'], ['Bug', 'Forecast chart rounds negative margins', 'Open']],
    confluence: [['Page', 'Pricing tier analysis — margin scenarios'], ['Meeting notes', 'Stakeholder update — FinFlow pricing']],
    ado: [['Work item', 'Regulatory report export (XBRL)', 'Active'], ['Repo', 'finflow-analytics', 'main · 3 open PRs']],
    modules: [['Billing', 'Plans, invoices and usage metering'], ['Forecasting', 'Predictive models and scenarios'], ['Compliance', 'Regulatory reporting']]
  },
  p4: {
    jira: [['Epic', 'Offline mode for rural schools', 'Backlog'], ['Story', 'AI tutor hints in quizzes', 'In progress']],
    confluence: [['Page', 'Curriculum personalization model'], ['Page', 'Teacher dashboard requirements']],
    ado: [['Repo', 'edupath-lms', 'main · 2 open PRs']],
    modules: [['Courses', 'Content, lessons and quizzes'], ['AI tutor', 'Hints, explanations and feedback'], ['Progress', 'Learner analytics']]
  },
  p5: {
    jira: [['Epic', 'Predictive disruption alerts', 'Done'], ['Story', 'Automated reorder thresholds', 'In review'], ['Bug', 'Shipment ETA off by one timezone', 'Open']],
    confluence: [['Page', 'Supplier onboarding playbook'], ['Meeting notes', 'Customer call — LogiTrack']],
    ado: [['Work item', 'Carrier API rate limiting', 'Active'], ['Repo', 'logitrack-platform', 'main · 5 open PRs']],
    modules: [['Shipments', 'Tracking, ETAs and exceptions'], ['Inventory', 'Stock levels and reorders'], ['Suppliers', 'Onboarding and scorecards']]
  }
};

/**
 * Mock catalog behind the prompt bar's "Add context" menu: Jira issues, Confluence pages, Azure DevOps
 * work items/repos and product modules, per project. Frontend only — no integration calls.
 */
@Injectable({ providedIn: 'root' })
export class ContextSourcesService {
  private readonly data = inject(PscMockDataService);
  private readonly lifecycle = inject(ProjectLifecycleService);
  private readonly catalog: ContextAttachment[] = this.build();
  /** Context set up for a project (New Project wizard): every new chat in it starts with these attached. */
  private projectContext: Record<string, ContextAttachment[]> = this.readProjectContext();

  /** Items of one source, the chat's project first (includes items added when the project was created). */
  list(kind: ContextSourceKind, projectId: string | null): ContextAttachment[] {
    if (kind === 'pdlc') {
      const all = Object.keys(this.lifecycle.all()).flatMap(id => this.lifecycleItems(id));
      return projectId ? [...all.filter(c => c.projectId === projectId), ...all.filter(c => c.projectId !== projectId)] : all;
    }
    const custom = Object.values(this.projectContext).flat().filter(c => c.kind !== 'file');
    const all = [...custom, ...this.catalog].filter(c => c.kind === kind);
    return projectId ? [...all.filter(c => c.projectId === projectId), ...all.filter(c => c.projectId !== projectId)] : all;
  }

  /** Default context for new chats in a project: what was set up for it, plus its lifecycle and evaluation plan. */
  defaultsFor(projectId: string | null): ContextAttachment[] {
    return projectId ? [...(this.projectContext[projectId] ?? []), ...this.lifecycleItems(projectId)] : [];
  }

  /** The project's PDLC as two context items: where it is (phase + exit gate) and how it is evaluated. */
  lifecycleItems(projectId: string): ContextAttachment[] {
    const lc = this.lifecycle.get(projectId);
    if (!lc) return [];
    const phase = pdlcPhase(lc.current);
    const ev = lc.evaluation;
    const cadence = EVALUATION_CADENCES.find(c => c.id === ev.cadence)?.label.toLowerCase() ?? ev.cadence;
    const metrics = ev.metrics.map(m => `${m.name} ${m.baseline ? m.baseline + ' → ' : '→ '}${m.target}`);
    return [
      {
        id: `pdlc-plan-${projectId}`, kind: 'pdlc', type: 'Lifecycle', projectId,
        title: `Lifecycle plan — ${phase.label} phase`,
        detail: `${this.lifecycle.progressLabel(lc)} · exit gate: ${phase.gate}`
      },
      {
        id: `pdlc-eval-${projectId}`, kind: 'pdlc', type: 'Evaluation', projectId,
        title: `Evaluation plan — ${metrics.length} success metric${metrics.length === 1 ? '' : 's'}`,
        detail: `${metrics.slice(0, 3).join(' · ') || 'No metrics yet'} · reviewed ${cadence}, ${ev.reviewAfterDays} days after launch`
      }
    ];
  }

  setProjectContext(projectId: string, items: ContextAttachment[]): void {
    this.projectContext = { ...this.projectContext, [projectId]: items.map(i => ({ ...i, projectId })) };
    try { localStorage.setItem(PROJECT_CONTEXT_KEY, JSON.stringify(this.projectContext)); } catch { /* ignore */ }
  }

  /** A linked Jira project / Azure DevOps project, or a product module, as a context item. */
  makeItem(kind: Exclude<ContextSourceKind, 'file' | 'pdlc'>, title: string, detail: string, ref?: string): ContextAttachment {
    const type = kind === 'module' ? 'Module' : kind === 'jira' ? 'Project' : kind === 'ado' ? 'Project' : 'Page';
    return { id: `${kind}-new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, kind, title, detail, ref, type };
  }

  isConnected(meta: ContextSourceMeta): boolean {
    if (!meta.integration) return true;
    return this.data.integrations.find(i => i.type === meta.integration)?.status === 'connected';
  }

  projectName(id?: string): string {
    return id ? this.data.findProject(id)?.name ?? '' : '';
  }

  /** "Jira · ACP-142 One-click checkout" — the label the AI sees and the reply lists. */
  label(a: ContextAttachment): string {
    const src = { jira: 'Jira', confluence: 'Confluence', ado: 'Azure DevOps', module: 'Module', pdlc: 'Lifecycle', file: 'File' }[a.kind];
    return `${src} — ${a.ref ? a.ref + ' ' : ''}${a.title}`;
  }

  /** Turn picked local files into attachments (name + size only; contents never leave the browser). */
  fromFiles(files: FileList | File[], projectId: string | null): ContextAttachment[] {
    return [...files].map(f => ({
      id: `file-${f.name}-${f.size}`,
      kind: 'file' as const,
      title: f.name,
      detail: `${(f.name.split('.').pop() || 'file').toUpperCase()} · ${f.size < 1024 * 1024 ? Math.max(1, Math.round(f.size / 1024)) + ' KB' : (f.size / 1024 / 1024).toFixed(1) + ' MB'}`,
      projectId: projectId ?? undefined
    }));
  }

  private readProjectContext(): Record<string, ContextAttachment[]> {
    try { return JSON.parse(localStorage.getItem(PROJECT_CONTEXT_KEY) || '{}'); } catch { return {}; }
  }

  private build(): ContextAttachment[] {
    const out: ContextAttachment[] = [];
    for (const [pid, s] of Object.entries(SEED)) {
      const key = KEYS[pid];
      s.jira.forEach(([type, title, status], i) => out.push({ id: `jira-${key}-${120 + i * 7}`, kind: 'jira', ref: `${key}-${120 + i * 7}`, title, type, detail: `${type} · ${status}`, projectId: pid }));
      s.confluence.forEach(([type, title], i) => out.push({ id: `conf-${pid}-${i}`, kind: 'confluence', title, type, detail: `${type} · ${key} space · updated ${i + 1}d ago`, projectId: pid }));
      s.ado.forEach(([type, title, status], i) => out.push({ id: `ado-${pid}-${i}`, kind: 'ado', ref: type === 'Repo' ? undefined : `#${4200 + i * 13 + pid.charCodeAt(1)}`, title, type, detail: `${type} · ${status}`, projectId: pid }));
      s.modules.forEach(([title, detail], i) => out.push({ id: `mod-${pid}-${i}`, kind: 'module', title, type: 'Module', detail, projectId: pid }));
    }
    return out;
  }
}
