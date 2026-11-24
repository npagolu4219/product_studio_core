import { Artifact } from '../models/psc.models';
import { getArtifactOption } from './artifact-options';

/**
 * Golden workflows: the standard, ordered sequences of documents a PM produces.
 * Each message in a workflow chat drafts the next document, built on everything before it.
 */
export interface GoldenWorkflow {
  id: string;
  label: string;
  icon: string;
  /** Artifact option ids, in order. */
  steps: string[];
}

export const GOLDEN_WORKFLOWS: GoldenWorkflow[] = [
  { id: 'idea-to-delivery', label: 'Idea to delivery', icon: 'rocket', steps: ['prd', 'epic', 'story', 'acceptance-criteria'] },
  { id: 'discovery', label: 'Product discovery', icon: 'search', steps: ['market', 'competitive', 'goal'] },
  { id: 'release-planning', label: 'Release planning', icon: 'map', steps: ['scope', 'feature', 'roadmap'] },
  { id: 'ideation', label: 'Ideation to PRD', icon: 'lightbulb', steps: ['brainstorm', 'ideation', 'prd'] }
];

export function getWorkflow(id: string | null | undefined): GoldenWorkflow | undefined {
  return id ? GOLDEN_WORKFLOWS.find(w => w.id === id) : undefined;
}

/** "PRD → Epic → User story → Acceptance criteria" */
export function workflowSummary(w: GoldenWorkflow): string {
  return w.steps.map(s => getArtifactOption(s)?.shortLabel ?? s).join(' → ');
}

/** Index of the step to draft next: the first step without a draft yet, or the last step once all are drafted. */
export function workflowStepIndex(w: GoldenWorkflow, artifacts: Artifact[]): number {
  const drafted = new Set(artifacts.map(a => getArtifactOption(a.type)?.id ?? a.type));
  const next = w.steps.findIndex(s => !drafted.has(s));
  return next === -1 ? w.steps.length - 1 : next;
}

/** True once every step in the workflow has a draft. */
export function workflowComplete(w: GoldenWorkflow, artifacts: Artifact[]): boolean {
  const drafted = new Set(artifacts.map(a => getArtifactOption(a.type)?.id ?? a.type));
  return w.steps.every(s => drafted.has(s));
}
