import { Injectable, computed, inject } from '@angular/core';
import { Artifact, ArtifactVersion, PdlcPhaseId } from '../models/psc.models';
import { ConversationService } from './conversation.service';
import { PscMockDataService } from './psc-mock-data.service';
import { buildArtifactContent } from '../constants/artifact-content';
import { getArtifactOption } from '../constants/artifact-options';
import { CURRENT_USER } from '../constants/current-user';

export type RepoStatus = Artifact['status'];

/** One document in the repository: every version of an artifact type within a chat, collapsed into one entry. */
export interface RepoDoc {
  /** Stable key, used in the URL (?doc=…). */
  key: string;
  /** 'chat' = generated in a conversation; 'library' = published before (sample history), not tied to a chat. */
  source: 'chat' | 'library';
  projectId: string | null;
  type: Artifact['type'];
  /** Artifact option id (route segment in /psc/home/:artifact). */
  optionId: string;
  title: string;
  /** Latest version. */
  latest: Artifact;
  /** Newest published version, if any (may be older than `latest` when a newer draft is in progress). */
  published?: Artifact;
  status: RepoStatus;
  version: number;
  versions: ArtifactVersion[];
  createdAt: string;
  updatedAt: string;
  author: string;
  jiraKey?: string;
  phase: PdlcPhaseId;
  conversationId?: string;
  conversationTitle?: string;
  /** Route segment of the source chat (its primary artifact). */
  conversationArtifactId?: string;
}

/** Where each artifact type sits in the product development lifecycle. */
export const TYPE_PHASE: Record<Artifact['type'], PdlcPhaseId> = {
  'market-research': 'discover', 'competitive-analysis': 'discover', brainstorm: 'discover',
  goal: 'define', scope: 'define', prd: 'define',
  ideation: 'design', feature: 'design',
  epic: 'build', story: 'build',
  'acceptance-criteria': 'validate',
  roadmap: 'launch'
};

const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString();

/** [projectId, type, title, status, version, days since update, jira key?] — authors come from the project team. */
type Seed = [string, Artifact['type'], string, RepoStatus, number, number, string?];
const LIBRARY: Seed[] = [
  ['p1', 'prd', 'Checkout redesign — PRD', 'published', 4, 3, 'ACP-118'],
  ['p1', 'epic', 'Saved cards & one-click pay', 'published', 2, 6, 'ACP-120'],
  ['p1', 'competitive-analysis', 'BNPL providers — competitor scan', 'approved', 1, 9],
  ['p1', 'story', 'Saved card user stories', 'review', 3, 1],
  ['p1', 'roadmap', 'H1 checkout roadmap', 'published', 2, 14],
  ['p2', 'prd', 'Real-time vitals streaming — PRD', 'published', 3, 5],
  ['p2', 'acceptance-criteria', 'Vitals PDF export — acceptance criteria', 'review', 2, 2],
  ['p2', 'market-research', 'Remote patient monitoring market', 'published', 1, 21],
  ['p3', 'scope', 'Usage-based pricing — scope', 'approved', 2, 4],
  ['p3', 'goal', 'FY27 revenue goals & OKRs', 'published', 1, 12],
  ['p4', 'brainstorm', 'AI tutor opportunities', 'draft', 1, 2],
  ['p4', 'market-research', 'K-12 adaptive learning market', 'review', 1, 7],
  ['p5', 'prd', 'Predictive disruption alerts — PRD', 'published', 5, 40, 'LTS-210'],
  ['p5', 'roadmap', 'Regional rollout roadmap', 'published', 3, 18],
  ['p5', 'epic', 'Automated reorder thresholds', 'published', 2, 25, 'LTS-231']
];

/**
 * Project-wise repository of everything generated in chats (and published before): one entry per
 * document, with its latest and published versions, lifecycle phase and source chat. Read-only view
 * over ConversationService — edits and publishing still happen on the canvas in the chat.
 */
@Injectable({ providedIn: 'root' })
export class ArtifactRepositoryService {
  private readonly conversations = inject(ConversationService);
  private readonly mockData = inject(PscMockDataService);
  private readonly library: RepoDoc[] = this.buildLibrary();

  readonly docs = computed<RepoDoc[]>(() => {
    const fromChats: RepoDoc[] = [];
    for (const c of this.conversations.conversations()) {
      const byType = new Map<Artifact['type'], Artifact[]>();
      for (const m of c.messages) for (const a of m.artifacts ?? []) byType.set(a.type, [...(byType.get(a.type) ?? []), a]);
      for (const [type, list] of byType) {
        const sorted = [...list].sort((x, y) => x.version - y.version);
        const latest = sorted[sorted.length - 1];
        const published = [...sorted].reverse().find(a => a.status === 'published');
        fromChats.push({
          key: `${c.id}~${type}`,
          source: 'chat',
          projectId: c.projectId ?? null,
          type,
          optionId: getArtifactOption(type)?.id ?? type,
          title: latest.title,
          latest,
          published,
          status: latest.status,
          version: latest.version,
          versions: latest.history?.length ? latest.history : [{ version: latest.version, content: latest.content, savedAt: latest.updatedAt, label: `Version ${latest.version}` }],
          createdAt: sorted[0].createdAt,
          updatedAt: latest.updatedAt,
          author: CURRENT_USER.name,
          jiraKey: [...sorted].reverse().find(a => a.jiraIssueKey)?.jiraIssueKey,
          phase: TYPE_PHASE[type] ?? 'define',
          conversationId: c.id,
          conversationTitle: c.title,
          conversationArtifactId: c.artifactId
        });
      }
    }
    return [...fromChats, ...this.library].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  });

  find(key: string | null | undefined): RepoDoc | undefined {
    return key ? this.docs().find(d => d.key === key) : undefined;
  }

  /** Version shown to the team: the published one, else the latest. */
  current(d: RepoDoc): Artifact {
    return d.published ?? d.latest;
  }

  /** A newer version exists than the one that's published. */
  hasNewerDraft(d: RepoDoc): boolean {
    return !!d.published && d.published.version < d.latest.version;
  }

  private buildLibrary(): RepoDoc[] {
    return LIBRARY.filter(([pid]) => this.mockData.findProject(pid)).map(([projectId, type, title, status, version, ago, jiraKey], i) => {
      const project = this.mockData.findProject(projectId)!;
      const versions: ArtifactVersion[] = Array.from({ length: version }, (_, k) => {
        const v = version - k;
        return {
          version: v,
          content: buildArtifactContent(type, title, `${title} for ${project.name}${v > 1 ? ` (revision ${v})` : ''}`),
          savedAt: day(ago + k * 4),
          label: v === 1 ? 'Version 1 (generated)' : `Version ${v} (${k === 0 && status === 'published' ? 'published' : 'edited'})`
        };
      });
      const latest: Artifact = {
        id: `lib-${projectId}-${i}`, type, title, content: versions[0].content, status, version,
        createdAt: versions[versions.length - 1].savedAt, updatedAt: versions[0].savedAt, projectId, tags: [], jiraIssueKey: jiraKey, history: versions
      };
      return {
        key: `lib-${projectId}-${i}`,
        source: 'library' as const,
        projectId,
        type,
        optionId: getArtifactOption(type)?.id ?? type,
        title,
        latest,
        published: status === 'published' ? latest : undefined,
        status,
        version,
        versions,
        createdAt: latest.createdAt,
        updatedAt: latest.updatedAt,
        author: project.team[i % project.team.length] ?? project.owner,
        jiraKey,
        phase: TYPE_PHASE[type]
      };
    });
  }
}
