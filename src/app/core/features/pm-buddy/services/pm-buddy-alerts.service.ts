import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { PmBuddyService } from './pm-buddy.service';
import { today } from '../data/pm-buddy.dates';

const SETTINGS_KEY = 'psc.pm-buddy.alerts';
const SENT_KEY = 'psc.pm-buddy.alerts.sent';
const CHECK_MS = 30_000;
/** Alert this many minutes before a meeting starts. */
const MEETING_LEAD_MIN = 10;
const BUDDY_URL = '/psc/pm-buddy';

export type AlertPermission = NotificationPermission | 'unsupported';

interface PendingAlert {
  key: string;
  title: string;
  body: string;
  link: string;
  focus?: string;
}

/**
 * System (OS) notifications for PM Buddy — frontend only, via the browser Notification API.
 *
 * Runs on every Product Studio page. When you're looking at PM Buddy, alerts appear as in-app toasts;
 * when the tab is in the background, minimised, or you're elsewhere in the app, they're sent as
 * desktop notifications. Clicking one brings the tab forward and opens the related item.
 * Without a push backend, the tab must stay open (it can be in the background) for alerts to fire.
 */
@Injectable({ providedIn: 'root' })
export class PmBuddyAlertsService {
  private readonly buddy = inject(PmBuddyService);
  private readonly router = inject(Router);
  private timer?: number;

  readonly supported = typeof window !== 'undefined' && 'Notification' in window;
  readonly permission = signal<AlertPermission>(this.supported ? Notification.permission : 'unsupported');
  readonly enabled = signal<boolean>(this.readEnabled());

  /** Start watching. Safe to call more than once. */
  start(): void {
    if (this.timer || typeof window === 'undefined') return;
    this.timer = window.setInterval(() => this.check(), CHECK_MS);
    // Re-check when you come back to the tab; background tabs are covered by the timer.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.check(); });
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => this.check());
    window.addEventListener('storage', e => { if (e.key === SETTINGS_KEY) this.enabled.set(this.readEnabled()); });
    window.setTimeout(() => this.check(), 1500);
  }

  /** Ask the browser for permission (must run from a click) and switch alerts on. */
  async enable(): Promise<void> {
    if (!this.supported) {
      this.buddy.toast('error', 'This browser doesn’t support desktop notifications');
      return;
    }
    let p = Notification.permission;
    if (p === 'default') p = await Notification.requestPermission();
    this.permission.set(p);
    if (p !== 'granted') {
      this.buddy.toast('error', 'Notifications are blocked — allow them in your browser’s site settings');
      return;
    }
    this.setEnabled(true);
    this.notify({ key: 'test', title: 'PM Buddy alerts are on', body: 'You’ll be alerted about meetings, reminders and slipping commitments — even when you’re in another tab.', link: BUDDY_URL });
    this.buddy.toast('success', 'Desktop alerts on');
    this.check();
  }

  disable(): void {
    this.setEnabled(false);
    this.buddy.toast('info', 'Desktop alerts off');
  }

  toggle(): void {
    this.enabled() && this.permission() === 'granted' ? this.disable() : void this.enable();
  }

  /** Collect what's due right now and deliver anything not already sent. */
  check(): void {
    if (!this.enabled()) return;
    if (this.supported) this.permission.set(Notification.permission);
    const sent = this.readSent();
    const fresh = this.collect().filter(a => !sent[a.key]);
    if (!fresh.length) return;
    fresh.forEach(a => (sent[a.key] = today()));
    this.writeSent(sent); // write before showing so other tabs don't duplicate them

    if (this.lookingAtBuddy()) {
      // In PM Buddy already: one grouped toast instead of a pile of them.
      const [first] = fresh;
      if (fresh.length === 1) this.buddy.toast('info', first.title, 'View', () => this.open(first));
      else this.buddy.toast('info', `${fresh.length} new alerts — ${first.title}`, 'View', () => this.router.navigateByUrl(`${BUDDY_URL}/missing`));
      return;
    }
    fresh.forEach(a => this.notify(a));
  }

  private lookingAtBuddy(): boolean {
    return document.visibilityState === 'visible' && this.router.url.startsWith(BUDDY_URL);
  }

  private collect(): PendingAlert[] {
    const out: PendingAlert[] = [];
    const d = today();
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    // 1. Meetings starting soon.
    for (const m of this.buddy.todaysMeetings()) {
      const [h, min] = m.time.split(':').map(Number);
      const until = h * 60 + min - nowMin;
      if (until < 0 || until > MEETING_LEAD_MIN) continue;
      const owed = this.buddy.active().filter(i => i.kind === 'commitment' && i.stakeholder && m.participants.includes(i.stakeholder)).length;
      out.push({
        key: `mtg:${m.id}:${d}`,
        title: until === 0 ? `Starting now: ${m.title}` : `In ${until} min: ${m.title}`,
        body: `${m.time} · ${m.durationMin} min${owed ? ` · ${owed} open commitment${owed === 1 ? '' : 's'} with attendees` : ''}`,
        link: `${BUDDY_URL}/meetings`, focus: m.id
      });
    }

    // 2. Reminders due today — one alert each.
    for (const i of this.buddy.dueToday().filter(x => x.kind === 'reminder')) {
      out.push({ key: `rem:${i.id}:${d}`, title: `Reminder: ${i.title}`, body: i.project ? `Due today · ${i.project}` : 'Due today', link: `${BUDDY_URL}/tasks`, focus: i.id });
    }

    // 3. Overdue commitments — once per day each.
    for (const i of this.buddy.overdueCommitments()) {
      const who = i.stakeholder ? (i.direction === 'owed-to-me' ? `${i.stakeholder} still owes you this` : `You promised this to ${i.stakeholder}`) : 'Commitment is overdue';
      out.push({ key: `od:${i.id}:${d}`, title: `Overdue: ${i.title}`, body: who, link: `${BUDDY_URL}/commitments`, focus: i.id });
    }

    // 4. A daily digest the first time we check each day.
    const due = this.buddy.dueToday().length, overdue = this.buddy.overdue().length, meetings = this.buddy.todaysMeetings().length;
    if (due || overdue || meetings) {
      out.unshift({
        key: `digest:${d}`,
        title: 'Your PM Buddy briefing is ready',
        body: [overdue && `${overdue} overdue`, due && `${due} due today`, meetings && `${meetings} meeting${meetings === 1 ? '' : 's'}`].filter(Boolean).join(' · '),
        link: `${BUDDY_URL}/briefing`
      });
    }
    return out;
  }

  /** Send a system (OS) notification; clicking it focuses the tab and opens the item. */
  private notify(a: PendingAlert): void {
    if (!this.supported || Notification.permission !== 'granted') return;
    try {
      const n = new Notification(a.title, { body: a.body, tag: a.key, icon: 'favicon.ico' });
      n.onclick = () => { window.focus(); this.open(a); n.close(); };
    } catch { /* some mobile browsers only allow notifications from a service worker */ }
  }

  private open(a: PendingAlert): void {
    void this.router.navigate([a.link], { queryParams: a.focus ? { focus: a.focus } : {} });
  }

  private readEnabled(): boolean {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').enabled === true; } catch { return false; }
  }

  private setEnabled(on: boolean): void {
    this.enabled.set(on);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ enabled: on })); } catch { /* ignore */ }
  }

  private readSent(): Record<string, string> {
    try {
      const all: Record<string, string> = JSON.parse(localStorage.getItem(SENT_KEY) || '{}');
      // Keep only today's keys — yesterday's alerts can fire again if still relevant.
      return Object.fromEntries(Object.entries(all).filter(([, day]) => day === today()));
    } catch { return {}; }
  }

  private writeSent(sent: Record<string, string>): void {
    try { localStorage.setItem(SENT_KEY, JSON.stringify(sent)); } catch { /* ignore */ }
  }
}
