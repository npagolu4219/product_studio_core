import { EvaluationCadence, PdlcPhaseId } from '../models/psc.models';

export interface PdlcDeliverable {
  label: string;
  /** Artifact this deliverable is drafted as in chat (none = tracked outside Product Studio). */
  artifactId?: string;
  /** Prompt used when starting it from the project workspace ({project} is replaced). */
  prompt?: string;
}

export interface PdlcPhase {
  id: PdlcPhaseId;
  label: string;
  icon: string;
  /** What a PM does in this phase. */
  summary: string;
  deliverables: PdlcDeliverable[];
  /** Exit gate: what must be true to move on. */
  gate: string;
}

/** End-to-end product development lifecycle, as a PM runs it — from discovery to evaluating the outcome. */
export const PDLC_PHASES: PdlcPhase[] = [
  {
    id: 'discover', label: 'Discover', icon: 'search', summary: 'Research the problem, users and market',
    deliverables: [
      { label: 'Market research', artifactId: 'market', prompt: 'Run market research for {project}: segments, size, trends and the problem worth solving.' },
      { label: 'Competitor analysis', artifactId: 'competitive', prompt: 'Run a competitor analysis for {project}.' },
      { label: 'Opportunity brainstorm', artifactId: 'brainstorm', prompt: 'Brainstorm opportunities and user problems for {project}.' }
    ],
    gate: 'Problem validated with users and data'
  },
  {
    id: 'define', label: 'Define', icon: 'target', summary: 'Set goals, scope and requirements',
    deliverables: [
      { label: 'Goals & OKRs', artifactId: 'goal', prompt: 'Define product goals and OKRs for {project}, tied to its success metrics.' },
      { label: 'Scope', artifactId: 'scope', prompt: 'Define the scope for {project}: in, out, assumptions and risks.' },
      { label: 'PRD', artifactId: 'prd', prompt: 'Write a PRD for {project}, with success metrics from its evaluation plan.' }
    ],
    gate: 'PRD and success metrics approved'
  },
  {
    id: 'design', label: 'Design', icon: 'pen-tool', summary: 'Shape the solution and the experience',
    deliverables: [
      { label: 'Solution ideation', artifactId: 'ideation', prompt: 'Explore solution concepts for {project} and compare their trade-offs.' },
      { label: 'Feature specs', artifactId: 'feature', prompt: 'Specify the key features of {project} with UX notes and edge cases.' },
      { label: 'Design review' }
    ],
    gate: 'Designs reviewed with engineering and stakeholders'
  },
  {
    id: 'build', label: 'Build', icon: 'hammer', summary: 'Break down and deliver in sprints',
    deliverables: [
      { label: 'Epics', artifactId: 'epic', prompt: 'Break {project} down into epics with goals and success metrics.' },
      { label: 'User stories', artifactId: 'story', prompt: 'Write user stories with acceptance criteria for {project}’s top priority epic.' },
      { label: 'Sprint plan' }
    ],
    gate: 'Scope delivered and feature complete'
  },
  {
    id: 'validate', label: 'Validate', icon: 'shield-check', summary: 'QA, UAT and beta feedback',
    deliverables: [
      { label: 'Acceptance criteria', artifactId: 'acceptance-criteria', prompt: 'Write acceptance criteria and a UAT checklist for {project}.' },
      { label: 'Beta feedback review' }
    ],
    gate: 'UAT signed off, no open P1 defects'
  },
  {
    id: 'launch', label: 'Launch', icon: 'rocket', summary: 'Release, go-to-market and enablement',
    deliverables: [
      { label: 'Launch roadmap', artifactId: 'roadmap', prompt: 'Plan the launch roadmap for {project}: rollout stages, GTM and enablement.' },
      { label: 'Release notes' }
    ],
    gate: 'Released to target users, tracking live'
  },
  {
    id: 'evaluate', label: 'Evaluate', icon: 'chart-line', summary: 'Measure outcomes against success metrics',
    deliverables: [
      { label: 'Outcome review', artifactId: 'goal', prompt: 'Evaluate {project} against its success metrics: actuals vs targets, what we learned, and whether to iterate, scale or stop.' },
      { label: 'Retrospective' }
    ],
    gate: 'Metrics reviewed — iterate, scale or sunset'
  }
];

export const PDLC_ORDER: PdlcPhaseId[] = PDLC_PHASES.map(p => p.id);

export function pdlcPhase(id: PdlcPhaseId): PdlcPhase {
  return PDLC_PHASES.find(p => p.id === id)!;
}

/** Success metrics PMs commonly evaluate against (one click to add in the wizard). */
export const METRIC_SUGGESTIONS: { name: string; baseline?: string; target: string }[] = [
  { name: 'Feature adoption', target: '40% of active users' },
  { name: 'Activation rate', baseline: '25%', target: '35%' },
  { name: 'Task success rate', target: '90%' },
  { name: 'Time on task', target: '−30%' },
  { name: 'NPS / CSAT', target: '+10 pts' },
  { name: 'Retention (30-day)', target: '+5 pts' },
  { name: 'Revenue impact', target: '+$250k ARR' },
  { name: 'Defect escape rate', target: '< 2%' },
  { name: 'Support tickets', target: '−20%' }
];

export const EVALUATION_CADENCES: { id: EvaluationCadence; label: string }[] = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'biweekly', label: 'Every 2 weeks' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' }
];

export const REVIEW_WINDOWS = [30, 60, 90];
