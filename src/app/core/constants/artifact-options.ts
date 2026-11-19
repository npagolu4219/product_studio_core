import { Artifact } from '../models/psc.models';

export interface ArtifactOption {
  /** Route-friendly id, used in /psc/home/:artifact */
  id: string;
  icon: string;
  /** lucide-angular icon name */
  iconName: string;
  label: string;
  /** Compact label for cards, chips and lists. */
  shortLabel: string;
}

export const ARTIFACT_OPTIONS: ArtifactOption[] = [
  { id: 'prd', iconName: 'clipboard-list', icon: '📋', label: 'Product requirements document', shortLabel: 'PRD' },
  { id: 'epic', iconName: 'layers', icon: '🗂️', label: 'Epic', shortLabel: 'Epic' },
  { id: 'feature', iconName: 'zap', icon: '⚡', label: 'Feature', shortLabel: 'Feature' },
  { id: 'story', iconName: 'sparkles', icon: '✨', label: 'User story', shortLabel: 'User story' },
  { id: 'acceptance-criteria', iconName: 'list-checks', icon: '☑️', label: 'Acceptance criteria', shortLabel: 'Acceptance criteria' },
  { id: 'market', iconName: 'search', icon: '🔍', label: 'Product research / Market analysis', shortLabel: 'Market research' },
  { id: 'competitive', iconName: 'swords', icon: '⚔️', label: 'Competitor analysis', shortLabel: 'Competitors' },
  { id: 'goal', iconName: 'target', icon: '🎯', label: 'Product strategy / Goals', shortLabel: 'Goals & OKRs' },
  { id: 'roadmap', iconName: 'map', icon: '🗺️', label: 'Roadmap', shortLabel: 'Roadmap' },
  { id: 'scope', iconName: 'crosshair', icon: '📐', label: 'Scope definition', shortLabel: 'Scope' },
  { id: 'brainstorm', iconName: 'lightbulb', icon: '💡', label: 'Brainstorm', shortLabel: 'Brainstorm' },
  { id: 'ideation', iconName: 'rocket', icon: '🚀', label: 'Ideation', shortLabel: 'Ideation' }
];

export const DEFAULT_ARTIFACT_ID = 'prd';

const ARTIFACT_TYPE_ALIASES: Record<string, Artifact['type']> = {
  market: 'market-research',
  competitive: 'competitive-analysis'
};

export function isArtifactOptionId(id: string | null | undefined): id is string {
  return !!id && ARTIFACT_OPTIONS.some(option => option.id === id);
}

export function getArtifactOption(id: string | null | undefined): ArtifactOption | undefined {
  if (!id) return undefined;
  return ARTIFACT_OPTIONS.find(option => option.id === id || toArtifactType(option.id) === id);
}

export function getArtifactLabel(id: string | null | undefined): string {
  return getArtifactOption(id)?.label || 'Artifact';
}

export function getArtifactShortLabel(id: string | null | undefined): string {
  return getArtifactOption(id)?.shortLabel || 'Artifact';
}

export function getArtifactIconName(id: string | null | undefined): string {
  return getArtifactOption(id)?.iconName || 'file-text';
}

/** Maps a route/option id to the Artifact model type. */
export function toArtifactType(id: string): Artifact['type'] {
  return ARTIFACT_TYPE_ALIASES[id] || (id as Artifact['type']);
}
