/** The five Product Intelligence capabilities (ported from product-studio's dashboard MVP section). */
export interface PiFeature {
  /** Child route under /psc/intelligence */
  route: string;
  icon: string;
  title: string;
  /** Short label for the tab strip. */
  tab: string;
  description: string;
  /** One-line summary for cards. */
  tagline: string;
  accentColor: string;
}

export const PI_FEATURES: PiFeature[] = [
  {
    route: 'product-memory',
    icon: 'brain-circuit',
    title: 'Context & Product Memory',
    tab: 'Product Memory',
    description: 'AI-powered product knowledge, searchable decisions, meeting summaries and persistent project context.',
    tagline: 'Searchable knowledge, decisions & meetings',
    accentColor: 'var(--psc-primary)'
  },
  {
    route: 'tool-sync',
    icon: 'git-merge',
    title: 'Updates & Tool Synchronization',
    tab: 'Tool Sync',
    description: 'Jira and Azure DevOps integrations with field mapping, bi-directional sync and real-time status updates.',
    tagline: 'Two-way Jira & ADO sync',
    accentColor: 'var(--psc-secondary)'
  },
  {
    route: 'dependencies',
    icon: 'link',
    title: 'Dependencies & Commitments',
    tab: 'Dependencies',
    description: 'Cross-team dependency tracking, delivery blockers, ownership assignment and commitment visibility.',
    tagline: 'Blockers, owners & commitments',
    accentColor: '#059669'
  },
  {
    route: 'customer-feedback',
    icon: 'message-square',
    title: 'Unified Customer Feedback',
    tab: 'Customer Feedback',
    description: 'Customer feedback ingestion, AI categorization, insight extraction and feedback-to-feature mapping.',
    tagline: 'Feedback themes mapped to features',
    accentColor: '#D97706'
  },
  {
    route: 'ai-decision-context',
    icon: 'sparkles',
    title: 'AI Decision Context',
    tab: 'Decision Context',
    description: 'AI-generated decision briefs using product knowledge, customer evidence and delivery constraints.',
    tagline: 'Evidence-backed decision briefs',
    accentColor: '#EC4899'
  }
];
