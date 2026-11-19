import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgSwitch, NgSwitchCase, NgSwitchDefault } from '@angular/common';

export type IllustrationName =
  | 'prd' | 'epic' | 'feature' | 'story' | 'acceptance-criteria' | 'market' | 'competitive'
  | 'goal' | 'roadmap' | 'scope' | 'brainstorm' | 'ideation'
  | 'product-memory' | 'tool-sync' | 'dependencies' | 'customer-feedback' | 'ai-decision-context'
  | 'empty-chats';

/** Artifact type ids (Artifact['type']) that differ from option ids. */
const ALIASES: Record<string, IllustrationName> = {
  'market-research': 'market',
  'competitive-analysis': 'competitive'
};

/**
 * Small decorative spot illustrations (inline SVG, 120×80) in the Product Studio palette.
 * Purely visual: always pair with a text label, so they're hidden from assistive tech.
 */
@Component({
  selector: 'app-psc-illustration',
  standalone: true,
  imports: [NgSwitch, NgSwitchCase, NgSwitchDefault],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  templateUrl: './psc-illustration.component.html',
  styleUrl: './psc-illustration.component.scss'
})
export class PscIllustrationComponent {
  private _name: IllustrationName = 'prd';

  @Input() set name(value: string | null | undefined) {
    this._name = (value && (ALIASES[value] ?? value)) as IllustrationName;
  }
  get name(): IllustrationName {
    return this._name;
  }
}
