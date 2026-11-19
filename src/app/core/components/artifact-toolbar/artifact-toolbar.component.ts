import { Component, ElementRef, HostListener, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ArtifactCanvasService, ArtifactStatus, CanvasMode, ExportFormat, STATUS_OPTIONS } from '../../services/artifact-canvas.service';
import { Artifact } from '../../models/psc.models';
import { getArtifactIconName, getArtifactLabel, getArtifactShortLabel } from '../../constants/artifact-options';

interface Tab { id: CanvasMode; icon: string; label: string; shortcut?: string; }
interface MoreItem { id: string; icon: string; label: string; hint?: string; divider?: boolean; narrowOnly?: boolean; }

/** Primary ways to work with the document. Share / Publish / Export live on the right. */
const TABS: Tab[] = [
  { id: 'view', icon: 'eye', label: 'View' },
  { id: 'edit', icon: 'pencil', label: 'Edit', shortcut: 'E' },
  { id: 'compare', icon: 'git-compare', label: 'Compare' },
  { id: 'history', icon: 'history', label: 'History' }
];

const MORE: MoreItem[] = [
  { id: 'share', icon: 'share-2', label: 'Share…', narrowOnly: true },
  { id: 'refine', icon: 'sparkles', label: 'Ask AI to refine', hint: 'Opens the chat with a refine prompt' },
  { id: 'preview', icon: 'monitor', label: 'Preview as reader', divider: true },
  { id: 'copy', icon: 'clipboard-copy', label: 'Copy as Markdown' },
  { id: 'markdown', icon: 'file-down', label: 'Download Markdown' },
  { id: 'pdf', icon: 'printer', label: 'Print / Save as PDF' },
  { id: 'export', icon: 'download', label: 'More export options…', hint: 'Word, Jira, Azure DevOps' },
  { id: 'chat', icon: 'panel-left', label: 'Toggle conversation', divider: true }
];

@Component({
  selector: 'app-artifact-toolbar',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './artifact-toolbar.component.html',
  styleUrl: './artifact-toolbar.component.scss'
})
export class ArtifactToolbarComponent {
  readonly canvas = inject(ArtifactCanvasService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  readonly closed = output<void>();

  readonly tabs = TABS;
  readonly more = MORE;
  readonly statusOptions = STATUS_OPTIONS;
  readonly menu = signal<'doc' | 'status' | 'more' | null>(null);

  readonly iconName = computed(() => getArtifactIconName(this.canvas.artifact()?.type));
  readonly typeLabel = computed(() => getArtifactLabel(this.canvas.artifact()?.type));
  readonly getIcon = getArtifactIconName;
  readonly getShort = getArtifactShortLabel;

  toggleMenu(m: 'doc' | 'status' | 'more', e: Event): void {
    e.stopPropagation();
    this.menu.set(this.menu() === m ? null : m);
    if (this.menu()) setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.tb-menu [role="menuitem"], .tb-menu [role="menuitemradio"]')?.focus());
  }

  setMode(mode: CanvasMode): void {
    this.menu.set(null);
    this.canvas.setMode(mode);
  }

  switchTo(a: Artifact): void {
    this.menu.set(null);
    if (a.id === this.canvas.artifact()?.id) return;
    this.canvas.guard(() => this.router.navigate([], { relativeTo: this.route, queryParams: { artifact: a.id }, queryParamsHandling: 'merge' }));
  }

  setStatus(s: ArtifactStatus): void {
    this.menu.set(null);
    this.canvas.setStatus(s);
  }

  runMore(id: string): void {
    this.menu.set(null);
    if (id === 'refine') this.canvas.requestRefine();
    else if (id === 'preview' || id === 'export' || id === 'share') this.canvas.setMode(id);
    else if (id === 'chat') this.canvas.toggleChatCollapsed();
    else this.canvas.exportAs(id as ExportFormat);
  }

  close(): void {
    this.menu.set(null);
    this.canvas.guard(() => this.closed.emit());
  }

  /** Arrow-key navigation inside an open menu. */
  onMenuKeydown(e: KeyboardEvent): void {
    const items = [...this.host.nativeElement.querySelectorAll<HTMLElement>('.tb-menu [role^="menuitem"]')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
  }

  @HostListener('document:click')
  closeMenus(): void {
    this.menu.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.menu()) this.menu.set(null);
  }
}
