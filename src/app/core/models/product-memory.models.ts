/** Product Memory — the team's shared knowledge, used by the Product Memory page and as chat knowledge on Home. */

export type MemoryType = 'decision' | 'meeting' | 'context' | 'insight';
export type SourceType = 'confluence' | 'sharepoint' | 'github';
export type SourceStatus = 'connected' | 'syncing' | 'error' | 'disconnected';

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  title: string;
  summary: string;
  /** Owning project id ('' = general / no project). */
  projectId: string;
  tags: string[];
  createdAt: string;
  author: string;
  authorInitials: string;
  pinned?: boolean;
}

export interface MeetingSummary {
  id: string;
  title: string;
  date: string;
  duration: string;
  attendees: string[];
  keyDecisions: string[];
  actionItems: { owner: string; task: string; due: string }[];
  projectId: string;
}

export interface ContextSource {
  id: string;
  type: SourceType;
  name: string;
  url: string;
  status: SourceStatus;
  lastSync: string | null;
  docsIngested: number;
  entriesCreated: number;
  projectId: string;
}

/** Display fields derived from the project store (name + colour), so pages never show stale project names. */
export interface WithProject {
  project: string;
  projectColor: string;
}

/** Anything from Product Memory that a chat can be grounded in. */
export type KnowledgeKind = MemoryType | 'source';

export interface KnowledgeRef {
  /** Same id as the underlying entry / meeting / source. Stored on conversations as contextIds. */
  id: string;
  kind: KnowledgeKind;
  title: string;
  /** One-line description shown under the title. */
  detail: string;
  projectId: string;
  project: string;
  projectColor: string;
  pinned: boolean;
  /** Sources with an auth error can't be used until they're reconnected. */
  unavailable?: string;
  updatedAt: string;
}
