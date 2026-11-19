import { Injectable, signal } from '@angular/core';
import { PdlcPhaseId, ProjectLifecycle } from '../models/psc.models';
import { PDLC_ORDER, pdlcPhase } from '../constants/pdlc';

const STORAGE_KEY = 'psc.project-lifecycle.v1';

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** Seeded lifecycles for the sample projects (p1–p5), so every project shows where it is in the PDLC. */
function seed(): Record<string, ProjectLifecycle> {
  const base = (current: PdlcPhaseId, extra: Partial<ProjectLifecycle> & Pick<ProjectLifecycle, 'evaluation'>): ProjectLifecycle => ({
    phases: [...PDLC_ORDER],
    current,
    completed: PDLC_ORDER.slice(0, PDLC_ORDER.indexOf(current)),
    targets: {},
    ...extra
  });
  return {
    p1: base('build', {
      targets: { build: day(21), validate: day(35), launch: day(49), evaluate: day(110) },
      evaluation: {
        metrics: [
          { id: 'p1m1', name: 'Checkout conversion', baseline: '2.1%', target: '3.0%' },
          { id: 'p1m2', name: 'Mobile payment-step abandonment', baseline: '68%', target: '45%' },
          { id: 'p1m3', name: 'Checkout API p95', baseline: '1.8s', target: '< 800ms' }
        ],
        cadence: 'biweekly', reviewAfterDays: 60,
        criteria: 'Ship to 100% if conversion lifts ≥ 0.5 pts with no rise in payment failures; roll back below 2.0%.'
      }
    }),
    p2: base('validate', {
      targets: { validate: day(10), launch: day(24), evaluate: day(84) },
      evaluation: {
        metrics: [
          { id: 'p2m1', name: 'Daily active patients', baseline: '1.2k', target: '3k' },
          { id: 'p2m2', name: 'Vitals sync success', baseline: '94%', target: '99.5%' }
        ],
        cadence: 'weekly', reviewAfterDays: 30,
        criteria: 'Clinicians use exported vitals in ≥ 30% of follow-ups; zero PHI incidents.'
      }
    }),
    p3: base('define', {
      targets: { define: day(14), design: day(35), build: day(90) },
      evaluation: {
        metrics: [
          { id: 'p3m1', name: 'Net revenue retention', baseline: '104%', target: '112%' },
          { id: 'p3m2', name: 'Usage-tier adoption', target: '25% of accounts' }
        ],
        cadence: 'monthly', reviewAfterDays: 90,
        criteria: 'Margin stays ≥ 70% at the new tier; churn does not rise for SMB accounts.'
      }
    }),
    p4: base('discover', {
      targets: { discover: day(21), define: day(42) },
      evaluation: {
        metrics: [
          { id: 'p4m1', name: 'Lesson completion rate', baseline: '41%', target: '60%' },
          { id: 'p4m2', name: 'Teacher weekly active', target: '70%' }
        ],
        cadence: 'monthly', reviewAfterDays: 90,
        criteria: 'Learning outcomes improve in pilot schools vs control group.'
      }
    }),
    p5: base('evaluate', {
      evaluation: {
        metrics: [
          { id: 'p5m1', name: 'Disruptions flagged ahead', baseline: '0', target: '80%' },
          { id: 'p5m2', name: 'Stock-outs', baseline: '14 / month', target: '< 5 / month' },
          { id: 'p5m3', name: 'Supplier onboarding time', baseline: '12 days', target: '5 days' }
        ],
        cadence: 'monthly', reviewAfterDays: 60,
        criteria: 'Scale to all regions if stock-outs fall below 5/month for two consecutive months.'
      }
    })
  };
}

/**
 * Each project's product development lifecycle: phases in scope, the current phase, phase targets and the
 * evaluation plan (success metrics, review cadence, criteria). Set in the New Project wizard, advanced from
 * the project workspace, and fed to chats as context. Frontend only (localStorage).
 */
@Injectable({ providedIn: 'root' })
export class ProjectLifecycleService {
  private readonly state = signal<Record<string, ProjectLifecycle>>({ ...seed(), ...this.read() });

  /** Read-only view (signal) for templates and computed values. */
  readonly all = this.state.asReadonly();

  get(projectId: string | null | undefined): ProjectLifecycle | undefined {
    return projectId ? this.state()[projectId] : undefined;
  }

  set(projectId: string, lifecycle: ProjectLifecycle): void {
    const phases = PDLC_ORDER.filter(p => lifecycle.phases.includes(p) || p === 'evaluate');
    const current = phases.includes(lifecycle.current) ? lifecycle.current : phases[0];
    this.patch(projectId, { ...lifecycle, phases, current });
  }

  /** Sign off the current phase (its exit gate is met) and move to the next one in scope. */
  advance(projectId: string): PdlcPhaseId | null {
    const lc = this.get(projectId);
    if (!lc) return null;
    const i = lc.phases.indexOf(lc.current);
    const next = lc.phases[i + 1];
    if (!next) return null;
    this.patch(projectId, { ...lc, current: next, completed: [...new Set([...lc.completed, lc.current])] });
    return next;
  }

  /** Jump to a phase (e.g. going back to Define after evaluation says "iterate"). */
  setCurrent(projectId: string, phase: PdlcPhaseId): void {
    const lc = this.get(projectId);
    if (!lc || !lc.phases.includes(phase)) return;
    const idx = lc.phases.indexOf(phase);
    this.patch(projectId, { ...lc, current: phase, completed: lc.phases.slice(0, idx) });
  }

  /** "Define · 2 of 7" */
  progressLabel(lc: ProjectLifecycle): string {
    return `${pdlcPhase(lc.current).label} · ${lc.phases.indexOf(lc.current) + 1} of ${lc.phases.length}`;
  }

  /** One line the AI sees: phase, gate and how the work will be evaluated. */
  summary(lc: ProjectLifecycle): string {
    const phase = pdlcPhase(lc.current);
    const metrics = lc.evaluation.metrics.map(m => `${m.name} ${m.baseline ? m.baseline + ' → ' : '→ '}${m.target}`).join('; ');
    return `${phase.label} phase (exit gate: ${phase.gate})${metrics ? ` · evaluated on ${metrics}` : ''}`;
  }

  private patch(projectId: string, lifecycle: ProjectLifecycle): void {
    this.state.update(s => ({ ...s, [projectId]: lifecycle }));
    try {
      const stored = this.read();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...stored, [projectId]: lifecycle }));
    } catch { /* keep in memory only */ }
  }

  private read(): Record<string, ProjectLifecycle> {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  }
}
