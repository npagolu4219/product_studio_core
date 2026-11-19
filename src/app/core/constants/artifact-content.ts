// Mock artifact bodies used by the conversation service until the real generation API is wired in.
// Ported from projects/product-studio/.../conversation-panel (RESPONSES), keyed by Artifact['type'].
import { Artifact } from '../models/psc.models';

const RULE = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

const section = (title: string, lines: string[]): string => `${RULE}\n${title}\n${RULE}\n${lines.join('\n')}`;

const TEMPLATES: Partial<Record<Artifact['type'], string>> = {
  'market-research': `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 MARKET OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The global AI-powered product management market is valued at $4.2B in 2024, growing at a CAGR of 34.7% through 2029. Enterprise adoption is accelerating as teams seek to reduce time-to-market and improve artifact quality.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 TAM / SAM / SOM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Total Addressable Market (TAM)   →  $18.4B
  Serviceable Addressable Market   →  $4.2B
  Serviceable Obtainable Market    →  $380M (Year 3 target)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏆 TOP COMPETITORS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. Aha!          — Roadmapping focus, weak AI layer, $59/user/mo
  2. ProductBoard  — Strong discovery, limited generation, $49/user/mo
  3. Jira Product  — Deep integration, no AI authoring, $15/user/mo
  4. Linear        — Dev-centric, minimal PM features, $8/user/mo

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔑 KEY TRENDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  → AI-native artifact generation becoming table stakes by Q3 2025
  → Jira/ADO sync is the #1 requested integration (78% of surveyed PMs)
  → Teams using AI tools ship 2.3× faster on average
  → Compliance & audit trails emerging as enterprise blocker

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ OPPORTUNITY SCORE: 87 / 100
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,

  'prd': `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 EXECUTIVE SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This document defines the product requirements for the AI-powered conversational workspace feature. The goal is to reduce artifact creation time by 70% while maintaining enterprise-grade quality and traceability.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 PROBLEM STATEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Product managers spend 60% of their time writing documentation rather than doing strategic work. Existing tools require manual input for every artifact with no AI assistance or cross-artifact consistency.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👤 USER PERSONAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Primary   → Senior Product Manager (5–10 yrs exp, enterprise)
  Secondary → Product Owner (Jira/ADO power user)
  Tertiary  → Engineering Lead (consumes PRDs, writes stories)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ FUNCTIONAL REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  FR-01  Conversational prompt interface for artifact generation
  FR-02  Real-time streaming output to canvas
  FR-03  One-click Jira/ADO sync with field mapping
  FR-04  Version history with diff view
  FR-05  Role-based access control per artifact
  FR-06  Export to Markdown, PDF, Word

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 NON-FUNCTIONAL REQUIREMENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  NFR-01  Generation latency < 3s for first token
  NFR-02  99.9% uptime SLA
  NFR-03  SOC 2 Type II compliant data handling
  NFR-04  WCAG 2.1 AA accessibility

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 SUCCESS METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  → Time-to-first-artifact < 5 minutes
  → Artifact approval rate > 85% without manual edits
  → Weekly active usage > 4 sessions per PM
  → NPS > 45 within 90 days of launch`,

  'epic': `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗂 EPIC BREAKDOWN  (4 epics · 23 stories · ~68 pts)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EPIC-01 · Conversational Interface  [13 pts]
  Story 1.1  Prompt input with streaming response         3 pts
  Story 1.2  Suggestion chips and quick-action tabs       2 pts
  Story 1.3  Message history with timestamps              2 pts
  Story 1.4  Clear / reset conversation                   1 pt
  Story 1.5  Keyboard shortcuts (Enter, Shift+Enter)      1 pt
  Story 1.6  Accessibility — screen reader support        4 pts

EPIC-02 · Canvas & Artifact Rendering  [21 pts]
  Story 2.1  Real-time streaming content to canvas        5 pts
  Story 2.2  Artifact type detection & icon mapping       3 pts
  Story 2.3  Version badge and status indicator           2 pts
  Story 2.4  Edit mode with inline changes                8 pts
  Story 2.5  History diff view                            3 pts

EPIC-03 · Integrations  [18 pts]
  Story 3.1  Jira field mapping configuration             5 pts
  Story 3.2  One-click push to Jira                       5 pts
  Story 3.3  ADO sync with work item hierarchy            5 pts
  Story 3.4  Sync status in activity watch panel          3 pts

EPIC-04 · Export & Sharing  [8 pts]
  Story 4.1  Export to Markdown                           2 pts
  Story 4.2  Export to PDF                                3 pts
  Story 4.3  Shareable link generation                    3 pts

All epics are ready for Jira sync. Use Sync in the toolbar to push them now.`,

  'competitive-analysis': `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚔ COMPETITOR MATRIX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                    Aha!   ProdBoard  Linear   US
  AI Generation      ✗        ✗        ✗      ✓✓
  Jira Sync          ✓        ✓        ✓      ✓✓
  PRD Authoring      ✓        ✓        ✗      ✓✓
  Epic Generation    ✗        ✗        ✗      ✓✓
  Market Research    ✗        ✓        ✗      ✓✓
  Roadmapping        ✓✓       ✓        ✗      ✓
  Pricing/user/mo   $59      $49      $8     TBD

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 SWOT ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Strengths    → Only AI-native end-to-end PM platform
               → Conversational UX reduces learning curve
               → Deep Jira/ADO integration

  Weaknesses   → New entrant, limited brand recognition
               → No mobile app yet

  Opportunities → 78% of PMs want AI-assisted writing
                → Enterprise compliance gap in market

  Threats      → Atlassian Intelligence expanding rapidly
               → OpenAI could enter PM tooling space

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 STRATEGIC RECOMMENDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Double down on AI-native generation as the primary differentiator. No competitor offers end-to-end conversational artifact creation. Target mid-market teams (50–500 PMs) where Aha! and ProductBoard are over-priced and under-powered on AI.`,

  'roadmap': `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗺 PRODUCT ROADMAP  (Q3 2025 – Q2 2026)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Q3 2025 — Foundation
  ▸ Conversational workspace MVP
  ▸ PRD & Epic generation
  ▸ Jira sync v1
  ▸ Beta launch (50 design partners)

Q4 2025 — Growth
  ▸ Market research agent
  ▸ Competitive analysis
  ▸ ADO integration
  ▸ Export (PDF, Markdown)
  ▸ GA launch

Q1 2026 — Scale
  ▸ Persona & roadmap generation
  ▸ Version history & diff view
  ▸ Team collaboration features
  ▸ SSO & enterprise security

Q2 2026 — Intelligence
  ▸ Cross-artifact consistency engine
  ▸ Change impact analysis
  ▸ Analytics & adoption dashboard
  ▸ Mobile companion app`,

  'scope': `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 EXTRACTED REQUIREMENTS  (14 total)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  REQ-01  [MUST]   Real-time streaming response in conversation panel
  REQ-02  [MUST]   Artifact persisted across navigation
  REQ-03  [MUST]   Jira/ADO sync with field mapping
  REQ-04  [SHOULD] Version history with diff view
  REQ-05  [SHOULD] Export to PDF and Markdown
  REQ-06  [COULD]  AI-suggested follow-up actions
  REQ-07  [MUST]   Role-based access control
  REQ-08  [MUST]   WCAG 2.1 AA accessibility compliance

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠ IDENTIFIED RISKS  (3 high, 2 medium)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🔴 HIGH   AI hallucination in requirements — Mitigation: human review gate
  🔴 HIGH   Jira API rate limits at scale — Mitigation: queue + retry logic
  🔴 HIGH   Data residency for EU customers — Mitigation: region-aware storage
  🟡 MED    Streaming latency on slow connections — Mitigation: progressive render
  🟡 MED    Browser compatibility for drag-resize — Mitigation: fallback fixed width`,

};
const GENERIC_SECTIONS: Partial<Record<Artifact['type'], [string, string[]][]>> = {
  feature: [
    ['⚡ FEATURE SUMMARY', ['  Goal       → Remove friction from the primary user journey', '  Owner      → Product + Engineering pod', '  Release    → Next sprint, behind a feature flag']],
    ['🧩 CAPABILITIES', ['  F-01  Core interaction and empty/error states', '  F-02  Telemetry for adoption and drop-off', '  F-03  Admin configuration and permissions']],
    ['📏 SUCCESS METRICS', ['  → 30% adoption within 30 days of launch', '  → Task completion time reduced by 40%']]
  ],
  story: [
    ['✨ USER STORIES', [
      '  US-01  As a product manager, I want to describe an idea in plain language so that a draft artifact is created for me.',
      '  US-02  As a reviewer, I want to compare versions so that I can see what changed before approving.',
      '  US-03  As an engineer, I want stories pushed to Jira so that I can plan the sprint without copy-paste.'
    ]],
    ['📐 ESTIMATES', ['  US-01  5 pts   ·  US-02  3 pts   ·  US-03  5 pts', '  Total: 13 pts (fits one sprint at current velocity)']]
  ],
  'acceptance-criteria': [
    ['☑ ACCEPTANCE CRITERIA', [
      '  AC-01  Given a valid prompt, when the user submits, then a draft is created within 3 seconds.',
      '  AC-02  Given an existing draft, when the user saves an edit, then a new version is recorded.',
      '  AC-03  Given a published artifact, when it is opened, then it is read-only for viewers.',
      '  AC-04  Given a network error, when generation fails, then the user can retry without losing input.'
    ]],
    ['🧪 TEST NOTES', ['  → Cover keyboard-only flow and screen-reader announcements', '  → Verify behaviour with empty and very long prompts']]
  ],
  goal: [
    ['🎯 OBJECTIVE', ['  Become the default workspace for product artifacts across the organisation.']],
    ['📈 KEY RESULTS', ['  KR1  70% of new PRDs started in Product Studio by end of quarter', '  KR2  Reduce PRD-to-sprint lead time from 10 days to 4', '  KR3  Weekly active PMs ≥ 120 with 60% 4-week retention']],
    ['🧭 STRATEGIC BETS', ['  → AI-first authoring with human review gates', '  → Deep Jira / ADO sync as the adoption wedge']]
  ],
  brainstorm: [
    ['💡 IDEAS', ['  1. Guided prompt templates per artifact type', '  2. “Explain this decision” links back to source evidence', '  3. Auto-generated release notes from merged stories', '  4. Stakeholder digest emailed every Friday', '  5. Risk radar that flags stale or blocked epics']],
    ['🗳 QUICK VOTE', ['  Highest impact / lowest effort → ideas 1 and 4']]
  ],
  ideation: [
    ['🚀 CONCEPTS', ['  Concept A  Conversational canvas — chat drives a live document', '  Concept B  Evidence board — every claim linked to research', '  Concept C  Delivery autopilot — artifacts sync and update themselves']],
    ['⚖ EVALUATION', ['  Desirability  A ●●●  B ●●○  C ●●●', '  Feasibility   A ●●●  B ●●○  C ●○○', '  Viability     A ●●○  B ●●○  C ●●●']],
    ['➡ NEXT STEP', ['  Prototype Concept A and test with 5 PMs next week.']]
  ]
};

/** Builds the body of a generated artifact. `prompt` is the user's request that produced it. */
/**
 * @param context Product Memory items the chat is grounded in ("Decision — Adopt Stripe …"); listed in a final
 *                section so readers can trace where the draft's assumptions came from.
 */
export function buildArtifactContent(type: Artifact['type'], title: string, prompt: string, context: string[] = []): string {
  const header = `${title}\nRequest: “${prompt}”\n`;
  const sources = context.length ? `\n\n${section('📚 GROUNDED IN CONTEXT', context.map(c => `  • ${c}`))}` : '';
  const template = TEMPLATES[type];
  if (template) return `${header}\n${template}${sources}`;
  const sections = GENERIC_SECTIONS[type] ?? [['📄 DRAFT', ['  This draft is ready for your input.']]];
  return `${header}\n${sections.map(([heading, lines]) => section(heading, lines)).join('\n\n')}${sources}`;
}
