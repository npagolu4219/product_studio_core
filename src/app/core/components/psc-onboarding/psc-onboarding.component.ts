import { Component, OnInit, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { PscMockDataService } from '../../services/psc-mock-data.service';
import { Integration } from '../../models/psc.models';
import { ARTIFACT_OPTIONS } from '../../constants/artifact-options';

export const ONBOARDING_SEEN_KEY = 'psc_dashboard_seen';

export function hasSeenOnboarding(): boolean {
  try { return localStorage.getItem(ONBOARDING_SEEN_KEY) === '1'; } catch { return true; }
}

type StepKind = 'chat' | 'context' | 'create' | 'canvas' | 'share' | 'projects';

interface SetupStep { kind: StepKind; icon: string; title: string; desc: string; }

/** Tools the prompt bar's + menu can pull context from. */
const CONTEXT_TOOLS: Integration['type'][] = ['jira', 'confluence', 'ado', 'github'];

/**
 * First-visit welcome + a short walkthrough of Home, in the order a new user meets it:
 * project → chat → add context → create a document → refine on the canvas → share / export.
 * Each step names the real control on screen, so the tour matches the page it lands on.
 */
@Component({
  selector: 'app-psc-onboarding',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './psc-onboarding.component.html',
  styleUrl: './psc-onboarding.component.scss'
})
export class PscOnboardingComponent implements OnInit {
  readonly completed = output<void>();

  setupStep = 0; // 0 = welcome, 1..n = setup steps
  contextTools: Integration[] = [];

  readonly setupSteps: SetupStep[] = [
    { kind: 'projects', icon: 'folder-open', title: 'Start with a project',
      desc: 'Every chat lives in a project, with its documents, lifecycle and context. Open a project from Home to continue its chats, or create one with just a title and description.' },
    { kind: 'chat', icon: 'message-circle', title: 'Describe your idea',
      desc: 'Inside a project, describe what you’re working on in the prompt bar. New chats start on the Idea to delivery workflow, so your first message drafts a PRD.' },
    { kind: 'context', icon: 'layers', title: 'Ground it in your context',
      desc: 'Use Add Context in the prompt bar to attach files or pull in Jira issues, Confluence pages, Azure DevOps items, product modules and Product Memory. Answers and drafts then use your real context.' },
    { kind: 'create', icon: 'sparkles', title: 'Turn it into a document',
      desc: 'When you’re ready, open Golden workflow in the prompt bar. A workflow drafts its documents in order, one per message, from the project’s context and the chat so far.' },
    { kind: 'canvas', icon: 'file-text', title: 'Refine it on the canvas',
      desc: 'When a draft is ready it opens in the preview next to the chat. Read, edit, compare versions and see its history, or keep asking for changes in the chat.' },
    { kind: 'share', icon: 'share-2', title: 'Share, export or push',
      desc: 'From the canvas toolbar, share a draft for review, publish it, or export it. Exports can go to a file or straight into your delivery tools.' },
  ];

  /** A few of the documents the Golden workflow menu can create. */
  readonly modeOptions = [...ARTIFACT_OPTIONS.filter(o => ['prd', 'epic', 'story', 'roadmap', 'market'].includes(o.id))];

  /** Mirrors the canvas Export panel. */
  readonly exportOptions = [
    { icon: 'file-down', label: 'Markdown' },
    { icon: 'printer', label: 'PDF' },
    { icon: 'file-type', label: 'Word' },
    { icon: 'clipboard-copy', label: 'Copy Markdown' },
    { icon: 'trello', label: 'Push to Jira' },
    { icon: 'git-merge', label: 'Push to Azure DevOps' }
  ];

  readonly capabilities = [
    { icon: 'message-circle', title: 'Just chat', desc: 'Think an idea through in plain language. No forms, no templates.' },
    { icon: 'clipboard-list', title: 'PRDs & specs', desc: 'Draft PRDs, features, scope and acceptance criteria from a conversation.' },
    { icon: 'layers', title: 'Epics & user stories', desc: 'Break requirements down into epics and stories your team can pick up.' },
    { icon: 'search', title: 'Research & strategy', desc: 'Market research, competitor analysis, goals & OKRs, and roadmaps.' },
    { icon: 'brain-circuit', title: 'Grounded in your context', desc: 'Use Jira, Confluence, Azure DevOps, files and Product Memory as sources.' },
    { icon: 'share-2', title: 'Share & push', desc: 'Review, publish, export to Markdown, PDF or Word, or push to Jira or ADO.' }
  ];

  readonly documentTypeCount = ARTIFACT_OPTIONS.length;
  readonly exportCount = this.exportOptions.length;
  integrationCount = 0;

  constructor(private mockData: PscMockDataService) {}

  ngOnInit(): void {
    this.mockData.getIntegrations().subscribe(list => {
      this.integrationCount = list.length;
      this.contextTools = CONTEXT_TOOLS.map(t => list.find(i => i.type === t)).filter((i): i is Integration => !!i);
    });
  }

  get currentStep(): SetupStep | undefined {
    return this.setupSteps[this.setupStep - 1];
  }

  integrationIcon(type: Integration['type']): string {
    return ({ jira: 'trello', ado: 'git-merge', github: 'github', confluence: 'book-open' } as Record<string, string>)[type] ?? 'plug';
  }

  startSetup(): void { this.setupStep = 1; }

  prevStep(): void { if (this.setupStep > 1) this.setupStep--; }

  nextStep(): void {
    if (this.setupStep < this.setupSteps.length) this.setupStep++;
    else this.completeSetup();
  }

  skipSetup(): void { this.completeSetup(); }

  private completeSetup(): void {
    try { localStorage.setItem(ONBOARDING_SEEN_KEY, '1'); } catch { /* ignore */ }
    this.completed.emit();
  }
}
