import { BuddyIdea, BuddyItem, BuddyMeeting, BuddyMessage, BuddyState } from '../models/pm-buddy.models';
import { isoDay } from './pm-buddy.dates';

/**
 * Seed data for the PM Buddy POC. Dates are relative to the day the demo is first loaded,
 * so there is always something due today, overdue and upcoming.
 */
/** Bump when the seed changes so saved demos pick up the new data. v2: KPMG & SFI client engagements. */
export const BUDDY_STATE_VERSION = 2;

export const ME = 'Pramod';

export const STAKEHOLDERS = ['Mahesh', 'Priya', 'Marcus', 'Anita', 'Rachel', 'Tom', 'Design team', 'Engineering', 'InfoSec', 'Legal',
  // Client stakeholders
  'KPMG', 'Elena', 'Ravi', 'Sophie', 'SFI', 'David', 'Meera', 'Arjun'];

/** Client accounts PM Buddy knows about (project names are prefixed with the client). */
export const CLIENTS = ['KPMG', 'SFI'];

export const BUDDY_PROJECTS = ['Aava Commerce Platform', 'HealthSync Mobile', 'FinFlow Analytics', 'EduPath LMS', 'LogiTrack Supply Chain',
  'KPMG Audit Insights Platform', 'KPMG ESG Reporting Hub', 'SFI Member Self-Service Portal', 'SFI Claims Automation'];

/** Keyword → project, used by the mock AI to tag captures. */
export const PROJECT_KEYWORDS: Record<string, string> = {
  checkout: 'Aava Commerce Platform', commerce: 'Aava Commerce Platform', aava: 'Aava Commerce Platform', api: 'Aava Commerce Platform', bnpl: 'Aava Commerce Platform', loyalty: 'Aava Commerce Platform', prd: 'Aava Commerce Platform',
  healthsync: 'HealthSync Mobile', vitals: 'HealthSync Mobile', patient: 'HealthSync Mobile',
  finflow: 'FinFlow Analytics', billing: 'FinFlow Analytics', pricing: 'FinFlow Analytics',
  edupath: 'EduPath LMS', lms: 'EduPath LMS', school: 'EduPath LMS',
  logitrack: 'LogiTrack Supply Chain', 'supply chain': 'LogiTrack Supply Chain', shipment: 'LogiTrack Supply Chain',
  kpmg: 'KPMG Audit Insights Platform', audit: 'KPMG Audit Insights Platform', 'control testing': 'KPMG Audit Insights Platform', sox: 'KPMG Audit Insights Platform',
  esg: 'KPMG ESG Reporting Hub', csrd: 'KPMG ESG Reporting Hub', emissions: 'KPMG ESG Reporting Hub',
  sfi: 'SFI Member Self-Service Portal', member: 'SFI Member Self-Service Portal', portal: 'SFI Member Self-Service Portal', kyc: 'SFI Member Self-Service Portal',
  claims: 'SFI Claims Automation', claim: 'SFI Claims Automation'
};

export function buildSeedState(): BuddyState {
  const t = (n: number) => isoDay(n);
  const at = (n: number, h = 9) => {
    const x = new Date();
    x.setDate(x.getDate() + n);
    x.setHours(h, 0, 0, 0);
    return x.toISOString();
  };

  const meetings: BuddyMeeting[] = [
    {
      id: 'm1', title: 'Engineering sync — API performance', date: t(-2), time: '11:00', durationMin: 45,
      participants: ['Mahesh', 'Marcus', 'Anita', ME], project: 'Aava Commerce Platform',
      summary: 'Checkout API p95 latency is 1.8s against a 500ms target. Most of the time is spent in the pricing service and image resizing. Engineering will profile the hot paths; product will update the PRD with explicit performance requirements.',
      decisions: ['Set a p95 target of 500ms for the checkout API', 'Move image resizing to an async worker', 'Performance budget becomes part of the definition of done'],
      actionItems: [
        { id: 'm1a1', text: 'Share updated PRD with performance requirements with Mahesh', owner: ME, dueDate: t(-1), taskId: 'i1' },
        { id: 'm1a2', text: 'Profile checkout API and report p95 by endpoint', owner: 'Marcus', dueDate: t(1) },
        { id: 'm1a3', text: 'Estimate effort for async image worker', owner: 'Anita', dueDate: t(2) }
      ],
      questions: ['Do we need a CDN in front of the product-images API?', 'Who owns the performance dashboard after launch?']
    },
    {
      id: 'm2', title: 'Design review — checkout redesign', date: t(-4), time: '15:00', durationMin: 60,
      participants: ['Priya', 'Tom', ME], project: 'Aava Commerce Platform',
      summary: 'Reviewed three checkout concepts. The single-page variant tested best in hallway tests. Address autocomplete and saved cards are must-haves; guest checkout stays.',
      decisions: ['Go with the single-page checkout concept', 'Guest checkout remains available'],
      actionItems: [
        { id: 'm2a1', text: 'Share final checkout mockups', owner: 'Priya', dueDate: t(-1), taskId: 'i3' },
        { id: 'm2a2', text: 'Write acceptance criteria for guest checkout', owner: ME, dueDate: t(-1), taskId: 'i11', done: true }
      ],
      questions: ['Should saved cards be opt-in or opt-out?']
    },
    {
      id: 'm3', title: 'Sprint planning — HealthSync', date: t(-1), time: '10:00', durationMin: 90,
      participants: ['Anita', 'Tom', 'Rachel', ME], project: 'HealthSync Mobile',
      summary: 'Committed 34 points for Sprint 5. Vitals streaming is the sprint goal; Apple Watch support was deferred. Capacity is tight because Anita is at 50%.',
      decisions: ['Sprint goal: real-time vitals streaming', 'Defer Apple Watch support to Sprint 6'],
      actionItems: [
        { id: 'm3a1', text: 'Groom backlog for Sprint 6 candidates', owner: ME, dueDate: t(1), taskId: 'i7' },
        { id: 'm3a2', text: 'Confirm FHIR test environment access', owner: 'Tom', dueDate: t(0) }
      ],
      questions: []
    },
    {
      id: 'm4', title: 'Stakeholder update — FinFlow pricing', date: t(-7), time: '14:00', durationMin: 30,
      participants: ['Rachel', 'Mahesh', ME], project: 'FinFlow Analytics',
      summary: 'Leadership wants a usage-based tier before Q1. Finance needs a pricing tier analysis with margin scenarios.',
      decisions: ['Explore a usage-based pricing tier for Q1'],
      actionItems: [{ id: 'm4a1', text: 'Send pricing tier analysis to Rachel', owner: ME, dueDate: t(0), taskId: 'i2' }],
      questions: ['Will enterprise contracts be grandfathered on the old pricing?']
    },
    { id: 'm5', title: 'Daily standup', date: t(0), time: '09:30', durationMin: 15, participants: ['Engineering', ME], project: 'Aava Commerce Platform', summary: '', decisions: [], actionItems: [], questions: [], upcoming: true },
    { id: 'm6', title: 'Roadmap review with leadership', date: t(0), time: '14:00', durationMin: 60, participants: ['Mahesh', 'Rachel', ME], project: 'Aava Commerce Platform', summary: '', decisions: [], actionItems: [], questions: [], upcoming: true },
    { id: 'm7', title: '1:1 with Mahesh', date: t(0), time: '16:30', durationMin: 30, participants: ['Mahesh', ME], summary: '', decisions: [], actionItems: [], questions: [], upcoming: true },
    { id: 'm8', title: 'Customer call — LogiTrack', date: t(1), time: '11:00', durationMin: 45, participants: ['Tom', ME], project: 'LogiTrack Supply Chain', summary: '', decisions: [], actionItems: [], questions: [], upcoming: true },

    // ── KPMG (client) ──
    {
      id: 'mk1', title: 'KPMG requirements workshop — audit analytics', date: t(-3), time: '10:00', durationMin: 120,
      participants: ['Elena', 'Ravi', 'Marcus', ME], project: 'KPMG Audit Insights Platform',
      summary: 'Walked KPMG’s audit leads through the control-testing workflow. Their auditors spend ~40% of fieldwork time on sampling and evidence collection. They want automated full-population testing for journal entries, with an evidence trail that satisfies their quality-review team.',
      decisions: ['MVP scope: journal-entry testing + evidence vault', 'Data stays in KPMG’s Azure tenant (no shared hosting)', 'Weekly status call with Elena every week'],
      actionItems: [
        { id: 'mk1a1', text: 'Send KPMG the MVP scope document and timeline', owner: ME, dueDate: t(-1), taskId: 'ik1' },
        { id: 'mk1a2', text: 'Share anonymised GL sample extract', owner: 'Ravi', dueDate: t(-1), taskId: 'ik2' },
        { id: 'mk1a3', text: 'Draft data-residency architecture for Azure tenant', owner: 'Marcus', dueDate: t(2) },
        { id: 'mk1a4', text: 'List the 12 risk rules KPMG uses today for journal entries', owner: ME, dueDate: t(1) }
      ],
      questions: ['Which ERP exports will KPMG provide first — SAP or Oracle?', 'Does the evidence vault need KPMG’s 7-year retention policy from day one?']
    },
    {
      id: 'mk2', title: 'KPMG ESG — CSRD reporting discovery', date: t(-6), time: '15:30', durationMin: 60,
      participants: ['Sophie', 'Elena', ME], project: 'KPMG ESG Reporting Hub',
      summary: 'KPMG’s sustainability practice needs a hub to collect Scope 1–3 emissions data from client subsidiaries for CSRD disclosures. Today it runs on 200+ spreadsheets per client. Sophie wants a pilot with two audit clients next quarter.',
      decisions: ['Start with Scope 1 & 2; Scope 3 in phase two', 'Pilot with two KPMG audit clients'],
      actionItems: [
        { id: 'mk2a1', text: 'Map ESRS E1 datapoints to the data model', owner: ME, dueDate: t(3), taskId: 'ik5' },
        { id: 'mk2a2', text: 'Send list of pilot clients and contacts', owner: 'Sophie', dueDate: t(1) }
      ],
      questions: ['Is limited assurance enough for the pilot, or do they need reasonable assurance?']
    },
    { id: 'mk3', title: 'KPMG weekly status — Audit Insights', date: t(0), time: '11:30', durationMin: 30, participants: ['Elena', 'Ravi', ME], project: 'KPMG Audit Insights Platform', summary: '', decisions: [], actionItems: [], questions: [], upcoming: true },
    { id: 'mk4', title: 'KPMG ESG pilot planning', date: t(2), time: '15:00', durationMin: 45, participants: ['Sophie', ME], project: 'KPMG ESG Reporting Hub', summary: '', decisions: [], actionItems: [], questions: [], upcoming: true },

    // ── SFI (client) ──
    {
      id: 'ms1', title: 'SFI steering committee — portal phase 2', date: t(-5), time: '13:00', durationMin: 60,
      participants: ['David', 'Meera', 'Mahesh', ME], project: 'SFI Member Self-Service Portal',
      summary: 'SFI reviewed phase 1 results: 38% of member service requests now go through the self-service portal, up from 12%. Phase 2 adds digital KYC refresh and nominee updates. David flagged the regulatory deadline for KYC refresh at the end of next quarter.',
      decisions: ['Phase 2 = digital KYC refresh + nominee updates', 'Go-live before the regulatory KYC deadline', 'SFI provides UAT testers from member services'],
      actionItems: [
        { id: 'ms1a1', text: 'Share phase 2 PRD with SFI for sign-off', owner: ME, dueDate: t(0), taskId: 'is1' },
        { id: 'ms1a2', text: 'Confirm UAT tester names from member services', owner: 'Meera', dueDate: t(-2), taskId: 'is2' },
        { id: 'ms1a3', text: 'Get video-KYC vendor shortlist approved by compliance', owner: 'David', dueDate: t(4) }
      ],
      questions: ['Can members update nominees without a branch visit under current SFI policy?']
    },
    {
      id: 'ms2', title: 'SFI claims automation — process walkthrough', date: t(-2), time: '16:00', durationMin: 45,
      participants: ['Arjun', 'Anita', ME], project: 'SFI Claims Automation',
      summary: 'Arjun walked through SFI’s claims intake: 70% of claims arrive as scanned PDFs and are re-keyed manually, taking 4 days on average. Target is same-day triage using document AI with human review for anything above the auto-approve threshold.',
      decisions: ['Pilot on health claims only', 'Human review for claims above the auto-approve limit'],
      actionItems: [
        { id: 'ms2a1', text: 'Estimate OCR/document-AI accuracy on 500 sample claims', owner: 'Anita', dueDate: t(3) },
        { id: 'ms2a2', text: 'Draft claims triage user journey', owner: ME, dueDate: t(2), taskId: 'is4' }
      ],
      questions: ['What is SFI’s current auto-approve limit for health claims?']
    },
    { id: 'ms3', title: 'SFI UAT kickoff — member portal', date: t(1), time: '10:00', durationMin: 60, participants: ['David', 'Meera', ME], project: 'SFI Member Self-Service Portal', summary: '', decisions: [], actionItems: [], questions: [], upcoming: true }
  ];

  const item = (x: Partial<BuddyItem> & Pick<BuddyItem, 'id' | 'kind' | 'title'>): BuddyItem => ({
    priority: 'medium', status: 'pending', owner: ME, source: { kind: 'manual' }, createdAt: at(-5), ...x
  });

  const items: BuddyItem[] = [
    item({ id: 'i1', kind: 'commitment', direction: 'i-owe', stakeholder: 'Mahesh', title: 'Share updated PRD with performance requirements with Mahesh', priority: 'high', dueDate: t(-1), project: 'Aava Commerce Platform', source: { kind: 'meeting', refId: 'm1', label: 'Engineering sync — API performance' }, createdAt: at(-2, 12) }),
    item({ id: 'i2', kind: 'commitment', direction: 'i-owe', stakeholder: 'Rachel', title: 'Send pricing tier analysis to Rachel', priority: 'high', dueDate: t(0), project: 'FinFlow Analytics', source: { kind: 'meeting', refId: 'm4', label: 'Stakeholder update — FinFlow pricing' }, createdAt: at(-7, 15) }),
    item({ id: 'i3', kind: 'commitment', direction: 'owed-to-me', stakeholder: 'Priya', owner: 'Priya', title: 'Final checkout mockups from the design team', priority: 'high', dueDate: t(-1), project: 'Aava Commerce Platform', source: { kind: 'meeting', refId: 'm2', label: 'Design review — checkout redesign' }, createdAt: at(-4, 16) }),
    item({ id: 'i4', kind: 'commitment', direction: 'owed-to-me', stakeholder: 'InfoSec', owner: 'InfoSec', title: 'Security review sign-off for biometric checkout', priority: 'medium', dueDate: t(3), project: 'Aava Commerce Platform', createdAt: at(-6) }),
    item({ id: 'i5', kind: 'task', title: 'Review biometric checkout epic', priority: 'high', dueDate: t(0), project: 'Aava Commerce Platform', createdAt: at(-3) }),
    item({ id: 'i6', kind: 'task', title: 'Prepare Q1 roadmap deck for leadership', priority: 'medium', dueDate: t(2), project: 'Aava Commerce Platform', createdAt: at(-4) }),
    item({ id: 'i7', kind: 'task', title: 'Groom HealthSync backlog for Sprint 6', priority: 'medium', dueDate: t(1), project: 'HealthSync Mobile', source: { kind: 'meeting', refId: 'm3', label: 'Sprint planning — HealthSync' }, createdAt: at(-1, 12) }),
    item({ id: 'i8', kind: 'follow-up', stakeholder: 'Marcus', title: 'Follow up with Marcus on API rate limits', priority: 'medium', dueDate: t(0), project: 'Aava Commerce Platform', source: { kind: 'capture', label: 'Quick capture' }, createdAt: at(-2, 18) }),
    item({ id: 'i9', kind: 'follow-up', stakeholder: 'Legal', title: 'Check with Legal on BNPL compliance', priority: 'high', dueDate: t(-3), project: 'Aava Commerce Platform', createdAt: at(-9) }),
    item({ id: 'i10', kind: 'reminder', title: 'Book user interviews for loyalty research', priority: 'low', dueDate: t(4), project: 'Aava Commerce Platform', source: { kind: 'capture', label: 'Quick capture' }, createdAt: at(-1, 19) }),
    item({ id: 'i11', kind: 'task', title: 'Write acceptance criteria for guest checkout', priority: 'medium', status: 'completed', dueDate: t(-1), completedAt: at(0, 8), project: 'Aava Commerce Platform', source: { kind: 'meeting', refId: 'm2', label: 'Design review — checkout redesign' }, createdAt: at(-4, 16) }),
    item({ id: 'i12', kind: 'task', title: 'Update Jira epic descriptions for Sprint 5', priority: 'low', status: 'completed', dueDate: t(-1), completedAt: at(-1, 17), project: 'HealthSync Mobile', createdAt: at(-3) }),
    item({ id: 'i13', kind: 'task', title: 'Draft release notes for v2.3', priority: 'low', dueDate: t(6), project: 'Aava Commerce Platform', createdAt: at(-2) }),
    item({ id: 'i14', kind: 'task', title: 'Clean up stale feature flags', priority: 'low', dueDate: t(0), snoozedUntil: t(2), project: 'EduPath LMS', createdAt: at(-8) }),
    item({ id: 'i15', kind: 'commitment', direction: 'owed-to-me', stakeholder: 'Rachel', owner: 'Rachel', title: 'Q1 budget approval for loyalty program', priority: 'medium', dueDate: t(5), project: 'Aava Commerce Platform', createdAt: at(-3) }),

    // ── KPMG ──
    item({ id: 'ik1', kind: 'commitment', direction: 'i-owe', stakeholder: 'Elena', title: 'Send KPMG the MVP scope document and timeline', priority: 'high', dueDate: t(-1), project: 'KPMG Audit Insights Platform', source: { kind: 'meeting', refId: 'mk1', label: 'KPMG requirements workshop — audit analytics' }, createdAt: at(-3, 12) }),
    item({ id: 'ik2', kind: 'commitment', direction: 'owed-to-me', stakeholder: 'Ravi', owner: 'Ravi', title: 'Anonymised GL sample extract from KPMG', priority: 'high', dueDate: t(-1), project: 'KPMG Audit Insights Platform', source: { kind: 'meeting', refId: 'mk1', label: 'KPMG requirements workshop — audit analytics' }, createdAt: at(-3, 12) }),
    item({ id: 'ik3', kind: 'task', title: 'Prepare KPMG weekly status update (scope, risks, next steps)', priority: 'high', dueDate: t(0), project: 'KPMG Audit Insights Platform', createdAt: at(-1, 17) }),
    item({ id: 'ik4', kind: 'follow-up', stakeholder: 'Elena', title: 'Confirm KPMG’s Azure tenant access for the dev team', priority: 'medium', dueDate: t(1), project: 'KPMG Audit Insights Platform', source: { kind: 'capture', label: 'Quick capture' }, createdAt: at(-1, 10) }),
    item({ id: 'ik5', kind: 'task', title: 'Map ESRS E1 datapoints to the ESG hub data model', priority: 'medium', dueDate: t(3), project: 'KPMG ESG Reporting Hub', source: { kind: 'meeting', refId: 'mk2', label: 'KPMG ESG — CSRD reporting discovery' }, createdAt: at(-6, 17) }),
    item({ id: 'ik6', kind: 'commitment', direction: 'i-owe', stakeholder: 'Sophie', title: 'Share ESG pilot proposal with Sophie', priority: 'medium', dueDate: t(2), project: 'KPMG ESG Reporting Hub', createdAt: at(-4) }),
    item({ id: 'ik7', kind: 'reminder', title: 'Renew KPMG NDA before sharing the pricing model', priority: 'high', dueDate: t(0), project: 'KPMG Audit Insights Platform', createdAt: at(-2) }),
    item({ id: 'ik8', kind: 'task', title: 'Send KPMG workshop minutes', priority: 'medium', status: 'completed', dueDate: t(-2), completedAt: at(-2, 18), project: 'KPMG Audit Insights Platform', source: { kind: 'meeting', refId: 'mk1', label: 'KPMG requirements workshop — audit analytics' }, createdAt: at(-3, 12) }),

    // ── SFI ──
    item({ id: 'is1', kind: 'commitment', direction: 'i-owe', stakeholder: 'David', title: 'Share phase 2 PRD with SFI for sign-off', priority: 'high', dueDate: t(0), project: 'SFI Member Self-Service Portal', source: { kind: 'meeting', refId: 'ms1', label: 'SFI steering committee — portal phase 2' }, createdAt: at(-5, 14) }),
    item({ id: 'is2', kind: 'commitment', direction: 'owed-to-me', stakeholder: 'Meera', owner: 'Meera', title: 'UAT tester names from SFI member services', priority: 'high', dueDate: t(-2), project: 'SFI Member Self-Service Portal', source: { kind: 'meeting', refId: 'ms1', label: 'SFI steering committee — portal phase 2' }, createdAt: at(-5, 14) }),
    item({ id: 'is3', kind: 'task', title: 'Prepare UAT test scenarios for KYC refresh', priority: 'high', dueDate: t(1), project: 'SFI Member Self-Service Portal', createdAt: at(-2) }),
    item({ id: 'is4', kind: 'task', title: 'Draft SFI claims triage user journey', priority: 'medium', dueDate: t(2), project: 'SFI Claims Automation', source: { kind: 'meeting', refId: 'ms2', label: 'SFI claims automation — process walkthrough' }, createdAt: at(-2, 17) }),
    item({ id: 'is5', kind: 'follow-up', stakeholder: 'Arjun', title: 'Ask Arjun for SFI’s auto-approve limit on health claims', priority: 'medium', dueDate: t(-1), project: 'SFI Claims Automation', createdAt: at(-2, 17) }),
    item({ id: 'is6', kind: 'commitment', direction: 'owed-to-me', stakeholder: 'SFI', owner: 'SFI', title: 'Signed change request for phase 2 budget', priority: 'medium', dueDate: t(4), project: 'SFI Member Self-Service Portal', createdAt: at(-4) }),
    item({ id: 'is7', kind: 'reminder', title: 'SFI KYC regulatory deadline check-in with compliance', priority: 'medium', dueDate: t(5), project: 'SFI Member Self-Service Portal', source: { kind: 'capture', label: 'Quick capture' }, createdAt: at(-1, 19) })
  ];

  const idea = (x: Partial<BuddyIdea> & Pick<BuddyIdea, 'id' | 'kind' | 'title'>): BuddyIdea => ({
    tags: [], status: 'new', createdAt: at(-2), source: { kind: 'capture', label: 'Quick capture' }, ...x
  });

  const ideas: BuddyIdea[] = [
    idea({ id: 'd1', kind: 'idea', title: 'One-tap reorder from order history', body: 'Returning grocery shoppers re-buy 60% of their basket. A one-tap reorder could lift repeat orders.', project: 'Aava Commerce Platform', tags: ['retention', 'mobile'], createdAt: at(-1, 20) }),
    idea({ id: 'd2', kind: 'idea', title: 'AI-generated release notes from merged PRs', body: 'Draft release notes automatically from merged pull requests and linked Jira stories.', tags: ['ai', 'productivity'], createdAt: at(-3, 10) }),
    idea({ id: 'd3', kind: 'feedback', title: 'Customers are confused by the billing dashboard', body: '34% of support tickets last month were billing questions. Users can’t find invoice history.', project: 'FinFlow Analytics', tags: ['support', 'billing'], status: 'reviewed', createdAt: at(-6) }),
    idea({ id: 'd4', kind: 'note', title: 'Competitor launched BNPL at checkout', body: 'Seen on their changelog: BNPL via Klarna, available in 4 markets.', project: 'Aava Commerce Platform', tags: ['competitive'], createdAt: at(-2, 9) }),
    idea({ id: 'd5', kind: 'idea', title: 'Offline mode for rural schools', project: 'EduPath LMS', tags: ['offline'], status: 'promoted', createdAt: at(-10) }),
    idea({ id: 'd6', kind: 'feedback', title: 'Doctors want to export vitals to PDF', body: 'Raised by 3 pilot clinics — needed for patient files.', project: 'HealthSync Mobile', tags: ['export', 'clinics'], createdAt: at(-4) }),
    idea({ id: 'dk1', kind: 'idea', title: 'AI explanations for flagged journal entries', body: 'KPMG auditors asked “why was this flagged?” for every exception. A plain-language reason per rule hit would cut review time.', project: 'KPMG Audit Insights Platform', tags: ['kpmg', 'ai', 'audit'], createdAt: at(-2, 11) }),
    idea({ id: 'dk2', kind: 'feedback', title: 'KPMG reviewers need evidence export to their audit file format', body: 'Elena: evidence must drop straight into KPMG’s audit workpapers — otherwise adoption stalls.', project: 'KPMG Audit Insights Platform', tags: ['kpmg', 'evidence'], status: 'reviewed', createdAt: at(-3, 13) }),
    idea({ id: 'ds1', kind: 'feedback', title: 'SFI members drop off at document upload', body: 'Portal analytics: 41% of KYC refresh attempts abandon at the upload step on mobile.', project: 'SFI Member Self-Service Portal', tags: ['sfi', 'kyc', 'mobile'], createdAt: at(-1, 15) }),
    idea({ id: 'ds2', kind: 'note', title: 'SFI prefers phased go-live by region', body: 'David mentioned branches in the south region are ready first — consider a regional rollout.', project: 'SFI Member Self-Service Portal', tags: ['sfi', 'rollout'], createdAt: at(-5, 15) })
  ];

  const messages: BuddyMessage[] = [
    {
      id: 'welcome', role: 'buddy', createdAt: at(0, 8),
      text: 'Good to see you. Tell me anything you’re thinking, planning or need to remember — I’ll turn it into tasks, commitments and reminders. You can also ask me things like “What did I promise Mahesh?”'
    }
  ];

  return { version: BUDDY_STATE_VERSION, items, meetings, ideas, messages, snoozedInsights: {}, resolvedInsights: [] };
}

/** Example questions shown as chips for Personal Product Memory. */
export const MEMORY_EXAMPLES = [
  'What did I promise Mahesh?',
  'What did we discuss in the last engineering meeting?',
  'Which features are awaiting approval?',
  'What customer feedback did I capture?',
  'What am I waiting for from the design team?',
  'What did I promise KPMG?',
  'What is pending for SFI?'
];

/** Example captures shown as chips on Buddy Home. */
export const CAPTURE_EXAMPLES = [
  'Tomorrow discuss API performance with engineering and send updated PRD to Mahesh.',
  'Remind me to discuss API performance tomorrow.',
  'Idea: let shoppers split payments with friends at checkout',
  'Follow up with Priya on the onboarding mockups by Friday',
  'Send KPMG the audit evidence demo by Thursday',
  'Remind me to chase SFI on UAT sign-off tomorrow'
];
