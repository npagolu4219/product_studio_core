import { Component, ElementRef, HostListener, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ArtifactCanvasService } from '../../services/artifact-canvas.service';
import { PscMockDataService } from '../../services/psc-mock-data.service';
import { getArtifactIconName, getArtifactLabel } from '../../constants/artifact-options';
import { ArtifactVersion } from '../../models/psc.models';
import { DiffChunk, DocSection, diffLines, foldDiff, parseDoc, toMarkdown } from '../../utils/artifact-doc';
import { initials } from '../../constants/project-visuals';

interface PublishCheck { id: string; ok: boolean; label: string; detail?: string; fix?: 'edit'; }

@Component({
  selector: 'app-artifact-canvas',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, LucideAngularModule],
  templateUrl: './artifact-canvas.component.html',
  styleUrl: './artifact-canvas.component.scss'
})
export class ArtifactCanvasComponent {
  readonly canvas = inject(ArtifactCanvasService);
  private readonly mockData = inject(PscMockDataService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  @ViewChild('scroller') private scroller?: ElementRef<HTMLElement>;

  readonly initials = initials;
  readonly activeSection = signal<string | null>(null);
  readonly expandedFolds = signal<Set<number>>(new Set());
  readonly copiedSection = signal<string | null>(null);

  constructor() {
    // Each mode / document starts at the top (otherwise switching from a long View keeps its offset).
    effect(() => {
      this.canvas.mode();
      this.canvas.artifact()?.id;
      this.canvas.viewingVersion();
      queueMicrotask(() => this.scroller?.nativeElement.scrollTo({ top: 0 }));
      this.expandedFolds.set(new Set());
    });
    // Move focus into the unsaved-changes dialog so keyboard users land on its primary action.
    effect(() => {
      if (this.canvas.leaveGuard()) setTimeout(() => this.scroller?.nativeElement.querySelector<HTMLElement>('.cv-guard .cv-btn--primary')?.focus());
    });
    // Focus the section editor when it opens.
    effect(() => {
      const s = this.canvas.sectionEdit();
      if (s) setTimeout(() => this.scroller?.nativeElement.querySelector<HTMLTextAreaElement>('.cv-section-editor')?.focus());
    });
  }

  readonly typeLabel = computed(() => getArtifactLabel(this.canvas.artifact()?.type));
  readonly project = computed(() => this.mockData.findProject(this.canvas.artifact()?.projectId));

  /** Structured document for the View / Preview tabs. */
  readonly doc = computed(() => parseDoc(this.canvas.viewedContent(), this.canvas.artifact()?.title));
  readonly viewingOld = computed(() => this.canvas.viewingVersion() !== null);

  readonly editStats = computed(() => {
    const text = this.canvas.editContent();
    return { words: text.trim() ? text.trim().split(/\s+/).length : 0, chars: text.length };
  });

  // ── Compare ──
  readonly compareFromVersion = computed(() => this.canvas.versions().find(v => v.version === this.canvas.compareFrom()) ?? null);
  readonly compareToVersion = computed(() => {
    const to = this.canvas.compareTo();
    const a = this.canvas.artifact();
    if (a && (to === null || to === a.version)) return { version: a.version, content: a.content, savedAt: a.updatedAt, label: 'Current' } as ArtifactVersion;
    return this.canvas.versions().find(v => v.version === to) ?? null;
  });
  readonly diff = computed(() => {
    const from = this.compareFromVersion();
    const to = this.compareToVersion();
    if (!from || !to) return null;
    const d = diffLines(from.content, to.content);
    return { added: d.added, removed: d.removed, chunks: foldDiff(d.lines) as DiffChunk[] };
  });

  // ── History: change size of each version vs the one before it ──
  readonly versionStats = computed(() => {
    const vs = this.canvas.versions();
    return vs.map((v, i) => {
      const prev = vs[i + 1];
      if (!prev) return { added: 0, removed: 0, first: true };
      const d = diffLines(prev.content, v.content);
      return { added: d.added, removed: d.removed, first: false };
    });
  });

  // ── Publish readiness (computed from the real document) ──
  readonly publishChecks = computed<PublishCheck[]>(() => {
    const a = this.canvas.artifact();
    if (!a) return [];
    const doc = parseDoc(a.content, a.title);
    const placeholders = (a.content.match(/\b(TBD|TODO|XXX)\b|\[(?:insert|add|tbd)[^\]]*\]/gi) ?? []).length;
    const grounded = doc.sections.some(s => /grounded in (product memory|context)/i.test(s.heading));
    return [
      { id: 'content', ok: doc.sections.length >= 2, label: doc.sections.length >= 2 ? `${doc.sections.length} sections, ${doc.words} words` : 'Add at least two sections', fix: doc.sections.length >= 2 ? undefined : 'edit' },
      { id: 'placeholders', ok: placeholders === 0, label: placeholders ? `${placeholders} placeholder${placeholders === 1 ? '' : 's'} (TBD / TODO) left` : 'No TBD / TODO placeholders', fix: placeholders ? 'edit' : undefined },
      { id: 'grounded', ok: grounded, label: grounded ? 'Grounded in context' : 'Not grounded in any context', detail: grounded ? undefined : 'Optional — use Add Context in the prompt bar (Jira, Confluence, files, knowledge base), then ask for an update in the chat' }
    ];
  });
  /** Only real content problems block publishing; review and grounding are recommendations. */
  readonly publishBlocked = computed(() => this.publishChecks().some(c => !c.ok && c.id === 'content'));

  readonly team = computed(() => this.project()?.team ?? []);

  readonly toastIcon = computed(() => {
    const type = this.canvas.toast()?.type;
    return type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : 'info';
  });

  // ── Sections ──
  private spyPausedUntil = 0;

  jumpTo(id: string): void {
    const el = this.scroller?.nativeElement.querySelector<HTMLElement>(`#${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // The last sections can't reach the top of the scroller, so don't let the scroll-spy override the choice.
    this.spyPausedUntil = Date.now() + 900;
    this.activeSection.set(id);
    el?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  }

  copySection(s: DocSection): void {
    const a = this.canvas.artifact();
    if (!a) return;
    const md = toMarkdown(s.heading, `━━━━━━━━━━\n${s.icon} ${s.heading}\n━━━━━━━━━━\n${s.body}`).replace(/^# .*\n\n/, '');
    try { void navigator.clipboard?.writeText(md); } catch { /* ignore */ }
    this.copiedSection.set(s.id);
    setTimeout(() => this.copiedSection() === s.id && this.copiedSection.set(null), 1500);
  }

  cancelSection(): void {
    this.canvas.guard(() => this.canvas.cancelSectionEdit());
  }

  autosize(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, 560)}px`;
  }

  onScroll(): void {
    const root = this.scroller?.nativeElement;
    if (!root || this.canvas.mode() !== 'view' || Date.now() < this.spyPausedUntil) return;
    if (root.scrollTop + root.clientHeight >= root.scrollHeight - 4) {
      const all = this.doc().sections;
      this.activeSection.set(all[all.length - 1]?.id ?? null);
      return;
    }
    const top = root.getBoundingClientRect().top + 90;
    let current: string | null = null;
    root.querySelectorAll<HTMLElement>('.cv-section').forEach(el => { if (el.getBoundingClientRect().top <= top) current = el.id; });
    this.activeSection.set(current ?? this.doc().sections[0]?.id ?? null);
  }

  // ── Compare ──
  setCompare(which: 'from' | 'to', value: string): void {
    const n = Number(value);
    (which === 'from' ? this.canvas.compareFrom : this.canvas.compareTo).set(n);
    this.expandedFolds.set(new Set());
  }

  swapCompare(): void {
    const from = this.canvas.compareFrom();
    const to = this.compareToVersion()?.version ?? null;
    this.canvas.compareFrom.set(to);
    this.canvas.compareTo.set(from);
  }

  toggleFold(i: number): void {
    this.expandedFolds.update(s => {
      const next = new Set(s);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  // ── Publish fixes ──
  runFix(fix: PublishCheck['fix']): void {
    if (fix === 'edit') this.canvas.setMode('edit');
  }

  /** "A newer AI version exists" → open it. */
  openNewer(): void {
    const n = this.canvas.newerDraft();
    if (n) this.canvas.guard(() => this.router.navigate([], { relativeTo: this.route, queryParams: { artifact: n.id }, queryParamsHandling: 'merge' }));
  }

  trackByIndex(i: number): number {
    return i;
  }

  // ── Keyboard ──
  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (!this.canvas.artifact()) return;
    const mod = e.metaKey || e.ctrlKey;
    const target = e.target as HTMLElement;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;

    if (this.canvas.leaveGuard()) {
      if (e.key === 'Escape') { e.preventDefault(); this.canvas.resolveGuard('stay'); }
      return;
    }
    if (mod && e.key.toLowerCase() === 's') {
      if (this.canvas.mode() === 'edit') { e.preventDefault(); this.canvas.saveEdit(); }
      else if (this.canvas.sectionEdit()) { e.preventDefault(); this.canvas.saveSectionEdit(); }
      return;
    }
    if (mod && e.key === 'Enter' && this.canvas.sectionEdit()) { e.preventDefault(); this.canvas.saveSectionEdit(); return; }
    if (e.key === 'Escape') {
      if (this.canvas.sectionEdit()) { e.preventDefault(); this.canvas.guard(() => this.canvas.cancelSectionEdit()); }
      else if (this.canvas.mode() === 'edit') { e.preventDefault(); this.canvas.cancelEdit(); }
      // History, compare, share, publish, export, reader preview: Esc goes back to the document.
      else if (this.canvas.mode() !== 'view' && !document.querySelector('.tb-title-input')) { e.preventDefault(); this.canvas.setMode('view'); }
      return;
    }
    if (!typing && !mod && !e.altKey && e.key.toLowerCase() === 'e' && this.canvas.mode() === 'view' && !this.viewingOld()) {
      e.preventDefault();
      this.canvas.setMode('edit');
    }
  }
}
