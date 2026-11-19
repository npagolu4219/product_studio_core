/** PM Buddy domain models — frontend-only POC (all data is local mock state). */

export type BuddyPriority = 'high' | 'medium' | 'low';
export type BuddyItemKind = 'task' | 'commitment' | 'follow-up' | 'reminder';
export type BuddyItemStatus = 'pending' | 'completed';

/** For commitments: something I promised someone, or something someone owes me. */
export type CommitmentDirection = 'i-owe' | 'owed-to-me';

export interface BuddySource {
  kind: 'capture' | 'meeting' | 'manual' | 'insight' | 'idea';
  /** Meeting id / idea id / capture message id */
  refId?: string;
  label?: string;
}

/** Tasks, commitments, follow-ups and reminders share one shape so they can move between lists. */
export interface BuddyItem {
  id: string;
  kind: BuddyItemKind;
  title: string;
  notes?: string;
  priority: BuddyPriority;
  status: BuddyItemStatus;
  /** ISO date (YYYY-MM-DD) */
  dueDate?: string;
  project?: string;
  owner: string;
  /** Stakeholder for commitments / follow-ups (who I owe, or who owes me). */
  stakeholder?: string;
  direction?: CommitmentDirection;
  source: BuddySource;
  createdAt: string;
  completedAt?: string;
  /** ISO date — hidden from "today" views until this date. */
  snoozedUntil?: string;
}

export interface MeetingActionItem {
  id: string;
  text: string;
  owner: string;
  dueDate?: string;
  /** Set when converted into a BuddyItem. */
  taskId?: string;
  done?: boolean;
}

export interface BuddyMeeting {
  id: string;
  title: string;
  /** ISO date */
  date: string;
  /** "10:00" (24h) */
  time: string;
  durationMin: number;
  participants: string[];
  project?: string;
  summary: string;
  decisions: string[];
  actionItems: MeetingActionItem[];
  questions: string[];
  /** Raw notes the user typed (for manually added meetings). */
  notes?: string;
  /** Upcoming meetings have no summary yet. */
  upcoming?: boolean;
}

export type IdeaKind = 'idea' | 'note' | 'feedback';
export type IdeaStatus = 'new' | 'reviewed' | 'promoted';

export interface BuddyIdea {
  id: string;
  kind: IdeaKind;
  title: string;
  body?: string;
  project?: string;
  tags: string[];
  status: IdeaStatus;
  createdAt: string;
  source: BuddySource;
}

/** One item the mock AI extracted from a capture, shown as an editable card before it is saved. */
export interface ProposedItem {
  id: string;
  /** 'idea' | 'note' become BuddyIdeas; the rest become BuddyItems. */
  category: BuddyItemKind | 'idea' | 'note';
  title: string;
  dueDate?: string;
  priority: BuddyPriority;
  project?: string;
  stakeholder?: string;
  direction?: CommitmentDirection;
  state: 'proposed' | 'editing' | 'confirmed' | 'cancelled';
  /** Id of the created item/idea once confirmed. */
  savedId?: string;
}

export interface MemoryReference {
  label: string;
  /** ISO date */
  date: string;
  project?: string;
  kind: 'meeting' | 'task' | 'commitment' | 'idea' | 'capture' | 'feedback';
  /** In-app route to open the source. */
  link?: string[];
}

export interface MemoryAnswer {
  answer: string;
  bullets: string[];
  references: MemoryReference[];
}

export interface BuddyMessage {
  id: string;
  role: 'user' | 'buddy';
  text: string;
  createdAt: string;
  proposals?: ProposedItem[];
  memory?: MemoryAnswer;
  /** Buddy is still "thinking" (simulated AI delay). */
  pending?: boolean;
}

export type InsightKind =
  | 'overdue-commitment'
  | 'meeting-action'
  | 'stakeholder-response'
  | 'upcoming-deadline'
  | 'unreviewed-idea'
  | 'open-question';

export interface BuddyInsight {
  /** Stable id derived from the underlying record so snooze/dismiss survive recomputation. */
  id: string;
  kind: InsightKind;
  severity: 'high' | 'medium' | 'low';
  title: string;
  message: string;
  project?: string;
  date?: string;
  /** What the insight points at. */
  ref: { type: 'item' | 'meeting-action' | 'meeting-question' | 'idea'; id: string; meetingId?: string };
  /** Which actions make sense for this insight. */
  canComplete: boolean;
  canConvert: boolean;
  link: string[];
}

export interface BuddyToast {
  id: number;
  type: 'success' | 'info' | 'error';
  text: string;
  /** Optional undo handler label + callback. */
  actionLabel?: string;
  action?: () => void;
}

export interface BuddyState {
  version: number;
  items: BuddyItem[];
  meetings: BuddyMeeting[];
  ideas: BuddyIdea[];
  messages: BuddyMessage[];
  /** insight id → ISO date until which it is snoozed */
  snoozedInsights: Record<string, string>;
  /** insight ids the user resolved without an underlying item (e.g. answered question) */
  resolvedInsights: string[];
}
