import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ArtifactCanvasService } from '../../services/artifact-canvas.service';

interface WatchItem {
  id: string;
  label: string;
  status: 'running' | 'complete' | 'error' | 'syncing';
  detail?: string;
}

const EXPORT_LABELS = { copy: 'Clipboard', markdown: 'Markdown', pdf: 'PDF', word: 'Word', jira: 'Jira', ado: 'Azure DevOps' } as const;

/** Collapsible activity strip under the canvas: generation, publish and export progress for the open artifact. */
@Component({
  selector: 'app-activity-watch',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './activity-watch.component.html',
  styleUrl: './activity-watch.component.scss'
})
export class ActivityWatchComponent {
  readonly canvas = inject(ArtifactCanvasService);

  readonly watchItems = computed<WatchItem[]>(() => {
    const items: WatchItem[] = [];
    const artifact = this.canvas.artifact();
    if (this.canvas.generating()) {
      items.push({ id: 'gen', label: 'Generating reply', status: 'running', detail: `${this.canvas.generationProgress()}%` });
    }
    if (this.canvas.publishStatus() === 'publishing') {
      items.push({ id: 'publish', label: 'Publishing to team', status: 'syncing' });
    }
    const format = this.canvas.exportFormat();
    if (format) {
      items.push({ id: 'export', label: `Exporting to ${EXPORT_LABELS[format]}`, status: 'syncing' });
    }
    if (artifact && !items.length) {
      items.push({
        id: 'ready',
        label: artifact.status === 'published' ? `${artifact.title} published` : `${artifact.title} ready`,
        status: 'complete',
        detail: `v${artifact.version}`
      });
    }
    return items;
  });

  readonly busy = computed(() => this.watchItems().some(i => i.status === 'running' || i.status === 'syncing'));
}
