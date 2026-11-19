import { Component, OnInit, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { PscMockDataService } from '../../services/psc-mock-data.service';
import { Agent } from '../../models/psc.models';

export const ONBOARDING_SEEN_KEY = 'psc_dashboard_seen';

export function hasSeenOnboarding(): boolean {
  try { return localStorage.getItem(ONBOARDING_SEEN_KEY) === '1'; } catch { return true; }
}

/** First-visit welcome screen + 6-step setup walkthrough (ported from product-studio's dashboard landing). */
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
  agents: Agent[] = [];

  readonly setupSteps = [
    { icon: 'folder-open', title: 'Create your first project', desc: 'Set up a project to organise your AI-generated artifacts and team collaboration.' },
    { icon: 'cpu', title: 'Meet your AI agents', desc: 'Specialised agents — Forge, Aria, Scout and more — pick up the work your prompts describe.' },
    { icon: 'git-merge', title: 'Connect your tools', desc: 'Sync with Jira, ADO, GitHub, Confluence or Slack to push artifacts directly.' },
    { icon: 'message-square', title: 'Chat with Product Studio AI', desc: 'Describe what you are building. Replies, drafts and follow-ups stay together in one conversation.' },
    { icon: 'sparkles', title: 'Generate your first artifact', desc: 'Pick a type — PRD, Epic, User Story or Market Research — and let AI do the heavy lifting.' },
    { icon: 'download', title: 'Review & export', desc: 'Open a draft on the canvas to edit, compare versions, then share, publish or export it.' }
  ];

  readonly capabilities = [
    { icon: 'clipboard-list', title: 'PRD Generator', desc: 'Turn a one-line idea into a full product requirements document in seconds.' },
    { icon: 'layers', title: 'Epic & Story Writer', desc: 'Decompose PRDs into sprint-ready epics and user stories with acceptance criteria.' },
    { icon: 'search', title: 'Market Research', desc: 'AI-powered competitive analysis, SWOT matrices and market sizing reports.' },
    { icon: 'target', title: 'Goal Planner', desc: 'Generate OKRs aligned to your product vision and company strategy.' },
    { icon: 'git-merge', title: 'One-click Sync', desc: 'Push artifacts directly to Jira, ADO, GitHub or Confluence with field mapping.' },
    { icon: 'cpu', title: 'Golden Agents', desc: 'Onboard custom AI agents with personas, capabilities and system prompts.' }
  ];

  constructor(private mockData: PscMockDataService) {}

  ngOnInit(): void {
    this.mockData.getAgents().subscribe(a => (this.agents = a));
  }

  startSetup(): void { this.setupStep = 1; }

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
