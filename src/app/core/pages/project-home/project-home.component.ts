import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ConversationService } from '../../services/conversation.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PscMockDataService } from '../../services/psc-mock-data.service';
import { EvaluationCadence, PdlcMetric, PdlcPhaseId, Project, ProjectLifecycle, TeamMember } from '../../models/psc.models';
import { EVALUATION_CADENCES, METRIC_SUGGESTIONS, PDLC_ORDER, PDLC_PHASES, REVIEW_WINDOWS, pdlcPhase } from '../../constants/pdlc';
import { ProjectLifecycleService } from '../../services/project-lifecycle.service';
import { CURRENT_USER } from '../../constants/current-user';
import { PROJECT_COLORS, initials, projectGradient, setProjectColor } from '../../constants/project-visuals';
import { ContextAttachment, ContextSourcesService } from '../../services/context-sources.service';
import { ProductMemoryService } from '../../services/product-memory.service';
import { SourceType } from '../../models/product-memory.models';

type LinkType = 'jira' | 'confluence' | 'ado' | 'github' | 'sharepoint';

/** New project flow: 1) create (title, description, Product Memory) → 2) optional setup of the new project. */
type ModalPhase = 'create' | 'setup';
type SetupSection = 'team' | 'integrations' | 'context' | 'lifecycle';

/** A source linked in the wizard's Context step. */
interface ContextLink { id: string; type: LinkType; value: string; }

interface NewProjectForm {
  name: string;
  description: string;
  /** Index into PROJECT_COLORS; null = the automatic colour. */
  colorIndex: number | null;
  memoryAutoUpdate: boolean;
  team: string[];
  integrations: string[];
  /** Context step: what every chat in the project starts grounded in. */
  brief: string;
  modules: string[];
  links: ContextLink[];
  files: ContextAttachment[];
  /** Lifecycle step: PDLC phases in scope, where the project starts, and how it will be evaluated. */
  lifecycle: {
    phases: PdlcPhaseId[];
    current: PdlcPhaseId;
    targets: Partial<Record<PdlcPhaseId, string>>;
    metrics: PdlcMetric[];
    cadence: EvaluationCadence;
    reviewAfterDays: number;
    criteria: string;
  };
}

@Component({
  selector: 'app-psc-project-home',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './project-home.component.html',
  styleUrls: ['./project-home.component.scss', '../../styles-shared/project-cards.scss']
})
export class ProjectHomeComponent implements OnInit, OnDestroy {
  projects: Project[] = [];
  allTeamMembers: TeamMember[] = [];
  search = '';

  // Modal state
  showModal = false;
  phase: ModalPhase = 'create';
  creating = false;
  /** The project made in the create step; setup edits it. */
  created: Project | null = null;
  /** Setup section currently expanded (one at a time). */
  openSection: SetupSection | null = null;
  colorMenuOpen = false;
  teamSearch = '';

  readonly descriptionMax = 1000;
  readonly projectColors = PROJECT_COLORS;
  readonly setupSections: { id: SetupSection; icon: string; title: string; desc: string }[] = [
    { id: 'team', icon: 'users', title: 'Team', desc: 'Who works on this project' },
    { id: 'integrations', icon: 'git-merge', title: 'Integrations', desc: 'Tools to sync, import from and publish to' },
    { id: 'context', icon: 'layers', title: 'Context', desc: 'Brief, modules, linked sources and files every chat starts with' },
    { id: 'lifecycle', icon: 'route', title: 'Lifecycle & evaluation', desc: 'Phases, where you start, and how success is measured' }
  ];

  form: NewProjectForm = this.emptyForm();

  readonly availableIntegrations = [
    { type: 'jira',       name: 'Jira',            icon: 'trello',         desc: 'Sync epics, stories and sprints' },
    { type: 'ado',        name: 'Azure DevOps',    icon: 'git-merge',      desc: 'Work items and pipelines' },
    { type: 'github',     name: 'GitHub',          icon: 'github',         desc: 'Issues, PRs and code context' },
    { type: 'confluence', name: 'Confluence',      icon: 'book-open',      desc: 'Publish PRDs and docs' },
    { type: 'figma',      name: 'Figma',           icon: 'figma',          desc: 'Design context and assets' },
    { type: 'slack',      name: 'Slack',           icon: 'slack',          desc: 'Notifications and updates' },
    { type: 'teams',      name: 'Microsoft Teams', icon: 'message-square', desc: 'Team collaboration' },
  ];


  // ── Context step ──
  private readonly sources = inject(ContextSourcesService);
  private readonly memory = inject(ProductMemoryService);
  moduleDraft = '';
  linkType: LinkType = 'jira';
  linkDraft = '';
  readonly linkTypes: { id: LinkType; label: string; icon: string; placeholder: string; hint: string }[] = [
    { id: 'jira', label: 'Jira project', icon: 'layers', placeholder: 'Project key, e.g. ACP', hint: 'Epics, stories and bugs' },
    { id: 'confluence', label: 'Confluence space', icon: 'book-open', placeholder: 'Space URL or key', hint: 'Specs and meeting notes' },
    { id: 'ado', label: 'Azure DevOps project', icon: 'git-branch', placeholder: 'org/project', hint: 'Work items and repos' },
    { id: 'github', label: 'GitHub repo', icon: 'github', placeholder: 'org/repo', hint: 'READMEs, ADRs and issues' },
    { id: 'sharepoint', label: 'SharePoint site', icon: 'folder-open', placeholder: 'Site URL', hint: 'Docs, sheets and decks' }
  ];
  /** Starter module ideas (one click to add). */
  readonly moduleSuggestions = ['Onboarding', 'Authentication', 'Payments', 'Notifications', 'Reporting', 'Admin & settings'];

  linkMeta(type: LinkType) {
    return this.linkTypes.find(t => t.id === type)!;
  }

  /** Link types whose integration was picked in step 2 come first. */
  get orderedLinkTypes() {
    const picked = (t: LinkType) => this.form.integrations.includes(t);
    return [...this.linkTypes].sort((a, b) => Number(picked(b.id)) - Number(picked(a.id)));
  }

  addModule(name = this.moduleDraft): void {
    const n = name.trim().replace(/,$/, '');
    if (n && !this.form.modules.some(m => m.toLowerCase() === n.toLowerCase())) this.form.modules = [...this.form.modules, n];
    this.moduleDraft = '';
  }

  removeModule(name: string): void {
    this.form.modules = this.form.modules.filter(m => m !== name);
  }

  onModuleKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); this.addModule(); }
    else if (e.key === 'Backspace' && !this.moduleDraft && this.form.modules.length) this.form.modules = this.form.modules.slice(0, -1);
  }

  addLink(): void {
    const v = this.linkDraft.trim();
    if (!v) return;
    if (!this.form.links.some(l => l.type === this.linkType && l.value.toLowerCase() === v.toLowerCase())) {
      this.form.links = [...this.form.links, { id: `${this.linkType}-${Date.now().toString(36)}`, type: this.linkType, value: v }];
    }
    this.linkDraft = '';
  }

  removeLink(id: string): void {
    this.form.links = this.form.links.filter(l => l.id !== id);
  }

  onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addFiles(input.files);
    input.value = '';
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragOver = false;
    this.addFiles(e.dataTransfer?.files ?? null);
  }
  dragOver = false;

  private addFiles(files: FileList | null): void {
    if (!files?.length) return;
    const picked = this.sources.fromFiles(files, null).map(f => ({ ...f, id: `p${f.id}` })); // "pfile-…" = project file
    this.form.files = [...this.form.files, ...picked.filter(f => !this.form.files.some(x => x.id === f.id))];
  }

  removeFile(id: string): void {
    this.form.files = this.form.files.filter(f => f.id !== id);
  }

  get contextCount(): number {
    return (this.form.brief.trim() ? 1 : 0) + this.form.modules.length + this.form.links.length + this.form.files.length;
  }

  /** Save the Context step: brief → Product Memory, Confluence/GitHub/SharePoint → memory sources, the rest → project context. */
  private saveContext(projectId: string): void {
    const f = this.form;
    if (f.brief.trim()) {
      this.memory.addEntry({ type: 'context', title: `Project brief — ${f.name.trim()}`, summary: f.brief.trim(), projectId, tags: ['brief'], pinned: true });
    }
    const items: ContextAttachment[] = [];
    for (const l of f.links) {
      if (l.type === 'confluence' || l.type === 'github' || l.type === 'sharepoint') {
        const label = this.linkMeta(l.type).label.split(' ')[0];
        this.memory.addSource({ type: l.type as SourceType, name: `${label} — ${l.value}`, url: l.value, projectId });
      } else {
        items.push(this.sources.makeItem(l.type, l.type === 'jira' ? 'Jira project' : `Azure DevOps — ${l.value}`, `${this.linkMeta(l.type).hint} · linked at setup`, l.type === 'jira' ? l.value.toUpperCase() : undefined));
      }
    }
    for (const m of f.modules) items.push(this.sources.makeItem('module', m, `Module of ${f.name.trim()}`));
    items.push(...f.files);
    if (items.length) this.sources.setProjectContext(projectId, items);
  }

  // ── Lifecycle step (end-to-end PDLC + evaluation) ──
  private readonly lifecycles = inject(ProjectLifecycleService);
  readonly pdlcPhases = PDLC_PHASES;
  readonly cadences = EVALUATION_CADENCES;
  readonly reviewWindows = REVIEW_WINDOWS;
  metricDraft = { name: '', baseline: '', target: '' };

  inScope(id: PdlcPhaseId): boolean { return this.form.lifecycle.phases.includes(id); }

  togglePhase(id: PdlcPhaseId): void {
    if (id === 'evaluate') return; // every project is evaluated
    const lc = this.form.lifecycle;
    lc.phases = this.inScope(id) ? lc.phases.filter(p => p !== id) : PDLC_ORDER.filter(p => p === id || lc.phases.includes(p));
    if (!lc.phases.includes(lc.current)) lc.current = lc.phases[0];
  }

  setCurrentPhase(id: PdlcPhaseId): void {
    if (!this.inScope(id)) this.togglePhase(id);
    this.form.lifecycle.current = id;
  }

  /** Phases before the starting one are already done (e.g. an existing product starting in Define). */
  phaseState(id: PdlcPhaseId): 'done' | 'current' | 'next' | 'off' {
    const lc = this.form.lifecycle;
    if (!this.inScope(id)) return 'off';
    if (id === lc.current) return 'current';
    return lc.phases.indexOf(id) < lc.phases.indexOf(lc.current) ? 'done' : 'next';
  }

  get metricSuggestions() {
    return METRIC_SUGGESTIONS.filter(s => !this.form.lifecycle.metrics.some(m => m.name.toLowerCase() === s.name.toLowerCase()));
  }

  addMetric(m: { name: string; baseline?: string; target: string } = this.metricDraft): void {
    const name = m.name.trim();
    if (!name || !m.target.trim()) return;
    const lc = this.form.lifecycle;
    if (!lc.metrics.some(x => x.name.toLowerCase() === name.toLowerCase())) {
      lc.metrics = [...lc.metrics, { id: `mt-${Date.now().toString(36)}-${lc.metrics.length}`, name, baseline: m.baseline?.trim() || undefined, target: m.target.trim() }];
    }
    if (m === this.metricDraft) this.metricDraft = { name: '', baseline: '', target: '' };
  }

  removeMetric(id: string): void {
    this.form.lifecycle.metrics = this.form.lifecycle.metrics.filter(m => m.id !== id);
  }

  get lifecycleSummary(): string {
    const lc = this.form.lifecycle;
    return `${lc.phases.length} phases · starts in ${pdlcPhase(lc.current).label}`;
  }

  phaseLabel(id: PdlcPhaseId): string { return pdlcPhase(id).label; }
  phaseIcon(id: PdlcPhaseId): string { return pdlcPhase(id).icon; }
  phaseGate(id: PdlcPhaseId): string { return pdlcPhase(id).gate; }
  lifecycleOf(projectId: string): ProjectLifecycle | undefined { return this.lifecycles.get(projectId); }

  get cadenceLabel(): string {
    return this.cadences.find(c => c.id === this.form.lifecycle.cadence)!.label;
  }

  private saveLifecycle(projectId: string): void {
    const f = this.form.lifecycle;
    const lifecycle: ProjectLifecycle = {
      phases: f.phases,
      current: f.current,
      completed: f.phases.slice(0, f.phases.indexOf(f.current)),
      targets: Object.fromEntries(Object.entries(f.targets).filter(([k, v]) => v && f.phases.includes(k as PdlcPhaseId))),
      evaluation: { metrics: f.metrics, cadence: f.cadence, reviewAfterDays: f.reviewAfterDays, criteria: f.criteria.trim() }
    };
    this.lifecycles.set(projectId, lifecycle);
  }

  /** Chats per project. */
  chatCounts: Record<string, number> = {};
  /** Latest chat activity per project (ISO), for ordering the cards. */
  private lastChatAt: Record<string, string> = {};
  private readonly conversations = inject(ConversationService);

  constructor(private mockData: PscMockDataService, private router: Router, private route: ActivatedRoute) {
    this.conversations.conversations$.pipe(takeUntilDestroyed()).subscribe(list => {
      const counts: Record<string, number> = {};
      const active: Record<string, string> = {};
      for (const c of list) {
        if (!c.projectId) continue;
        counts[c.projectId] = (counts[c.projectId] ?? 0) + 1;
        if (!active[c.projectId] || c.updatedAt > active[c.projectId]) active[c.projectId] = c.updatedAt;
      }
      this.chatCounts = counts;
      this.lastChatAt = active;
    });
  }

  ngOnInit(): void {
    // /psc/projects?new=1 (e.g. the "+ New project" card on Home) opens the wizard on arrival.
    if (this.route.snapshot.queryParamMap.get('new') === '1') {
      setTimeout(() => this.openModal());
      this.router.navigate([], { relativeTo: this.route, queryParams: { new: null }, replaceUrl: true });
    }
    this.mockData.getProjects().subscribe(p => this.projects = p);
    this.mockData.getTeamMembers().subscribe(t => this.allTeamMembers = t);
  }

  /** Same as the Home landing: matching projects, most recently active first. */
  get filtered(): Project[] {
    const q = this.search.trim().toLowerCase();
    return this.projects
      .filter(p => !q || p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.tags.some(t => t.toLowerCase().includes(q)))
      .sort((a, b) => this.lastActive(b).localeCompare(this.lastActive(a)));
  }

  /** Search appears once there are more than 10 projects (as on Home). */
  get showSearch(): boolean {
    return this.projects.length > 10;
  }

  /** Last activity: the newest of the project's own update and its chats. */
  private lastActive(p: Project): string {
    const chat = this.lastChatAt[p.id];
    return chat && chat > p.updatedAt ? chat : p.updatedAt;
  }

  /** Current lifecycle phase label, if the project has a lifecycle. */
  phaseOf(p: Project): string | null {
    const lc = this.lifecycles.get(p.id);
    return lc ? this.phaseLabel(lc.current) : null;
  }

  trackById(_: number, p: Project): string {
    return p.id;
  }

  get filteredTeamMembers(): TeamMember[] {
    if (!this.teamSearch) return this.allTeamMembers;
    return this.allTeamMembers.filter(m =>
      m.name.toLowerCase().includes(this.teamSearch.toLowerCase()) ||
      m.role.toLowerCase().includes(this.teamSearch.toLowerCase())
    );
  }

  // ── Gradient / display helpers ──────────────────────────────────────────
  getGradient(id: string, index: number): string {
    return projectGradient(id, index);
  }

  initials(name: string): string {
    return initials(name);
  }




  // ── Modal lifecycle ──────────────────────────────────────────────────────
  openModal(): void {
    this.form = this.emptyForm();
    this.phase = 'create';
    this.created = null;
    this.openSection = null;
    this.colorMenuOpen = false;
    this.teamSearch = '';
    this.moduleDraft = '';
    this.linkDraft = '';
    this.creating = false;
    this.showModal = true;
    document.body.style.overflow = 'hidden';
  }

  /** Closing during setup keeps the project (it already exists) with whatever was set up so far left unsaved. */
  closeModal(): void {
    this.showModal = false;
    this.colorMenuOpen = false;
    document.body.style.overflow = '';
    this.projects = [...this.mockData.projects];
  }

  onBackdropClick(e: Event): void {
    if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.closeModal();
    }
  }

  // ── Step 1: create ───────────────────────────────────────────────────────
  get canCreate(): boolean {
    return !!this.form.name.trim() && !this.creating;
  }

  get previewGradient(): string {
    return this.form.colorIndex !== null ? PROJECT_COLORS[this.form.colorIndex] : PROJECT_COLORS[0];
  }

  pickColor(i: number | null): void {
    this.form.colorIndex = i;
    this.colorMenuOpen = false;
  }

  /** Creates the project from its title and description, then opens it. Team, tools, context and lifecycle are set up later inside the project. */
  createProject(): void {
    if (!this.canCreate) return;
    this.creating = true;

    setTimeout(() => {
      const today = new Date().toISOString().split('T')[0];
      const project = this.mockData.addProject({
        name: this.form.name.trim(),
        description: this.form.description.trim(),
        status: 'active',
        owner: CURRENT_USER.name,
        team: [CURRENT_USER.name],
        createdAt: today,
        updatedAt: today,
        tags: [],
        progress: 0,
        integrations: [],
        aiAgents: 0,
        artifacts: 0,
        memoryAutoUpdate: this.form.memoryAutoUpdate
      });
      if (this.form.colorIndex !== null) setProjectColor(project.id, this.form.colorIndex);
      // A usable default lifecycle from the start, so skipping setup still gives the project its phases.
      this.saveLifecycle(project.id);

      this.created = project;
      this.projects = [...this.mockData.projects];
      this.creating = false;
      // Straight into the project: its workspace opens on a new chat.
      this.openCreated(false);
    }, 500);
  }

  // ── Step 2: set up the new project (all optional) ────────────────────────
  toggleSection(id: SetupSection): void {
    this.openSection = this.openSection === id ? null : id;
  }

  sectionSummary(id: SetupSection): string {
    const f = this.form;
    switch (id) {
      case 'team': return f.team.length ? `${f.team.length} member${f.team.length === 1 ? '' : 's'}` : 'Just you';
      case 'integrations': return f.integrations.length ? this.availableIntegrations.filter(i => f.integrations.includes(i.type)).map(i => i.name).join(', ') : 'None yet';
      case 'context': return this.contextCount ? `${this.contextCount} item${this.contextCount === 1 ? '' : 's'}` : 'None yet';
      case 'lifecycle': return `${this.lifecycleSummary} · ${f.lifecycle.metrics.length} metric${f.lifecycle.metrics.length === 1 ? '' : 's'}`;
    }
  }

  sectionDone(id: SetupSection): boolean {
    const f = this.form;
    return id === 'team' ? f.team.length > 0 : id === 'integrations' ? f.integrations.length > 0 : id === 'context' ? this.contextCount > 0 : true;
  }

  /** Saves the setup choices to the project, then opens its first chat. */
  finishSetup(): void {
    const p = this.created;
    if (!p) return;
    this.mockData.updateProject(p.id, {
      team: this.form.team.length ? [...new Set([CURRENT_USER.name, ...this.form.team])] : [CURRENT_USER.name],
      integrations: [...this.form.integrations]
    });
    this.saveContext(p.id);
    this.saveLifecycle(p.id);
    this.openCreated(true);
  }

  /** Skip setup: the project already exists with a default lifecycle — go straight to it. */
  skipSetup(): void {
    this.openCreated(false);
  }

  /** Home, scoped to the new project. After setup, the prompt is pre-filled to draft the starting phase's first deliverable. */
  private openCreated(kickoff: boolean): void {
    const p = this.created;
    this.closeModal();
    if (!p) return;
    const first = this.firstDeliverable.artifactId;
    this.router.navigate(['/psc', 'home', ...(kickoff ? [first] : [])], { queryParams: { project: p.id, ...(kickoff ? { kickoff: 1 } : {}) } });
  }

  /** The first chat drafts the starting phase's first AI deliverable (e.g. Discover → market research, Define → goals). */
  get firstDeliverable(): { label: string; artifactId: string } {
    const d = pdlcPhase(this.form.lifecycle.current).deliverables.find(x => x.artifactId);
    return d ? { label: d.label, artifactId: d.artifactId! } : { label: 'a PRD', artifactId: 'prd' };
  }

  // ── Team ─────────────────────────────────────────────────────────────────
  isTeamSelected(name: string): boolean { return this.form.team.includes(name); }

  toggleTeam(name: string): void {
    if (this.isTeamSelected(name)) {
      this.form.team = this.form.team.filter(m => m !== name);
    } else {
      this.form.team.push(name);
    }
  }

  // ── Integrations ─────────────────────────────────────────────────────────
  isIntSelected(type: string): boolean { return this.form.integrations.includes(type); }

  toggleInt(type: string): void {
    if (this.isIntSelected(type)) {
      this.form.integrations = this.form.integrations.filter(i => i !== type);
    } else {
      this.form.integrations.push(type);
    }
  }



  /** "Open" a project → Home with the chat scoped to that project (its knowledge, its chats). */
  openProject(project: Project): void {
    this.router.navigate(['/psc', 'home'], { queryParams: { project: project.id } });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.colorMenuOpen) { this.colorMenuOpen = false; return; }
    if (this.showModal && !this.creating) this.closeModal();
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }





  private emptyForm(): NewProjectForm {
    this.metricDraft = { name: '', baseline: '', target: '' };
    return {
      name: '', description: '', colorIndex: null, memoryAutoUpdate: false, team: [], integrations: [], brief: '', modules: [], links: [], files: [],
      lifecycle: {
        phases: [...PDLC_ORDER],
        current: 'discover',
        targets: {},
        metrics: METRIC_SUGGESTIONS.slice(0, 2).map((m, i) => ({ id: `mt-default-${i}`, ...m })),
        cadence: 'biweekly',
        reviewAfterDays: 60,
        criteria: ''
      }
    };
  }
}
