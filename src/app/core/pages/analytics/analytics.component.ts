import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { PscMockDataService } from '../../services/psc-mock-data.service';
import { Project } from '../../models/psc.models';

@Component({
  selector: 'app-psc-analytics',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss'
})
export class AnalyticsComponent implements OnInit {
  projects: Project[] = [];
  period = '30d';
  weeklyTrend = [42, 58, 71, 65, 89, 94, 112];
  days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  featureBreakdown = [
    { name: 'User Stories', count: 156, color: '#7C3AED' },
    { name: 'Features', count: 89, color: '#2563EB' },
    { name: 'Epics', count: 47, color: '#059669' },
    { name: 'PRDs', count: 18, color: '#D97706' },
    { name: 'Market Research', count: 12, color: '#DC2626' },
    { name: 'Competitive Analysis', count: 9, color: '#E25292' }
  ];
  kpis = [
    { icon: 'folder-open', label: 'Projects', value: '5', trend: 25, color: 'var(--psc-primary)' },
    { icon: 'bot', label: 'AI interactions', value: '1,847', trend: 18, color: 'var(--psc-secondary)' },
    { icon: 'file-text', label: 'Artifacts', value: '239', trend: 32, color: '#059669' },
    { icon: 'timer', label: 'Hours saved', value: '340h', trend: 12, color: '#D97706' }
  ];

  /** Donut segments for "Artifacts by type" (r = 40 → circumference ≈ 251.3). */
  get donut(): { name: string; count: number; color: string; dash: string; offset: number; pct: number }[] {
    const total = this.featureBreakdown.reduce((sum, f) => sum + f.count, 0);
    const c = 2 * Math.PI * 40;
    let acc = 0;
    return this.featureBreakdown.map(f => {
      const len = (f.count / total) * c;
      const seg = { ...f, dash: `${Math.max(0, len - 2)} ${c}`, offset: -acc, pct: Math.round((f.count / total) * 100) };
      acc += len;
      return seg;
    });
  }

  get totalArtifacts(): number {
    return this.featureBreakdown.reduce((sum, f) => sum + f.count, 0);
  }

  /** stroke-dasharray for a progress ring (r = 15). */
  ring(pct: number): string {
    const c = 2 * Math.PI * 15;
    return `${(Math.max(0, Math.min(100, pct)) / 100) * c} ${c}`;
  }

  initials(name: string): string {
    return name.replace(/^Dr\.\s*/, '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  }

  get maxTrend(): number { return Math.max(...this.weeklyTrend); }
  get maxBreakdown(): number { return Math.max(...this.featureBreakdown.map(f => f.count)); }

  private colors: Record<string, string> = {
    p1: '#7C3AED', p2: '#059669', p3: '#D97706', p4: '#E25292', p5: '#2563EB'
  };

  constructor(private mockData: PscMockDataService) {}
  ngOnInit(): void { this.mockData.getProjects().subscribe(p => this.projects = p); }
  getColor(id: string): string { return this.colors[id] || '#7C3AED'; }
}
