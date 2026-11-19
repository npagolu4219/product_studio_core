import { Component, HostListener, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PmBuddyService } from './services/pm-buddy.service';
import { PmBuddyAlertsService } from './services/pm-buddy-alerts.service';
import { BuddyComposerComponent } from './components/buddy-composer.component';
import { BuddyConversationComponent } from './components/buddy-conversation.component';

/** PM Buddy workspace: header, section tabs, persistent Quick Capture, toasts. */
@Component({
  selector: 'app-pm-buddy-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule, BuddyComposerComponent, BuddyConversationComponent],
  template: `
    <header class="pb-head">
      <div class="pb-brand">
        <span class="pb-logo" aria-hidden="true"><lucide-icon name="bot" [size]="18"></lucide-icon></span>
        <div>
          <div class="pb-name">PM Buddy <span class="pb-poc">POC</span></div>
          <div class="pb-tag">Your personal AI product manager · {{ todayLabel }}</div>
        </div>
      </div>
      <div class="pb-head-actions">
        <button type="button" class="pmb-btn pmb-btn--sm pb-alerts" [class.on]="alertsOn()" (click)="alerts.toggle()"
          [attr.aria-pressed]="alertsOn()" [title]="alertsTitle()">
          <lucide-icon [name]="alertsOn() ? 'bell-ring' : 'bell-off'" [size]="13"></lucide-icon><span>{{ alertsOn() ? 'Alerts on' : 'Desktop alerts' }}</span>
        </button>
        <button type="button" class="pmb-btn pmb-btn--ghost pmb-btn--sm pb-reset" (click)="buddy.resetDemo()" title="Restore the original demo data">
          <lucide-icon name="rotate-ccw" [size]="13"></lucide-icon><span>Reset demo</span>
        </button>
        <a class="pb-bell" routerLink="missing" [attr.aria-label]="insightCount() + ' things need your attention'" title="What am I missing?">
          <lucide-icon name="bell" [size]="18"></lucide-icon>
          <span class="pb-bell-n" *ngIf="insightCount()">{{ insightCount() }}</span>
        </a>
      </div>
    </header>

    <nav class="pb-tabs" aria-label="PM Buddy">
      <a class="pb-tab" *ngFor="let t of tabs()" [routerLink]="t.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: t.path === '.' }" ariaCurrentWhenActive="page">
        <lucide-icon [name]="t.icon" [size]="15"></lucide-icon>
        <span>{{ t.label }}</span>
        <span class="pb-tab-n" *ngIf="t.count" [class.alert]="t.alert">{{ t.count }}</span>
      </a>
    </nav>

    <main class="pb-main"><router-outlet></router-outlet></main>

    <!-- Persistent Quick Capture -->
    <button type="button" class="pb-fab" (click)="openCapture()" aria-haspopup="dialog" title="Quick capture (press C)">
      <lucide-icon name="zap" [size]="18"></lucide-icon><span>Quick capture</span>
    </button>

    <div class="pb-sheet-wrap" *ngIf="captureOpen">
      <div class="pb-sheet-scrim" (click)="closeCapture()" aria-hidden="true"></div>
      <section class="pb-sheet" role="dialog" aria-modal="true" aria-labelledby="pb-capture-title" #sheet>
        <header class="pb-sheet-head">
          <span class="pb-logo pb-logo--sm" aria-hidden="true"><lucide-icon name="zap" [size]="15"></lucide-icon></span>
          <div>
            <h2 id="pb-capture-title">Quick capture</h2>
            <p>Brain-dump anything — I’ll sort it into tasks, commitments, reminders and ideas.</p>
          </div>
          <button type="button" class="pmb-icon-btn" (click)="closeCapture()" aria-label="Close quick capture"><lucide-icon name="x" [size]="16"></lucide-icon></button>
        </header>
        <div class="pb-sheet-body">
          <app-buddy-conversation *ngIf="sheetMessages().length" [messages]="sheetMessages()" maxHeight="46vh"></app-buddy-conversation>
          <div class="pb-sheet-empty" *ngIf="!sheetMessages().length">
            <lucide-icon name="sparkles" [size]="16"></lucide-icon>
            Example: “Tomorrow discuss API performance with engineering and send updated PRD to Mahesh.”
          </div>
        </div>
        <app-buddy-composer #sheetComposer size="compact" inputId="pmb-sheet-composer" placeholder="What’s on your mind?"></app-buddy-composer>
      </section>
    </div>

    <div class="pmb-toasts" role="status" aria-live="polite">
      <div class="pmb-toast" *ngFor="let t of buddy.toasts(); trackBy: trackToast" [attr.data-type]="t.type">
        <lucide-icon [name]="t.type === 'success' ? 'circle-check' : t.type === 'error' ? 'circle-x' : 'info'" [size]="16"></lucide-icon>
        <span>{{ t.text }}</span>
        <button type="button" *ngIf="t.actionLabel" (click)="buddy.runToastAction(t)">{{ t.actionLabel }}</button>
        <button type="button" (click)="buddy.dismissToast(t.id)" aria-label="Dismiss"><lucide-icon name="x" [size]="12"></lucide-icon></button>
      </div>
    </div>
  `,
  styles: [`
    :host { position: relative; display: flex; flex-direction: column; flex: 1; min-height: 0; background: var(--psc-page-gradient); font-family: 'Mulish', sans-serif; }
    .pb-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 24px 10px; flex-shrink: 0; }
    .pb-brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .pb-logo { display: grid; place-items: center; width: 38px; height: 38px; flex-shrink: 0; border-radius: 12px; color: #fff; background: var(--psc-gradient-brand); box-shadow: 0 6px 16px rgb(var(--psc-primary-rgb) / .3); }
    .pb-logo--sm { width: 32px; height: 32px; border-radius: 10px; }
    .pb-name { display: flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 800; color: var(--psc-text-strong); }
    .pb-poc { padding: 1px 7px; border-radius: 999px; font-size: 9.5px; font-weight: 800; letter-spacing: .5px; color: var(--psc-on-tint-violet); background: var(--psc-tint-violet); }
    .pb-tag { font-size: 12px; color: var(--psc-text-subtle); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pb-head-actions { display: flex; align-items: center; gap: 8px; }
    .pb-alerts { border: 1px solid var(--psc-line); background: var(--psc-surface); color: var(--psc-text-body); }
    .pb-alerts.on { border-color: transparent; color: var(--psc-on-tint-green); background: var(--psc-tint-green); }
    .pb-bell { position: relative; display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; color: var(--psc-text-body); background: var(--psc-surface); border: 1px solid var(--psc-line); text-decoration: none; }
    .pb-bell:hover { color: var(--psc-primary-text); border-color: rgb(var(--psc-primary-rgb) / .4); }
    .pb-bell:focus-visible { outline: 2px solid var(--psc-primary); outline-offset: 2px; }
    .pb-bell-n { position: absolute; top: -5px; right: -5px; min-width: 19px; height: 19px; padding: 0 5px; display: grid; place-items: center; border-radius: 999px; font-size: 10.5px; font-weight: 800; color: #fff; background: #EF4444; box-shadow: 0 0 0 2px var(--psc-surface); }
    .pb-tabs { display: flex; gap: 4px; padding: 0 20px; overflow-x: auto; scrollbar-width: none; flex-shrink: 0; border-bottom: 1px solid var(--psc-line); }
    .pb-tabs::-webkit-scrollbar { display: none; }
    .pb-tab { position: relative; display: inline-flex; align-items: center; gap: 7px; height: 44px; padding: 0 12px; color: var(--psc-text-subtle); font-size: 13px; font-weight: 700; text-decoration: none; white-space: nowrap; transition: color .15s; }
    .pb-tab:hover { color: var(--psc-text-strong); }
    .pb-tab.active { color: var(--psc-primary-text); }
    .pb-tab.active::after { content: ''; position: absolute; left: 10px; right: 10px; bottom: -1px; height: 2.5px; border-radius: 2px 2px 0 0; background: var(--psc-gradient-brand); }
    .pb-tab:focus-visible { outline: 2px solid var(--psc-primary); outline-offset: -4px; border-radius: 8px; }
    .pb-tab-n { min-width: 18px; height: 18px; padding: 0 5px; display: grid; place-items: center; border-radius: 999px; font-size: 10.5px; font-weight: 800; color: var(--psc-on-tint-violet); background: var(--psc-tint-violet); }
    .pb-tab-n.alert { color: var(--psc-on-tint-red); background: var(--psc-tint-red); }
    .pb-main { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    .pb-fab { position: absolute; right: 24px; bottom: 24px; z-index: 50; display: inline-flex; align-items: center; gap: 8px; height: 48px; padding: 0 18px 0 16px; border: 0; border-radius: 999px;
      color: #fff; background: var(--psc-gradient-brand); font: 800 13.5px 'Mulish', sans-serif; cursor: pointer; box-shadow: 0 12px 28px rgb(var(--psc-primary-rgb) / .4); transition: transform .18s, box-shadow .18s; }
    .pb-fab:hover { transform: translateY(-2px); box-shadow: 0 16px 34px rgb(var(--psc-primary-rgb) / .45); }
    .pb-fab:focus-visible { outline: 3px solid rgb(var(--psc-primary-rgb) / .5); outline-offset: 3px; }
    .pb-sheet-wrap { position: fixed; inset: 0; z-index: 800; }
    .pb-sheet-scrim { position: absolute; inset: 0; background: var(--psc-scrim); animation: pmb-fade-up .15s ease both; }
    .pb-sheet { position: absolute; right: 24px; bottom: 24px; width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); display: flex; flex-direction: column; gap: 12px; padding: 16px;
      background: var(--psc-surface); border: 1px solid var(--psc-line); border-radius: 18px; box-shadow: 0 30px 70px rgba(0, 0, 0, .3); animation: pb-sheet-in .22s cubic-bezier(.2, .8, .2, 1) both; }
    .pb-sheet-head { display: flex; align-items: flex-start; gap: 10px; }
    .pb-sheet-head > div { flex: 1; min-width: 0; }
    .pb-sheet-head h2 { margin: 0; font-size: 15px; font-weight: 800; color: var(--psc-text-strong); }
    .pb-sheet-head p { margin: 2px 0 0; font-size: 12.5px; color: var(--psc-text-subtle); }
    .pb-sheet-body { min-height: 0; overflow: hidden; }
    .pb-sheet-empty { display: flex; gap: 8px; align-items: flex-start; padding: 12px; border-radius: 12px; background: var(--psc-surface-3); color: var(--psc-text-subtle); font-size: 12.5px; line-height: 1.5; }
    .pb-sheet-empty lucide-icon { color: var(--psc-primary-text); flex-shrink: 0; margin-top: 1px; }
    @keyframes pb-sheet-in { from { opacity: 0; transform: translateY(14px) scale(.98); } to { opacity: 1; transform: none; } }
    @media (max-width: 767.98px) {
      .pb-head { padding: 12px 14px 8px; }
      .pb-tag { display: none; }
      .pb-reset span, .pb-alerts span { display: none; }
      .pb-tabs { padding: 0 8px; }
      .pb-fab { right: 14px; bottom: 14px; width: 52px; height: 52px; padding: 0; justify-content: center; }
      .pb-fab span { display: none; }
      .pb-sheet { left: 0; right: 0; bottom: 0; width: 100%; max-height: 88dvh; border-radius: 18px 18px 0 0; padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
    }
    @media (prefers-reduced-motion: reduce) { .pb-sheet, .pb-sheet-scrim { animation: none; } }
  `]
})
export class PmBuddyShellComponent {
  @ViewChild('sheetComposer') private sheetComposer?: BuddyComposerComponent;

  readonly buddy = inject(PmBuddyService);
  readonly alerts = inject(PmBuddyAlertsService);
  readonly alertsOn = computed(() => this.alerts.enabled() && this.alerts.permission() === 'granted');
  readonly alertsTitle = computed(() => {
    const p = this.alerts.permission();
    if (p === 'unsupported') return 'Desktop notifications aren’t supported in this browser';
    if (p === 'denied') return 'Notifications are blocked — allow them in your browser’s site settings';
    return this.alertsOn() ? 'Desktop alerts are on — click to turn off' : 'Get system alerts for meetings, reminders and overdue commitments, even in another tab';
  });

  readonly todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  readonly insightCount = computed(() => this.buddy.insights().length);

  readonly tabs = computed(() => [
    { path: '.', label: 'Buddy Home', icon: 'house', count: 0, alert: false },
    { path: 'tasks', label: 'My Tasks', icon: 'list-checks', count: this.buddy.active().filter(i => i.kind !== 'commitment').length, alert: false },
    { path: 'meetings', label: 'Meeting Memory', icon: 'calendar', count: this.buddy.todaysMeetings().length, alert: false },
    { path: 'commitments', label: 'My Commitments', icon: 'handshake', count: this.buddy.overdueCommitments().length, alert: true },
    { path: 'ideas', label: 'Ideas & Notes', icon: 'lightbulb', count: this.buddy.ideas().filter(d => d.status === 'new').length, alert: false },
    { path: 'briefing', label: 'Daily Briefing', icon: 'sun', count: 0, alert: false },
    { path: 'missing', label: 'What Am I Missing?', icon: 'radar', count: this.insightCount(), alert: true }
  ]);

  captureOpen = false;
  /** Only show messages exchanged since the sheet opened. */
  private readonly sheetFrom = signal(0);
  readonly sheetMessages = computed(() => this.buddy.messages().slice(this.sheetFrom()));

  private returnFocus: HTMLElement | null = null;

  openCapture(): void {
    this.returnFocus = document.activeElement as HTMLElement | null;
    this.sheetFrom.set(this.buddy.messages().length);
    this.captureOpen = true;
    setTimeout(() => this.sheetComposer?.focus());
  }

  closeCapture(): void {
    this.captureOpen = false;
    setTimeout(() => this.returnFocus?.focus());
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.captureOpen) {
      this.closeCapture();
      return;
    }
    // "C" opens Quick Capture when not typing in a field.
    const t = e.target as HTMLElement;
    if (!this.captureOpen && e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) {
      e.preventDefault();
      this.openCapture();
    }
  }

  trackToast(_: number, t: { id: number }): number {
    return t.id;
  }
}
