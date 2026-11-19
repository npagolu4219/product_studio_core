import { Component, DestroyRef, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideAngularModule } from 'lucide-angular';
import { Artifact, ArtifactVersion, PdlcPhaseId, Project } from '../../models/psc.models';
import { ArtifactRepositoryService, RepoDoc, RepoStatus } from '../../services/artifact-repository.service';
import { PscMockDataService } from '../../services/psc-mock-data.service';
import { ProjectLifecycleService } from '../../services/project-lifecycle.service';
import { PDLC_PHASES, pdlcPhase } from '../../constants/pdlc';
import { getArtifactIconName, getArtifactLabel, getArtifactShortLabel } from '../../constants/artifact-options';
import { initials, projectGradient } from '../../constants/project-visuals';
import { DocBlock, parseDoc, ParsedDoc, toMarkdown } from '../../utils/artifact-doc';

type StatusFilter = 'all' | RepoStatus;
type GroupBy = 'phase' | 'type' | 'none';
type SortBy = 'updated' | 'title' | 'status';
/** 'all' = every project; 'none' = chats not filed in a project. */
type ProjectScope = 'all' | 'none' | string;

interface DocGroup { id: string; label: string; icon: string; docs: RepoDoc[]; }

const STATUS_META: Record<RepoStatus, { label: string; icon: string; order: number }> = {
  published: { label: 'Published', icon: 'circle-check', order: 0 },
  approved: { label: 'Approved', icon: 'badge-check', order: 1 },
  review: { label: 'In review', icon: 'eye', order: 2 },
  draft: { label: 'Draft', icon: 'pencil', order: 3 }
};

const VIEW_KEY = 'psc.repository.view';

/**
 * Repository: every document generated in chats, organised project by project — what's published, what's
 * in review, every version — with a reader, version history and the way back to the chat that made it.
 */
@Component({
  selector: 'app-psc-repository',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule],
  templateUrl: './repository.component.html',
  styleUrl: './repository.component.scss'
})
export class RepositoryComponent implements OnInit {
  private readonly repo = inject(ArtifactRepositoryService);
  private readonly mockData = inject(PscMockDataService);
  private readonly lifecycles = inject(ProjectLifecycleService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);

  readonly statusMeta = STATUS_META;
  readonly statuses: RepoStatus[] = ['published', 'approved', 'review', 'draft'];
  readonly initials = initials;
  readonly projectGradient = projectGradient;
  readonly artifactIcon = getArtifactIconName;
  readonly artifactLabel = getArtifactLabel;
  readonly artifactShortLabel = getArtifactShortLabel;

  // Filters (project, status and doc live in the URL so views can be linked)
  project: ProjectScope = 'all';
  status: StatusFilter = 'all';
  type = 'all';
  query = '';
  groupBy: GroupBy = 'phase';
  sortBy: SortBy = 'updated';
  view: 'list' | 'grid' = this.readView();
  projectSearch = '';

  // Detail drawer
  docKey: string | null = null;
  detailTab: 'preview' | 'versions' = 'preview';
  /** Version shown in the reader (null = the current one: published, else latest). */
  previewVersion: number | null = null;
  toast = '';
  private toastTimer = 0;

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(q => {
      const project = q.get('project') ?? 'all';
      this.project = project === 'none' || project === 'all' || this.mockData.findProject(project) ? project : 'all';
      const status = q.get('status') as StatusFilter | null;
      this.status = status && (status === 'all' || status in STATUS_META) ? status : 'all';
      const doc = q.get('doc');
      if (doc !== this.docKey) { this.detailTab = 'preview'; this.previewVersion = null; }
      this.docKey = doc && this.repo.find(doc) ? doc : null;
    });
  }

  // ── Projects column ──

  get projectRows(): { id: ProjectScope; name: string; project?: Project; total: number; published: number; phase?: string }[] {
    const docs = this.repo.docs();
    const q = this.projectSearch.trim().toLowerCase();
    const rows = this.mockData.projects
      .map(p => {
        const mine = docs.filter(d => d.projectId === p.id);
        const lc = this.lifecycles.get(p.id);
        return { id: p.id, name: p.name, project: p, total: mine.length, published: mine.filter(d => d.published).length, phase: lc ? pdlcPhase(lc.current).label : undefined, updated: mine[0]?.updatedAt ?? '' };
      })
      .filter(r => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => Number(!!b.total) - Number(!!a.total) || b.updated.localeCompare(a.updated));
    return rows;
  }

  get allCount(): number { return this.repo.docs().length; }
  get allPublished(): number { return this.repo.docs().filter(d => d.published).length; }
  get unfiledCount(): number { return this.repo.docs().filter(d => !d.projectId).length; }

  get scopeProject(): Project | undefined {
    return this.project !== 'all' && this.project !== 'none' ? this.mockData.findProject(this.project) : undefined;
  }

  get scopeTitle(): string {
    return this.project === 'all' ? 'All projects' : this.project === 'none' ? 'Not in a project' : this.scopeProject?.name ?? 'Project';
  }

  get scopePhase(): string | undefined {
    const lc = this.lifecycles.get(this.scopeProject?.id);
    return lc ? `${pdlcPhase(lc.current).label} phase · ${lc.phases.indexOf(lc.current) + 1} of ${lc.phases.length}` : undefined;
  }

  selectProject(id: ProjectScope): void {
    this.type = 'all';
    this.navigate({ project: id === 'all' ? null : id, doc: null });
  }

  // ── Documents ──

  /** Documents in the selected project (before status/type/search). */
  get scoped(): RepoDoc[] {
    const docs = this.repo.docs();
    if (this.project === 'all') return docs;
    if (this.project === 'none') return docs.filter(d => !d.projectId);
    return docs.filter(d => d.projectId === this.project);
  }

  count(status: StatusFilter): number {
    return status === 'all' ? this.scoped.length : this.scoped.filter(d => this.effectiveStatus(d) === status).length;
  }

  /** A doc counts as Published while a published version exists (even if a newer draft is in progress). */
  effectiveStatus(d: RepoDoc): RepoStatus {
    return d.published ? 'published' : d.status;
  }

  get typeOptions(): { id: string; label: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const d of this.scoped) counts.set(d.type, (counts.get(d.type) ?? 0) + 1);
    return [...counts].map(([id, count]) => ({ id, label: getArtifactLabel(id), count })).sort((a, b) => a.label.localeCompare(b.label));
  }

  get filtered(): RepoDoc[] {
    const q = this.query.trim().toLowerCase();
    const list = this.scoped.filter(d =>
      (this.status === 'all' || this.effectiveStatus(d) === this.status) &&
      (this.type === 'all' || d.type === this.type) &&
      (!q || `${d.title} ${getArtifactLabel(d.type)} ${d.conversationTitle ?? ''} ${d.jiraKey ?? ''} ${this.projectName(d)} ${d.author}`.toLowerCase().includes(q))
    );
    const by: Record<SortBy, (a: RepoDoc, b: RepoDoc) => number> = {
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      title: (a, b) => a.title.localeCompare(b.title),
      status: (a, b) => STATUS_META[this.effectiveStatus(a)].order - STATUS_META[this.effectiveStatus(b)].order || b.updatedAt.localeCompare(a.updatedAt)
    };
    return [...list].sort(by[this.sortBy]);
  }

  get groups(): DocGroup[] {
    const docs = this.filtered;
    if (this.groupBy === 'none') return docs.length ? [{ id: 'all', label: '', icon: '', docs }] : [];
    if (this.groupBy === 'phase') {
      return PDLC_PHASES.map(p => ({ id: p.id, label: p.label, icon: p.icon, docs: docs.filter(d => d.phase === p.id) })).filter(g => g.docs.length);
    }
    const types = [...new Set(docs.map(d => d.type))];
    return types.map(t => ({ id: t, label: getArtifactLabel(t), icon: getArtifactIconName(t), docs: docs.filter(d => d.type === t) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  get hasFilters(): boolean {
    return this.status !== 'all' || this.type !== 'all' || !!this.query.trim();
  }

  setStatus(s: StatusFilter): void {
    this.navigate({ status: s === 'all' ? null : s });
  }

  clearFilters(): void {
    this.query = '';
    this.type = 'all';
    this.navigate({ status: null });
  }

  setView(v: 'list' | 'grid'): void {
    this.view = v;
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
  }

  projectName(d: RepoDoc): string {
    return d.projectId ? this.mockData.findProject(d.projectId)?.name ?? '' : '';
  }

  phaseLabel(id: PdlcPhaseId): string { return pdlcPhase(id).label; }

  trackByKey(_: number, d: RepoDoc): string { return d.key; }
  trackById(_: number, g: { id: string }): string { return g.id; }

  // ── Detail drawer ──

  get selected(): RepoDoc | undefined {
    return this.repo.find(this.docKey);
  }

  open(d: RepoDoc): void {
    this.navigate({ doc: d.key });
  }

  close(): void {
    this.navigate({ doc: null });
  }

  hasNewerDraft(d: RepoDoc): boolean { return this.repo.hasNewerDraft(d); }

  /** The version shown in the reader. */
  get shown(): { version: number; content: string; savedAt: string; label: string } | undefined {
    const d = this.selected;
    if (!d) return undefined;
    if (this.previewVersion != null) {
      const v = d.versions.find(x => x.version === this.previewVersion);
      if (v) return v;
    }
    const cur = this.repo.current(d);
    return { version: cur.version, content: cur.content, savedAt: cur.updatedAt, label: `Version ${cur.version}` };
  }

  private parsedCache: { key: string; doc: ParsedDoc } | null = null;

  get parsed(): ParsedDoc | undefined {
    const d = this.selected, s = this.shown;
    if (!d || !s) return undefined;
    const key = `${d.key}@${s.version}@${s.content.length}`;
    if (this.parsedCache?.key !== key) this.parsedCache = { key, doc: parseDoc(s.content, d.title) };
    return this.parsedCache.doc;
  }

  versionStatus(d: RepoDoc, v: ArtifactVersion): string | null {
    if (d.published?.version === v.version) return 'Published';
    if (v.version === d.latest.version) return STATUS_META[d.status].label;
    return null;
  }

  readVersion(v: ArtifactVersion): void {
    this.previewVersion = v.version;
    this.detailTab = 'preview';
  }

  /** Back to the chat that made it, with this version open on the canvas. Library docs start a new chat to iterate. */
  openInChat(d: RepoDoc): void {
    if (d.source === 'chat' && d.conversationId) {
      // The version being read: the published one (default), else the latest document.
      const target: Artifact = this.previewVersion == null ? this.repo.current(d) : d.published?.version === this.previewVersion ? d.published : d.latest;
      this.router.navigate(['/psc', 'home', d.conversationArtifactId ?? d.optionId, d.conversationId], { queryParams: { artifact: target.id } });
      return;
    }
    const project = d.projectId ? this.mockData.findProject(d.projectId)?.name : '';
    this.router.navigate(['/psc', 'home', d.optionId], {
      queryParams: { project: d.projectId, prompt: `Update “${d.title}” (v${d.version})${project ? ' for ' + project : ''}: ` }
    });
  }

  copyLink(d: RepoDoc): void {
    const tree = this.router.createUrlTree(['/psc', 'repository'], { queryParams: { project: d.projectId ?? 'none', doc: d.key } });
    const url = window.location.origin + this.location.prepareExternalUrl(this.router.serializeUrl(tree));
    this.copy(url, 'Link copied');
  }

  copyMarkdown(d: RepoDoc): void {
    const s = this.shown;
    if (s) this.copy(toMarkdown(d.title, s.content), 'Copied as Markdown');
  }

  download(d: RepoDoc): void {
    const s = this.shown;
    if (!s) return;
    const blob = new Blob([toMarkdown(d.title, s.content)], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${d.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'document'}-v${s.version}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    this.flash(`Downloaded v${s.version} as Markdown`);
  }

  blockTrack(i: number): number { return i; }
  isList(b: DocBlock): boolean { return b.kind === 'bullet' || b.kind === 'item' || b.kind === 'kv'; }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.docKey) this.close();
  }

  private copy(text: string, message: string): void {
    navigator.clipboard?.writeText(text).then(() => this.flash(message), () => this.flash('Copy failed — your browser blocked the clipboard'));
  }

  private flash(message: string): void {
    this.toast = message;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toast = ''), 2600);
  }

  private navigate(params: Record<string, string | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge', replaceUrl: !('doc' in params) });
  }

  private readView(): 'list' | 'grid' {
    try { return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list'; } catch { return 'list'; }
  }
}
