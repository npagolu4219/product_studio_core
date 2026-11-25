import { AiMessage } from '../models/psc.models';

/**
 * Human-in-the-loop: before drafting a new document, the AI asks a few clarifying questions.
 * Each has quick-pick answers plus a free-text "Other". Answers shape the draft; skipping drafts with defaults.
 */
export interface ClarifyQuestion {
  id: string;
  text: string;
  hint?: string;
  options: string[];
  /** Several answers allowed. */
  multi?: boolean;
}

export interface ClarifyRequest {
  /** Document type (artifact option id) the questions are for. */
  artifactId: string;
  /** The request that triggered the questions; the draft is built from it plus the answers. */
  prompt: string;
  status: 'pending' | 'answered' | 'skipped';
  questions: ClarifyQuestion[];
  /** question id → chosen answers (set once answered). */
  answers?: Record<string, string[]>;
  /** Free text the user typed in the chat instead of using the card. */
  note?: string;
}

const AUDIENCE: ClarifyQuestion = {
  id: 'audience', text: 'Who is this for?', hint: 'The primary users or customers',
  options: ['Consumers (B2C)', 'Small businesses', 'Enterprise customers', 'Internal teams'], multi: true
};
const OUTCOME: ClarifyQuestion = {
  id: 'outcome', text: 'What outcome matters most?',
  options: ['Increase conversion', 'Grow adoption / engagement', 'Reduce cost or effort', 'Improve retention', 'Meet compliance']
};
const TIMELINE: ClarifyQuestion = {
  id: 'timeline', text: 'What’s the timeline?',
  options: ['This sprint', 'This quarter', 'Next quarter', 'No fixed date']
};
const DETAIL: ClarifyQuestion = {
  id: 'detail', text: 'How detailed should it be?',
  options: ['Short summary', 'Standard', 'Comprehensive']
};

const BANK: Record<string, ClarifyQuestion[]> = {
  prd: [
    AUDIENCE,
    OUTCOME,
    { id: 'scope', text: 'What should the first release cover?', options: ['MVP only', 'MVP + quick wins', 'Full feature set'] },
    { id: 'constraints', text: 'Any constraints to respect?', hint: 'Pick all that apply',
      options: ['Fixed deadline', 'Limited engineering capacity', 'Regulatory / compliance', 'Must reuse existing platform', 'None'], multi: true },
    TIMELINE
  ],
  epic: [
    { id: 'goal', text: 'Which goal does this epic serve?', options: ['New capability', 'Improve an existing flow', 'Tech debt / platform', 'Compliance'] },
    AUDIENCE,
    { id: 'size', text: 'Roughly how big is it?', options: ['1 sprint', '2–3 sprints', 'A quarter', 'Not sure yet'] },
    { id: 'stories', text: 'Break it into stories now?', options: ['Yes, list candidate stories', 'Just the epic for now'] }
  ],
  feature: [
    AUDIENCE,
    { id: 'problem', text: 'What problem does it solve?', options: ['Users can’t do X today', 'X is too slow or manual', 'Users drop off at X', 'Customer request'] },
    { id: 'platforms', text: 'Which platforms?', options: ['Web', 'iOS', 'Android', 'API'], multi: true },
    OUTCOME
  ],
  story: [
    { id: 'persona', text: 'Which persona is it for?', options: ['End user', 'Admin', 'Support agent', 'Developer / API user'] },
    { id: 'count', text: 'How many stories?', options: ['One focused story', '3–5 stories', 'A full backlog for the feature'] },
    { id: 'ac', text: 'Include acceptance criteria?', options: ['Yes, Given / When / Then', 'Yes, as a checklist', 'No'] },
    { id: 'estimate', text: 'Add estimates?', options: ['Story points', 'T-shirt sizes', 'No estimates'] }
  ],
  'acceptance-criteria': [
    { id: 'format', text: 'Which format?', options: ['Given / When / Then', 'Checklist', 'Both'] },
    { id: 'cover', text: 'What should they cover?', options: ['Happy path', 'Edge cases', 'Error handling', 'Accessibility', 'Performance'], multi: true },
    { id: 'nfr', text: 'Include non-functional criteria?', options: ['Yes', 'No'] }
  ],
  market: [
    { id: 'market', text: 'Which market or segment?', options: ['Global', 'North America', 'Europe', 'India / APAC', 'A specific segment'] },
    { id: 'focus', text: 'What should it focus on?', options: ['Market size (TAM / SAM / SOM)', 'Trends', 'Customer needs', 'Pricing'], multi: true },
    { id: 'horizon', text: 'Time horizon?', options: ['Next 12 months', '1–3 years', '3–5 years'] },
    DETAIL
  ],
  competitive: [
    { id: 'competitors', text: 'Which competitors?', options: ['Top 3 direct competitors', 'Direct and indirect', 'I’ll name them'] },
    { id: 'compare', text: 'Compare on…', options: ['Features', 'Pricing', 'UX', 'Positioning', 'Integrations'], multi: true },
    { id: 'output', text: 'Include a SWOT?', options: ['Yes', 'No'] }
  ],
  goal: [
    { id: 'period', text: 'Which period?', options: ['This quarter', 'Next quarter', 'This half', 'This year'] },
    { id: 'theme', text: 'Main theme?', options: ['Growth', 'Retention', 'Efficiency', 'Quality / reliability', 'Revenue'] },
    { id: 'count', text: 'How many objectives?', options: ['1–2', '3', '4–5'] }
  ],
  roadmap: [
    { id: 'horizon', text: 'Roadmap horizon?', options: ['Next quarter', '2 quarters', '12 months'] },
    { id: 'format', text: 'Format?', options: ['Now / Next / Later', 'By quarter', 'By theme'] },
    { id: 'audience', text: 'Who will read it?', options: ['Engineering', 'Leadership', 'Customers', 'Whole company'] },
    { id: 'capacity', text: 'Team capacity?', options: ['1 squad', '2–3 squads', '4+ squads', 'Not sure'] }
  ],
  scope: [
    { id: 'in', text: 'What’s definitely in scope?', options: ['Core user flow', 'Admin tools', 'Integrations', 'Reporting'], multi: true },
    { id: 'out', text: 'Anything explicitly out of scope?', options: ['Mobile apps', 'Internationalisation', 'Migrations', 'Nothing yet'], multi: true },
    { id: 'release', text: 'Release approach?', options: ['Big bang', 'Phased rollout', 'Beta first'] }
  ]
};

const GENERIC: ClarifyQuestion[] = [AUDIENCE, OUTCOME, DETAIL];

export function clarifyQuestionsFor(artifactId: string): ClarifyQuestion[] {
  return BANK[artifactId] ?? GENERIC;
}

export function clarifyOf(m: AiMessage | null | undefined): ClarifyRequest | undefined {
  return (m?.metadata?.['clarify'] as ClarifyRequest | undefined) ?? undefined;
}

/** "• Who is this for?: Consumers (B2C), Small businesses" lines for the answered questions. */
export function clarifySummary(c: ClarifyRequest): string[] {
  const lines = c.questions
    .filter(q => c.answers?.[q.id]?.length)
    .map(q => `• ${q.text.replace(/\?$/, '')}: ${c.answers![q.id].join(', ')}`);
  if (c.note) lines.push(`• Notes: ${c.note}`);
  return lines;
}
