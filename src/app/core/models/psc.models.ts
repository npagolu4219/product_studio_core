export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'paused' | 'completed' | 'draft';
  owner: string;
  team: string[];
  createdAt: string;
  updatedAt: string;
  tags: string[];
  progress: number;
  integrations: string[];
  aiAgents: number;
  artifacts: number;
  jiraKey?: string;
  adoProject?: string;
  /** Organise this project's chat activity into Product Memory automatically (daily, when there are new chats). */
  memoryAutoUpdate?: boolean;
}

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant' | 'agent';
  content: string;
  timestamp: string;
  agentName?: string;
  agentAvatar?: string;
  artifacts?: Artifact[];
  isStreaming?: boolean;
  metadata?: Record<string, unknown>;
}

export interface Artifact {
  id: string;
  type: 'prd' | 'epic' | 'feature' | 'story' | 'acceptance-criteria' | 'roadmap' | 'market-research' | 'competitive-analysis' | 'goal' | 'scope' | 'brainstorm' | 'ideation';
  title: string;
  content: string;
  status: 'draft' | 'review' | 'approved' | 'published';
  version: number;
  createdAt: string;
  updatedAt: string;
  projectId: string;
  tags: string[];
  jiraIssueKey?: string;
  /** Saved versions, newest first. */
  history?: ArtifactVersion[];
}

export interface ArtifactVersion {
  version: number;
  content: string;
  savedAt: string;
  label: string;
}

export interface BackgroundJob {
  id: string;
  name: string;
  type: string;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'queued';
  progress: number;
  startedAt: string;
  estimatedCompletion?: string;
  projectId: string;
  agentName: string;
  canPause: boolean;
  canRetry: boolean;
  logs: string[];
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  avatar: string;
  status: 'active' | 'idle' | 'busy' | 'offline';
  capabilities: string[];
  currentTask?: string;
  completedTasks: number;
  successRate: number;
}

export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'ai';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  projectId?: string;
  conversationState?: AiMessage[];
  actionLabel?: string;
  actionRoute?: string;
}

export interface Integration {
  id: string;
  name: string;
  type: 'jira' | 'ado' | 'github' | 'confluence' | 'figma' | 'slack' | 'teams';
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  icon: string;
  lastSync?: string;
  projectCount: number;
  fieldMappings: FieldMapping[];
}

export interface FieldMapping {
  sourceField: string;
  targetField: string;
  transform?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar: string;
  email: string;
  skills: string[];
  availability: number;
  assignedStories: number;
}

export interface AnalyticsData {
  totalProjects: number;
  activeProjects: number;
  artifactsGenerated: number;
  aiInteractions: number;
  timeSaved: number;
  teamVelocity: number;
  weeklyTrend: number[];
  featureBreakdown: { name: string; count: number; color: string }[];
}

/** Where a piece of chat context comes from (the prompt bar's "Add context" menu). */
export type ContextSourceKind = 'jira' | 'confluence' | 'ado' | 'module' | 'pdlc' | 'file';

// ── Product development lifecycle (PDLC): the phases a project covers, where it is now, and how it is evaluated ──

export type PdlcPhaseId = 'discover' | 'define' | 'design' | 'build' | 'validate' | 'launch' | 'evaluate';

/** A success metric the project is evaluated against ("Checkout conversion: 2.1% → 3%"). */
export interface PdlcMetric {
  id: string;
  name: string;
  baseline?: string;
  target: string;
}

export type EvaluationCadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly';

export interface ProjectLifecycle {
  /** Phases in scope, in lifecycle order. Evaluate is always included. */
  phases: PdlcPhaseId[];
  current: PdlcPhaseId;
  /** Phases signed off (their exit gate was met). */
  completed: PdlcPhaseId[];
  /** Target end date per phase (yyyy-mm-dd). */
  targets: Partial<Record<PdlcPhaseId, string>>;
  evaluation: {
    metrics: PdlcMetric[];
    cadence: EvaluationCadence;
    /** Post-launch review, in days after launch. */
    reviewAfterDays: number;
    /** What success (or stopping) looks like. */
    criteria: string;
  };
}

/** One item attached to a chat as context (Product Memory items are tracked separately, by id). */
export interface ContextAttachment {
  id: string;
  kind: ContextSourceKind;
  title: string;
  /** Key shown before the title: "ACP-141", "#4262". */
  ref?: string;
  /** Second line: type and status, space, size… */
  detail: string;
  /** Sub-type used for filter chips (Epic / Story / Bug, Page / Meeting notes, Work item / Repo…). */
  type?: string;
  projectId?: string;
}

export interface Conversation {
  id: string;
  title: string;
  /** Primary artifact option id the conversation was started with (route segment). */
  artifactId: string;
  /** Project this chat belongs to (scopes knowledge sources and the artifacts it generates). */
  projectId?: string;
  contextIds: string[];
  /** Jira / Confluence / Azure DevOps / module / file context added via "Add context". */
  attachments?: ContextAttachment[];
  /** Golden workflow this chat follows (each message drafts its next document). */
  workflowId?: string;
  /** Project members invited to collaborate on this chat. */
  collaborators?: string[];
  messages: AiMessage[];
  createdAt: string;
  updatedAt: string;
}

// ── Decision & Stakeholder Intelligence (used by AI Decision Context) ──
export interface Decision {
  id: string; projectId: string;
  title: string; description: string;
  rationale: string; alternatives: string[];
  owner: string; stakeholders: string[];
  status: 'proposed' | 'under-review' | 'approved' | 'rejected' | 'superseded';
  impact: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string; resolvedAt?: string;
  linkedArtifacts: string[];
  evidence: string[];
  approvals: { name: string; status: 'pending' | 'approved' | 'rejected'; at?: string }[];
  tags: string[];
}
