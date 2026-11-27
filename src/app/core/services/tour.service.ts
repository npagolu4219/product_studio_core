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
      body: 'Open a project to continue its chats or start a new one. Cards show the project’s status and team.'
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
      title: 'Refine',
      body: 'Refine rewrites your prompt so it is clearer and more complete. Undo brings yours back.'
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
      title: 'Document details',
      body: 'The document’s title, version and details. Hover the title to rename it. Open another draft from its card in the chat.'
    },
    {
      target: 'pv-modes', placement: 'bottom', icon: 'eye',
      title: 'Version history',
      body: 'Every AI change is saved as a new version. Open History to view, compare or restore any of them. Press E to edit.'
    },
    {
      target: 'pv-section', placement: 'left', icon: 'pencil',
      title: 'Work section by section',
      body: 'Hover a section to copy it or edit just that part. The rest of the document stays as it is.'
    },
    {
      target: 'pv-outline', placement: 'left', icon: 'list',
      title: 'Jump around',
      body: 'Contents lists every section. Click one to jump straight to it.'
    },
    {
      target: 'pv-resize', placement: 'right', icon: 'panel-left',
      title: 'Resize the split',
      body: 'Drag this divider (or use ← →) to give the chat or the document more room.'
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
