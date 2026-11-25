import { AfterViewChecked, Component, DestroyRef, ElementRef, HostListener, OnDestroy, OnInit, ViewChild, effect, inject, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { combineLatest, map, of, switchMap } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { PscMockDataService } from '../../services/psc-mock-data.service';
import { ConversationService } from '../../services/conversation.service';
import { AiMessage, Artifact, Conversation, PdlcPhaseId, Project, ProjectLifecycle, Team, TeamMember } from '../../models/psc.models';
import { TeamsService } from '../../services/teams.service';
import { PDLC_PHASES, PdlcDeliverable, PdlcPhase, pdlcPhase } from '../../constants/pdlc';
import { ProjectLifecycleService } from '../../services/project-lifecycle.service';
import { KnowledgeKind, KnowledgeRef } from '../../models/product-memory.models';
import { KNOWLEDGE_KIND_META, ProductMemoryService } from '../../services/product-memory.service';
import { ArtifactCanvasService } from '../../services/artifact-canvas.service';
import { ChatOrganizerService } from '../../services/chat-organizer.service';
import { CONTEXT_KIND_ICON, CONTEXT_SOURCES, ContextAttachment, ContextSourceKind, ContextSourceMeta, ContextSourcesService } from '../../services/context-sources.service';
import { PromptRefinerService, REFINE_OPTIONS, RefineMode } from '../../services/prompt-refiner.service';
import { CURRENT_USER } from '../../constants/current-user';
import { ArtifactCanvasComponent } from '../../components/artifact-canvas/artifact-canvas.component';
import { ArtifactToolbarComponent } from '../../components/artifact-toolbar/artifact-toolbar.component';
import { ActivityWatchComponent } from '../../components/activity-watch/activity-watch.component';
import { initials, projectGradient } from '../../constants/project-visuals';
import {
  COMPOSER_OPTIONS,
  getArtifactIconName,
  getArtifactLabel,
  getArtifactOption,
  getArtifactShortLabel,
  isArtifactOptionId,
  isChatMode
} from '../../constants/artifact-options';
import { GOLDEN_WORKFLOWS, GoldenWorkflow, getWorkflow, workflowStepIndex, workflowSummary } from '../../constants/golden-workflows';

type PromptMenu = 'project' | 'artifact' | 'context' | 'refine' | 'move' | 'team';
/** One row in the Golden workflow menu: chat only, a workflow, or a single document. */
interface ModeEntry { kind: 'chat' | 'workflow' | 'doc'; id: string; label: string; desc?: string; icon: string; }
/** Tabs in a project's header. The left panel holds only the chat history. */
export type ProjectTab = 'chat' | 'context' | 'documents';
/** A document drafted in one of the project's chats (latest version per chat + type). */
interface ProjectDocument { artifact: Artifact; chat: Conversation; }
/** Screen inside the Add context popover: the source list, or one source's picker. */
type ContextView = 'root' | ContextSourceKind | 'kb';

interface RouteState {
  artifactId: string | null;
  conversationId: string | null;
  openArtifactId: string | null;
  /** ?project=<id> on a new chat scopes it to that project. */
  projectId: string | null;
  /** ?kickoff=1 (from the New Project wizard) pre-fills a first prompt for the project. */
  kickoff: boolean;
  /** ?prompt=… pre-fills the prompt (e.g. "Iterate in chat" from the Repository). */
  prompt?: string | null;
  /** ?context=<memoryId> ("Use in chat" on Product Memory) pre-selects that item as knowledge. */
  contextId: string | null;
  conversation?: Conversation;
  pending: boolean;
}

@Component({
  selector: 'app-psc-home',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LucideAngularModule,
    RouterLink,
    ArtifactCanvasComponent,
    ArtifactToolbarComponent,
    ActivityWatchComponent
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss', './home-project-workspace.scss', './home-prompt-bar.scss', './home-landing.scss']
})
export class HomeComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('messageList') private messageList?: ElementRef<HTMLElement>;
  @ViewChild('promptInput') private promptInput?: ElementRef<HTMLTextAreaElement>;

  @ViewChild('homeRoot') private homeRoot?: ElementRef<HTMLElement>;
  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;

  private readonly destroyRef = inject(DestroyRef);
  readonly canvas = inject(ArtifactCanvasService);
  private shouldScroll = false;
  private dragStart: { x: number; width: number } | null = null;

  messages: AiMessage[] = [];
  activeConversation: Conversation | null = null;
  promptText = '';
  /** New chats start on the first golden workflow's first document (there is no chat-only mode). */
  selectedArtifact = GOLDEN_WORKFLOWS[0].steps[0];
  selectedContextIds: string[] = [];
  /** Project the current chat belongs to (null = not tied to a project). */
  selectedProjectId: string | null = null;
  isListening = false;
  isTyping = false;
  /**
   * Short status line under the prompt bar. Clears itself after 4 s, except the "choose a project" prompt,
   * which stays until a project is picked.
   */
  private feedbackText = '';
  private feedbackTimer = 0;
  get voiceMessage(): string {
    return this.feedbackText;
  }
  set voiceMessage(text: string) {
    this.feedbackText = text;
    window.clearTimeout(this.feedbackTimer);
    if (text && !this.sendAfterProject) this.feedbackTimer = window.setTimeout(() => (this.feedbackText = ''), 4000);
  }
  /** Errors read as errors; everything else is a neutral note. */
  get feedbackIsError(): boolean {
    return /couldn’t|not supported/i.test(this.feedbackText);
  }
  isResizing = false;

  /** Chat first, then the documents it can create. */
  readonly artifactOptions = COMPOSER_OPTIONS;

  // ── Golden workflow picker ──
  /** Golden workflow the next message follows (null = chat only, or a single document). */
  selectedWorkflowId: string | null = GOLDEN_WORKFLOWS[0].id;
  readonly menuEntries: ModeEntry[] = [
    ...GOLDEN_WORKFLOWS.map(w => ({ kind: 'workflow' as const, id: w.id, label: w.label, desc: workflowSummary(w), icon: w.icon })),
    ...COMPOSER_OPTIONS.filter(o => !isChatMode(o.id)).map(o => ({ kind: 'doc' as const, id: o.id, label: o.label, icon: o.iconName }))
  ];

  get activeWorkflow(): GoldenWorkflow | undefined {
    return getWorkflow(this.selectedWorkflowId);
  }

  /** 0-based step the next message drafts, in the active workflow. */
  get workflowStep(): number {
    const w = this.activeWorkflow;
    return w ? Math.max(0, w.steps.indexOf(this.selectedArtifact)) : 0;
  }

  get pickerCaption(): string {
    return this.activeWorkflow ? 'Golden workflow' : 'Single document';
  }

  get pickerValue(): string {
    const w = this.activeWorkflow;
    if (w) return `${w.label} · ${this.workflowStep + 1}/${w.steps.length}`;
    return isChatMode(this.selectedArtifact) ? 'Chat only' : getArtifactShortLabel(this.selectedArtifact);
  }

  get pickerIcon(): string {
    return this.activeWorkflow?.icon ?? getArtifactIconName(this.selectedArtifact);
  }

  get pickerTitle(): string {
    const w = this.activeWorkflow;
    if (w) return `${w.label}: ${workflowSummary(w)}. Next: ${getArtifactShortLabel(this.selectedArtifact)}`;
    return isChatMode(this.selectedArtifact) ? 'Chat only. Pick a golden workflow to draft documents' : `Drafting a ${this.selectedArtifactLabel}`;
  }

  isEntrySelected(e: ModeEntry): boolean {
    if (e.kind === 'workflow') return this.selectedWorkflowId === e.id;
    return !this.selectedWorkflowId && this.selectedArtifact === e.id;
  }

  selectEntry(e: ModeEntry): void {
    if (e.kind === 'workflow') this.selectWorkflow(e.id);
    else this.selectArtifact(e.id);
  }

  selectWorkflow(id: string): void {
    const w = getWorkflow(id);
    if (!w) return;
    this.selectedWorkflowId = id;
    const c = this.activeConversation;
    const step = c ? w.steps[workflowStepIndex(w, c.messages.flatMap(m => m.artifacts || []))] : w.steps[0];
    if (c) this.conversations.setWorkflow(c.id, id);
    this.onArtifactChange(step);
    this.openMenu = null;
    this.focusPrompt();
  }

  /**
   * What a new chat drafts: the document in the URL (/psc/home/<id>), keeping the workflow when it's one of its steps,
   * otherwise the default golden workflow. Chat-only is no longer offered.
   */
  private applyNewChatSelection(artifactId: string | null | undefined): void {
    if (artifactId && !isChatMode(artifactId)) {
      if (!this.activeWorkflow?.steps.includes(artifactId)) this.selectedWorkflowId = null;
      this.selectedArtifact = artifactId;
      return;
    }
    const def = GOLDEN_WORKFLOWS[0];
    this.selectedWorkflowId = def.id;
    this.selectedArtifact = def.steps[0];
  }

  /** Reply footer for a workflow step: what was drafted and what comes next. */
  private workflowNote(): string | undefined {
    const w = this.activeWorkflow;
    const idx = w ? w.steps.indexOf(this.selectedArtifact) : -1;
    if (!w || idx === -1) return undefined;
    const drafted = new Set((this.activeConversation?.messages ?? []).flatMap(m => m.artifacts || []).map(a => getArtifactOption(a.type)?.id ?? a.type));
    drafted.add(this.selectedArtifact);
    const next = w.steps.find(s => !drafted.has(s));
    return next
      ? `**${w.label}** · step ${idx + 1} of ${w.steps.length}. Send your next message (even just “next”) to draft the **${getArtifactLabel(next).toLowerCase()}**.`
      : `**${w.label}** · all ${w.steps.length} documents are drafted. Ask for changes to any of them here.`;
  }

  // ── Team collaboration: teams assigned to the project, plus teams and people added to this chat ──
  private readonly teamsSvc = inject(TeamsService);
  private newChatCollaborators: string[] = [];
  private newChatTeamIds: string[] = [];

  /** People who can be invited individually (everyone but you), from the Teams page. */
  get teamMembers(): TeamMember[] {
    return this.teamsSvc.members().filter(m => m.name !== CURRENT_USER.name);
  }

  /** Teams assigned to this project: they're always part of its chats. */
  get projectTeams(): Team[] {
    return this.teamsSvc.teamsForProject(this.workspaceProject?.id);
  }

  get otherTeams(): Team[] {
    const onProject = new Set(this.projectTeams.map(t => t.id));
    return this.teamsSvc.teams().filter(t => !onProject.has(t.id));
  }

  private get chatTeamIds(): string[] {
    return this.activeConversation ? this.activeConversation.teamIds ?? [] : this.newChatTeamIds;
  }

  isTeamOn(t: Team): boolean {
    return this.projectTeams.some(p => p.id === t.id) || this.chatTeamIds.includes(t.id);
  }

  /** Add or remove a team for this chat (project teams are fixed; change them on the Teams page). */
  toggleTeam(t: Team): void {
    if (this.projectTeams.some(p => p.id === t.id)) return;
    const on = this.chatTeamIds.includes(t.id);
    const next = on ? this.chatTeamIds.filter(id => id !== t.id) : [...this.chatTeamIds, t.id];
    if (this.activeConversation) this.conversations.setTeams(this.activeConversation.id, next);
    else this.newChatTeamIds = next;
    this.voiceMessage = on ? `${t.name} was removed from this chat.` : `${t.name} (${t.memberIds.length} ${t.memberIds.length === 1 ? 'person' : 'people'}) can now see and contribute to this chat.`;
  }

  /** Teams in this chat: the project's plus any added to the chat. */
  get activeTeams(): Team[] {
    return this.teamsSvc.teams().filter(t => this.isTeamOn(t));
  }

  /** The team a person joins this chat through, if any. */
  viaTeam(m: TeamMember): Team | undefined {
    return this.activeTeams.find(t => t.memberIds.includes(m.id));
  }

  /** Everyone collaborating on this chat (teams + individuals), without you. */
  get participants(): TeamMember[] {
    const ids = new Set(this.activeTeams.flatMap(t => t.memberIds));
    return this.teamMembers.filter(m => ids.has(m.id) || this.isCollaborator(m.name));
  }

  get collaborators(): string[] {
    return this.activeConversation ? this.activeConversation.collaborators ?? [] : this.newChatCollaborators;
  }

  isCollaborator(name: string): boolean {
    return this.collaborators.includes(name);
  }

  toggleCollaborator(name: string): void {
    const next = this.isCollaborator(name) ? this.collaborators.filter(n => n !== name) : [...this.collaborators, name];
    if (this.activeConversation) this.conversations.setCollaborators(this.activeConversation.id, next);
    else this.newChatCollaborators = next;
    this.voiceMessage = next.includes(name) ? `${name} can now see and contribute to this chat.` : `${name} was removed from this chat.`;
  }
  readonly isChatMode = isChatMode;
  readonly getArtifactIconName = getArtifactIconName;
  readonly getArtifactLabel = getArtifactLabel;
  readonly getArtifactShortLabel = getArtifactShortLabel;
  readonly userName = CURRENT_USER.firstName;

  /** Which prompt-bar popover is open (project, artifact picker, knowledge sources, refine). */
  openMenu: PromptMenu | null = null;
  /** Keyboard-highlighted option in the artifact picker. */
  artifactMenuIndex = 0;

  // ── Prompt refine ──
  readonly refineOptions = REFINE_OPTIONS;
  refineMenuIndex = 0;
  isRefining = false;
  /** Text before the last refine, kept so the user can undo it. Cleared once they edit the prompt. */
  refineUndo: { previous: string; refined: string; label: string } | null = null;
  private readonly refiner = inject(PromptRefinerService);

  // ── Knowledge (from Product Memory) ──
  private readonly memory = inject(ProductMemoryService);
  readonly kindMeta = KNOWLEDGE_KIND_META;
  knowledgeQuery = '';
  knowledgeFilter: 'all' | KnowledgeKind = 'all';

  // ── Add context (Jira, Confluence, Azure DevOps, modules, knowledge base, files) ──
  private readonly sources = inject(ContextSourcesService);
  readonly contextSources = CONTEXT_SOURCES;
  readonly contextKindIcon = CONTEXT_KIND_ICON;
  contextView: ContextView = 'root';
  contextQuery = '';
  contextType = 'all';
  /** Non-memory context attached to the chat. */
  attachments: ContextAttachment[] = [];

  constructor(
    private mockData: PscMockDataService,
    private conversations: ConversationService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    // Canvas "Ask AI to refine" → pre-fill the chat prompt, targeting the same artifact type so the reply is its next version.
    effect(() => {
      const req = this.canvas.refineRequest();
      if (!req) return;
      untracked(() => {
        const option = getArtifactOption(req.artifactType);
        if (option) this.selectedArtifact = option.id;
        this.promptText = req.text;
        this.refineUndo = null;
        this.openMenu = null;
        this.focusPrompt(true);
      });
    });
  }

  /** Artifact ids seen at the last route update — to spot a newly generated version. */
  private seenArtifactIds = new Set<string>();

  /** True once a prompt has been sent in the current conversation. */
  get conversationStarted(): boolean {
    return !!this.activeConversation || this.messages.length > 0;
  }

  /** The prompt bar docks to the bottom once the first AI response has completed (always, inside a project). */
  get docked(): boolean {
    return this.projectMode || this.messages.some(m => m.role !== 'user');
  }

  // ── Project workspace: a project's chats are their own space (project heading, chats + context panel) ──

  /** The project this screen is working in: the open chat's project, or the one picked for a new chat. */
  get workspaceProject(): Project | undefined {
    return this.activeConversation ? this.conversationProject : this.selectedProject;
  }

  get projectMode(): boolean {
    return !!this.workspaceProject;
  }

  /**
   * Left panel (chats, lifecycle, context). Docked beside the chat; while the canvas is open (or the panel is
   * hidden) it collapses to a slim rail, and opening it from there shows it over the chat.
   */
  projectPanelOpen = this.readPanelPref();
  /** Panel shown over the chat/canvas (from the rail or, on small screens, the header button). */
  panelOverlay = false;

  /** Projects have no left chat-history panel: chats are listed in the main sidebar. */
  get panelDocked(): boolean {
    return false;
  }

  get showProjectPanel(): boolean {
    return false;
  }

  /** Slim rail with the project's chats / lifecycle / context, whenever the panel isn't docked. */
  get showProjectRail(): boolean {
    return false; // no slim rail in projects: reopen chats from the header button
  }

  toggleProjectPanel(): void {
    if (this.panelOverlay) { this.panelOverlay = false; return; }
    this.projectPanelOpen = !this.projectPanelOpen;
    try { localStorage.setItem('psc.home.project-panel', String(this.projectPanelOpen)); } catch { /* ignore */ }
  }

  /** From the rail (or the small-screen header button): dock it back, or show it over the canvas / on a phone. */
  openProjectPanel(): void {
    if (this.canvasOpen || window.innerWidth < 900) this.panelOverlay = true;
    else {
      this.projectPanelOpen = true;
      try { localStorage.setItem('psc.home.project-panel', 'true'); } catch { /* ignore */ }
    }
  }

  // ── Project tabs: Chat · Context · Documents ──
  projectTab: ProjectTab = 'chat';

  get projectTabs(): { id: ProjectTab; label: string; icon: string; badge?: string }[] {
    const docs = this.projectDocuments.length;
    return [
      { id: 'chat', label: 'Chat', icon: 'message-square' },
      { id: 'context', label: 'Context', icon: 'layers', badge: this.contextCount ? String(this.contextCount) : undefined },
      { id: 'documents', label: 'Documents', icon: 'file-text', badge: docs ? String(docs) : undefined }
    ];
  }

  setProjectTab(tab: ProjectTab): void {
    this.openMenu = null;
    this.projectTab = tab;
    if (tab === 'chat') this.focusPrompt(true);
  }

  /** Arrow keys move between tabs (WAI-ARIA tabs pattern). */
  onTabKeydown(e: KeyboardEvent, i: number): void {
    const n = this.projectTabs.length;
    const to = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    this.setProjectTab(this.projectTabs[to].id);
    setTimeout(() => document.getElementById(`pw-tab-${this.projectTabs[to].id}`)?.focus());
  }

  /** A tab other than Chat is showing (the conversation and composer are hidden, not destroyed). */
  get otherTabOpen(): boolean {
    return this.projectMode && this.projectTab !== 'chat';
  }

  /** Documents drafted in this project's chats — the latest version per chat and type, newest first. */
  get projectDocuments(): ProjectDocument[] {
    const latest = new Map<string, ProjectDocument>();
    for (const chat of this.workspaceChats) {
      for (const m of chat.messages) {
        for (const a of m.artifacts ?? []) latest.set(`${chat.id}:${a.type}`, { artifact: a, chat });
      }
    }
    return [...latest.values()].sort((x, y) => y.artifact.updatedAt.localeCompare(x.artifact.updatedAt));
  }

  /** Open a document on the canvas, inside the chat it came from. */
  openDocument(d: ProjectDocument): void {
    this.projectTab = 'chat';
    this.router.navigate(['/psc', 'home', d.chat.artifactId, d.chat.id], { queryParams: { artifact: d.artifact.id } });
  }

  // ── Chat history (left panel): search, grouping, rename, delete ──
  chatQuery = '';
  renamingChatId: string | null = null;
  renameDraft = '';
  confirmDeleteChatId: string | null = null;

  /** The project's chats filtered by the search box, grouped by when they were last active. */
  get chatGroups(): { label: string; chats: Conversation[] }[] {
    const q = this.chatQuery.trim().toLowerCase();
    const list = q ? this.workspaceChats.filter(c => c.title.toLowerCase().includes(q) || c.messages.some(m => m.content.toLowerCase().includes(q))) : this.workspaceChats;
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const today = startOfToday.getTime();
    const week = today - 6 * 86_400_000;
    const groups = [
      { label: 'Today', chats: [] as Conversation[] },
      { label: 'Previous 7 days', chats: [] as Conversation[] },
      { label: 'Older', chats: [] as Conversation[] }
    ];
    for (const c of list) {
      const t = new Date(c.updatedAt).getTime();
      groups[t >= today ? 0 : t >= week ? 1 : 2].chats.push(c);
    }
    return groups.filter(g => g.chats.length);
  }

  startRenameChat(c: Conversation, e?: Event): void {
    e?.stopPropagation();
    this.confirmDeleteChatId = null;
    this.renamingChatId = c.id;
    this.renameDraft = c.title;
    setTimeout(() => {
      const input = document.getElementById(`pp-rename-${c.id}`) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  commitRenameChat(): void {
    if (this.renamingChatId && this.renameDraft.trim()) this.conversations.renameConversation(this.renamingChatId, this.renameDraft);
    this.renamingChatId = null;
  }

  askDeleteChat(c: Conversation, e?: Event): void {
    e?.stopPropagation();
    this.renamingChatId = null;
    this.confirmDeleteChatId = c.id;
  }

  /** Delete a chat; if it's the open one, land on a new chat in the same project. */
  deleteChat(c: Conversation, e?: Event): void {
    e?.stopPropagation();
    const projectId = c.projectId;
    const wasOpen = c.id === this.activeConversation?.id;
    this.confirmDeleteChatId = null;
    this.conversations.deleteConversation(c.id);
    if (wasOpen) this.router.navigate(['/psc', 'home'], { queryParams: { project: projectId ?? null } });
  }

  cancelChatEdit(): void {
    this.renamingChatId = null;
    this.confirmDeleteChatId = null;
  }

  /** On small screens (and over the canvas) the panel is a drawer: close it after picking a chat. */
  private closePanelOnSmallScreens(): void {
    this.panelOverlay = false;
    if (window.innerWidth < 900) this.projectPanelOpen = false;
  }

  // ── Lifecycle (PDLC) of the workspace project: phase, exit gate, deliverables, evaluation ──
  private readonly lifecycles = inject(ProjectLifecycleService);
  /** Shown under the panel's lifecycle after signing off a phase. */
  lifecycleNote = '';

  get workspaceLifecycle(): ProjectLifecycle | undefined {
    return this.lifecycles.get(this.workspaceProject?.id);
  }

  get lifecyclePhase(): PdlcPhase | undefined {
    const lc = this.workspaceLifecycle;
    return lc ? pdlcPhase(lc.current) : undefined;
  }

  /** Phases in scope with their state, for the panel's track. */
  get lifecycleTrack(): { id: PdlcPhaseId; label: string; icon: string; state: 'done' | 'current' | 'next' }[] {
    const lc = this.workspaceLifecycle;
    if (!lc) return [];
    return PDLC_PHASES.filter(p => lc.phases.includes(p.id)).map(p => ({
      id: p.id, label: p.label, icon: p.icon,
      state: p.id === lc.current ? 'current' : lc.completed.includes(p.id) ? 'done' : 'next'
    }));
  }

  get nextPhase(): PdlcPhase | undefined {
    const lc = this.workspaceLifecycle;
    const next = lc?.phases[lc.phases.indexOf(lc.current) + 1];
    return next ? pdlcPhase(next) : undefined;
  }

  get lifecycleIndex(): number {
    const lc = this.workspaceLifecycle;
    return lc ? lc.phases.indexOf(lc.current) + 1 : 0;
  }

  targetFor(id: PdlcPhaseId): string | undefined {
    return this.workspaceLifecycle?.targets[id];
  }

  /** Sign off the current phase's exit gate and move on; the chat's lifecycle context follows. */
  advancePhase(): void {
    const p = this.workspaceProject;
    if (!p) return;
    const from = this.lifecyclePhase?.label;
    const next = this.lifecycles.advance(p.id);
    if (!next) return;
    this.lifecycleNote = `${from} signed off — now in ${pdlcPhase(next).label}.`;
    this.refreshLifecycleContext();
  }

  /** After Evaluate: iterate — go back to a phase and run the loop again. */
  restartFrom(id: PdlcPhaseId): void {
    const p = this.workspaceProject;
    if (!p) return;
    this.lifecycles.setCurrent(p.id, id);
    this.lifecycleNote = `New iteration — back to ${pdlcPhase(id).label}.`;
    this.refreshLifecycleContext();
  }

  /** Swap the chat's lifecycle/evaluation items for the project's current ones. */
  private refreshLifecycleContext(): void {
    const p = this.workspaceProject;
    if (!p) return;
    const fresh = this.sources.lifecycleItems(p.id);
    const had = this.attachments.some(a => a.kind === 'pdlc' && a.projectId === p.id);
    if (!had && this.activeConversation) return; // the PM removed it from this chat on purpose
    this.attachments = [...this.attachments.filter(a => !(a.kind === 'pdlc' && a.projectId === p.id)), ...fresh];
    this.contextChanged();
  }

  /** Start a phase deliverable (PRD, epics, outcome review…) as a new chat in the project. */
  startDeliverable(d: PdlcDeliverable): void {
    const p = this.workspaceProject;
    if (!p || !d.artifactId) return;
    const starter = { artifactId: d.artifactId, prompt: (d.prompt ?? `Create ${d.label} for {project}.`).replace(/\{project\}/g, p.name) };
    this.closePanelOnSmallScreens();
    if (this.activeConversation) {
      this.router.navigate(['/psc', 'home', d.artifactId], { queryParams: { project: p.id } }).then(() => this.useStarter(starter));
    } else {
      this.useStarter(starter);
    }
  }

  private readPanelPref(): boolean {
    if (typeof window !== 'undefined' && window.innerWidth < 900) return false;
    try { return localStorage.getItem('psc.home.project-panel') !== 'false'; } catch { return true; }
  }

  /** Every chat in the workspace project, newest first. */
  get workspaceChats(): Conversation[] {
    const id = this.workspaceProject?.id;
    return id ? this.allChats.filter(c => c.projectId === id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : [];
  }

  openWorkspaceChat(c: Conversation): void {
    if (this.renamingChatId === c.id) return;
    this.closePanelOnSmallScreens();
    this.projectTab = 'chat';
    this.openChat(c);
  }

  /** Quick starts on an empty project chat: the current phase's deliverables (then the next phase's). */
  get projectStarters(): { artifactId: string; label: string; prompt: string }[] {
    const p = this.workspaceProject;
    if (!p) return [];
    const phase = this.lifecyclePhase;
    if (phase) {
      const fill = (d: PdlcDeliverable) => ({ artifactId: d.artifactId!, label: d.label, prompt: (d.prompt ?? '').replace(/\{project\}/g, p.name) });
      const now = phase.deliverables.filter(d => d.artifactId && d.prompt).map(fill);
      const next = (this.nextPhase?.deliverables ?? []).filter(d => d.artifactId && d.prompt).map(fill);
      const seen = new Set<string>();
      return [...now, ...next].filter(s => !seen.has(s.label) && seen.add(s.label)).slice(0, 4);
    }
    return [
      { artifactId: 'prd', label: 'PRD for the next release', prompt: `Write a PRD for the next release of ${p.name}.` },
      { artifactId: 'epic', label: 'Break down into epics', prompt: `Break ${p.name} down into epics with goals and success metrics.` },
      { artifactId: 'story', label: 'User stories', prompt: `Write user stories with acceptance criteria for ${p.name}'s top priority feature.` },
      { artifactId: 'competitive', label: 'Competitor analysis', prompt: `Run a competitor analysis for ${p.name}.` }
    ];
  }

  /** The Home landing shows projects only; the prompt bar appears inside a project (or an older chat). */
  get showComposer(): boolean {
    return this.projectMode || this.conversationStarted;
  }

  useStarter(s: { artifactId: string; prompt: string }): void {
    this.projectTab = 'chat';
    this.onArtifactChange(s.artifactId);
    this.promptText = s.prompt;
    this.refineUndo = null;
    this.focusPrompt(true);
  }

  // ── File a general chat into a project ──
  private readonly organizer = inject(ChatOrganizerService);

  get moveTargets(): { id: string; name: string; index: number }[] {
    return this.activeConversation ? this.organizer.targets(this.activeConversation) : [];
  }

  moveActiveChat(projectId: string): void {
    this.openMenu = null;
    if (this.activeConversation) this.organizer.move(this.activeConversation.id, projectId);
  }

  /** Back to the general Home (no project). */
  leaveProject(): void {
    this.router.navigate(['/psc', 'home']);
  }

  /** Context changed while a chat is open → keep it with that chat. */
  private contextChanged(): void {
    if (this.activeConversation) this.conversations.updateContext(this.activeConversation.id, this.selectedContextIds, this.attachments);
  }

  /** The canvas is open when the URL carries ?artifact=<id> for an artifact in this conversation. */
  get canvasOpen(): boolean {
    return !!this.activeConversation && !!this.canvas.artifact();
  }

  get greeting(): string {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  get selectedArtifactLabel(): string {
    return getArtifactLabel(this.selectedArtifact);
  }

  ngOnInit(): void {
    this.conversations.conversations$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(list => {
      const counts: Record<string, number> = {};
      const docs: Record<string, number> = {};
      const active: Record<string, string> = {};
      for (const c of list) {
        if (!c.projectId) continue;
        counts[c.projectId] = (counts[c.projectId] ?? 0) + 1;
        // Documents: one per chat + type (versions don't count twice).
        docs[c.projectId] = (docs[c.projectId] ?? 0) + new Set(c.messages.flatMap(m => (m.artifacts || []).map(a => a.type))).size;
        if (!active[c.projectId] || c.updatedAt > active[c.projectId]) active[c.projectId] = c.updatedAt;
      }
      this.chatCounts = counts;
      this.docCounts = docs;
      this.lastChatAt = active;
      this.allChats = list;
    });

    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(
        switchMap(([params, query]) => {
          const artifactId = params.get('artifact');
          const conversationId = params.get('conversationId');
          const openArtifactId = query.get('artifact');
          const projectId = query.get('project');
          const kickoff = query.get('kickoff') === '1';
          const contextId = query.get('context');
          const prompt = query.get('prompt');
          if (!conversationId) {
            return of<RouteState>({ artifactId, conversationId: null, openArtifactId: null, projectId, kickoff, contextId, prompt, pending: false });
          }
          return combineLatest([
            this.conversations.watchConversation(conversationId),
            this.conversations.isPending$(conversationId)
          ]).pipe(
            map(([conversation, pending]): RouteState => ({ artifactId, conversationId, openArtifactId, projectId: null, kickoff: false, contextId: null, conversation, pending }))
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(state => this.applyRouteState(state));
  }

  ngOnDestroy(): void {
    window.clearTimeout(this.autoRefineTimer);
    window.clearTimeout(this.feedbackTimer);
    this.canvas.close();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll && this.messageList) {
      const el = this.messageList.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.shouldScroll = false;
    }
  }


  // ── Prompt-bar popovers ──
  toggleMenu(menu: PromptMenu, event?: Event): void {
    event?.stopPropagation();
    this.openMenu = this.openMenu === menu ? null : menu;
    if (this.openMenu === 'context') {
      this.contextView = 'root';
      this.knowledgeQuery = '';
      this.knowledgeFilter = 'all';
    }
    if (this.openMenu === 'context' || this.openMenu === 'project' || this.openMenu === 'team' || this.openMenu === 'refine') this.placePopover(menu === 'context' && this.panelContextMenu ? '.psc-pp-context-anchor' : '.psc-prompt-composer');
    if (this.openMenu === 'artifact') {
      this.artifactMenuIndex = Math.max(0, this.menuEntries.findIndex(e => this.isEntrySelected(e)));
      setTimeout(() => this.focusArtifactOption());
    }
    if (this.openMenu === 'refine') {
      this.refineMenuIndex = 0;
      setTimeout(() => this.focusMenuItem('refine-option', this.refineMenuIndex));
    }
  }

  /** Tall popovers (project, knowledge) open toward whichever side of the composer has room, capped to fit. */
  popoverUp = false;
  popoverMaxHeight: number | null = null;
  /** Position of the context menu when opened from the project panel (fixed, so the panel's scroll can't clip it). */
  panelPopoverStyle: Record<string, string> | null = null;

  /** The context menu is opened from the project's Context tab (otherwise from the prompt bar's Add Context). */
  get panelContextMenu(): boolean {
    return this.projectMode && this.projectTab === 'context';
  }

  /** Keep the Context tab's menu attached to "Add" while the tab scrolls. */
  onPanelScroll(): void {
    if (this.openMenu === 'context' && this.panelContextMenu) this.placePopover('.psc-pp-context-anchor');
  }

  private placePopover(anchor = '.psc-prompt-composer'): void {
    const el = this.homeRoot?.nativeElement.querySelector<HTMLElement>(anchor);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 16;
    const below = window.innerHeight - r.bottom - gap;
    const above = r.top - gap;
    const inPanel = anchor !== '.psc-prompt-composer';
    if (inPanel) {
      // In the project's Context tab: a fixed popover under "Add" (or above it when there's no room), panel-wide, always on screen.
      const panel = el.closest<HTMLElement>('.psc-pw-tabpanel')?.getBoundingClientRect();
      const left = (panel?.left ?? r.left) + 8;
      const width = Math.min(380, (panel?.width ?? 300) - 16, window.innerWidth - left - 8);
      const up = below < 300 && above > below;
      this.popoverUp = false;
      this.popoverMaxHeight = Math.max(200, Math.min(480, up ? above : below));
      // A transformed ancestor (the page's entry animation) becomes the containing block of position: fixed.
      const root = this.homeRoot?.nativeElement as HTMLElement | undefined;
      const box = root && getComputedStyle(root).transform !== 'none' ? root.getBoundingClientRect() : { left: 0, top: 0, bottom: window.innerHeight };
      this.panelPopoverStyle = up
        ? { left: `${left - box.left}px`, width: `${width}px`, top: 'auto', bottom: `${box.bottom - r.top + 6}px` }
        : { left: `${left - box.left}px`, width: `${width}px`, top: `${r.bottom + 6 - box.top}px`, bottom: 'auto' };
      return;
    }
    this.popoverUp = this.docked || (below < 360 && above > below);
    this.popoverMaxHeight = Math.max(220, Math.min(480, this.popoverUp ? above : below));
  }

  get canRefine(): boolean {
    return !!this.promptText.trim() && !this.isRefining && !this.isTyping;
  }

  /** Rewrites the prompt text using the selected artifact + knowledge sources as context. */
  refinePrompt(mode: RefineMode): void {
    const text = this.promptText.trim();
    if (!text || this.isRefining) return;
    const option = this.refineOptions.find(o => o.id === mode)!;
    const contextNames = this.contextLabels;
    const previous = this.promptText;
    this.openMenu = null;
    this.isRefining = true;
    this.refiner
      .refine(text, mode, { artifactId: this.selectedArtifact, contextNames })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: refined => {
          this.promptText = refined;
          this.refineUndo = { previous, refined, label: option.label };
          this.isRefining = false;
          this.focusPrompt(true);
        },
        error: () => {
          this.isRefining = false;
          this.voiceMessage = 'Couldn’t refine the prompt. Please try again.';
        }
      });
  }

  undoRefine(): void {
    if (!this.refineUndo) return;
    this.autoRefineSkip = this.refineUndo.previous; // don't auto-refine straight back
    this.promptText = this.refineUndo.previous;
    this.refineUndo = null;
    this.focusPrompt(true);
  }

  /** Any manual edit after a refine makes the undo point stale. */
  onPromptChange(value: string): void {
    this.promptText = value;
    if (this.refineUndo && value !== this.refineUndo.refined) this.refineUndo = null;
    this.autoResizePrompt();
    this.scheduleAutoRefine();
  }

  // ── Auto refine while typing: once you pause, the prompt is improved in place (Undo restores yours) ──
  private autoRefineTimer = 0;
  autoRefining = false;
  /** Text we must not auto-refine again: the last result, or what Undo restored. */
  private autoRefineSkip = '';

  private scheduleAutoRefine(delayMs = 1000): void {
    window.clearTimeout(this.autoRefineTimer);
    const text = this.promptText.trim();
    if (!this.autoRefine || text.length < 12 || this.isRefining || this.isTyping || text === this.autoRefineSkip.trim()) return;
    this.autoRefineTimer = window.setTimeout(() => this.runAutoRefine(), delayMs);
  }

  private runAutoRefine(): void {
    const previous = this.promptText;
    const text = previous.trim();
    if (!this.autoRefine || !text || this.isRefining || text === this.autoRefineSkip.trim()) return;
    this.autoRefining = true;
    this.refiner.refine(text, 'improve', { artifactId: this.selectedArtifact, contextNames: this.contextLabels })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: refined => {
          this.autoRefining = false;
          // Kept typing meanwhile (or sent it): leave their text alone; the next pause refines it.
          if (this.promptText !== previous) return;
          this.autoRefineSkip = refined;
          this.promptText = refined;
          this.refineUndo = { previous, refined, label: 'Auto refine' };
          this.focusPrompt(true);
        },
        error: () => { this.autoRefining = false; }
      });
  }

  /** Grows the prompt textarea with its content (capped in CSS via max-height), shrinks back when cleared. */
  autoResizePrompt(): void {
    setTimeout(() => {
      const el = this.promptInput?.nativeElement;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
    });
  }

  onRefineMenuKeydown(event: KeyboardEvent): void {
    const last = this.refineOptions.length - 1;
    const keys: Record<string, () => void> = {
      ArrowDown: () => (this.refineMenuIndex = this.refineMenuIndex >= last ? 0 : this.refineMenuIndex + 1),
      ArrowUp: () => (this.refineMenuIndex = this.refineMenuIndex <= 0 ? last : this.refineMenuIndex - 1),
      Home: () => (this.refineMenuIndex = 0),
      End: () => (this.refineMenuIndex = last),
      Enter: () => this.refinePrompt(this.refineOptions[this.refineMenuIndex].id),
      ' ': () => this.refinePrompt(this.refineOptions[this.refineMenuIndex].id)
    };
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    action();
    if (this.openMenu === 'refine') this.focusMenuItem('refine-option', this.refineMenuIndex);
  }

  private focusMenuItem(prefix: string, index: number): void {
    this.homeRoot?.nativeElement.querySelector<HTMLElement>(`#${prefix}-${index}`)?.focus();
  }

  closeMenus(): void {
    this.openMenu = null;
  }

  selectArtifact(id: string): void {
    // Chat only or a single document: leaves any golden workflow.
    if (this.selectedWorkflowId) {
      this.selectedWorkflowId = null;
      if (this.activeConversation) this.conversations.setWorkflow(this.activeConversation.id, null);
    }
    this.onArtifactChange(id);
    this.openMenu = null;
    this.focusPrompt();
  }

  onArtifactMenuKeydown(event: KeyboardEvent): void {
    const last = this.menuEntries.length - 1;
    const keys: Record<string, () => void> = {
      ArrowDown: () => (this.artifactMenuIndex = this.artifactMenuIndex >= last ? 0 : this.artifactMenuIndex + 1),
      ArrowUp: () => (this.artifactMenuIndex = this.artifactMenuIndex <= 0 ? last : this.artifactMenuIndex - 1),
      Home: () => (this.artifactMenuIndex = 0),
      End: () => (this.artifactMenuIndex = last),
      Enter: () => this.selectEntry(this.menuEntries[this.artifactMenuIndex]),
      ' ': () => this.selectEntry(this.menuEntries[this.artifactMenuIndex])
    };
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    action();
    this.focusArtifactOption();
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.openMenu = null;
    this.sortMenuOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.sortMenuOpen) { this.sortMenuOpen = false; return; }
    // Inside a context source, Esc steps back to the source list first.
    if (this.openMenu === 'context' && this.contextView !== 'root') {
      this.contextBack();
      return;
    }
    if (this.openMenu) {
      this.openMenu = null;
      this.focusPrompt();
      return;
    }
    if (this.panelOverlay) this.panelOverlay = false;
  }

  private focusArtifactOption(): void {
    this.focusMenuItem('artifact-option', this.artifactMenuIndex);
  }

  /** Selecting an artifact on a new prompt reflects it in the URL: /psc/home/<artifact> (keeps ?project). */
  onArtifactChange(id: string): void {
    this.selectedArtifact = id;
    if (!this.activeConversation) {
      // Plain chat lives at /psc/home; a document type is reflected as /psc/home/<artifact>.
      this.router.navigate(['/psc', 'home', ...(isChatMode(id) ? [] : [id])], { replaceUrl: true, queryParamsHandling: 'merge' });
    }
  }

  // ── Projects ↔ chats ──
  readonly projectGradient = projectGradient;
  readonly initials = initials;
  /** Number of chats per project id. */
  chatCounts: Record<string, number> = {};
  private allChats: Conversation[] = [];

  /** All projects, most recently updated first. */
  get projects(): Project[] {
    return [...this.mockData.projects].sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
  }

  get totalProjects(): number {
    return this.mockData.projects.length;
  }

  // ── Home landing: summary and a searchable project grid ──
  docCounts: Record<string, number> = {};
  /** Latest chat activity per project (ISO). */
  private lastChatAt: Record<string, string> = {};
  landingQuery = '';
  landingSort: 'recent' | 'name' | 'chats' = 'recent';
  readonly landingSorts = [
    { id: 'recent' as const, label: 'Recently active' },
    { id: 'name' as const, label: 'Name (A–Z)' },
    { id: 'chats' as const, label: 'Most chats' }
  ];
  readonly statusMeta: Record<Project['status'], { label: string; tone: string }> = {
    active: { label: 'Active', tone: 'green' },
    paused: { label: 'Paused', tone: 'amber' },
    draft: { label: 'Draft', tone: 'gray' },
    completed: { label: 'Completed', tone: 'blue' }
  };

  /** Search appears once there are more than 10 projects. */
  get showProjectSearch(): boolean {
    return this.landingSource.length > 10;
  }

  sortMenuOpen = false;

  get sortLabel(): string {
    return this.landingSorts.find(o => o.id === this.landingSort)?.label ?? '';
  }

  readonly todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  /** Last activity: the newest of the project's own update and its chats. */
  lastActive(p: Project): string {
    const chat = this.lastChatAt[p.id];
    return chat && chat > p.updatedAt ? chat : p.updatedAt;
  }

  /** Preview switch: show the landing as a brand-new user with no projects sees it. */
  previewEmpty = false;

  /** Projects the landing shows (none while previewing the empty state). */
  private get landingSource(): Project[] {
    return this.previewEmpty ? [] : this.mockData.projects;
  }

  get hasProjects(): boolean {
    return this.landingSource.length > 0;
  }

  togglePreviewEmpty(): void {
    this.previewEmpty = !this.previewEmpty;
    this.landingQuery = '';
    this.sortMenuOpen = false;
  }

  get landingStats(): { projects: number; chats: number; docs: number } {
    const ids = new Set(this.landingSource.map(p => p.id));
    let chats = 0, docs = 0;
    for (const id of ids) { chats += this.chatCounts[id] ?? 0; docs += this.docCounts[id] ?? 0; }
    return { projects: ids.size, chats, docs };
  }

  get landingProjects(): Project[] {
    const q = this.landingQuery.trim().toLowerCase();
    const list = this.landingSource.filter(p =>
      (!q || p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q) || p.tags.some(t => t.toLowerCase().includes(q))));
    const by = this.landingSort;
    return list.sort((a, b) =>
      by === 'name' ? a.name.localeCompare(b.name)
        : by === 'chats' ? (this.chatCounts[b.id] ?? 0) - (this.chatCounts[a.id] ?? 0) || this.lastActive(b).localeCompare(this.lastActive(a))
          : this.lastActive(b).localeCompare(this.lastActive(a)));
  }

  /** Latest chat in a project, for the card's Resume action. */
  latestChat(p: Project): Conversation | undefined {
    return this.allChats.filter(c => c.projectId === p.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  }

  projectTeamCount(p: Project): number {
    return this.teamsSvc.teamsForProject(p.id).length;
  }

  projectPhase(p: Project): string | null {
    const lc = this.lifecycles.get(p.id);
    return lc ? pdlcPhase(lc.current).label : null;
  }

  clearLandingFilters(): void {
    this.landingQuery = '';
  }

  /** "just now", "12 min ago", "3 h ago", "Yesterday", "4 days ago", "12 Nov". */
  relativeTime(iso: string): string {
    const t = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso).getTime();
    const mins = Math.round((Date.now() - t) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24 && iso.length > 10) return `${hours} h ago`;
    const days = Math.floor(mins / 1440);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  /** "/" jumps to the project search on the Home landing. */
  @HostListener('document:keydown', ['$event'])
  onSlash(e: KeyboardEvent): void {
    if (e.key !== '/' || this.projectMode || this.conversationStarted || !this.showProjectSearch) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault();
    this.homeRoot?.nativeElement.querySelector<HTMLInputElement>('#landing-search')?.focus();
  }

  get selectedProject(): Project | undefined {
    return this.mockData.findProject(this.selectedProjectId);
  }

  /** Project of the open conversation (shown in the chat header). */
  get conversationProject(): Project | undefined {
    return this.mockData.findProject(this.activeConversation?.projectId);
  }



  /** Project the knowledge picker is scoped to (the open chat's project, or the one selected for a new chat). */
  private get knowledgeProjectId(): string | null {
    return this.activeConversation ? this.activeConversation.projectId ?? null : this.selectedProjectId;
  }

  /** Product Memory items currently grounding the chat. */
  get selectedKnowledge(): KnowledgeRef[] {
    return this.memory.resolve(this.selectedContextIds);
  }

  /** Type filter chips with counts (respecting the search). */
  get knowledgeFilters(): { id: 'all' | KnowledgeKind; label: string; count: number }[] {
    const list = this.searchKnowledge();
    const kinds: KnowledgeKind[] = ['decision', 'insight', 'context', 'meeting', 'source'];
    return [
      { id: 'all' as const, label: 'All', count: list.length },
      ...kinds.map(k => ({ id: k, label: KNOWLEDGE_KIND_META[k].plural, count: list.filter(i => i.kind === k).length })).filter(f => f.count)
    ];
  }

  /** Picker groups: this project's memory first (pinned, then newest), then everything else. */
  get knowledgeGroups(): { label: string; items: KnowledgeRef[] }[] {
    const pid = this.knowledgeProjectId;
    const list = this.searchKnowledge().filter(k => this.knowledgeFilter === 'all' || k.kind === this.knowledgeFilter);
    const rank = (a: KnowledgeRef, b: KnowledgeRef) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt);
    if (!pid) return list.length ? [{ label: 'All product memory', items: [...list].sort(rank) }] : [];
    const mine = list.filter(k => k.projectId === pid).sort(rank);
    const others = list.filter(k => k.projectId !== pid).sort(rank);
    return [
      ...(mine.length ? [{ label: `This project · ${this.mockData.findProject(pid)?.name ?? ''}`, items: mine }] : []),
      ...(others.length ? [{ label: 'Other projects', items: others }] : [])
    ];
  }

  get hasProjectKnowledge(): boolean {
    return this.memory.defaultsFor(this.knowledgeProjectId).length > 0;
  }

  isProjectSource(item: KnowledgeRef): boolean {
    const pid = this.knowledgeProjectId;
    return !!pid && item.projectId === pid;
  }

  /** Select every usable item from the chat's project. */
  useProjectKnowledge(): void {
    this.selectedContextIds = [...new Set([...this.selectedContextIds, ...this.memory.defaultsFor(this.knowledgeProjectId)])];
    this.contextChanged();
  }

  clearKnowledge(): void {
    this.selectedContextIds = [];
    this.contextChanged();
  }

  memoryLabel(k: KnowledgeRef): string {
    return this.memory.label(k);
  }

  /** Link to the item on the Product Memory page (highlighted there). */
  memoryLink(k: KnowledgeRef): { focus: string } {
    return { focus: k.id };
  }

  // ── Add context ──

  /** Everything grounding the chat, as labels for the AI (memory + attachments). */
  get contextLabels(): string[] {
    return [...this.selectedKnowledge.map(k => this.memory.label(k)), ...this.attachments.map(a => this.sources.label(a))];
  }

  get contextCount(): number {
    return this.selectedKnowledge.length + this.attachments.length;
  }

  /** Root screen of the popover, grouped like the reference: Integrations / Product / Upload. */
  get contextGroups(): { label: string; items: ContextSourceMeta[] }[] {
    return ['Integrations', 'Product', 'Upload'].map(label => ({ label, items: this.contextSources.filter(s => s.group === label) }));
  }

  get contextMeta(): ContextSourceMeta | undefined {
    return this.contextSources.find(s => s.id === this.contextView);
  }

  /** How many items of a source are attached (badge on the root list). */
  contextSelectedCount(id: ContextSourceMeta['id']): number {
    return id === 'kb' ? this.selectedKnowledge.length : this.attachments.filter(a => a.kind === id).length;
  }

  isSourceConnected(meta: ContextSourceMeta): boolean {
    return this.sources.isConnected(meta);
  }

  openContextSource(meta: ContextSourceMeta, event?: Event): void {
    event?.stopPropagation();
    if (meta.id === 'file') {
      this.pickFiles();
      return;
    }
    this.contextView = meta.id;
    this.contextQuery = '';
    this.contextType = 'all';
    this.knowledgeQuery = '';
    this.knowledgeFilter = 'all';
    setTimeout(() => this.homeRoot?.nativeElement.querySelector<HTMLInputElement>('#context-menu input[type=search]')?.focus());
  }

  contextBack(event?: Event): void {
    event?.stopPropagation();
    this.contextView = 'root';
    setTimeout(() => this.homeRoot?.nativeElement.querySelector<HTMLElement>('#context-menu .psc-ctx-source')?.focus());
  }

  /** Items of the open source, filtered by search and sub-type; this project's first. */
  get contextItems(): { label: string; items: ContextAttachment[] }[] {
    const kind = this.contextView;
    if (kind === 'root' || kind === 'kb' || kind === 'file') return [];
    const q = this.contextQuery.trim().toLowerCase();
    const pid = this.knowledgeProjectId;
    const list = this.sources.list(kind, pid).filter(a =>
      (this.contextType === 'all' || a.type === this.contextType) &&
      (!q || `${a.ref ?? ''} ${a.title} ${a.detail} ${this.sources.projectName(a.projectId)}`.toLowerCase().includes(q)));
    if (!pid) return list.length ? [{ label: 'All projects', items: list }] : [];
    const mine = list.filter(a => a.projectId === pid), others = list.filter(a => a.projectId !== pid);
    return [
      ...(mine.length ? [{ label: `This project · ${this.sources.projectName(pid)}`, items: mine }] : []),
      ...(others.length ? [{ label: 'Other projects', items: others }] : [])
    ];
  }

  /** Sub-type chips (Epic / Story / Bug…) with counts. */
  get contextTypes(): { id: string; count: number }[] {
    const kind = this.contextView;
    if (kind === 'root' || kind === 'kb' || kind === 'file') return [];
    const all = this.sources.list(kind, null);
    const types = [...new Set(all.map(a => a.type).filter((t): t is string => !!t))];
    return types.length > 1 ? [{ id: 'all', count: all.length }, ...types.map(t => ({ id: t, count: all.filter(a => a.type === t).length }))] : [];
  }

  projectNameOf(id?: string): string {
    return this.sources.projectName(id);
  }

  isAttached(id: string): boolean {
    return this.attachments.some(a => a.id === id);
  }

  toggleAttachment(a: ContextAttachment, checked: boolean): void {
    this.attachments = checked ? [...this.attachments.filter(x => x.id !== a.id), a] : this.attachments.filter(x => x.id !== a.id);
    this.contextChanged();
  }

  removeAttachment(id: string): void {
    this.attachments = this.attachments.filter(a => a.id !== id);
    this.contextChanged();
  }

  clearAllContext(): void {
    this.selectedContextIds = [];
    this.attachments = [];
    this.contextChanged();
  }

  pickFiles(event?: Event): void {
    event?.stopPropagation();
    this.fileInput?.nativeElement.click();
  }

  /** Local files → attachments (names and sizes only; nothing is uploaded anywhere). */
  onFilesPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = input.files ? this.sources.fromFiles(input.files, this.knowledgeProjectId) : [];
    input.value = '';
    if (!picked.length) return;
    const fresh = picked.filter(f => !this.isAttached(f.id));
    this.attachments = [...this.attachments, ...fresh];
    this.contextChanged();
    this.openMenu = null;
    this.voiceMessage = fresh.length ? `Attached ${fresh.length === 1 ? fresh[0].title : fresh.length + ' files'} as context.` : 'Already attached.';
  }

  /** Chips under the prompt: every context item, removable. */
  get groundedChips(): { id: string; title: string; tip: string; icon: string; color?: string; memory: boolean }[] {
    return [
      ...this.selectedKnowledge.map(k => ({ id: k.id, title: k.title, tip: this.memory.label(k), icon: this.kindMeta[k.kind].icon, color: this.kindMeta[k.kind].color, memory: true })),
      ...this.attachments.map(a => ({ id: a.id, title: a.ref ? `${a.ref} ${a.title}` : a.title, tip: this.sources.label(a), icon: this.contextKindIcon[a.kind], memory: false }))
    ];
  }

  removeChip(c: { id: string; memory: boolean }): void {
    c.memory ? this.toggleContext(c.id, false) : this.removeAttachment(c.id);
  }

  private searchKnowledge(): KnowledgeRef[] {
    const q = this.knowledgeQuery.trim().toLowerCase();
    return this.memory.knowledge().filter(k => !q || `${k.title} ${k.detail} ${k.project}`.toLowerCase().includes(q));
  }

  get promptPlaceholder(): string {
    const p = this.selectedProject;
    if (isChatMode(this.selectedArtifact)) {
      return p ? `Ask anything about ${p.name}…` : 'Ask anything, or describe an idea you’re working on…';
    }
    const doc = getArtifactShortLabel(this.selectedArtifact);
    return p ? `What should the ${doc} for ${p.name} cover?` : `Describe what the ${doc} should cover…`;
  }

  /** Scope the new chat to a project (or clear it). Reflected in the URL as ?project=<id>. */
  selectProject(id: string | null): void {
    this.openMenu = null;
    if (!id) return; // every chat belongs to a project
    if (this.activeConversation) {
      // An older chat without a project: file it under the one picked, then send what was typed.
      if (!this.activeConversation.projectId) {
        this.organizer.move(this.activeConversation.id, id);
        if (this.sendAfterProject) setTimeout(() => this.sendPrompt());
      }
      return;
    }
    if (this.sendAfterProject) this.carryContext = { contextIds: [...this.selectedContextIds], attachments: [...this.attachments] };
    this.router.navigate([], { relativeTo: this.route, queryParams: { project: id }, queryParamsHandling: 'merge', replaceUrl: true });
    this.focusPrompt(true);
  }

  openChat(c: Conversation): void {
    this.router.navigate(['/psc', 'home', c.artifactId, c.id]);
  }

  /** Open a project's workspace: its chat history on the left, a new chat ready on the right. */
  openProject(p: Project): void {
    this.sendAfterProject = false;
    this.router.navigate(['/psc', 'home'], { queryParams: { project: p.id } });
  }

  /** Opens the New Project form on the Projects page. */
  newProject(): void {
    this.router.navigate(['/psc', 'projects'], { queryParams: { new: 1 } });
  }

  openArtifact(artifact: Artifact): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { artifact: artifact.id } });
  }

  closeArtifact(): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { artifact: null } });
  }

  isArtifactOpen(artifact: Artifact): boolean {
    return this.canvas.artifact()?.id === artifact.id;
  }

  // ── Resizable chat panel (canvas mode) ──
  /** Chat share of the width while the preview is open: 40% chat · 60% preview by default (drag to adjust, 25–60%). */
  chatPct = 40;

  private setChatPct(pct: number): void {
    this.chatPct = Math.min(60, Math.max(25, Math.round(pct * 10) / 10));
  }

  startResize(event: MouseEvent): void {
    event.preventDefault();
    this.dragStart = { x: event.clientX, width: this.chatPct };
    this.isResizing = true;
  }

  @HostListener('document:mousemove', ['$event'])
  onResize(event: MouseEvent): void {
    if (!this.dragStart) return;
    const total = this.homeRoot?.nativeElement.getBoundingClientRect().width || window.innerWidth;
    this.setChatPct(this.dragStart.width + ((event.clientX - this.dragStart.x) / total) * 100);
  }

  @HostListener('document:mouseup')
  endResize(): void {
    if (!this.dragStart) return;
    this.dragStart = null;
    this.isResizing = false;
  }

  /** Keyboard resize for the drag handle (←/→). */
  nudgeChatWidth(delta: number): void {
    this.setChatPct(this.chatPct + delta);
  }

  toggleContext(id: string, checked: boolean): void {
    this.selectedContextIds = checked
      ? [...this.selectedContextIds.filter(item => item !== id), id]
      : this.selectedContextIds.filter(item => item !== id);
    this.contextChanged();
  }

  startVoiceInput(): void {
    const speechWindow = window as any;
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      this.voiceMessage = 'Voice input is not supported in this browser.';
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onstart = () => { this.isListening = true; this.voiceMessage = ''; };
    recognition.onresult = (event: any) => {
      this.promptText = `${this.promptText}${this.promptText ? ' ' : ''}${event.results[0][0].transcript}`;
      this.refineUndo = null;
      this.autoResizePrompt();
    };
    recognition.onerror = () => { this.voiceMessage = 'Voice capture ended. You can continue typing.'; };
    recognition.onend = () => { this.isListening = false; };
    recognition.start();
  }

  /** Auto refine: improve every prompt before it's sent (remembered per browser). */
  autoRefine = (() => { try { return localStorage.getItem('psc.prompt.auto-refine') === '1'; } catch { return false; } })();

  toggleAutoRefine(): void {
    this.autoRefine = !this.autoRefine;
    try { localStorage.setItem('psc.prompt.auto-refine', this.autoRefine ? '1' : '0'); } catch { /* ignore */ }
    this.voiceMessage = this.autoRefine ? 'Auto refine is on. Your prompt is improved when you pause typing.' : 'Auto refine is off.';
    if (this.autoRefine) this.scheduleAutoRefine(300);
    else window.clearTimeout(this.autoRefineTimer);
  }

  /** Set when Send was pressed without a project: the prompt is sent once one is picked. */
  sendAfterProject = false;
  private carryContext: { contextIds: string[]; attachments: ContextAttachment[] } | null = null;

  sendPrompt(): void {
    const prompt = this.promptText.trim();
    if (!prompt || this.isTyping || this.isRefining) return;

    // Every chat belongs to a project: ask for one first, then send.
    const hasProject = this.activeConversation ? !!this.activeConversation.projectId : !!this.selectedProjectId;
    if (!hasProject) {
      this.sendAfterProject = true;
      this.voiceMessage = 'Choose a project for this chat. Your message is sent as soon as you pick one.';
      if (this.openMenu !== 'project') this.toggleMenu('project');
      return;
    }
    this.sendAfterProject = false;

    // Auto refine: improve the prompt first (unless it was just refined), then send it.
    window.clearTimeout(this.autoRefineTimer);
    if (this.autoRefine && this.refineUndo?.refined !== this.promptText && this.promptText.trim() !== this.autoRefineSkip.trim()) {
      this.isRefining = true;
      this.refiner.refine(prompt, 'improve', { artifactId: this.selectedArtifact, contextNames: this.contextLabels })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: refined => {
            this.isRefining = false;
            this.promptText = refined;
            this.refineUndo = { previous: prompt, refined, label: 'Auto refine' };
            this.sendPrompt();
          },
          error: () => {
            this.isRefining = false;
            this.promptText = prompt;
            this.refineUndo = { previous: prompt, refined: prompt, label: 'Auto refine' };
            this.sendPrompt();
          }
        });
      return;
    }

    const contextNames = this.contextLabels;
    const lc = this.workspaceLifecycle;
    // Only when the chat keeps its lifecycle context (the PM can remove it).
    const lifecycle = lc && this.attachments.some(a => a.kind === 'pdlc') ? this.lifecycles.summary(lc) : undefined;
    const options = { artifactId: this.selectedArtifact, contextNames, lifecycle, workflowNote: this.workflowNote() };

    this.clearPrompt();
    this.refineUndo = null;
    this.voiceMessage = '';
    this.shouldScroll = true;
    this.autoResizePrompt();

    if (this.activeConversation) {
      this.conversations.sendMessage(this.activeConversation.id, prompt, options);
      return;
    }

    const conversation = this.conversations.startConversation(prompt, {
      ...options,
      contextIds: this.selectedContextIds,
      attachments: this.attachments,
      projectId: this.selectedProjectId ?? undefined,
      workflowId: this.selectedWorkflowId ?? undefined,
      collaborators: this.newChatCollaborators,
      teamIds: this.newChatTeamIds
    });
    this.newChatCollaborators = [];
    this.newChatTeamIds = [];
    this.router.navigate(['/psc', 'home', conversation.artifactId, conversation.id]);
  }

  submitOnEnter(event: Event): void {
    if (!(event as KeyboardEvent).shiftKey) {
      event.preventDefault();
      this.sendPrompt();
    }
  }

  formatMessage(content: string): string {
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  /** "New chat" from inside a project chat stays in that project. */
  /** New chat — inside a project it stays in that project (also from an empty project chat) and shows the Chat tab. */
  startNewConversation(): void {
    const project = this.activeConversation ? this.activeConversation.projectId : this.workspaceProject?.id;
    this.projectTab = 'chat';
    this.router.navigate(['/psc', 'home'], { queryParams: project ? { project } : {} });
    this.focusPrompt(true);
  }

  trackById(_: number, item: { id: string }): string {
    return item.id;
  }

  trackDoc(_: number, d: ProjectDocument): string {
    return `${d.chat.id}:${d.artifact.id}`;
  }

  trackByLabel(_: number, g: { label: string }): string {
    return g.label;
  }

  private applyRouteState(state: RouteState): void {
    const { artifactId, conversationId, openArtifactId, conversation, pending, kickoff, contextId } = state;

    if (artifactId && !isArtifactOptionId(artifactId)) {
      this.router.navigate(['/psc', 'home'], { replaceUrl: true, queryParamsHandling: 'preserve' });
      return;
    }

    // Unknown or deleted conversation → fall back to a fresh prompt for that artifact.
    if (conversationId && !conversation) {
      this.router.navigate(['/psc', 'home', ...(artifactId ? [artifactId] : [])], { replaceUrl: true });
      return;
    }

    // Keep the artifact segment in sync with the conversation it belongs to.
    if (conversation && artifactId !== conversation.artifactId) {
      this.router.navigate(['/psc', 'home', conversation.artifactId, conversation.id], { replaceUrl: true, queryParamsHandling: 'preserve' });
      return;
    }

    // Unknown project in ?project= → drop it.
    const projectId = conversation ? conversation.projectId ?? null : state.projectId;
    if (!conversation && projectId && !this.mockData.findProject(projectId)) {
      this.router.navigate([], { relativeTo: this.route, queryParams: { project: null, kickoff: null }, queryParamsHandling: 'merge', replaceUrl: true });
      return;
    }
    const projectChanged = projectId !== this.selectedProjectId;
    if (projectChanged) { this.lifecycleNote = ''; this.panelOverlay = false; this.chatQuery = ''; this.cancelChatEdit(); }
    this.selectedProjectId = projectId;

    const switched = (conversation?.id ?? null) !== (this.activeConversation?.id ?? null);
    const wasDocked = this.docked;

    this.activeConversation = conversation ?? null;
    this.messages = conversation?.messages ?? [];
    this.isTyping = pending;

    // Opening another chat (or a new one) always shows the conversation.
    if (switched || projectChanged) this.projectTab = 'chat';

    if (switched) {
      this.clearPrompt();
      this.refineUndo = null;
      this.autoResizePrompt();
      this.voiceMessage = '';
      this.newChatCollaborators = [];
      this.newChatTeamIds = [];
      this.selectedWorkflowId = conversation?.workflowId ?? null;
      if (conversation) {
        this.selectedArtifact = conversation.artifactId;
        this.selectedContextIds = [...conversation.contextIds];
        this.attachments = [...(conversation.attachments ?? [])];
      } else {
        this.applyNewChatSelection(artifactId);
        this.resetContextSelection();
      }
    } else if (!conversation) {
      this.applyNewChatSelection(artifactId);
      if (projectChanged) { this.resetContextSelection(); this.newChatCollaborators = []; this.newChatTeamIds = []; }
    } else if (projectChanged) {
      // The open chat was moved into (or out of) a project: pick up its new context.
      this.selectedContextIds = [...conversation.contextIds];
      this.attachments = [...(conversation.attachments ?? [])];
    }

    // Golden workflow chats: the next message drafts the first step without a draft yet.
    const wf = getWorkflow(conversation?.workflowId);
    if (conversation && wf && !pending) {
      this.selectedWorkflowId = wf.id;
      this.selectedArtifact = wf.steps[workflowStepIndex(wf, conversation.messages.flatMap(m => m.artifacts || []))];
    }

    // "Use in chat" from Product Memory: ground the new chat in that item (on top of the project defaults).
    if (!conversation && contextId) {
      const ref = this.memory.resolve([contextId])[0];
      if (ref && !ref.unavailable && !this.selectedContextIds.includes(ref.id)) this.selectedContextIds = [...this.selectedContextIds, ref.id];
      if (ref) this.voiceMessage = `Grounded in ${this.memory.label(ref)} — describe what you need.`;
      this.focusPrompt();
      this.router.navigate([], { relativeTo: this.route, queryParams: { context: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }

    // Arriving with a prompt (e.g. "Iterate in chat" from the Repository): pre-fill it, ready to finish and send.
    if (!conversation && state.prompt) {
      this.promptText = state.prompt;
      this.refineUndo = null;
      this.focusPrompt(true);
      this.router.navigate([], { relativeTo: this.route, queryParams: { prompt: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }

    // Send was pressed before a project was picked: keep what was added on Home, then send it in the project.
    if (!conversation && this.sendAfterProject && this.selectedProjectId) {
      const carry = this.carryContext;
      this.carryContext = null;
      if (carry) {
        this.selectedContextIds = [...new Set([...this.selectedContextIds, ...carry.contextIds])];
        this.attachments = [...this.attachments, ...carry.attachments.filter(a => !this.attachments.some(x => x.id === a.id))];
      }
      setTimeout(() => this.sendPrompt());
    }

    // Arriving from the New Project wizard: pre-fill a first prompt for the project, ready to send.
    if (!conversation && kickoff) {
      const p = this.selectedProject;
      if (p) {
        this.promptText = isChatMode(this.selectedArtifact)
          ? `Let’s get started on ${p.name}.${p.description ? ' ' + p.description : ''}`
          : `Create a ${getArtifactLabel(this.selectedArtifact)} for ${p.name}.${p.description ? ' ' + p.description : ''}`;
        this.refineUndo = null;
        this.focusPrompt(true);
      }
      this.router.navigate([], { relativeTo: this.route, queryParams: { kickoff: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }

    // The AI just produced a newer version of the open document → follow it on the canvas.
    if (conversation && openArtifactId && !switched) {
      const all = conversation.messages.flatMap(m => m.artifacts || []);
      const open = all.find(a => a.id === openArtifactId);
      const fresh = all.filter(a => !this.seenArtifactIds.has(a.id));
      const newer = open && fresh.reverse().find(a => a.type === open.type && a.version > open.version);
      if (newer && !this.canvas.dirty()) {
        this.seenArtifactIds = new Set(all.map(a => a.id));
        this.router.navigate([], { relativeTo: this.route, queryParams: { artifact: newer.id }, queryParamsHandling: 'merge', replaceUrl: true });
        this.canvas.showToast('success', `Updated to v${newer.version} by the AI — see what changed in Compare`);
        return;
      }
    }
    // A reply just drafted a document → open it in the preview straight away.
    // (The reply lands while the chat is still marked pending, so don't wait for pending to clear.)
    if (conversation && !openArtifactId && !switched) {
      const fresh = conversation.messages.flatMap(m => m.artifacts || []).filter(a => !this.seenArtifactIds.has(a.id));
      const latest = fresh[fresh.length - 1];
      if (latest) {
        this.seenArtifactIds = new Set(conversation.messages.flatMap(m => (m.artifacts || []).map(a => a.id)));
        this.router.navigate([], { relativeTo: this.route, queryParams: { artifact: latest.id }, queryParamsHandling: 'merge', replaceUrl: true });
        return;
      }
    }
    this.seenArtifactIds = new Set(conversation?.messages.flatMap(m => (m.artifacts || []).map(a => a.id)) ?? []);

    if (conversation && openArtifactId && this.conversations.findArtifact(conversation.id, openArtifactId)) {
      this.canvas.open(conversation.id, openArtifactId);
    } else {
      this.canvas.close();
      if (conversation && openArtifactId) this.closeArtifact(); // stale/unknown artifact id in the URL
    }

    this.shouldScroll = true;
    if (!wasDocked && this.docked && !switched) this.focusPrompt();
  }

  /** A project chat starts grounded in that project's Product Memory; a general chat starts with none. */
  private resetContextSelection(): void {
    this.selectedContextIds = this.memory.defaultsFor(this.selectedProjectId);
    // Files you picked stay; everything else resets to the project's own context (set up in the New Project wizard).
    const defaults = this.sources.defaultsFor(this.selectedProjectId);
    const kept = this.attachments.filter(a => a.kind === 'file' && !a.id.startsWith('pfile-') && !defaults.some(d => d.id === a.id));
    this.attachments = [...defaults, ...kept];
  }

  /**
   * Empties the prompt. Also clears the textarea directly: with event coalescing, Enter can arrive in the
   * same frame as the last keystroke, so ngModel never saw the typed text and '' would look like "no change".
   */
  private clearPrompt(): void {
    this.promptText = '';
    const el = this.promptInput?.nativeElement;
    if (el) el.value = '';
  }

  private focusPrompt(caretToEnd = false): void {
    this.autoResizePrompt();
    setTimeout(() => {
      const el = this.promptInput?.nativeElement;
      if (!el) return;
      el.focus();
      if (caretToEnd) {
        el.setSelectionRange(el.value.length, el.value.length);
        el.scrollTop = el.scrollHeight;
      }
    });
  }
}
