import { AfterViewInit, Component, ElementRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ProductMemoryService, SOURCE_TYPES } from '../../../services/product-memory.service';
import { ContextSource, MemoryEntry, WithProject } from '../../../models/product-memory.models';

type Entry = MemoryEntry & WithProject;

interface ConnectSourceForm {
  type: ContextSource['type'] | '';
  name: string;
  url: string;
  token: string;
  /** Project id ('' = general). */
  project: string;
}

interface NewMemoryForm {
  type: 'decision' | 'meeting' | 'context' | 'insight';
  title: string;
  summary: string;
  /** Project id ('' = general). */
  project: string;
  tags: string;
  pinned: boolean;
}

@Component({
  selector: 'app-psc-product-memory',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './product-memory.component.html',
  styleUrl: './product-memory.component.scss',
})
export class ProductMemoryComponent implements OnInit, AfterViewInit {
  /** Shared store: everything here is also offered as Knowledge for chats on Home. */
  private readonly memory = inject(ProductMemoryService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  /** Item highlighted when arriving from a chat (?focus=<id>). */
  focusId: string | null = null;

  activeTab: 'knowledge' | 'meetings' | 'context' | 'sources' = 'knowledge';
  search = '';
  filterType = '';
  filterProject = '';

  // ── Connect Source modal ─────────────────────────────────────────────
  showConnectSourceModal = false;
  connectingSource = false;
  syncingSourceId: string | null = null;
  connectSourceForm: ConnectSourceForm = this.blankSourceForm();

  private blankSourceForm(): ConnectSourceForm {
    return { type: '', name: '', url: '', token: '', project: '' };
  }

  readonly sourceTypes = SOURCE_TYPES;

  get sources() { return this.memory.sources(); }
  get entries(): Entry[] { return this.memory.entries(); }
  get meetings() { return this.memory.meetings(); }
  /** Project choices for the Add Memory / Connect Source forms. */
  get projectOptions() { return this.memory.projectOptions(); }

  openConnectSourceModal(): void {
    this.connectSourceForm = this.blankSourceForm();
    this.showConnectSourceModal = true;
  }

  closeConnectSourceModal(): void { this.showConnectSourceModal = false; }

  get connectSourceFormValid(): boolean {
    return !!this.connectSourceForm.type && !!this.connectSourceForm.name.trim() && !!this.connectSourceForm.url.trim() && !!this.connectSourceForm.token.trim();
  }

  selectSourceType(type: ContextSource['type']): void {
    this.connectSourceForm.type = type;
    const project = this.projectOptions.find(p => p.id === this.connectSourceForm.project)?.name;
    this.connectSourceForm.name = this.sourceTypes.find(s => s.value === type)?.label + ' — ' + (project || 'My Project');
  }

  saveConnectSource(): void {
    if (!this.connectSourceFormValid || this.connectingSource) return;
    this.connectingSource = true;
    setTimeout(() => {
      this.memory.addSource({
        type: this.connectSourceForm.type as ContextSource['type'],
        name: this.connectSourceForm.name.trim(),
        url: this.connectSourceForm.url.trim(),
        projectId: this.connectSourceForm.project
      });
      this.connectingSource = false;
      this.showConnectSourceModal = false;
    }, 1800);
  }

  syncSource(id: string): void {
    if (this.syncingSourceId) return;
    this.syncingSourceId = id;
    setTimeout(() => {
      this.memory.syncSource(id);
      this.syncingSourceId = null;
    }, 2200);
  }

  removeSource(id: string): void {
    this.memory.removeSource(id);
  }

  sourceTypeInfo(type: string) {
    return this.sourceTypes.find(s => s.value === type);
  }

  sourceStatusLabel(s: ContextSource): string {
    if (s.status === 'syncing') return 'Syncing…';
    if (s.status === 'error') return 'Auth error';
    if (s.status === 'disconnected') return 'Disconnected';
    if (s.lastSync) {
      const diff = Math.floor((Date.now() - new Date(s.lastSync).getTime()) / 60000);
      if (diff < 1) return 'Synced just now';
      if (diff < 60) return `Synced ${diff}m ago`;
      const h = Math.floor(diff / 60);
      if (h < 24) return `Synced ${h}h ago`;
      return `Synced ${Math.floor(h / 24)}d ago`;
    }
    return 'Never synced';
  }

  get totalDocsIngested(): number { return this.sources.reduce((a, s) => a + s.docsIngested, 0); }
  get connectedSourceCount(): number { return this.sources.filter(s => s.status === 'connected').length; }

  // ── Add Memory modal ────────────────────────────────────────────────
  showAddModal = false;
  saving = false;
  form: NewMemoryForm = this.blankForm();

  private blankForm(): NewMemoryForm {
    return { type: 'decision', title: '', summary: '', project: '', tags: '', pinned: false };
  }

  readonly typeOptions = [
    { v: 'decision', l: 'Decision', i: 'check-circle' },
    { v: 'insight',  l: 'Insight',  i: 'lightbulb' },
    { v: 'context',  l: 'Context',  i: 'book-open' },
    { v: 'meeting',  l: 'Meeting',  i: 'users' },
  ] as const;

  openAddModal(): void { this.form = this.blankForm(); this.showAddModal = true; }
  closeAddModal(): void { this.showAddModal = false; }

  saveMemory(): void {
    if (!this.form.title.trim() || !this.form.summary.trim()) return;
    this.saving = true;
    setTimeout(() => {
      this.memory.addEntry({
        type: this.form.type,
        title: this.form.title.trim(),
        summary: this.form.summary.trim(),
        projectId: this.form.project,
        tags: this.form.tags.split(',').map(t => t.trim()).filter(Boolean),
        pinned: this.form.pinned
      });
      this.saving = false;
      this.showAddModal = false;
    }, 600);
  }

  searchQuery = '';
  searchResults: Entry[] = [];
  isSearching = false;
  hasSearched = false;

  ngOnInit(): void {
    // Arriving from a chat's "Grounded in" source: open the right tab and highlight the item.
    const focus = this.route.snapshot.queryParamMap.get('focus');
    if (focus) {
      this.focusId = focus;
      if (this.memory.meetings().some(m => m.id === focus)) this.activeTab = 'meetings';
      else if (this.memory.sources().some(x => x.id === focus)) this.activeTab = 'sources';
    }
  }

  ngAfterViewInit(): void {
    if (!this.focusId) return;
    setTimeout(() => this.host.nativeElement.querySelector(`[data-mem-id="${this.focusId}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 150);
  }

  /** Start a chat on Home grounded in this item (and scoped to its project). */
  useInChat(id: string, projectId: string): void {
    this.router.navigate(['/psc', 'home'], { queryParams: { ...(projectId ? { project: projectId } : {}), context: id } });
  }

  togglePin(e: Entry): void {
    this.memory.togglePin(e.id);
  }

  get decisionCount(): number { return this.entries.filter(e => e.type === 'decision').length; }
  get pinnedCount(): number { return this.entries.filter(e => !!e.pinned).length; }
  get contextEntries(): Entry[] { return this.entries.filter(e => e.type === 'context' || e.type === 'decision'); }

  initials(name: string): string { return name.split(' ').map(n => n[0]).join(''); }

  get filtered(): Entry[] {
    return this.entries.filter(e =>
      (!this.filterType || e.type === this.filterType) &&
      (!this.filterProject || e.project === this.filterProject) &&
      (!this.search || e.title.toLowerCase().includes(this.search.toLowerCase()) || e.summary.toLowerCase().includes(this.search.toLowerCase()))
    );
  }

  get pinned(): Entry[] { return this.filtered.filter(e => e.pinned); }
  get unpinned(): Entry[] { return this.filtered.filter(e => !e.pinned); }

  get projects(): string[] { return [...new Set(this.entries.map(e => e.project))]; }

  typeIcon(type: string): string {
    const m: Record<string, string> = { decision: 'check-circle', meeting: 'users', context: 'book-open', insight: 'lightbulb' };
    return m[type] ?? 'circle';
  }

  typeColor(type: string): string {
    const m: Record<string, string> = { decision: '#059669', meeting: '#2563EB', context: '#7C3AED', insight: '#D97706' };
    return m[type] ?? '#9CA3AF';
  }

  typeLabel(type: string): string {
    const m: Record<string, string> = { decision: 'Decision', meeting: 'Meeting', context: 'Context', insight: 'Insight' };
    return m[type] ?? type;
  }

  daysAgo(d: string): string {
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return `${diff}d ago`;
  }

  runSearch(): void {
    if (!this.searchQuery.trim()) return;
    this.isSearching = true;
    this.hasSearched = false;
    setTimeout(() => {
      const q = this.searchQuery.toLowerCase();
      this.searchResults = this.entries.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q) ||
        e.tags.some(t => t.toLowerCase().includes(q))
      );
      this.isSearching = false;
      this.hasSearched = true;
    }, 700);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.hasSearched = false;
  }
}
