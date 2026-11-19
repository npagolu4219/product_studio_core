import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { PscMockDataService } from '../../../services/psc-mock-data.service';
import { Integration } from '../../../models/psc.models';
import { dt } from '../../../utils/date-utils';

interface ConnectToolForm {
  name: string;
  type: 'jira' | 'ado' | 'github' | 'confluence' | 'figma' | 'slack' | 'teams' | '';
  url: string;
  token: string;
}

interface SyncEvent {
  id: string;
  tool: string;
  toolColor: string;
  project: string;
  action: string;
  status: 'success' | 'failed' | 'pending';
  timestamp: string;
  items: number;
}

interface FieldMapping {
  id: string;
  tool: string;
  toolColor: string;
  sourceField: string;
  targetField: string;
  transform?: string;
  status: 'active' | 'conflict' | 'unmapped';
}

@Component({
  selector: 'app-psc-tool-sync',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './tool-sync.component.html',
  styleUrl: './tool-sync.component.scss',
})
export class ToolSyncComponent implements OnInit {
  integrations: Integration[] = [];
  activeTab: 'overview' | 'mappings' | 'history' = 'overview';
  syncingId: string | null = null;

  readonly syncHistory: SyncEvent[] = [
    { id: 'sh1', tool: 'Jira', toolColor: '#2563EB', project: 'Aava Commerce', action: 'Pushed 12 epics + 34 stories', status: 'success', timestamp: dt(0, 1), items: 46 },
    { id: 'sh2', tool: 'Azure DevOps', toolColor: '#0078D4', project: 'HealthSync Mobile', action: 'Synced 8 work items', status: 'success', timestamp: dt(0, 1), items: 8 },
    { id: 'sh3', tool: 'Jira', toolColor: '#2563EB', project: 'LogiTrack Supply Chain', action: 'Token expired — sync failed', status: 'failed', timestamp: dt(0, 3), items: 0 },
    { id: 'sh4', tool: 'Confluence', toolColor: '#172B4D', project: 'Aava Commerce', action: 'Published PRD v2.1 to Confluence', status: 'success', timestamp: dt(1, 0), items: 1 },
    { id: 'sh5', tool: 'GitHub', toolColor: '#24292F', project: 'EduPath LMS', action: 'Created 5 GitHub issues from stories', status: 'success', timestamp: dt(1, 1), items: 5 },
    { id: 'sh6', tool: 'Azure DevOps', toolColor: '#0078D4', project: 'HealthSync Mobile', action: 'Field mapping conflict on Priority', status: 'failed', timestamp: dt(1, 3), items: 0 },
  ];

  readonly fieldMappings: FieldMapping[] = [
    { id: 'fm1', tool: 'Jira', toolColor: '#2563EB', sourceField: 'Epic Title', targetField: 'summary', status: 'active' },
    { id: 'fm2', tool: 'Jira', toolColor: '#2563EB', sourceField: 'Description', targetField: 'description', status: 'active' },
    { id: 'fm3', tool: 'Jira', toolColor: '#2563EB', sourceField: 'Priority', targetField: 'priority', transform: 'Critical→Highest, High→High', status: 'active' },
    { id: 'fm4', tool: 'Jira', toolColor: '#2563EB', sourceField: 'Story Points', targetField: 'story_points', status: 'active' },
    { id: 'fm5', tool: 'Jira', toolColor: '#2563EB', sourceField: 'Acceptance Criteria', targetField: 'custom_field_10001', status: 'conflict' },
    { id: 'fm6', tool: 'Azure DevOps', toolColor: '#0078D4', sourceField: 'Epic Title', targetField: 'System.Title', status: 'active' },
    { id: 'fm7', tool: 'Azure DevOps', toolColor: '#0078D4', sourceField: 'Description', targetField: 'System.Description', status: 'active' },
    { id: 'fm8', tool: 'Azure DevOps', toolColor: '#0078D4', sourceField: 'Priority', targetField: 'Microsoft.VSTS.Common.Priority', transform: 'Critical→1, High→2', status: 'conflict' },
    { id: 'fm9', tool: 'GitHub', toolColor: '#24292F', sourceField: 'Story Title', targetField: 'issue.title', status: 'active' },
    { id: 'fm10', tool: 'GitHub', toolColor: '#24292F', sourceField: 'Acceptance Criteria', targetField: 'issue.body', status: 'active' },
    { id: 'fm11', tool: 'Confluence', toolColor: '#172B4D', sourceField: 'PRD Content', targetField: 'page.body', status: 'active' },
    { id: 'fm12', tool: 'Jira', toolColor: '#2563EB', sourceField: 'Sprint', targetField: 'sprint', status: 'unmapped' },
  ];

  filterTool = '';

  showConnectModal = false;
  connecting = false;
  connectForm: ConnectToolForm = { name: '', type: '', url: '', token: '' };

  readonly toolTypes: { value: ConnectToolForm['type']; label: string }[] = [
    { value: 'jira', label: 'Jira' },
    { value: 'ado', label: 'Azure DevOps' },
    { value: 'github', label: 'GitHub' },
    { value: 'confluence', label: 'Confluence' },
    { value: 'figma', label: 'Figma' },
    { value: 'slack', label: 'Slack' },
    { value: 'teams', label: 'Microsoft Teams' },
  ];

  constructor(private mockData: PscMockDataService, private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.integrations = this.mockData.integrations;
  }

  get connectedCount(): number { return this.integrations.filter(i => i.status === 'connected').length; }
  get errorCount(): number { return this.integrations.filter(i => i.status === 'error').length; }
  get conflictCount(): number { return this.fieldMappings.filter(m => m.status === 'conflict').length; }
  get successfulSyncsToday(): number { return this.syncHistory.filter(s => s.status === 'success').length; }

  get filteredMappings(): FieldMapping[] {
    return this.filterTool ? this.fieldMappings.filter(m => m.tool === this.filterTool) : this.fieldMappings;
  }

  get mappingTools(): string[] { return [...new Set(this.fieldMappings.map(m => m.tool))]; }

  openConnectModal(): void {
    this.connectForm = { name: '', type: '', url: '', token: '' };
    this.showConnectModal = true;
  }

  closeConnectModal(): void { this.showConnectModal = false; }

  get connectFormValid(): boolean {
    return !!this.connectForm.name.trim() && !!this.connectForm.type && !!this.connectForm.url.trim() && !!this.connectForm.token.trim();
  }

  saveConnect(): void {
    if (!this.connectFormValid || this.connecting) return;
    this.connecting = true;
    setTimeout(() => {
      const toolLabel = this.toolTypes.find(t => t.value === this.connectForm.type)?.label ?? this.connectForm.name;
      const newIntegration: Integration = {
        id: 'int-' + Date.now(),
        name: toolLabel,
        type: this.connectForm.type as Integration['type'],
        status: 'connected',
        icon: this.connectForm.type,
        lastSync: new Date().toISOString(),
        projectCount: 0,
        fieldMappings: [],
      };
      this.integrations = [...this.integrations, newIntegration];
      this.connecting = false;
      this.showConnectModal = false;
      this.cdr.detectChanges();
    }, 1500);
  }

  triggerSync(id: string): void {
    this.syncingId = id;
    setTimeout(() => {
      const i = this.integrations.find(x => x.id === id);
      if (i) { i.lastSync = new Date().toISOString(); i.status = 'connected'; }
      this.syncingId = null;
      this.cdr.detectChanges();
    }, 1800);
  }

  statusIcon(s: string): string {
    const m: Record<string, string> = { connected: 'check-circle', disconnected: 'circle', error: 'x-circle', pending: 'clock' };
    return m[s] ?? 'circle';
  }

  toolIcon(type: string): string {
    const m: Record<string, string> = { jira: 'trello', ado: 'git-merge', github: 'github', confluence: 'book-open', figma: 'figma', slack: 'message-square', teams: 'users' };
    return m[type] ?? 'link';
  }

  toolColor(name: string): string {
    const m: Record<string, string> = { Jira: '#2563EB', 'Azure DevOps': '#0078D4', GitHub: '#24292F', Confluence: '#172B4D', Figma: '#F24E1E', Slack: '#4A154B', 'Microsoft Teams': '#6264A7' };
    return m[name] ?? '#7C3AED';
  }

  timeAgo(ts: string): string {
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff}m ago`;
    const h = Math.floor(diff / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }
}
