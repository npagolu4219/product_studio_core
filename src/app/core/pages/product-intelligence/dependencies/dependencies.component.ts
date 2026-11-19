import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { d, dFuture } from '../../../utils/date-utils';

interface Dependency {
  id: string;
  fromTeam: string;
  fromItem: string;
  toTeam: string;
  toItem: string;
  project: string;
  projectColor: string;
  status: 'on-track' | 'at-risk' | 'blocked' | 'resolved';
  dueDate: string;
  owner: string;
  ownerInitials: string;
  description: string;
  type: 'blocks' | 'depends-on' | 'related-to';
}

interface Commitment {
  id: string;
  title: string;
  owner: string;
  ownerInitials: string;
  team: string;
  project: string;
  projectColor: string;
  dueDate: string;
  status: 'on-track' | 'at-risk' | 'overdue' | 'completed';
  progress: number;
  linkedItems: string[];
}

@Component({
  selector: 'app-psc-dependencies',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './dependencies.component.html',
  styleUrl: './dependencies.component.scss',
})
export class DependenciesComponent implements OnInit {
  activeTab: 'dependencies' | 'commitments' | 'blockers' = 'dependencies';
  filterStatus = '';
  filterProject = '';

  readonly dependencies: Dependency[] = [
    { id: 'd1', fromTeam: 'Checkout Team', fromItem: 'Payment Integration Epic', toTeam: 'Platform Team', toItem: 'Stripe API credentials & sandbox', project: 'Aava Commerce', projectColor: '#7C3AED', status: 'resolved', dueDate: d(5), owner: 'Marcus Rivera', ownerInitials: 'MR', description: 'Checkout team needs Stripe sandbox keys and webhook endpoint from Platform team before payment integration can begin.', type: 'depends-on' },
    { id: 'd2', fromTeam: 'Mobile Team', fromItem: 'Biometric Checkout Feature', toTeam: 'Security Team', toItem: 'Security review & approval', project: 'Aava Commerce', projectColor: '#7C3AED', status: 'blocked', dueDate: dFuture(5), owner: 'Priya Nair', ownerInitials: 'PN', description: 'Biometric checkout cannot proceed to development until Security team completes threat model review.', type: 'blocks' },
    { id: 'd3', fromTeam: 'HealthSync Mobile', fromItem: 'Vitals Streaming Feature', toTeam: 'DevOps', toItem: 'WebSocket infrastructure provisioning', project: 'HealthSync Mobile', projectColor: '#0891B2', status: 'on-track', dueDate: dFuture(3), owner: 'Leo Zhang', ownerInitials: 'LZ', description: 'WebSocket server needs to be provisioned in AWS before vitals streaming can be tested end-to-end.', type: 'depends-on' },
    { id: 'd4', fromTeam: 'HealthSync Mobile', fromItem: 'Patient Consent Flow', toTeam: 'Legal', toItem: 'HIPAA consent language approval', project: 'HealthSync Mobile', projectColor: '#0891B2', status: 'resolved', dueDate: d(6), owner: 'Dr. James Park', ownerInitials: 'JP', description: 'Legal must approve the exact consent language before the patient onboarding flow can be finalized.', type: 'depends-on' },
    { id: 'd5', fromTeam: 'FinFlow Analytics', fromItem: 'Billing Dashboard Redesign', toTeam: 'Data Team', toItem: 'Invoice data API v2', project: 'FinFlow Analytics', projectColor: '#059669', status: 'at-risk', dueDate: dFuture(7), owner: 'Rachel Kim', ownerInitials: 'RK', description: 'New billing dashboard requires invoice data API v2 which Data team is still building. Risk of delay.', type: 'depends-on' },
    { id: 'd6', fromTeam: 'EduPath LMS', fromItem: 'Offline Mode Feature', toTeam: 'Infrastructure', toItem: 'Service Worker CDN configuration', project: 'EduPath LMS', projectColor: '#D97706', status: 'on-track', dueDate: dFuture(10), owner: 'Carlos Mendez', ownerInitials: 'CM', description: 'Offline mode requires CDN to be configured for service worker caching. Infrastructure team has committed to Jan 25.', type: 'depends-on' },
  ];

  readonly commitments: Commitment[] = [
    { id: 'c1', title: 'Deliver checkout optimization MVP by Q2 launch', owner: 'Sarah Chen', ownerInitials: 'SC', team: 'Product', project: 'Aava Commerce', projectColor: '#7C3AED', dueDate: dFuture(75), status: 'on-track', progress: 68, linkedItems: ['Checkout Optimization Epic', 'Payment Integration Epic', 'Guest Checkout Feature'] },
    { id: 'c2', title: 'Complete FHIR R4 compliance before beta release', owner: 'Dr. James Park', ownerInitials: 'JP', team: 'HealthSync', project: 'HealthSync Mobile', projectColor: '#0891B2', dueDate: dFuture(31), status: 'on-track', progress: 82, linkedItems: ['FHIR R4 Architecture', 'Patient Consent Flow', 'Data Encryption Epic'] },
    { id: 'c3', title: 'Fix NPS billing confusion by end of January', owner: 'Rachel Kim', ownerInitials: 'RK', team: 'FinFlow', project: 'FinFlow Analytics', projectColor: '#059669', dueDate: dFuture(16), status: 'at-risk', progress: 35, linkedItems: ['Billing Dashboard Redesign', 'Invoice Data API v2'] },
    { id: 'c4', title: 'Ship Apple Watch support in Sprint 4', owner: 'Anita Sharma', ownerInitials: 'AS', team: 'Mobile', project: 'HealthSync Mobile', projectColor: '#0891B2', dueDate: dFuture(9), status: 'on-track', progress: 55, linkedItems: ['Device Pairing Wizard', 'WatchOS Pairing Story'] },
    { id: 'c5', title: 'EduPath offline mode for rural schools by Feb', owner: 'Carlos Mendez', ownerInitials: 'CM', team: 'EduPath', project: 'EduPath LMS', projectColor: '#D97706', dueDate: dFuture(44), status: 'on-track', progress: 20, linkedItems: ['Offline Mode Feature', 'Service Worker CDN'] },
    { id: 'c6', title: 'Resolve Jira sync token expiry for LogiTrack', owner: 'Fatima Al-Hassan', ownerInitials: 'FA', team: 'Platform', project: 'LogiTrack Supply Chain', projectColor: '#DC2626', dueDate: d(0), status: 'overdue', progress: 0, linkedItems: ['Jira Integration', 'Atlas Agent Sync Job'] },
  ];

  ngOnInit(): void {}

  get blockers(): Dependency[] { return this.dependencies.filter(d => d.status === 'blocked'); }
  get atRisk(): Dependency[] { return this.dependencies.filter(d => d.status === 'at-risk'); }
  get onTrackCommitmentsCount(): number { return this.commitments.filter(c => c.status === 'on-track').length; }

  get filteredDeps(): Dependency[] {
    return this.dependencies.filter(d =>
      (!this.filterStatus || d.status === this.filterStatus) &&
      (!this.filterProject || d.project === this.filterProject)
    );
  }

  get filteredCommitments(): Commitment[] {
    return this.commitments.filter(c =>
      (!this.filterStatus || c.status === this.filterStatus) &&
      (!this.filterProject || c.project === this.filterProject)
    );
  }

  get projects(): string[] { return [...new Set([...this.dependencies.map(d => d.project), ...this.commitments.map(c => c.project)])]; }

  statusColor(s: string): string {
    const m: Record<string, string> = { 'on-track': '#059669', 'at-risk': '#B45309', blocked: '#DC2626', resolved: '#6B7280', completed: '#059669', overdue: '#DC2626' };
    return m[s] ?? '#6B7280';
  }

  statusIcon(s: string): string {
    const m: Record<string, string> = { 'on-track': 'check-circle', 'at-risk': 'alert-triangle', blocked: 'x-circle', resolved: 'check-circle-2', completed: 'check-circle-2', overdue: 'clock' };
    return m[s] ?? 'circle';
  }

  progressColor(s: string): string {
    const m: Record<string, string> = { 'on-track': '#059669', 'at-risk': '#B45309', overdue: '#DC2626', completed: '#059669' };
    return m[s] ?? '#7C3AED';
  }

  daysUntil(d: string): string {
    const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
    if (diff < 0) return `${Math.abs(diff)}d overdue`;
    if (diff === 0) return 'Due today';
    return `${diff}d left`;
  }
}
