import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { PscMockDataService } from '../../services/psc-mock-data.service';
import { BackgroundJob } from '../../models/psc.models';

@Component({
  selector: 'app-psc-jobs',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './jobs.component.html',
  styleUrl: './jobs.component.scss'
})
export class JobsComponent implements OnInit {
  jobs: BackgroundJob[] = [];
  expandedJob: string | null = null;

  get runningCount(): number { return this.jobs.filter(j => j.status === 'running').length; }
  get pausedCount(): number { return this.jobs.filter(j => j.status === 'paused').length; }
  get failedCount(): number { return this.jobs.filter(j => j.status === 'failed').length; }

  constructor(private mockData: PscMockDataService) {}
  ngOnInit(): void { this.mockData.getBackgroundJobs().subscribe(j => this.jobs = j); }

  pauseJob(j: BackgroundJob): void { j.status = 'paused'; j.canPause = false; }
  resumeJob(j: BackgroundJob): void { j.status = 'running'; j.canPause = true; }
  retryJob(j: BackgroundJob): void { j.status = 'running'; j.progress = 0; j.canRetry = false; j.canPause = true; }
  toggleLogs(id: string): void { this.expandedJob = this.expandedJob === id ? null : id; }
}
