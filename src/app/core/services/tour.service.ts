import { Injectable, computed, signal } from '@angular/core';

/**
 * First-time product tours: a spotlight on a real control plus a short explanation card.
 * Two tours, each shown once (remembered per browser) and replayable:
 *   home    — the Home landing and the main navigation
 *   project — the project workspace and its prompt bar
 *   preview — the document preview, the first time a draft opens
 * Steps point at elements by `data-tour="<target>"`; a step whose element isn't on screen is skipped.
 */
export type TourId = 'home' | 'project' | 'preview';

export interface TourStep {
  /** `data-tour` value of the element to highlight; omit for a centred card. */
  target?: string;
  icon: string;
  title: string;
  body: string;
  /** Preferred side for the card; it flips when there isn't room. */
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

const SEEN_PREFIX = 'psc.tour.seen.';

/**
 * Product tours are switched off for now. Set to true to turn them back on: auto-start on first visit,
 * the "Take the tour" links on Home and in projects, and "Take the preview tour" in the preview's ⋯ menu.
 */
export const TOURS_ENABLED = false;

export const TOURS: Record<TourId, TourStep[]> = {
  home: [
    {
      icon: 'sparkles',
      title: 'Welcome to Product Studio',
      body: 'Turn ideas into PRDs, epics, user stories, research and roadmaps, grounded in your team’s context. Here’s a one-minute look around.'
    },
    {
      target: 'landing-new-project', placement: 'right', icon: 'folder-plus',
      title: 'Everything starts with a project',
      body: 'A project keeps its chats, documents, context and team together. Create one with just a title and an optional description.'
    },
    {
      target: 'landing-project', placement: 'right', icon: 'folder-open',
      title: 'Pick up where you left off',
      body: 'Open a project to continue its chats, or use Resume to jump straight into the latest one. Cards show status, chats, documents and the team.'
    },
    {
      target: 'landing-sort', placement: 'left', icon: 'arrow-up-down',
      title: 'Sort your projects',
      body: 'Order by recent activity, name or number of chats. Search appears here once you have more than 10 projects.'
    },
    {
      target: 'nav-teams', placement: 'right', icon: 'users',
      title: 'Bring your team',
      body: 'Add people, group them into teams and assign a team to a project. Its members then collaborate on every chat in that project.'
    },
    {
      target: 'nav-repository', placement: 'right', icon: 'library',
      title: 'Every document, in one place',
      body: 'The Repository collects every draft and published document across your projects, with versions and status.'
    },
    {
      target: 'nav-chats', placement: 'right', icon: 'messages-square',
      title: 'Your chats',
      body: 'Recent chats live in the sidebar, grouped by project. Drag a chat onto another project to move it.'
    },
    {
      icon: 'rocket',
      title: 'You’re all set',
      body: 'Create or open a project to start. You can replay this tour any time from “Take the tour” on Home.'
    }
  ],
  project: [
    {
      icon: 'folder-open',
      title: 'Your project workspace',
      body: 'This is where you chat and create documents for this project. A quick look at the prompt bar.'
    },
    {
      target: 'pw-tabs', placement: 'bottom', icon: 'layers',
      title: 'Chat, Context and Documents',
      body: 'Chat is the conversation. Context is what every chat here is grounded in. Documents lists every draft from the project’s chats.'
    },
    {
      target: 'pb-input', placement: 'top', icon: 'message-square',
      title: 'Describe what you need',
      body: 'Write an idea, a question or a request in plain language. Press Enter to send and Shift + Enter for a new line.'
    },
    {
      target: 'pb-context', placement: 'top', icon: 'plus',
      title: 'Add Context',
      body: 'Attach files or pull in Jira issues, Confluence pages, Azure DevOps items, modules and Product Memory, so drafts use your real context.'
    },
    {
      target: 'pb-team', placement: 'top', icon: 'users',
      title: 'Team Collaboration',
      body: 'Teams assigned to the project are always included. Add another team or individual people to just this chat.'
    },
    {
      target: 'pb-workflow', placement: 'top', icon: 'route',
      title: 'Golden workflow',
      body: 'Pick a workflow such as Idea to delivery (PRD → Epic → User story → Acceptance criteria): each message drafts the next document. Or choose a single document.'
    },
    {
      target: 'pb-refine', placement: 'top', icon: 'wand-sparkles',
      title: 'Refine and Auto refine',
      body: 'Refine rewrites your prompt in the style you choose. Switch on Auto refine to improve it automatically whenever you pause typing.'
    },
    {
      target: 'pb-send', placement: 'top', icon: 'arrow-up',
      title: 'Send and preview',
      body: 'When a draft is ready it opens in the preview beside the chat (40% chat · 60% preview) to read, edit, compare versions, share or export.'
    }
  ],
  preview: [
    {
      icon: 'file-text',
      title: 'Your first draft is ready',
      body: 'The document opens here, next to the chat. A quick look at what you can do with it.'
    },
    {
      target: 'pv-doc', placement: 'bottom', icon: 'file-text',
      title: 'Document and version',
      body: 'Shows which document you’re looking at and its version. Click to switch between the documents drafted in this chat or rename it.'
    },
    {
      target: 'pv-status', placement: 'bottom', icon: 'badge-check',
      title: 'Track its status',
      body: 'Move the document from Draft to In review, Approved and Published, so everyone knows where it stands.'
    },
    {
      target: 'pv-modes', placement: 'bottom', icon: 'eye',
      title: 'View, Edit, Compare, History',
      body: 'Read it, edit it directly (press E), compare any two versions side by side, or restore an earlier one. Every AI change is saved as a new version.'
    },
    {
      target: 'pv-section', placement: 'left', icon: 'pencil',
      title: 'Work section by section',
      body: 'Hover a section to edit just that part, or ask the AI to improve it. The rest of the document stays as it is.'
    },
    {
      target: 'pv-outline', placement: 'left', icon: 'list',
      title: 'Jump around',
      body: 'Contents lists every section. Click one to jump straight to it.'
    },
    {
      target: 'pv-share', placement: 'bottom', icon: 'share-2',
      title: 'Share and publish',
      body: 'Share a link for review, or Publish to make it the version your team sees in the Repository.'
    },
    {
      target: 'pv-more', placement: 'bottom', icon: 'download',
      title: 'Export and more',
      body: 'Copy or download as Markdown, save as PDF or Word, or push to Jira and Azure DevOps. You can replay this tour from here too.'
    },
    {
      target: 'pv-resize', placement: 'right', icon: 'panel-left',
      title: 'Resize the split',
      body: 'Drag this divider (or use ← →) to give the chat or the document more room.'
    },
    {
      target: 'pv-activity', placement: 'top', icon: 'activity',
      title: 'Activity',
      body: 'Follow what the AI is doing and what changed in each version. Keep chatting on the left to refine the draft.'
    }
  ]
};

interface ActiveTour {
  id: TourId;
  steps: TourStep[];
  index: number;
}

@Injectable({ providedIn: 'root' })
export class TourService {
  readonly enabled = TOURS_ENABLED;
  private readonly state = signal<ActiveTour | null>(null);

  readonly active = computed(() => this.state());
  readonly step = computed(() => {
    const s = this.state();
    return s ? s.steps[s.index] : null;
  });

  hasSeen(id: TourId): boolean {
    try { return localStorage.getItem(SEEN_PREFIX + id) === '1'; } catch { return true; }
  }

  /** Start a tour on first visit only. */
  autoStart(id: TourId): void {
    if (!this.state() && !this.hasSeen(id)) this.start(id);
  }

  /** Start (or replay) a tour. Steps whose element isn't on screen are left out. */
  start(id: TourId): void {
    if (!this.enabled) return;
    const steps = TOURS[id].filter(s => !s.target || !!document.querySelector(`[data-tour="${s.target}"]`));
    if (steps.length) this.state.set({ id, steps, index: 0 });
  }

  next(): void {
    const s = this.state();
    if (!s) return;
    if (s.index >= s.steps.length - 1) this.finish();
    else this.state.set({ ...s, index: s.index + 1 });
  }

  prev(): void {
    const s = this.state();
    if (s && s.index > 0) this.state.set({ ...s, index: s.index - 1 });
  }

  goTo(index: number): void {
    const s = this.state();
    if (s && index >= 0 && index < s.steps.length) this.state.set({ ...s, index });
  }

  /** Close the tour (finished or skipped); either way it won't auto-start again. */
  finish(): void {
    const s = this.state();
    if (s) {
      try { localStorage.setItem(SEEN_PREFIX + s.id, '1'); } catch { /* ignore */ }
    }
    this.state.set(null);
  }
}
