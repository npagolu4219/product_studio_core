import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PscMockDataService } from '../../services/psc-mock-data.service';
import { Integration } from '../../models/psc.models';

@Component({
  selector: 'app-psc-integrations',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink, LucideAngularModule],
  templateUrl: './integrations.component.html',
  styleUrl: './integrations.component.scss'
})
export class IntegrationsComponent implements OnInit {
  integrations: Integration[] = [];
  selectedIntegration: Integration | null = null;

  constructor(private mockData: PscMockDataService) {}

  ngOnInit(): void {
    this.mockData.getIntegrations().subscribe(i => this.integrations = i);
  }

  /** Brand-coloured tile + lucide glyph for each tool (replaces emoji placeholders). */
  private readonly brands: Record<string, { icon: string; color: string }> = {
    jira: { icon: 'square-kanban', color: '#2684FF' },
    ado: { icon: 'git-merge', color: '#0078D4' },
    github: { icon: 'github', color: '#24292F' },
    confluence: { icon: 'book-open', color: '#1868DB' },
    figma: { icon: 'figma', color: '#A259FF' },
    slack: { icon: 'slack', color: '#4A154B' },
    teams: { icon: 'users', color: '#5059C9' }
  };

  brand(type: string): { icon: string; color: string } {
    return this.brands[type] ?? { icon: 'plug', color: '#7C3AED' };
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = { connected: 'psc-badge-active', disconnected: 'psc-badge-draft', error: 'psc-badge-failed', pending: 'psc-badge-paused' };
    return map[status] || 'psc-badge-draft';
  }

  openFieldMapping(i: Integration): void { this.selectedIntegration = i; }
  syncNow(i: Integration): void { i.lastSync = new Date().toISOString(); }
  connect(i: Integration): void { i.status = 'connected'; i.lastSync = new Date().toISOString(); }
  reconnect(i: Integration): void { i.status = 'connected'; i.lastSync = new Date().toISOString(); }
  addMapping(): void { alert('Add field mapping (mock)'); }
}
