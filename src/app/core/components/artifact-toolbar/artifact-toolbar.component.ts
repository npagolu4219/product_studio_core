import { Component, ElementRef, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ArtifactCanvasService, CanvasMode } from '../../services/artifact-canvas.service';
import { PscMockDataService } from '../../services/psc-mock-data.service';
import { parseDoc } from '../../utils/artifact-doc';
import { getArtifactIconName, getArtifactLabel } from '../../constants/artifact-options';


/**
 * The preview header: document title (rename in place) + one line of details, History and Publish.
 * Modes that show a "Back to document" button:
 */
const AWAY_MODES: CanvasMode[] = ['edit', 'compare', 'history', 'publish'];

@Component({
  selector: 'app-artifact-toolbar',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './artifact-toolbar.component.html',
  styleUrl: './artifact-toolbar.component.scss'
})
export class ArtifactToolbarComponent {
  readonly canvas = inject(ArtifactCanvasService);
  private readonly mockData = inject(PscMockDataService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  readonly closed = output<void>();

  readonly renaming = signal(false);

  readonly iconName = computed(() => getArtifactIconName(this.canvas.artifact()?.type));
  readonly typeLabel = computed(() => getArtifactLabel(this.canvas.artifact()?.type));
  readonly projectName = computed(() => this.mockData.findProject(this.canvas.artifact()?.projectId)?.name ?? null);
  /** Word count and reading time of the version on screen. */
  readonly words = computed(() => parseDoc(this.canvas.viewedContent(), this.canvas.artifact()?.title).words);
  readonly readingMinutes = computed(() => Math.max(1, Math.round(this.words() / 200)));

  startRename(): void {
    if (this.canvas.viewingVersion()) return;
    this.renaming.set(true);
    setTimeout(() => {
      const el = this.host.nativeElement.querySelector<HTMLInputElement>('.tb-title-input');
      el?.focus();
      el?.select();
    });
  }

  finishRename(value: string, save: boolean): void {
    if (!this.renaming()) return;
    this.renaming.set(false);
    if (save) this.canvas.rename(value);
  }

  /** True when the canvas shows something other than the document itself. */
  isAway(): boolean {
    return AWAY_MODES.includes(this.canvas.mode());
  }

  /** History is a toggle: open it, or go back to the document. */
  toggleHistory(): void {
    this.setMode(this.canvas.mode() === 'history' ? 'view' : 'history');
  }

  setMode(mode: CanvasMode): void {
    this.canvas.setMode(mode);
  }

  close(): void {
    this.canvas.guard(() => this.closed.emit());
  }

}
