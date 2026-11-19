import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Artifact, ArtifactVersion } from '../models/psc.models';
import { ConversationService } from './conversation.service';
import { PscMockDataService } from './psc-mock-data.service';
import { DocSection, replaceSectionBody, toHtml, toMarkdown } from '../utils/artifact-doc';
import { getArtifactLabel } from '../constants/artifact-options';

export type CanvasMode = 'view' | 'edit' | 'compare' | 'history' | 'preview' | 'share' | 'publish' | 'export';
export type PublishStatus = 'idle' | 'publishing' | 'published';
export type ExportFormat = 'markdown' | 'copy' | 'pdf' | 'word' | 'jira' | 'ado';
export type ArtifactStatus = Artifact['status'];

export interface CanvasToast {
  id: number;
  type: 'success' | 'error' | 'info';
  text: string;
  actionLabel?: string;
  action?: () => void;
}

/** A section being edited in place on the View tab. */
export interface SectionEdit {
  section: DocSection;
  text: string;
}

/** "You have unsaved changes" confirmation, shown before an action that would lose them. */
export interface LeaveGuard {
  proceed: () => void;
}

/** Result of a (simulated) push to Jira / Azure DevOps. */
export interface PushResult {
  tool: 'Jira' | 'Azure DevOps';
  keys: string[];
  at: string;
}

/** Ask the chat to refine the open artifact (or one section); Home listens and pre-fills the prompt. */
export interface RefineRequest {
  seq: number;
  artifactId: string;
  artifactType: Artifact['type'];
  text: string;
}

interface OpenArtifactRef {
  conversationId: string;
  artifactId: string;
}

const LAYOUT_KEY = 'psc.canvas.layout.v1';
export const CHAT_PANEL_MIN = 300;
export const CHAT_PANEL_MAX = 620;
const CHAT_PANEL_DEFAULT = 400;

interface CanvasLayout {
  chatWidth: number;
  chatCollapsed: boolean;
  watchExpanded: boolean;
}

export const STATUS_OPTIONS: { id: ArtifactStatus; label: string; hint: string }[] = [
  { id: 'draft', label: 'Draft', hint: 'Work in progress' },
  { id: 'review', label: 'In review', hint: 'Ready for feedback' },
  { id: 'approved', label: 'Approved', hint: 'Signed off, not yet shared' },
  { id: 'published', label: 'Published', hint: 'Visible to the whole team' }
];

/**
 * UI state + actions for the artifact canvas. The artifact itself lives inside its conversation
 * (ConversationService), so edits, versions and status persist with the chat and survive reloads.
 */
@Injectable({ providedIn: 'root' })
export class ArtifactCanvasService {
  private readonly conversations = inject(ConversationService);
  private readonly mockData = inject(PscMockDataService);
  private readonly router = inject(Router);
  private readonly ref = signal<OpenArtifactRef | null>(null);
  private toastSeq = 0;
  private refineSeq = 0;

  readonly mode = signal<CanvasMode>('view');
  readonly editContent = signal('');
  readonly sectionEdit = signal<SectionEdit | null>(null);
  /** Version shown read-only on the View tab (null = current). */
  readonly viewingVersion = signal<number | null>(null);
  readonly compareFrom = signal<number | null>(null);
  readonly compareTo = signal<number | null>(null);
  readonly leaveGuard = signal<LeaveGuard | null>(null);
  readonly publishStatus = signal<PublishStatus>('idle');
  readonly exportFormat = signal<ExportFormat | null>(null);
  readonly pushResult = signal<PushResult | null>(null);
  readonly refineRequest = signal<RefineRequest | null>(null);
  readonly toast = signal<CanvasToast | null>(null);
  readonly layout = signal<CanvasLayout>(this.loadLayout());

  readonly conversationId = computed(() => this.ref()?.conversationId ?? null);

  readonly artifact = computed<Artifact | null>(() => {
    const ref = this.ref();
    if (!ref) return null;
    const conversation = this.conversations.conversations().find(c => c.id === ref.conversationId);
    return conversation?.messages.flatMap(m => m.artifacts || []).find(a => a.id === ref.artifactId) ?? null;
  });

  /** Latest artifact of each type in the open conversation (older drafts are reachable via History). */
  readonly conversationArtifacts = computed<Artifact[]>(() => {
    const id = this.conversationId();
    const conversation = id ? this.conversations.conversations().find(c => c.id === id) : null;
    const all = conversation?.messages.flatMap(m => m.artifacts || []) ?? [];
    const latest = new Map<string, Artifact>();
    for (const a of all) latest.set(a.type, a);
    return [...latest.values()];
  });

  /** A newer draft of the same document exists (the AI refined it after this one). */
  readonly newerDraft = computed<Artifact | null>(() => {
    const a = this.artifact();
    if (!a) return null;
    const latest = this.conversationArtifacts().find(x => x.type === a.type);
    return latest && latest.id !== a.id ? latest : null;
  });

  /** Versions newest first; falls back to the current content for artifacts created before history existed. */
  readonly versions = computed<ArtifactVersion[]>(() => {
    const a = this.artifact();
    if (!a) return [];
    return a.history?.length
      ? a.history
      : [{ version: a.version, content: a.content, savedAt: a.createdAt, label: `Version ${a.version}` }];
  });

  /** Content shown on the View tab: the current version, or an older one being inspected. */
  readonly viewedContent = computed(() => {
    const v = this.viewingVersion();
    const a = this.artifact();
    if (v === null || !a || v === a.version) return a?.content ?? '';
    return this.versions().find(x => x.version === v)?.content ?? a.content;
  });

  readonly dirty = computed(() => {
    const a = this.artifact();
    if (!a) return false;
    if (this.mode() === 'edit' && this.editContent() !== a.content) return true;
    const s = this.sectionEdit();
    return !!s && s.text !== s.section.body;
  });

  /** Whether a reply is currently generating in the open artifact's conversation. */
  readonly generating = computed(() => {
    const id = this.conversationId();
    return !!id && this.conversations.generationProgress()[id] !== undefined;
  });

  readonly generationProgress = computed(() => {
    const id = this.conversationId();
    return id ? this.conversations.generationProgress()[id] ?? 0 : 0;
  });

  constructor() {
    // Closing the tab with unsaved edits asks the browser to confirm.
    try {
      window.addEventListener('beforeunload', e => {
        if (this.dirty()) { e.preventDefault(); e.returnValue = ''; }
      });
    } catch { /* non-browser */ }
  }

  // ── Opening / navigation ──
  open(conversationId: string, artifactId: string): void {
    const current = this.ref();
    if (current?.conversationId === conversationId && current.artifactId === artifactId) return;
    const sameDoc = current?.conversationId === conversationId && this.artifact()?.type === this.findType(conversationId, artifactId);
    this.ref.set({ conversationId, artifactId });
    if (!sameDoc) this.mode.set('view');
    this.resetTransient();
    // Following a newer version of the same document: keep the current tab working.
    if (sameDoc && this.mode() === 'compare') this.initCompare();
    if (sameDoc && this.mode() === 'edit') this.editContent.set(this.artifact()?.content ?? '');
  }

  close(): void {
    this.ref.set(null);
    this.mode.set('view');
    this.resetTransient();
  }

  /** Runs `proceed` now, or after the user confirms discarding unsaved edits. */
  guard(proceed: () => void): void {
    if (this.dirty()) this.leaveGuard.set({ proceed });
    else proceed();
  }

  resolveGuard(choice: 'save' | 'discard' | 'stay'): void {
    const g = this.leaveGuard();
    this.leaveGuard.set(null);
    if (!g || choice === 'stay') return;
    if (choice === 'save') this.saveAll();
    else { this.sectionEdit.set(null); this.editContent.set(this.artifact()?.content ?? ''); }
    g.proceed();
  }

  setMode(mode: CanvasMode): void {
    if (mode === this.mode() && mode !== 'view') return;
    this.guard(() => {
      if (mode === 'edit') this.editContent.set(this.artifact()?.content ?? '');
      if (mode === 'compare') this.initCompare();
      if (mode !== 'view') this.viewingVersion.set(null);
      this.sectionEdit.set(null);
      this.mode.set(mode);
    });
  }

  // ── Editing ──
  saveEdit(): void {
    const a = this.artifact();
    if (!a) return;
    const content = this.editContent();
    this.mode.set('view');
    if (content === a.content) return;
    this.commitVersion(content, v => `Version ${v} (edited)`);
    this.showToast('success', `Saved as v${a.version + 1}`, 'Undo', () => this.undoLastVersion(a.version));
  }

  cancelEdit(): void {
    this.guard(() => {
      this.editContent.set(this.artifact()?.content ?? '');
      this.mode.set('view');
    });
  }

  startSectionEdit(section: DocSection): void {
    this.guard(() => {
      this.viewingVersion.set(null);
      this.sectionEdit.set({ section, text: section.body });
    });
  }

  updateSectionEdit(text: string): void {
    this.sectionEdit.update(s => (s ? { ...s, text } : s));
  }

  saveSectionEdit(): void {
    const s = this.sectionEdit();
    const a = this.artifact();
    this.sectionEdit.set(null);
    if (!s || !a || s.text === s.section.body) return;
    const heading = s.section.heading;
    this.commitVersion(replaceSectionBody(a.content, s.section, s.text), v => `Version ${v} (edited “${heading}”)`);
    this.showToast('success', `“${heading}” saved as v${a.version + 1}`, 'Undo', () => this.undoLastVersion(a.version));
  }

  cancelSectionEdit(): void {
    this.sectionEdit.set(null);
  }

  rename(title: string): void {
    const ref = this.ref();
    const t = title.trim();
    if (!ref || !t || t === this.artifact()?.title) return;
    this.conversations.updateArtifact(ref.conversationId, ref.artifactId, a => ({ ...a, title: t, updatedAt: new Date().toISOString() }));
    this.showToast('success', 'Renamed');
  }

  setStatus(status: ArtifactStatus): void {
    const ref = this.ref();
    const a = this.artifact();
    if (!ref || !a || a.status === status) return;
    if (status === 'published') { this.setMode('publish'); return; }
    const previous = a.status;
    this.conversations.updateArtifact(ref.conversationId, ref.artifactId, x => ({ ...x, status, updatedAt: new Date().toISOString() }));
    const label = STATUS_OPTIONS.find(o => o.id === status)?.label ?? status;
    this.showToast('success', `Marked as ${label.toLowerCase()}`, 'Undo', () =>
      this.conversations.updateArtifact(ref.conversationId, ref.artifactId, x => ({ ...x, status: previous })));
  }

  // ── Versions ──
  viewVersion(version: ArtifactVersion): void {
    this.guard(() => {
      const current = this.artifact()?.version;
      this.viewingVersion.set(version.version === current ? null : version.version);
      this.sectionEdit.set(null);
      this.mode.set('view');
    });
  }

  backToCurrent(): void {
    this.viewingVersion.set(null);
  }

  compareWith(version: ArtifactVersion): void {
    this.guard(() => {
      this.compareFrom.set(version.version);
      this.compareTo.set(this.artifact()?.version ?? null);
      this.viewingVersion.set(null);
      this.mode.set('compare');
    });
  }

  restoreVersion(version: ArtifactVersion): void {
    const a = this.artifact();
    if (!a) return;
    this.commitVersion(version.content, v => `Version ${v} (restored from v${version.version})`);
    this.viewingVersion.set(null);
    this.mode.set('view');
    this.showToast('success', `Restored v${version.version} as v${a.version + 1}`, 'Undo', () => this.undoLastVersion(a.version));
  }

  // ── Share ──
  get shareUrl(): string {
    const a = this.artifact();
    const url = new URL(window.location.href);
    if (a) url.searchParams.set('artifact', a.id);
    return url.toString();
  }

  copyLink(): void {
    this.copyToClipboard(this.shareUrl);
    this.showToast('success', 'Link copied — it opens this artifact on the canvas');
  }

  emailLink(): void {
    const a = this.artifact();
    if (!a) return;
    const subject = encodeURIComponent(`${a.title} (v${a.version})`);
    const body = encodeURIComponent(`Hi,\n\nHere’s the latest ${getArtifactLabel(a.type).toLowerCase()} — v${a.version}, ${this.statusLabel(a.status).toLowerCase()}:\n${this.shareUrl}\n`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  copyForSlack(): void {
    const a = this.artifact();
    if (!a) return;
    this.copyToClipboard(`📄 *${a.title}* — ${getArtifactLabel(a.type)} · v${a.version} · ${this.statusLabel(a.status)}\n${this.shareUrl}`);
    this.showToast('success', 'Slack message copied — paste it into any channel');
  }

  /** Notifies the artifact's project team (simulated). */
  notifyTeam(): string[] {
    const a = this.artifact();
    const team = this.mockData.findProject(a?.projectId)?.team ?? [];
    this.showToast('success', team.length ? `Notified ${team.length} teammate${team.length === 1 ? '' : 's'}` : 'This artifact has no project team yet — share the link instead');
    return team;
  }

  // ── Publish ──
  publish(): void {
    const ref = this.ref();
    if (!ref || this.publishStatus() === 'publishing') return;
    this.publishStatus.set('publishing');
    window.setTimeout(() => {
      this.conversations.updateArtifact(ref.conversationId, ref.artifactId, a => ({ ...a, status: 'published', updatedAt: new Date().toISOString() }));
      this.publishStatus.set('published');
      // Published documents are filed in the project's repository.
      const a = this.artifact();
      const project = this.conversations.conversations().find(c => c.id === ref.conversationId)?.projectId;
      this.showToast('success', `Published — filed in ${project ? (this.mockData.findProject(project)?.name ?? 'the project') + '’s' : 'the'} repository`, 'View', () =>
        this.router.navigate(['/psc', 'repository'], { queryParams: { project: project ?? 'none', doc: a ? `${ref.conversationId}~${a.type}` : null } }));
    }, 1200);
  }

  unpublish(): void {
    const ref = this.ref();
    if (!ref) return;
    this.conversations.updateArtifact(ref.conversationId, ref.artifactId, a => ({ ...a, status: 'approved', updatedAt: new Date().toISOString() }));
    this.publishStatus.set('idle');
    this.showToast('info', 'Unpublished — moved back to Approved');
  }

  // ── Export ──
  exportAs(format: ExportFormat): void {
    const a = this.artifact();
    if (!a || this.exportFormat()) return;
    if (format === 'copy') {
      this.copyToClipboard(toMarkdown(a.title, a.content));
      this.showToast('success', 'Copied as Markdown — paste into Confluence, Notion or GitHub');
      return;
    }
    if (format === 'pdf') { this.print(); return; }
    this.exportFormat.set(format);
    window.setTimeout(() => {
      this.exportFormat.set(null);
      try {
        if (format === 'markdown') {
          this.download(toMarkdown(a.title, a.content), 'text/markdown', 'md');
          this.showToast('success', 'Markdown file downloaded');
        } else if (format === 'word') {
          this.download(toHtml(a.title, a.content, this.metaLine(a)), 'application/msword', 'doc');
          this.showToast('success', 'Word document downloaded');
        } else {
          this.push(a, format === 'jira' ? 'Jira' : 'Azure DevOps');
        }
      } catch {
        this.showToast('error', 'Export failed — please try again');
      }
    }, format === 'jira' || format === 'ado' ? 1400 : 500);
  }

  /** Print / Save as PDF via a hidden iframe (no pop-up blockers). */
  print(): void {
    const a = this.artifact();
    if (!a) return;
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    if (!doc) { frame.remove(); return; }
    doc.open();
    doc.write(toHtml(a.title, a.content, this.metaLine(a)));
    doc.close();
    window.setTimeout(() => {
      try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } catch { /* ignore */ }
      window.setTimeout(() => frame.remove(), 1000);
    }, 150);
    this.showToast('info', 'Print dialog opened — choose “Save as PDF” to export');
  }

  // ── Ask AI ──
  requestRefine(section?: DocSection): void {
    const a = this.artifact();
    if (!a) return;
    const what = section ? `the “${section.heading}” section of this ${getArtifactLabel(a.type).toLowerCase()}` : `this ${getArtifactLabel(a.type).toLowerCase()}`;
    this.refineRequest.set({ seq: ++this.refineSeq, artifactId: a.id, artifactType: a.type, text: `Refine ${what}: ` });
    if (this.layout().chatCollapsed) this.toggleChatCollapsed();
  }

  // ── Layout ──
  toggleChatCollapsed(): void {
    this.patchLayout({ chatCollapsed: !this.layout().chatCollapsed });
  }

  toggleWatch(): void {
    this.patchLayout({ watchExpanded: !this.layout().watchExpanded });
  }

  setChatWidth(width: number, persist = false): void {
    const chatWidth = Math.min(CHAT_PANEL_MAX, Math.max(CHAT_PANEL_MIN, Math.round(width)));
    this.layout.update(l => ({ ...l, chatWidth }));
    if (persist) this.saveLayout();
  }

  showToast(type: CanvasToast['type'], text: string, actionLabel?: string, action?: () => void): void {
    const id = ++this.toastSeq;
    this.toast.set({ id, type, text, actionLabel, action });
    window.setTimeout(() => {
      if (this.toast()?.id === id) this.toast.set(null);
    }, actionLabel ? 6000 : 3200);
  }

  runToastAction(): void {
    const t = this.toast();
    this.toast.set(null);
    t?.action?.();
  }

  statusLabel(status: ArtifactStatus): string {
    return STATUS_OPTIONS.find(o => o.id === status)?.label ?? status;
  }

  // ── Internals ──
  private saveAll(): void {
    if (this.mode() === 'edit') this.saveEdit();
    else if (this.sectionEdit()) this.saveSectionEdit();
  }

  private initCompare(): void {
    const versions = this.versions();
    const current = this.artifact()?.version ?? null;
    if (this.compareFrom() === null || !versions.some(v => v.version === this.compareFrom())) {
      this.compareFrom.set(versions[1]?.version ?? versions[0]?.version ?? null);
    }
    this.compareTo.set(current);
  }

  private undoLastVersion(previousVersion: number): void {
    const ref = this.ref();
    if (!ref) return;
    this.conversations.updateArtifact(ref.conversationId, ref.artifactId, a => {
      const prev = a.history?.find(h => h.version === previousVersion);
      if (!prev || a.version !== previousVersion + 1) return a;
      return { ...a, content: prev.content, version: previousVersion, history: a.history!.filter(h => h.version <= previousVersion), updatedAt: new Date().toISOString() };
    });
    this.showToast('info', `Back to v${previousVersion}`);
  }

  private commitVersion(content: string, label: (version: number) => string): void {
    const ref = this.ref();
    if (!ref) return;
    const savedAt = new Date().toISOString();
    const base = this.versions();
    this.conversations.updateArtifact(ref.conversationId, ref.artifactId, a => {
      const version = a.version + 1;
      return {
        ...a,
        content,
        version,
        status: a.status === 'published' ? 'review' : a.status,
        updatedAt: savedAt,
        history: [{ version, content, savedAt, label: label(version) }, ...(a.history?.length ? a.history : base)]
      };
    });
    this.publishStatus.set('idle');
  }

  /** Simulated push: one work item per tagged line (FR-01, Story 1.1, US-02…), keyed by the project. */
  private push(a: Artifact, tool: PushResult['tool']): void {
    const ref = this.ref();
    const items = (a.content.match(/^\s*((?:[A-Z]{1,6}-\d+(?:\.\d+)?)|(?:Story \d+(?:\.\d+)?))\s{2,}/gm) ?? []).length || 1;
    const project = this.mockData.findProject(a.projectId);
    const prefix = tool === 'Jira'
      ? (project?.jiraKey ?? (project?.name ?? 'PSC').split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 4))
      : '#';
    const start = 100 + Math.floor(Math.random() * 800);
    const keys = Array.from({ length: Math.min(items, 30) }, (_, i) => (tool === 'Jira' ? `${prefix}-${start + i}` : `#${start * 10 + i}`));
    this.pushResult.set({ tool, keys, at: new Date().toISOString() });
    if (ref && tool === 'Jira') this.conversations.updateArtifact(ref.conversationId, ref.artifactId, x => ({ ...x, jiraIssueKey: keys[0] }));
    this.showToast('success', `Created ${keys.length} ${tool === 'Jira' ? 'issue' : 'work item'}${keys.length === 1 ? '' : 's'} in ${tool}`);
  }

  private metaLine(a: Artifact): string {
    const project = this.mockData.findProject(a.projectId)?.name;
    return [getArtifactLabel(a.type), `v${a.version}`, this.statusLabel(a.status), project, new Date(a.updatedAt).toLocaleDateString()].filter(Boolean).join(' · ');
  }

  private download(text: string, type: string, ext: string): void {
    const a = this.artifact();
    if (!a) return;
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${a.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-v${a.version}.${ext}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private findType(conversationId: string, artifactId: string): Artifact['type'] | undefined {
    return this.conversations.conversations().find(c => c.id === conversationId)?.messages.flatMap(m => m.artifacts || []).find(a => a.id === artifactId)?.type;
  }

  private resetTransient(): void {
    this.sectionEdit.set(null);
    this.viewingVersion.set(null);
    this.compareFrom.set(null);
    this.leaveGuard.set(null);
    this.publishStatus.set('idle');
    this.exportFormat.set(null);
    this.pushResult.set(null);
  }

  private copyToClipboard(text: string): void {
    try { void navigator.clipboard?.writeText(text); } catch { /* ignore */ }
  }

  private patchLayout(partial: Partial<CanvasLayout>): void {
    this.layout.update(l => ({ ...l, ...partial }));
    this.saveLayout();
  }

  private saveLayout(): void {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(this.layout())); } catch { /* ignore */ }
  }

  private loadLayout(): CanvasLayout {
    const fallback: CanvasLayout = { chatWidth: CHAT_PANEL_DEFAULT, chatCollapsed: false, watchExpanded: false };
    try {
      const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null');
      return saved ? { ...fallback, ...saved } : fallback;
    } catch {
      return fallback;
    }
  }
}
