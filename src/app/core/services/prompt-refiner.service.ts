import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import { getArtifactLabel } from '../constants/artifact-options';

export type RefineMode = 'improve' | 'detailed' | 'concise' | 'structured';

export interface RefineOption {
  id: RefineMode;
  icon: string;
  label: string;
  description: string;
}

export interface RefineContext {
  artifactId: string;
  contextNames: string[];
}

export const REFINE_OPTIONS: RefineOption[] = [
  { id: 'improve', icon: 'wand-sparkles', label: 'Improve prompt', description: 'Clearer goal and the sections to cover' },
  { id: 'detailed', icon: 'list-plus', label: 'Add detail', description: 'Audience, constraints and success criteria' },
  { id: 'concise', icon: 'minimize-2', label: 'Make concise', description: 'Strip filler, keep the essentials' },
  { id: 'structured', icon: 'list-tree', label: 'Structure as brief', description: 'Goal · Context · Audience · Deliverable' }
];

/** Sections each artifact type should cover — used to make refined prompts specific. */
const ARTIFACT_SECTIONS: Record<string, string[]> = {
  prd: ['problem statement', 'target users', 'goals & success metrics', 'functional requirements', 'non-functional requirements', 'scope & out of scope', 'risks'],
  epic: ['epic summary', 'business value', 'features', 'user stories with estimates', 'dependencies'],
  feature: ['feature summary', 'user value', 'capabilities', 'success metrics', 'rollout plan'],
  story: ['user stories in “As a… I want… so that…” form', 'acceptance criteria', 'estimates'],
  'acceptance-criteria': ['Given/When/Then criteria', 'edge cases', 'test notes'],
  market: ['market size (TAM/SAM/SOM)', 'trends', 'customer segments', 'opportunities', 'risks'],
  competitive: ['competitor overview', 'feature comparison', 'pricing', 'strengths & weaknesses', 'differentiation'],
  goal: ['objective', 'key results', 'strategic bets', 'measures of success'],
  roadmap: ['themes', 'now / next / later milestones', 'dependencies', 'release timeline'],
  scope: ['in scope', 'out of scope', 'assumptions', 'constraints', 'open questions'],
  brainstorm: ['a wide range of ideas', 'quick impact/effort assessment', 'top picks'],
  ideation: ['distinct concepts', 'desirability/feasibility/viability evaluation', 'recommended next step']
};

/** Artifact labels/aliases recognised as request lead-ins ("a PRD for …"). */
const ARTIFACT_LABEL_PATTERN = [
  'product requirements document', 'prd', 'epics?', 'features?', 'user stor(?:y|ies)', 'stories', 'acceptance criteria',
  'product research', 'market analysis', 'market research', 'competitor analysis', 'competitive analysis',
  'product strategy', 'goals?', 'okrs?', 'roadmap', 'scope definition', 'scope', 'brainstorm', 'ideation', 'brief'
].join('|');

const LEADING_VERB = /^(?:build|create|make|design|develop|plan|launch|add|implement|improve|define|reduce|increase|redesign|migrate|integrate|automate|enable|support|replace|optimi[sz]e|streamline|introduce|expand)\b/i;

const FILLER = [
  /\b(please|kindly|basically|actually|just|really|very|maybe|kind of|sort of|somehow)\b/gi,
  /\b(can you|could you|would you|i want you to|i would like you to|i need you to|i'd like you to)\b/gi,
  /\b(help me( to)?|i want to|i need to|i would like to|i'd like to|let's)\b/gi
];

/**
 * Rewrites the user's prompt into a clearer, artifact-aware request.
 * Mock implementation (deterministic, client-side) until the refine endpoint is available;
 * keep the Observable signature so the API call can drop in without UI changes.
 */
@Injectable({ providedIn: 'root' })
export class PromptRefinerService {
  refine(text: string, mode: RefineMode, context: RefineContext): Observable<string> {
    return of(this.rewrite(text, mode, context)).pipe(delay(650));
  }

  private rewrite(raw: string, mode: RefineMode, ctx: RefineContext): string {
    const idea = this.coreIdea(raw);
    const artifact = getArtifactLabel(ctx.artifactId).toLowerCase();
    const sections = ARTIFACT_SECTIONS[ctx.artifactId] ?? ['overview', 'details', 'next steps'];
    const sources = ctx.contextNames.length ? ctx.contextNames.join(', ') : '';

    switch (mode) {
      case 'concise':
        return this.sentence(`${this.capitalize(artifact)} ${this.about(idea)}`);

      case 'detailed':
        return [
          `Create a ${artifact} ${this.about(idea)}.`,
          `Cover: ${sections.join(', ')}.`,
          'Identify the primary users and their main pain points, and state measurable success criteria.',
          'Call out constraints (timeline, compliance, technical dependencies) and the key assumptions to validate.',
          sources ? `Ground it in these knowledge sources: ${sources}.` : 'Note any assumptions where data is missing.',
          'Keep it concise, use clear headings, and end with open questions and next steps.'
        ].join('\n');

      case 'structured':
        return [
          `Goal: ${this.sentence(idea)}`,
          `Deliverable: ${this.capitalize(artifact)} covering ${sections.slice(0, 5).join(', ')}.`,
          'Audience: Product, engineering and design stakeholders.',
          `Context: ${sources ? `Use ${sources}.` : 'No knowledge sources selected — state assumptions.'}`,
          'Success criteria: Specific, measurable outcomes with owners.',
          'Constraints: Flag timeline, dependency and compliance risks.'
        ].join('\n');

      case 'improve':
      default:
        return [
          `Create a ${artifact} ${this.about(idea)}.`,
          `Include ${this.list(sections)}.`,
          sources ? `Use ${sources} as context.` : ''
        ].filter(Boolean).join(' ');
    }
  }

  /**
   * Extracts the core idea from the raw prompt so refining is idempotent:
   * reuses the "Goal:" line of a structured brief, takes the first line of a multi-line prompt,
   * strips filler phrases, request lead-ins ("create a PRD for", "Product requirements document for")
   * and leading verbs ("build a …" → "a …"), repeating until the text stops changing.
   */
  private coreIdea(raw: string): string {
    const goal = raw.match(/^\s*Goal:\s*(.+)$/im);
    let text = (goal ? goal[1] : raw.split('\n').find(l => l.trim()) ?? raw).replace(/\s+/g, ' ').trim();
    const labels = ARTIFACT_LABEL_PATTERN;
    const leadIns = [
      new RegExp(`^(?:create|write|generate|draft|make|build|produce|prepare)\\s+(?:an?|the|some)?\\s*(?:${labels})\\s+(?:for|about|on|of|to)\\s+`, 'i'),
      new RegExp(`^(?:an?\\s+)?(?:${labels})\\s+(?:for|about|on|of|to)\\s+`, 'i'),
    ];
    for (let i = 0; i < 4; i++) {
      const before = text;
      for (const pattern of FILLER) text = text.replace(pattern, ' ');
      text = text.replace(/\s+/g, ' ').replace(/^[\s,.:;-]+/, '').trim();
      for (const pattern of leadIns) text = text.replace(pattern, '');
      text = text.trim();
      if (text === before) break;
    }
    // Drop sentences a previous refine appended ("… Include …", "Cover: …", "Use … as context").
    text = text.split(/\.\s+(?=(?:Include|Cover|Use|Ground|Identify|Call out|Keep)\b)/)[0];
    text = text.replace(/[\s,.:;!?-]+$/, '').trim();
    return text || raw.trim();
  }

  /** "for a checkout flow" vs "to build a checkout flow" depending on whether the idea starts with a verb. */
  private about(idea: string): string {
    return LEADING_VERB.test(idea) ? `to ${this.lowerFirst(idea)}` : `for ${this.lowerFirst(idea)}`;
  }

  private list(items: string[]): string {
    return items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items[0];
  }

  private sentence(text: string): string {
    const t = this.capitalize(text.trim());
    return /[.!?]$/.test(t) ? t : `${t}.`;
  }

  private capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  private lowerFirst(text: string): string {
    // Keep acronyms/proper nouns (e.g. "AI", "Jira") intact.
    return /^[A-Z][a-z]/.test(text) && !/^[A-Z][a-z]+[A-Z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
  }
}
