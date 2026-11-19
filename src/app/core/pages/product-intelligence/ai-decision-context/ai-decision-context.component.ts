import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { PscMockDataService } from '../../../services/psc-mock-data.service';
import { Decision } from '../../../models/psc.models';
import { dt } from '../../../utils/date-utils';

interface GenerateBriefForm {
  question: string;
  project: string;
  projectColor: string;
}

interface GenerationStep {
  label: string;
  done: boolean;
}

interface DecisionBrief {
  id: string;
  title: string;
  project: string;
  projectColor: string;
  generatedAt: string;
  confidence: 'high' | 'medium' | 'low';
  recommendation: string;
  productContext: string[];
  customerEvidence: string[];
  deliveryConstraints: string[];
  risks: string[];
  alternatives: { option: string; pros: string; cons: string }[];
  status: 'ready' | 'generating' | 'stale';
}

@Component({
  selector: 'app-psc-ai-decision-context',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './ai-decision-context.component.html',
  styleUrl: './ai-decision-context.component.scss',
})
export class AiDecisionContextComponent implements OnInit {
  decisions: Decision[] = [];
  briefs: DecisionBrief[] = [
    {
      id: 'b1',
      title: 'Should we add BNPL (Buy Now Pay Later) to checkout?',
      project: 'Aava Commerce',
      projectColor: '#7C3AED',
      generatedAt: dt(0, 1),
      confidence: 'high',
      recommendation: 'YES — Add BNPL in Phase 1. Customer evidence is strong (28 requests, 18 votes on top feedback item). Engineering effort is 3 weeks which fits within Q2 timeline if started this sprint. Klarna and Afterpay are the top two requested providers.',
      productContext: [
        'Checkout optimization is Q2 priority #1 (decided Jan 14)',
        'Payment Integration Epic is in-progress (45% complete)',
        'Multi-currency was deferred to Phase 2 — BNPL is a separate scope item',
        'Stripe supports Afterpay natively via Stripe Checkout',
      ],
      customerEvidence: [
        '28 feedback items mention BNPL across Intercom, G2 and Zendesk',
        '"We lose 30% of Gen Z customers without Klarna" — FashionHub (18 votes)',
        'Competitor Shopify, BigCommerce and WooCommerce all support BNPL',
        'BNPL adoption grew 42% YoY in e-commerce (Q4 2024 market research)',
      ],
      deliveryConstraints: [
        'Q2 launch deadline: March 31, 2025',
        'Engineering estimate: 3 weeks (Stripe Afterpay integration)',
        'PCI-DSS compliance review required — Legal team has 1 week SLA',
        'Sprint 8 has 12 story points of capacity available',
      ],
      risks: [
        'PCI-DSS scope expansion may require additional security review',
        'Klarna integration requires separate contract negotiation (2-3 weeks)',
        'Sprint 8 capacity may need 2 existing stories deferred',
      ],
      alternatives: [
        { option: 'Add Afterpay only (via Stripe)', pros: 'Fastest path — 1 week, no new contract', cons: 'Misses Klarna users (larger market share)' },
        { option: 'Add both Klarna + Afterpay', pros: 'Maximum coverage, strongest competitive position', cons: '3 weeks effort, Klarna contract needed' },
        { option: 'Defer to Phase 2', pros: 'No sprint disruption', cons: 'Continued customer churn, competitive disadvantage' },
      ],
      status: 'ready',
    },
    {
      id: 'b2',
      title: 'Should we prioritize biometric checkout or search redesign?',
      project: 'Aava Commerce',
      projectColor: '#7C3AED',
      generatedAt: dt(1, 2),
      confidence: 'medium',
      recommendation: 'BIOMETRIC CHECKOUT first. Mobile checkout abandonment (68%) is the top pain point. Biometric checkout directly addresses this. Search redesign has fewer customer signals (22 items vs 47 for checkout friction) and is blocked on OpenSearch infrastructure.',
      productContext: [
        'Checkout optimization is Q2 priority #1',
        'Biometric checkout is under security review (pending approval)',
        'Search redesign requires OpenSearch vector index — infrastructure not ready',
        'Mobile accounts for 67% of all transactions',
      ],
      customerEvidence: [
        '47 feedback items about checkout friction vs 22 about search',
        'Mobile checkout abandonment at 68% — highest in company history',
        'Biometric checkout requested by 12 enterprise customers',
        'Search complaints trending down 3% — less urgent',
      ],
      deliveryConstraints: [
        'Biometric checkout blocked on Security team approval (ETA: Jan 20)',
        'Search redesign blocked on OpenSearch infrastructure (ETA: Feb 1)',
        'Both features compete for same mobile engineering team',
        'Q2 deadline is fixed — only one can ship in Q2',
      ],
      risks: [
        'Security team may reject biometric checkout — fallback to search',
        'Biometric checkout adds 2 weeks if security changes are required',
      ],
      alternatives: [
        { option: 'Biometric checkout (recommended)', pros: 'Directly addresses #1 pain point, 67% mobile traffic', cons: 'Blocked on security review until Jan 20' },
        { option: 'Search redesign', pros: 'No blockers, can start immediately', cons: 'Lower customer signal, infrastructure dependency' },
        { option: 'Both in parallel', pros: 'Maximum coverage', cons: 'Team capacity insufficient — quality risk' },
      ],
      status: 'ready',
    },
    {
      id: 'b3',
      title: 'Should HealthSync support Apple Watch in Sprint 4?',
      project: 'HealthSync Mobile',
      projectColor: '#0891B2',
      generatedAt: dt(2, 5),
      confidence: 'high',
      recommendation: 'YES — Apple Watch support is low risk and high value. Engineering estimate is 1.5 weeks. FHIR R4 data format is already implemented. Apple Watch represents 34% of wearable market. No compliance blockers.',
      productContext: [
        'FHIR R4 compliance is complete — Apple Watch data maps cleanly',
        'Device Pairing Wizard is in-review (Sprint 4)',
        'Sprint 4 has 8 story points of remaining capacity',
        'Apple Watch support was approved as a change request (Jan 14)',
      ],
      customerEvidence: [
        'Dr. James Park (Product Owner) requested Apple Watch in Sprint 4',
        'Apple Watch holds 34% of wearable market share',
        '3 pilot hospital customers specifically requested Apple Watch support',
        'Competing apps (Withings, Garmin Connect) already support Apple Watch',
      ],
      deliveryConstraints: [
        'Sprint 4 ends Jan 24 — 1.5 week estimate fits',
        'WatchOS pairing story is in-progress (Anita Sharma)',
        'No compliance blockers — FHIR R4 handles Apple Watch data natively',
        'QA needs 2 days for device testing',
      ],
      risks: [
        'Pixel 8 Pro pairing bug may consume QA time needed for Apple Watch testing',
        'WatchOS API changes in watchOS 11 may require additional testing',
      ],
      alternatives: [
        { option: 'Add Apple Watch in Sprint 4 (recommended)', pros: 'Fits timeline, high customer value, no blockers', cons: 'Minor QA capacity risk' },
        { option: 'Defer to Sprint 5', pros: 'More QA time available', cons: 'Misses pilot hospital demo on Jan 28' },
      ],
      status: 'ready',
    },
  ];

  selectedBrief: DecisionBrief | null = null;
  generatingId: string | null = null;
  activeTab: 'briefs' | 'decisions' = 'briefs';

  // Generate Brief modal
  showGenerateModal = false;
  isGenerating = false;
  generateForm: GenerateBriefForm = { question: '', project: '', projectColor: '' };
  generationSteps: GenerationStep[] = [];
  generationCurrentStep = -1;

  readonly projectColorMap: Record<string, string> = {
    'Aava Commerce Platform': '#7C3AED',
    'HealthSync Mobile': '#0891B2',
    'FinFlow Analytics': '#059669',
    'EduPath LMS': '#D97706',
    'LogiTrack Supply Chain': '#DC2626',
  };

  get projects() { return this.mockData.projects; }

  constructor(private mockData: PscMockDataService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.decisions = this.mockData.decisions;
  }

  get highConfidenceCount(): number { return this.briefs.filter(b => b.confidence === 'high').length; }
  get underReviewCount(): number { return this.decisions.filter(d => d.status === 'under-review').length; }

  openBrief(b: DecisionBrief): void { this.selectedBrief = b; }
  closeBrief(): void { this.selectedBrief = null; }

  openGenerateModal(): void {
    this.generateForm = { question: '', project: this.projects[0]?.name ?? '', projectColor: this.projectColorMap[this.projects[0]?.name] ?? '#7C3AED' };
    this.isGenerating = false;
    this.generationSteps = [];
    this.generationCurrentStep = -1;
    this.showGenerateModal = true;
  }

  closeGenerateModal(): void {
    if (this.isGenerating) return;
    this.showGenerateModal = false;
  }

  selectProject(name: string): void {
    this.generateForm.project = name;
    this.generateForm.projectColor = this.projectColorMap[name] ?? '#7C3AED';
  }

  get generateFormValid(): boolean {
    return this.generateForm.question.trim().length > 10 && !!this.generateForm.project;
  }

  startGeneration(): void {
    if (!this.generateFormValid || this.isGenerating) return;
    this.isGenerating = true;
    this.generationSteps = [
      { label: 'Loading product memory & decisions…', done: false },
      { label: 'Scanning customer feedback signals…', done: false },
      { label: 'Analysing delivery constraints & risks…', done: false },
      { label: 'Evaluating alternatives…', done: false },
      { label: 'Synthesising recommendation…', done: false },
    ];
    this.generationCurrentStep = 0;
    this.tickGeneration();
  }

  private tickGeneration(): void {
    const delay = 700 + Math.random() * 400;
    setTimeout(() => {
      this.generationSteps[this.generationCurrentStep].done = true;
      this.cdr.detectChanges();
      if (this.generationCurrentStep < this.generationSteps.length - 1) {
        this.generationCurrentStep++;
        this.tickGeneration();
      } else {
        this.finishGeneration();
      }
    }, delay);
  }

  private finishGeneration(): void {
    const q = this.generateForm.question.trim();
    const proj = this.generateForm.project;
    const color = this.generateForm.projectColor;
    const newBrief: DecisionBrief = {
      id: 'b-' + Date.now(),
      title: q.endsWith('?') ? q : q + '?',
      project: proj,
      projectColor: color,
      generatedAt: new Date().toISOString(),
      confidence: 'medium',
      recommendation: `Based on current product context, customer signals and delivery constraints for ${proj}, the AI recommends proceeding with a phased approach. Validate assumptions with the team before committing to a final decision.`,
      productContext: [
        `Active project: ${proj}`,
        'Product memory and decision log scanned for relevant context',
        'Existing epics and features analysed for scope overlap',
      ],
      customerEvidence: [
        'Customer feedback corpus scanned for related signals',
        'Sentiment and vote counts aggregated across all sources',
      ],
      deliveryConstraints: [
        'Current sprint capacity and team availability considered',
        'Existing commitments and dependencies reviewed',
      ],
      risks: [
        'Confidence is medium — recommend team review before finalising',
        'Additional stakeholder input may shift the recommendation',
      ],
      alternatives: [
        { option: 'Proceed as recommended', pros: 'Aligns with current priorities and capacity', cons: 'Medium confidence — validate with team' },
        { option: 'Defer and gather more data', pros: 'Higher confidence decision', cons: 'Delays resolution' },
      ],
      status: 'ready',
    };
    setTimeout(() => {
      this.briefs = [newBrief, ...this.briefs];
      this.isGenerating = false;
      this.showGenerateModal = false;
      this.selectedBrief = newBrief;
      this.activeTab = 'briefs';
      this.cdr.detectChanges();
    }, 400);
  }

  projectColor(name: string): string {
    return this.projectColorMap[name] ?? '#7C3AED';
  }

  get generationProgress(): number {
    if (!this.generationSteps.length) return 0;
    const done = this.generationSteps.filter(s => s.done).length;
    return Math.round(done / this.generationSteps.length * 100);
  }

  generateBrief(id: string): void {
    this.generatingId = id;
    setTimeout(() => {
      const b = this.briefs.find(x => x.id === id);
      if (b) b.generatedAt = new Date().toISOString();
      this.generatingId = null;
      this.cdr.detectChanges();
    }, 2200);
  }

  confidenceColor(c: string): string {
    const m: Record<string, string> = { high: '#059669', medium: '#B45309', low: '#DC2626' };
    return m[c] ?? '#6B7280';
  }

  confidenceIcon(c: string): string {
    const m: Record<string, string> = { high: 'shield-check', medium: 'shield', low: 'shield-alert' };
    return m[c] ?? 'shield';
  }

  daysAgo(d: string): string {
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return `${diff}d ago`;
  }

  getStatusColor(status: string): string {
    const m: Record<string, string> = { approved: '#059669', 'under-review': '#D97706', proposed: '#2563EB', rejected: '#DC2626' };
    return m[status] ?? '#9CA3AF';
  }
}
