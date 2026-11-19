import { Injectable } from '@angular/core';
import { Observable, of, delay } from 'rxjs';
import {
  Project, BackgroundJob, Agent,
  Notification, Integration, TeamMember, AnalyticsData, Decision
} from '../models/psc.models';
import { d, dt } from '../utils/date-utils';

@Injectable({ providedIn: 'root' })
export class PscMockDataService {

  readonly projects: Project[] = [
    {
      id: 'p1', name: 'Aava Commerce Platform', description: 'Next-gen AI-powered e-commerce platform with personalized recommendations and dynamic pricing engine.',
      status: 'active', owner: 'Nagarjuna Pagolu', team: ['Nagarjuna Pagolu', 'Pooja R', 'Bharath Bobbili', 'Madan Vucha'],
      createdAt: '2024-11-01', updatedAt: '2025-01-15', tags: ['e-commerce', 'AI', 'platform'],
      progress: 68, integrations: ['jira', 'github', 'confluence'], aiAgents: 5, artifacts: 42, jiraKey: 'ACP'
    },
    {
      id: 'p2', name: 'HealthSync Mobile', description: 'Patient-centric health monitoring app with real-time vitals tracking and AI-driven health insights.',
      status: 'active', owner: 'Karthik Goyal', team: ['Karthik Goyal', 'Abdul Sabir', 'Vignesh Manivannan'],
      createdAt: '2024-12-10', updatedAt: '2025-01-14', tags: ['health', 'mobile', 'IoT'],
      progress: 34, integrations: ['ado', 'figma', 'slack'], aiAgents: 3, artifacts: 28, adoProject: 'HealthSync'
    },
    {
      id: 'p3', name: 'FinFlow Analytics', description: 'Enterprise financial analytics dashboard with predictive modeling and regulatory compliance automation.',
      status: 'paused', owner: 'Preetha Venugopal', team: ['Preetha Venugopal', 'Prithwish Ghosh', 'Akshata Khare'],
      createdAt: '2024-10-05', updatedAt: '2025-01-10', tags: ['fintech', 'analytics', 'compliance'],
      progress: 82, integrations: ['jira', 'teams', 'confluence'], aiAgents: 4, artifacts: 67, jiraKey: 'FFA'
    },
    {
      id: 'p4', name: 'EduPath LMS', description: 'Adaptive learning management system with AI tutoring, progress tracking, and curriculum personalization.',
      status: 'draft', owner: 'Satish Pallapu', team: ['Satish Pallapu', 'Pooja R'],
      createdAt: '2025-01-08', updatedAt: '2025-01-13', tags: ['education', 'LMS', 'adaptive'],
      progress: 12, integrations: ['github', 'figma'], aiAgents: 2, artifacts: 8
    },
    {
      id: 'p5', name: 'LogiTrack Supply Chain', description: 'End-to-end supply chain visibility platform with predictive disruption alerts and automated reordering.',
      status: 'completed', owner: 'Pramod George', team: ['Pramod George', 'Bharath Bobbili', 'Abdul Sabir', 'Madan Vucha'],
      createdAt: '2024-08-15', updatedAt: '2024-12-30', tags: ['logistics', 'supply-chain', 'automation'],
      progress: 100, integrations: ['jira', 'ado', 'slack', 'teams'], aiAgents: 6, artifacts: 94, jiraKey: 'LTS'
    }
  ];

  readonly agents: Agent[] = [
    { id: 'a1', name: 'Aria', role: 'Market Research Analyst', avatar: '🔍', status: 'active', capabilities: ['market-research', 'competitive-analysis', 'trend-analysis'], currentTask: 'Analyzing Q1 2025 market trends', completedTasks: 147, successRate: 96 },
    { id: 'a2', name: 'Nexus', role: 'Product Strategist', avatar: '🎯', status: 'busy', capabilities: ['goal-planning', 'scope-definition', 'roadmap'], currentTask: 'Generating OKRs for HealthSync Q2', completedTasks: 203, successRate: 94 },
    { id: 'a3', name: 'Forge', role: 'Requirements Engineer', avatar: '⚙️', status: 'active', capabilities: ['prd', 'epics', 'features', 'stories'], currentTask: 'Writing user stories for payment module', completedTasks: 389, successRate: 98 },
    { id: 'a4', name: 'Muse', role: 'Ideation Facilitator', avatar: '💡', status: 'idle', capabilities: ['brainstorming', 'ideation', 'innovation'], completedTasks: 92, successRate: 91 },
    { id: 'a5', name: 'Scout', role: 'Competitive Intelligence', avatar: '🕵️', status: 'active', capabilities: ['competitive-analysis', 'benchmarking', 'SWOT'], currentTask: 'Benchmarking FinFlow vs competitors', completedTasks: 178, successRate: 95 },
    { id: 'a6', name: 'Atlas', role: 'Integration Orchestrator', avatar: '🔗', status: 'idle', capabilities: ['jira', 'ado', 'github', 'field-mapping'], completedTasks: 256, successRate: 99 }
  ];

  readonly backgroundJobs: BackgroundJob[] = [
    { id: 'j1', name: 'Market Research — Aava Commerce', type: 'market-research', status: 'running', progress: 67, startedAt: '2025-01-15T09:30:00', estimatedCompletion: '2025-01-15T10:15:00', projectId: 'p1', agentName: 'Aria', canPause: true, canRetry: false, logs: ['Fetching industry reports...', 'Analyzing competitor pricing...', 'Generating insights...'] },
    { id: 'j2', name: 'Epic Generation — HealthSync Sprint 4', type: 'epic-generation', status: 'paused', progress: 45, startedAt: '2025-01-15T08:00:00', projectId: 'p2', agentName: 'Forge', canPause: false, canRetry: false, logs: ['Loaded PRD context', 'Generated 3/7 epics', 'Paused by user'] },
    { id: 'j3', name: 'Competitive Analysis — FinFlow', type: 'competitive-analysis', status: 'completed', progress: 100, startedAt: '2025-01-14T14:00:00', estimatedCompletion: '2025-01-14T15:30:00', projectId: 'p3', agentName: 'Scout', canPause: false, canRetry: false, logs: ['Analyzed 12 competitors', 'Generated SWOT matrix', 'Report ready'] },
    { id: 'j4', name: 'Story Generation — EduPath Onboarding', type: 'story-generation', status: 'queued', progress: 0, startedAt: '2025-01-15T11:00:00', projectId: 'p4', agentName: 'Forge', canPause: false, canRetry: false, logs: ['Waiting in queue...'] },
    { id: 'j5', name: 'Jira Sync — LogiTrack', type: 'integration-sync', status: 'failed', progress: 23, startedAt: '2025-01-15T07:45:00', projectId: 'p5', agentName: 'Atlas', canPause: false, canRetry: true, logs: ['Connecting to Jira...', 'Authentication failed', 'Token expired — retry needed'] }
  ];

  readonly notifications: Notification[] = [
    { id: 'n1', type: 'ai', title: 'Market Research Complete', message: 'Aria has finished the Q1 market analysis for Aava Commerce. 47 insights generated.', timestamp: '2025-01-15T10:15:00', read: false, projectId: 'p1', actionLabel: 'View Report', actionRoute: '/psc/dashboard/market' },
    { id: 'n2', type: 'warning', title: 'Epic Generation Paused', message: 'HealthSync Sprint 4 epic generation was paused. 3 of 7 epics completed.', timestamp: '2025-01-15T09:45:00', read: false, projectId: 'p2', actionLabel: 'Resume', actionRoute: '/psc/jobs' },
    { id: 'n3', type: 'error', title: 'Jira Sync Failed', message: 'LogiTrack Jira sync failed due to expired token. Please reconnect.', timestamp: '2025-01-15T07:50:00', read: false, projectId: 'p5', actionLabel: 'Fix Integration', actionRoute: '/psc/integrations' },
    { id: 'n4', type: 'success', title: 'PRD Approved', message: 'FinFlow Analytics PRD v2.3 has been approved by Rachel Kim.', timestamp: '2025-01-14T16:30:00', read: true, projectId: 'p3' },
    { id: 'n5', type: 'info', title: 'New Team Member', message: 'Yuki Tanaka has joined the EduPath LMS project.', timestamp: '2025-01-14T14:00:00', read: true, projectId: 'p4' },
    { id: 'n6', type: 'ai', title: 'Scope Definition Ready', message: 'Nexus has completed scope definition for HealthSync Mobile v2.0.', timestamp: '2025-01-14T11:20:00', read: true, projectId: 'p2', actionLabel: 'Review', actionRoute: '/psc/dashboard/scope' }
  ];

  readonly decisions: Decision[] = [
    {
      id: 'd1', projectId: 'p1',
      title: 'Adopt Stripe as primary payment processor',
      description: 'Use Stripe for all card payments, BNPL via Stripe Afterpay integration.',
      rationale: 'Stripe offers 99.99% uptime SLA, 135+ currencies, and native BNPL. Reduces integration effort by 60% vs building in-house.',
      alternatives: ['Braintree (PayPal)', 'Adyen', 'Build in-house gateway'],
      owner: 'Sarah Chen', stakeholders: ['Marcus Rivera', 'Tom Walsh', 'CFO'],
      status: 'approved', impact: 'high',
      createdAt: d(5), resolvedAt: d(2),
      linkedArtifacts: ['Checkout Optimization PRD', 'Payment Epic'],
      evidence: ['Stripe benchmark report Q4 2024', 'Cost analysis spreadsheet', 'Security audit pass'],
      approvals: [
        { name: 'Sarah Chen', status: 'approved', at: dt(2, 0) },
        { name: 'Marcus Rivera', status: 'approved', at: dt(2, 0) },
        { name: 'CFO', status: 'approved', at: dt(2, 0) },
      ],
      tags: ['payment', 'architecture', 'vendor'],
    },
    {
      id: 'd2', projectId: 'p1',
      title: 'Defer multi-currency checkout to Phase 2',
      description: 'Multi-currency support will not be included in the Q2 launch. Scope limited to USD/EUR/GBP.',
      rationale: 'Multi-currency adds 6 weeks of engineering effort. Q2 deadline is fixed. 94% of current users are in USD/EUR/GBP markets.',
      alternatives: ['Include multi-currency in Phase 1', 'Use third-party currency conversion widget'],
      owner: 'Sarah Chen', stakeholders: ['Marcus Rivera', 'Product Board'],
      status: 'approved', impact: 'medium',
      createdAt: d(3), resolvedAt: d(1),
      linkedArtifacts: ['Checkout Optimization PRD', 'Scope Definition'],
      evidence: ['User analytics — currency distribution', 'Engineering estimate doc'],
      approvals: [
        { name: 'Sarah Chen', status: 'approved', at: dt(1, 1) },
        { name: 'Product Board', status: 'approved', at: dt(1, 0) },
      ],
      tags: ['scope', 'phase-2', 'internationalisation'],
    },
    {
      id: 'd3', projectId: 'p2',
      title: 'Use FHIR R4 as the health data standard',
      description: 'All patient data exchange will conform to HL7 FHIR R4 specification.',
      rationale: 'FDA mandates FHIR R4 for interoperability. Enables EHR integration with Epic, Cerner, and Allscripts out of the box.',
      alternatives: ['HL7 v2 (legacy)', 'Proprietary data model'],
      owner: 'Dr. James Park', stakeholders: ['Anita Sharma', 'Legal', 'FDA Compliance Officer'],
      status: 'approved', impact: 'critical',
      createdAt: d(31), resolvedAt: d(26),
      linkedArtifacts: ['HealthSync Architecture Docs', 'Vitals Monitoring Epic'],
      evidence: ['FDA 21st Century Cures Act requirement', 'FHIR R4 compliance checklist'],
      approvals: [
        { name: 'Dr. James Park', status: 'approved', at: dt(26, 0) },
        { name: 'Legal', status: 'approved', at: dt(26, 0) },
      ],
      tags: ['compliance', 'architecture', 'FDA'],
    },
    {
      id: 'd4', projectId: 'p1',
      title: 'Introduce biometric checkout for mobile',
      description: 'Enable Face ID / Touch ID for returning mobile users to skip password entry at checkout.',
      rationale: 'Reduces checkout friction by 40% on mobile. 67% of transactions are mobile. Competitor Shopify already offers this.',
      alternatives: ['SMS OTP', 'Saved password autofill only'],
      owner: 'Priya Nair', stakeholders: ['Sarah Chen', 'Marcus Rivera', 'Security Team'],
      status: 'under-review', impact: 'high',
      createdAt: d(1),
      linkedArtifacts: ['Checkout Optimization PRD'],
      evidence: ['Mobile UX research report', 'Competitor feature matrix'],
      approvals: [
        { name: 'Sarah Chen', status: 'pending' },
        { name: 'Security Team', status: 'pending' },
      ],
      tags: ['mobile', 'security', 'UX'],
    },
  ];

  readonly integrations: Integration[] = [
    { id: 'i1', name: 'Jira', type: 'jira', status: 'connected', icon: 'jira', lastSync: '2025-01-15T10:00:00', projectCount: 3, fieldMappings: [{ sourceField: 'Epic Title', targetField: 'summary' }, { sourceField: 'Description', targetField: 'description' }, { sourceField: 'Priority', targetField: 'priority' }, { sourceField: 'Story Points', targetField: 'story_points' }] },
    { id: 'i2', name: 'Azure DevOps', type: 'ado', status: 'connected', icon: 'ado', lastSync: '2025-01-15T09:30:00', projectCount: 1, fieldMappings: [{ sourceField: 'Epic Title', targetField: 'System.Title' }, { sourceField: 'Description', targetField: 'System.Description' }, { sourceField: 'Priority', targetField: 'Microsoft.VSTS.Common.Priority' }] },
    { id: 'i3', name: 'GitHub', type: 'github', status: 'connected', icon: 'github', lastSync: '2025-01-15T08:00:00', projectCount: 2, fieldMappings: [{ sourceField: 'Story Title', targetField: 'issue.title' }, { sourceField: 'Acceptance Criteria', targetField: 'issue.body' }] },
    { id: 'i4', name: 'Confluence', type: 'confluence', status: 'connected', icon: 'confluence', lastSync: '2025-01-14T18:00:00', projectCount: 2, fieldMappings: [{ sourceField: 'PRD Content', targetField: 'page.body' }, { sourceField: 'Title', targetField: 'page.title' }] },
    { id: 'i5', name: 'Figma', type: 'figma', status: 'disconnected', icon: 'figma', projectCount: 0, fieldMappings: [] },
    { id: 'i6', name: 'Slack', type: 'slack', status: 'connected', icon: 'slack', lastSync: '2025-01-15T10:10:00', projectCount: 4, fieldMappings: [] },
    { id: 'i7', name: 'Microsoft Teams', type: 'teams', status: 'error', icon: 'teams', projectCount: 1, fieldMappings: [] }
  ];

  readonly teamMembers: TeamMember[] = [
    { id: 't1', name: 'Nagarjuna Pagolu', role: 'Product Manager', avatar: 'NP', email: 'nagarjuna.pagolu@company.com', skills: ['strategy', 'roadmap', 'stakeholder-mgmt'], availability: 80, assignedStories: 12 },
    { id: 't2', name: 'Pooja R', role: 'UX Designer', avatar: 'PR', email: 'pooja.r@company.com', skills: ['UX', 'prototyping', 'user-research'], availability: 90, assignedStories: 8 },
    { id: 't3', name: 'Bharath Bobbili', role: 'Senior Engineer', avatar: 'BB', email: 'bharath.bobbili@company.com', skills: ['backend', 'API', 'microservices'], availability: 60, assignedStories: 18 },
    { id: 't4', name: 'Abdul Sabir', role: 'Full Stack Engineer', avatar: 'AS', email: 'abdul.sabir@company.com', skills: ['Angular', 'Node.js', 'AWS'], availability: 50, assignedStories: 22 },
    { id: 't5', name: 'Satish Pallapu', role: 'Tech Lead', avatar: 'SP', email: 'satish.pallapu@company.com', skills: ['architecture', 'cloud', 'DevOps'], availability: 70, assignedStories: 14 },
    { id: 't6', name: 'Karthik Goyal', role: 'Product Owner', avatar: 'KG', email: 'karthik.goyal@company.com', skills: ['product', 'discovery', 'analytics'], availability: 75, assignedStories: 9 },
    { id: 't7', name: 'Prithwish Ghosh', role: 'Data Engineer', avatar: 'PG', email: 'prithwish.ghosh@company.com', skills: ['data pipelines', 'SQL', 'ML'], availability: 65, assignedStories: 11 },
    { id: 't8', name: 'Preetha Venugopal', role: 'Business Analyst', avatar: 'PV', email: 'preetha.venugopal@company.com', skills: ['requirements', 'process', 'compliance'], availability: 85, assignedStories: 10 },
    { id: 't9', name: 'Madan Vucha', role: 'QA Engineer', avatar: 'MV', email: 'madan.vucha@company.com', skills: ['testing', 'automation', 'performance'], availability: 100, assignedStories: 15 },
    { id: 't10', name: 'Vignesh Manivannan', role: 'Frontend Engineer', avatar: 'VM', email: 'vignesh.manivannan@company.com', skills: ['Angular', 'TypeScript', 'accessibility'], availability: 55, assignedStories: 19 },
    { id: 't11', name: 'Akshata Khare', role: 'Scrum Master', avatar: 'AK', email: 'akshata.khare@company.com', skills: ['agile', 'delivery', 'facilitation'], availability: 90, assignedStories: 7 },
    { id: 't12', name: 'Pramod George', role: 'Engineering Manager', avatar: 'PG', email: 'pramod.george@company.com', skills: ['leadership', 'planning', 'hiring'], availability: 60, assignedStories: 5 }
  ];


  readonly analyticsData: AnalyticsData = {
    totalProjects: 5, activeProjects: 2, artifactsGenerated: 239, aiInteractions: 1847,
    timeSaved: 340, teamVelocity: 87,
    weeklyTrend: [42, 58, 71, 65, 89, 94, 112],
    featureBreakdown: [
      { name: 'PRD', count: 18, color: '#7C3AED' },
      { name: 'Epics', count: 47, color: '#2563EB' },
      { name: 'Features', count: 89, color: '#059669' },
      { name: 'Stories', count: 156, color: '#D97706' },
      { name: 'Market Research', count: 12, color: '#DC2626' },
      { name: 'Competitive Analysis', count: 9, color: '#7C3AED' }
    ]
  };


  /** Projects created in the New Project wizard are kept locally so they (and their chats) survive a reload. */
  private readonly createdKey = 'psc.projects.created';

  constructor() {
    try {
      const created: Project[] = JSON.parse(localStorage.getItem(this.createdKey) || '[]');
      if (Array.isArray(created)) this.projects.unshift(...created.filter(c => !this.projects.some(p => p.id === c.id)));
    } catch { /* storage unavailable */ }
  }

  /** Adds a project to the shared store (top of the list) and persists it. Returns the stored project. */
  addProject(input: Omit<Project, 'id'>): Project {
    const project: Project = { ...input, id: `p${Date.now().toString(36)}` };
    this.projects.unshift(project);
    try {
      const created: Project[] = JSON.parse(localStorage.getItem(this.createdKey) || '[]');
      localStorage.setItem(this.createdKey, JSON.stringify([project, ...(Array.isArray(created) ? created : [])]));
    } catch { /* keep in memory only */ }
    return project;
  }

  /** Synchronous lookup, for places that only need a project's name/visuals. */
  findProject(id: string | null | undefined): Project | undefined {
    return id ? this.projects.find(p => p.id === id) : undefined;
  }

  getProjects(): Observable<Project[]> { return of(this.projects).pipe(delay(300)); }
  getProject(id: string): Observable<Project | undefined> { return of(this.projects.find(p => p.id === id)).pipe(delay(200)); }
  getAgents(): Observable<Agent[]> { return of(this.agents).pipe(delay(200)); }
  getBackgroundJobs(): Observable<BackgroundJob[]> { return of(this.backgroundJobs).pipe(delay(300)); }
  getNotifications(): Observable<Notification[]> { return of(this.notifications).pipe(delay(200)); }
  getIntegrations(): Observable<Integration[]> { return of(this.integrations).pipe(delay(300)); }
  getTeamMembers(): Observable<TeamMember[]> { return of(this.teamMembers).pipe(delay(200)); }
  getAnalytics(): Observable<AnalyticsData> { return of(this.analyticsData).pipe(delay(400)); }
  getUnreadCount(): number { return this.notifications.filter(n => !n.read).length; }
}
