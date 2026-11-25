import { Component, DestroyRef, ElementRef, HostListener, OnInit, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { LucideAngularModule } from 'lucide-angular';
import { PscIllustrationComponent } from '../core/components/psc-illustration/psc-illustration.component';
import { PscThemeCustomizerComponent } from '../core/components/psc-theme-customizer/psc-theme-customizer.component';
import { BreakpointObserver } from '@angular/cdk/layout';
import { PscMockDataService } from '../core/services/psc-mock-data.service';
import { ConversationService } from '../core/services/conversation.service';
import { Conversation, Notification, Project } from '../core/models/psc.models';
import { initials, projectGradient } from '../core/constants/project-visuals';
import { ARTIFACT_OPTIONS, getArtifactIconName, getArtifactLabel, getArtifactShortLabel } from '../core/constants/artifact-options';
import { CURRENT_USER } from '../core/constants/current-user';
import { THEME_OPTIONS, ThemeMode, ThemeService } from '../core/services/theme.service';
import { PmBuddyAlertsService } from '../core/features/pm-buddy/services/pm-buddy-alerts.service';
import { ChatOrganizerService } from '../core/services/chat-organizer.service';

/** A project in the chat list with its chats (newest first). */
interface ProjectFolder {
  project: Project;
  index: number;
  chats: Conversation[];
}

const CHAT_SECTIONS_KEY = 'psc.nav.chat-sections';
const OPEN_FOLDERS_KEY = 'psc.nav.open-projects';
/** Chats shown per project folder before "View all". */
const FOLDER_PREVIEW = 4;

interface HistoryGroup {
  label: string;
  items: Conversation[];
}

interface NavItem {
  route: string;
  label: string;
  icon: string;
}

interface CommandResult {
  label: string;
  desc: string;
  icon: string;
  commands?: string[];
  queryParams?: Record<string, string>;
  /** Non-navigation command (e.g. switch theme). */
  run?: () => void;
  group: 'Chats' | 'Create' | 'Go to' | 'Projects' | 'Theme';
}

const NAV_COLLAPSED_KEY = 'psc.nav.collapsed';

/** desktop ≥ 1100px · tablet 768–1099px · mobile < 768px */
export type ShellViewport = 'desktop' | 'tablet' | 'mobile';
const MOBILE_QUERY = '(max-width: 767.98px)';
const TABLET_QUERY = '(min-width: 768px) and (max-width: 1099.98px)';

@Component({
  selector: 'app-psc-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, DatePipe, FormsModule, LucideAngularModule, PscIllustrationComponent, PscThemeCustomizerComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent implements OnInit {
  @ViewChild('cmdInput') private cmdInput?: ElementRef<HTMLInputElement>;

  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpoints = inject(BreakpointObserver);

  readonly user = CURRENT_USER;
  readonly theme = inject(ThemeService);
  readonly themeOptions = THEME_OPTIONS;

  get themeIcon(): string {
    return this.themeOptions.find(o => o.id === this.theme.mode())?.icon ?? 'monitor';
  }

  get themeLabel(): string {
    const mode = this.theme.mode();
    return mode === 'system' ? `System (${this.theme.resolved()})` : this.themeOptions.find(o => o.id === mode)!.label;
  }

  setTheme(mode: ThemeMode): void {
    this.theme.setMode(mode);
  }

  /** Appearance panel (theme mode + custom colours). */
  appearanceOpen = false;

  openAppearance(): void {
    this.closeDrawers();
    this.cmdOpen = false;
    this.appearanceOpen = true;
  }
  /** The four primary destinations, always visible in the nav. */
  readonly mainNavItems: NavItem[] = [
    { route: 'home', label: 'Home', icon: 'house' },
    { route: 'pm-buddy', label: 'PM Buddy', icon: 'bot' },
    { route: 'projects', label: 'Projects', icon: 'folder-open' },
    { route: 'teams', label: 'Teams', icon: 'users' },
    { route: 'repository', label: 'Repository', icon: 'library' },
    { route: 'intelligence', label: 'Product Intelligence', icon: 'brain-circuit' }
  ];
  /** Secondary destinations behind "More". */
  readonly moreNavItems: NavItem[] = [
    { route: 'jobs', label: 'Background Jobs', icon: 'timer' },
    { route: 'analytics', label: 'Analytics', icon: 'bar-chart-3' }
  ];
  readonly navItems: NavItem[] = [...this.mainNavItems, ...this.moreNavItems];
  moreOpen = false;

  viewport: ShellViewport = 'desktop';
  /** Drawer (mobile) / overlay (tablet) state for the nav. */
  navOpen = false;

  activeRoute = 'home';
  activeConversationId: string | null = null;
  /** True on Home (prompt + chat), which uses the full-height prompt layout. */
  homeMode = false;
  navCollapsed = true;
  notificationsOpen = false;
  notifications: Notification[] = [];
  unreadCount = 0;
  runningJobsCount = 0;

  historyGroups: HistoryGroup[] = [];
  hasHistory = false;
  /** Chats split in two: project chats (grouped by project) and Recent (chats with no project). */
  projectFolders: ProjectFolder[] = [];
  recentGroups: HistoryGroup[] = [];
  recentCount = 0;
  /** Collapsed state of the two sections, and which project folders are open (persisted). */
  chatSections = this.readJson<{ projects: boolean; recent: boolean }>(CHAT_SECTIONS_KEY, { projects: false, recent: false });
  openFolders = new Set<string>(this.readJson<string[]>(OPEN_FOLDERS_KEY, []));
  readonly folderPreview = FOLDER_PREVIEW;
  readonly initials = initials;
  readonly projectGradient = projectGradient;
  private allConversations: Conversation[] = [];

  // ── Command palette (⌘K / Ctrl+K) ──
  cmdOpen = false;
  cmdQuery = '';
  cmdResults: CommandResult[] = [];
  cmdActiveIndex = 0;

  readonly getArtifactIconName = getArtifactIconName;
  readonly getArtifactLabel = getArtifactLabel;
  readonly getArtifactShortLabel = getArtifactShortLabel;

  constructor(
    private router: Router,
    private mockData: PscMockDataService,
    private conversations: ConversationService
  ) {
    // PM Buddy alerts run on every page, not only inside PM Buddy.
    inject(PmBuddyAlertsService).start();
    // Auto-close the nav when a response is generated in the open chat.
    this.conversations.replyArrived.pipe(takeUntilDestroyed()).subscribe(id => this.collapseForReply(id));
  }

  ngOnInit(): void {
    this.navCollapsed = this.readFlag(NAV_COLLAPSED_KEY, true);

    this.breakpoints
      .observe([MOBILE_QUERY, TABLET_QUERY])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(state => {
        this.viewport = state.breakpoints[MOBILE_QUERY] ? 'mobile' : state.breakpoints[TABLET_QUERY] ? 'tablet' : 'desktop';
        this.closeDrawers();
      });

    this.mockData.getNotifications().subscribe(n => {
      this.notifications = n;
      this.unreadCount = n.filter(x => !x.read).length;
    });
    this.mockData.getBackgroundJobs().subscribe(jobs => {
      this.runningJobsCount = jobs.filter(j => j.status === 'running').length;
    });
    this.conversations.conversations$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(list => {
        this.allConversations = list;
        this.hasHistory = list.length > 0;
        this.historyGroups = this.groupByDate(list);
        this.splitChats(list);
      });

    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe(e => {
        this.syncRoute(e.urlAfterRedirects);
        this.closeDrawers();
      });
    this.syncRoute(this.router.url);
  }

  navigate(route: string): void {
    this.notificationsOpen = false;
    this.closeDrawers();
    this.router.navigate(['/psc', route]);
  }

  get isDesktop(): boolean {
    return this.viewport === 'desktop';
  }

  /** Rail shows icons only: user choice on desktop, always on tablet (unless opened), never in the mobile drawer. */
  get railCollapsed(): boolean {
    if (this.viewport === 'desktop') return this.navCollapsed;
    if (this.viewport === 'tablet') return !this.navOpen;
    return false;
  }

  get scrimVisible(): boolean {
    return !this.isDesktop && this.navOpen;
  }

  get moreActive(): boolean {
    return this.moreNavItems.some(i => i.route === this.activeRoute);
  }

  toggleMore(): void {
    this.moreOpen = !this.moreOpen;
  }

  /** Collapsed rail: the chats icon expands the nav so the chat list is visible. */
  showChats(): void {
    if (this.railCollapsed) this.toggleNav();
  }

  /**
   * A reply just landed in the chat you're looking at: fold the expanded nav away (animated) so the
   * conversation and its preview get the room. Not saved as your preference; expand it again any time.
   */
  private collapseForReply(conversationId: string): void {
    if (conversationId !== this.activeConversationId) return;
    if (this.isDesktop) {
      if (!this.navCollapsed) this.navCollapsed = true;
    } else if (this.navOpen) {
      this.navOpen = false;
    }
  }

  toggleNav(): void {
    if (this.isDesktop) {
      this.navCollapsed = !this.navCollapsed;
      this.writeFlag(NAV_COLLAPSED_KEY, this.navCollapsed);
      return;
    }
    this.navOpen = !this.navOpen;
  }

  closeDrawers(): void {
    this.navOpen = false;
  }

  newChat(): void {
    this.closeDrawers(); // same-URL navigations don't emit NavigationEnd
    this.router.navigate(['/psc', 'home']);
  }

  openConversation(c: Conversation): void {
    this.closeDrawers();
    this.router.navigate(['/psc', 'home', c.artifactId, c.id]);
  }

  deleteConversation(c: Conversation, event: Event): void {
    event.stopPropagation();
    this.conversations.deleteConversation(c.id);
    if (this.activeConversationId === c.id) {
      this.router.navigate(['/psc', 'home', c.artifactId], { queryParams: c.projectId ? { project: c.projectId } : {} });
    }
  }

  // ── Chat list: Projects / Recent ──

  private splitChats(list: Conversation[]): void {
    const folders = new Map<string, ProjectFolder>();
    const recent: Conversation[] = [];
    for (const c of list) {
      const project = c.projectId ? this.mockData.findProject(c.projectId) : undefined;
      if (!project) { recent.push(c); continue; }
      const f = folders.get(project.id) ?? { project, index: 0, chats: [] };
      f.chats.push(c);
      folders.set(project.id, f);
    }
    const byNewest = (a: Conversation, b: Conversation) => b.updatedAt.localeCompare(a.updatedAt);
    const all = this.mockData.projects;
    this.projectFolders = [...folders.values()]
      .map(f => ({ ...f, chats: f.chats.sort(byNewest), index: Math.max(0, all.findIndex(p => p.id === f.project.id)) }))
      .sort((a, b) => byNewest(a.chats[0], b.chats[0]));
    this.recentGroups = this.groupByDate(recent.sort(byNewest));
    this.recentCount = recent.length;
    this.revealActiveChat();
  }

  /** Keep the folder that holds the open chat expanded, so you can always see where you are. */
  private revealActiveChat(): void {
    const id = this.activeConversationId;
    const folder = id ? this.projectFolders.find(f => f.chats.some(c => c.id === id)) : undefined;
    if (folder && !this.openFolders.has(folder.project.id)) {
      this.openFolders.add(folder.project.id);
      this.writeJson(OPEN_FOLDERS_KEY, [...this.openFolders]);
    }
    if (folder && this.chatSections.projects) this.toggleChatSection('projects');
    if (id && !folder && this.chatSections.recent && this.recentCount) this.toggleChatSection('recent');
  }

  toggleChatSection(section: 'projects' | 'recent'): void {
    this.chatSections = { ...this.chatSections, [section]: !this.chatSections[section] };
    this.writeJson(CHAT_SECTIONS_KEY, this.chatSections);
  }

  isFolderOpen(id: string): boolean {
    return this.openFolders.has(id);
  }

  toggleFolder(id: string): void {
    this.openFolders.has(id) ? this.openFolders.delete(id) : this.openFolders.add(id);
    this.writeJson(OPEN_FOLDERS_KEY, [...this.openFolders]);
  }

  /** Chats visible in a folder: the newest few, plus the active one if it's further down. */
  folderChats(f: ProjectFolder): Conversation[] {
    const head = f.chats.slice(0, FOLDER_PREVIEW);
    const active = f.chats.find(c => c.id === this.activeConversationId);
    return active && !head.includes(active) ? [...head, active] : head;
  }

  folderHasActive(f: ProjectFolder): boolean {
    return f.chats.some(c => c.id === this.activeConversationId);
  }

  /** New chat scoped to a project. */
  newProjectChat(projectId: string, event?: Event): void {
    event?.stopPropagation();
    this.closeDrawers();
    this.router.navigate(['/psc', 'home'], { queryParams: { project: projectId } });
  }

  /** All chats of a project (Home with the project selected lists them under "Continue in"). */
  openProjectChats(projectId: string): void {
    this.closeDrawers();
    this.router.navigate(['/psc', 'home'], { queryParams: { project: projectId } });
  }

  // ── Move chats into projects (⋯ menu, drag & drop) ──
  readonly organizer = inject(ChatOrganizerService);
  chatMenu: { conv: Conversation; x: number; y: number; targets: { id: string; name: string; index: number }[] } | null = null;
  chatMenuQuery = '';
  dragChatId: string | null = null;
  dropProjectId: string | null = null;
  dragTargets: { id: string; name: string; index: number }[] = [];
  recentHintVisible = this.readJson<boolean>('psc.nav.recent-hint', true);

  openChatMenu(c: Conversation, event: MouseEvent): void {
    event.stopPropagation();
    if (this.chatMenu?.conv.id === c.id) { this.closeChatMenu(); return; }
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const width = 260, height = 360;
    const x = Math.min(r.right + 6, window.innerWidth - width - 8);
    const y = Math.max(8, Math.min(r.top - 8, window.innerHeight - height - 8));
    this.chatMenuQuery = '';
    this.chatMenu = { conv: c, x: Math.max(8, x), y, targets: this.organizer.targets(c) };
    setTimeout(() => document.querySelector<HTMLElement>('.psc-chat-menu input, .psc-chat-menu .psc-chat-menu-item')?.focus());
  }

  closeChatMenu(): void {
    this.chatMenu = null;
  }

  get chatMenuTargets() {
    const q = this.chatMenuQuery.trim().toLowerCase();
    return (this.chatMenu?.targets ?? []).filter(t => !q || t.name.toLowerCase().includes(q));
  }

  moveChat(c: Conversation, projectId: string | null): void {
    this.closeChatMenu();
    this.organizer.move(c.id, projectId);
    if (projectId) {
      this.openFolders.add(projectId);
      this.writeJson(OPEN_FOLDERS_KEY, [...this.openFolders]);
      if (this.chatSections.projects) this.toggleChatSection('projects');
    }
  }

  onChatDragStart(c: Conversation, e: DragEvent): void {
    this.dragChatId = c.id;
    this.dragTargets = this.organizer.targets(c).filter(t => !this.projectFolders.some(f => f.project.id === t.id));
    e.dataTransfer?.setData('text/plain', c.id);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  onFolderDragOver(projectId: string, e: DragEvent): void {
    if (!this.dragChatId) return;
    const c = this.allConversations.find(x => x.id === this.dragChatId);
    if (c?.projectId === projectId) return; // already there
    e.preventDefault();
    this.dropProjectId = projectId;
  }

  onFolderDrop(projectId: string, e: DragEvent): void {
    e.preventDefault();
    const id = this.dragChatId;
    this.dragChatId = null;
    this.dropProjectId = null;
    const c = id ? this.allConversations.find(x => x.id === id) : undefined;
    if (c) this.moveChat(c, projectId);
  }

  dismissRecentHint(): void {
    this.recentHintVisible = false;
    this.writeJson('psc.nav.recent-hint', false);
  }

  @HostListener('document:click')
  onDocClickCloseChatMenu(): void {
    if (this.chatMenu) this.chatMenu = null;
  }

  @HostListener('document:keydown.escape')
  onEscCloseChatMenu(): void {
    if (this.chatMenu) this.chatMenu = null;
  }

  @HostListener('window:resize')
  onResizeCloseChatMenu(): void {
    if (this.chatMenu) this.chatMenu = null;
  }

  private readJson<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private writeJson(key: string, value: unknown): void {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  }

  /** Name of the project a chat belongs to (shown in the chat list). */
  projectName(c: Conversation): string {
    return this.mockData.findProject(c.projectId)?.name ?? '';
  }

  trackById(_: number, c: { id: string }): string {
    return c.id;
  }

  trackFolder(_: number, f: ProjectFolder): string {
    return f.project.id;
  }

  toggleNotifications(): void {
    this.closeDrawers();
    this.notificationsOpen = !this.notificationsOpen;
  }

  markAllRead(): void {
    this.notifications = this.notifications.map(n => ({ ...n, read: true }));
    this.unreadCount = 0;
  }

  handleNotification(n: Notification): void {
    n.read = true;
    this.unreadCount = this.notifications.filter(x => !x.read).length;
  }

  handleNotificationAction(n: Notification): void {
    if (n.actionRoute) this.router.navigateByUrl(n.actionRoute);
    this.notificationsOpen = false;
  }

  // ── Command palette ──────────────────────────────────────────────────

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(e: KeyboardEvent): void {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.cmdOpen ? this.closeCmd() : this.openCmd();
      return;
    }
    if (e.key === 'Escape') {
      if (this.appearanceOpen) return; // the panel handles its own Escape
      if (this.cmdOpen) this.closeCmd();
      else if (this.notificationsOpen) this.notificationsOpen = false;
      else if (this.scrimVisible) this.closeDrawers();
    }
  }

  openCmd(): void {
    this.closeDrawers();
    this.cmdOpen = true;
    this.cmdQuery = '';
    this.onCmdInput();
    setTimeout(() => this.cmdInput?.nativeElement.focus());
  }

  closeCmd(): void {
    this.cmdOpen = false;
  }

  onCmdInput(): void {
    const q = this.cmdQuery.toLowerCase().trim();
    const all = this.buildCommandIndex();
    this.cmdResults = q
      ? all.filter(r => r.label.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q)).slice(0, 12)
      : all.filter(r => r.group !== 'Create').slice(0, 10);
    this.cmdActiveIndex = 0;
  }

  onCmdKeydown(e: KeyboardEvent): void {
    if (!this.cmdResults.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.cmdActiveIndex = (this.cmdActiveIndex + 1) % this.cmdResults.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.cmdActiveIndex = (this.cmdActiveIndex - 1 + this.cmdResults.length) % this.cmdResults.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.runCmd(this.cmdResults[this.cmdActiveIndex]);
    }
  }

  runCmd(r: CommandResult): void {
    this.closeCmd();
    this.notificationsOpen = false;
    if (r.run) r.run();
    else if (r.commands) this.router.navigate(r.commands, r.queryParams ? { queryParams: r.queryParams } : {});
  }

  showGroupLabel(index: number): boolean {
    return index === 0 || this.cmdResults[index - 1].group !== this.cmdResults[index].group;
  }

  private buildCommandIndex(): CommandResult[] {
    const chats: CommandResult[] = this.allConversations.slice(0, 20).map(c => ({
      label: c.title,
      desc: `${getArtifactLabel(c.artifactId)} chat${this.projectName(c) ? ' · ' + this.projectName(c) : ''}`,
      icon: 'message-square',
      commands: ['/psc', 'home', c.artifactId, c.id],
      group: 'Chats'
    }));
    const pages: CommandResult[] = this.navItems.map(n => ({
      label: n.label,
      desc: `Go to ${n.label}`,
      icon: n.icon,
      commands: ['/psc', n.route],
      group: 'Go to'
    }));
    const buddy: CommandResult[] = [
      ['', 'PM Buddy', 'Your personal AI PM assistant', 'bot'],
      ['tasks', 'PM Buddy · My Tasks', 'Tasks, follow-ups and reminders', 'list-checks'],
      ['meetings', 'PM Buddy · Meeting Memory', 'Summaries, decisions and actions', 'calendar'],
      ['commitments', 'PM Buddy · My Commitments', 'Promises made and owed', 'handshake'],
      ['ideas', 'PM Buddy · Ideas & Notes', 'Ideas, notes and customer feedback', 'lightbulb'],
      ['briefing', 'PM Buddy · Daily Briefing', 'Today’s meetings, priorities and deadlines', 'sun'],
      ['missing', 'PM Buddy · What am I missing?', 'Anything slipping through the cracks', 'radar']
    ].map(([path, label, desc, icon]) => ({ label, desc, icon, commands: ['/psc', 'pm-buddy', ...(path ? [path] : [])], group: 'Go to' as const }));
    const projectChats: CommandResult[] = this.mockData.projects.map(p => ({
      label: p.name,
      desc: 'Chat in this project',
      icon: 'folder-open',
      commands: ['/psc', 'home'],
      queryParams: { project: p.id },
      group: 'Projects'
    }));
    const create: CommandResult[] = ARTIFACT_OPTIONS.map(o => ({
      label: `New ${o.label}`,
      desc: 'Start a new chat for this artifact',
      icon: o.iconName,
      commands: ['/psc', 'home', o.id],
      group: 'Create'
    }));
    const themes: CommandResult[] = this.themeOptions.map(o => ({
      label: `Theme: ${o.label}`,
      desc: o.id === 'system' ? 'Follow your OS setting, live' : `Switch to ${o.label.toLowerCase()} theme`,
      icon: o.icon,
      run: () => this.setTheme(o.id),
      group: 'Theme'
    }));
    themes.push({ label: 'Customize colours', desc: 'Pick accent & secondary colours, live', icon: 'palette', run: () => this.openAppearance(), group: 'Theme' });
    return [...chats.slice(0, 5), ...pages.filter(p => p.label !== 'PM Buddy'), ...buddy, ...projectChats, ...create, ...themes, ...chats.slice(5)];
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  /** URL shape: /psc/<section>[/<artifact>/<conversationId>][?query] */
  private syncRoute(url: string): void {
    const path = url.split(/[?#]/)[0];
    const seg = path.split('/').filter(Boolean);
    const pscIndex = seg.indexOf('psc');
    const section = pscIndex >= 0 ? seg[pscIndex + 1] : seg[0];
    this.activeRoute = section || 'home';
    this.homeMode = this.activeRoute === 'home';
    if (this.moreActive) this.moreOpen = true;
    this.activeConversationId = this.homeMode && pscIndex >= 0 ? seg[pscIndex + 3] || null : null;
    this.revealActiveChat();
  }

  private groupByDate(list: Conversation[]): HistoryGroup[] {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const day = 24 * 60 * 60 * 1000;
    const buckets: HistoryGroup[] = [
      { label: 'Today', items: [] },
      { label: 'Yesterday', items: [] },
      { label: 'Previous 7 days', items: [] },
      { label: 'Older', items: [] }
    ];
    for (const c of list) {
      const t = new Date(c.updatedAt).getTime();
      if (t >= startOfToday.getTime()) buckets[0].items.push(c);
      else if (t >= startOfToday.getTime() - day) buckets[1].items.push(c);
      else if (t >= startOfToday.getTime() - 7 * day) buckets[2].items.push(c);
      else buckets[3].items.push(c);
    }
    return buckets.filter(b => b.items.length);
  }

  private readFlag(key: string, fallback: boolean): boolean {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v === 'true';
    } catch {
      return fallback;
    }
  }

  private writeFlag(key: string, value: boolean): void {
    try { localStorage.setItem(key, String(value)); } catch { /* ignore */ }
  }
}
