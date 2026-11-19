import { Component, ElementRef, Input, NgZone, OnDestroy, ViewChild, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { PmBuddyService } from '../services/pm-buddy.service';
import { CAPTURE_EXAMPLES, MEMORY_EXAMPLES } from '../data/pm-buddy.mock-data';

/**
 * Conversational prompt bar: text + voice (browser SpeechRecognition when available, text fallback otherwise).
 * Sends to PmBuddyService, which classifies the input as a capture or a memory question.
 */
@Component({
  selector: 'app-buddy-composer',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    <div class="cmp" [class.cmp--large]="size === 'large'" [class.listening]="listening">
      <label class="pmb-sr-only" [attr.for]="inputId">Tell PM Buddy what you are thinking</label>
      <textarea #box [id]="inputId" [(ngModel)]="text" [rows]="size === 'large' ? 2 : 1" (keydown.enter)="onEnter($event)"
        (input)="autosize()" [placeholder]="listening ? 'Listening… speak now' : placeholder" [disabled]="buddy.thinking()"></textarea>
      <div class="cmp-actions">
        <span class="cmp-hint" *ngIf="voiceNote" role="status">{{ voiceNote }}</span>
        <button type="button" class="cmp-icon" [class.on]="listening" (click)="toggleVoice()"
          [attr.aria-label]="listening ? 'Stop voice input' : 'Start voice input'" [attr.aria-pressed]="listening" [title]="listening ? 'Stop listening' : 'Voice input'">
          <lucide-icon [name]="listening ? 'audio-lines' : 'mic'" [size]="17"></lucide-icon>
        </button>
        <button type="button" class="cmp-send" (click)="send()" [disabled]="!text.trim() || buddy.thinking()" aria-label="Send to PM Buddy" title="Send (Enter)">
          <lucide-icon [name]="buddy.thinking() ? 'loader' : 'arrow-up'" [size]="18" [class.spin]="buddy.thinking()"></lucide-icon>
        </button>
      </div>
    </div>
    <div class="cmp-examples" *ngIf="showExamples">
      <span class="cmp-examples-label"><lucide-icon name="sparkles" [size]="12"></lucide-icon>Try</span>
      <button type="button" class="cmp-chip" *ngFor="let e of captureExamples" (click)="use(e)" [title]="e">{{ e }}</button>
      <span class="cmp-examples-label"><lucide-icon name="search" [size]="12"></lucide-icon>Ask</span>
      <button type="button" class="cmp-chip cmp-chip--ask" *ngFor="let q of memoryExamples" (click)="use(q, true)">{{ q }}</button>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .cmp { display: flex; align-items: flex-end; gap: 10px; padding: 12px 12px 12px 16px; background: var(--psc-surface); border: 1px solid rgb(var(--psc-primary-rgb) / .2); border-radius: 16px;
      box-shadow: 0 12px 34px rgb(var(--psc-primary-rgb) / .1), 0 2px 8px rgba(0, 0, 0, .04); transition: border-color .2s, box-shadow .2s; }
    .cmp:focus-within { border-color: rgb(var(--psc-primary-rgb) / .45); box-shadow: 0 14px 38px rgb(var(--psc-primary-rgb) / .16), 0 0 0 3px rgb(var(--psc-primary-rgb) / .08); }
    .cmp.listening { border-color: #EF4444; box-shadow: 0 0 0 3px rgba(239, 68, 68, .15); }
    textarea { flex: 1; min-height: 24px; max-height: 180px; padding: 6px 0; border: 0; outline: 0; resize: none; background: transparent; color: var(--psc-text-strong); font: 15px/1.55 'Mulish', sans-serif; }
    textarea::placeholder { color: var(--psc-text-faint); }
    .cmp--large textarea { min-height: 52px; font-size: 16px; }
    .cmp-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .cmp-hint { font-size: 11.5px; color: var(--psc-text-subtle); max-width: 220px; }
    .cmp-icon, .cmp-send { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; border: 0; cursor: pointer; transition: transform .15s, background .15s, opacity .15s; }
    .cmp-icon { color: var(--psc-primary-text); background: rgb(var(--psc-primary-rgb) / .08); }
    .cmp-icon:hover { background: rgb(var(--psc-primary-rgb) / .15); }
    .cmp-icon.on { color: #fff; background: #EF4444; animation: cmp-pulse 1.3s ease-in-out infinite; }
    .cmp-send { color: #fff; background: var(--psc-gradient-brand); box-shadow: 0 6px 14px rgb(var(--psc-primary-rgb) / .3); }
    .cmp-send:hover:not(:disabled) { transform: translateY(-1px); }
    .cmp-send:disabled { opacity: .45; cursor: not-allowed; box-shadow: none; }
    .cmp-icon:focus-visible, .cmp-send:focus-visible { outline: 2px solid var(--psc-primary); outline-offset: 2px; }
    .spin { animation: cmp-spin 1s linear infinite; }
    .cmp-examples { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
    .cmp-examples-label { display: inline-flex; align-items: center; gap: 4px; margin: 0 2px 0 6px; font-size: 11px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase; color: var(--psc-text-subtle); }
    .cmp-examples-label:first-child { margin-left: 0; }
    .cmp-chip { max-width: 320px; height: 28px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--psc-line); background: var(--psc-surface); color: var(--psc-text-body);
      font: 600 12px 'Mulish', sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; transition: all .15s; }
    .cmp-chip:hover { color: var(--psc-primary-text); border-color: rgb(var(--psc-primary-rgb) / .4); }
    .cmp-chip--ask { color: var(--psc-on-tint-violet); background: var(--psc-tint-violet); border-color: transparent; }
    .cmp-chip:focus-visible { outline: 2px solid var(--psc-primary); outline-offset: 1px; }
    @keyframes cmp-pulse { 50% { box-shadow: 0 0 0 6px rgba(239, 68, 68, .18); } }
    @keyframes cmp-spin { to { transform: rotate(360deg); } }
    @media (max-width: 640px) { .cmp-chip { max-width: 100%; } .cmp--large textarea { font-size: 16px; } }
  `]
})
export class BuddyComposerComponent implements OnDestroy {
  @Input() placeholder = 'Tell me what you are thinking, planning or need to remember...';
  @Input() size: 'large' | 'compact' = 'large';
  @Input() showExamples = false;
  @Input() inputId = 'pmb-composer';
  /** Emits after a message is sent (the capture sheet uses it to scroll). */
  readonly sent = output<void>();

  @ViewChild('box', { static: true }) private box!: ElementRef<HTMLTextAreaElement>;

  readonly buddy = inject(PmBuddyService);
  private readonly zone = inject(NgZone);
  readonly captureExamples = CAPTURE_EXAMPLES.slice(0, 2);
  readonly memoryExamples = MEMORY_EXAMPLES.slice(0, 3);

  text = '';
  listening = false;
  voiceNote = '';
  private recognition: any = null;

  focus(): void {
    setTimeout(() => this.box.nativeElement.focus());
  }

  use(text: string, sendNow = false): void {
    this.text = text;
    this.autosize();
    if (sendNow) this.send();
    else this.focus();
  }

  onEnter(e: Event): void {
    if ((e as KeyboardEvent).shiftKey) return;
    e.preventDefault();
    this.send();
  }

  async send(): Promise<void> {
    const t = this.text.trim();
    if (!t || this.buddy.thinking()) return;
    this.stopVoice();
    this.text = '';
    this.autosize();
    this.sent.emit();
    await this.buddy.send(t);
    this.focus();
  }

  autosize(): void {
    const el = this.box.nativeElement;
    setTimeout(() => {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    });
  }

  toggleVoice(): void {
    if (this.listening) {
      this.stopVoice();
      return;
    }
    const w = window as any;
    const Speech = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Speech) {
      this.voiceNote = 'Voice isn’t supported in this browser — type instead.';
      this.focus();
      setTimeout(() => (this.voiceNote = ''), 4000);
      return;
    }
    const rec = new Speech();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = false;
    const base = this.text ? `${this.text.trim()} ` : '';
    rec.onresult = (ev: any) => this.zone.run(() => {
      const transcript = Array.from(ev.results as ArrayLike<any>).map((r: any) => r[0].transcript).join('');
      this.text = base + transcript;
      this.autosize();
    });
    rec.onerror = () => this.zone.run(() => { this.voiceNote = 'Couldn’t hear that — try again or type.'; this.listening = false; });
    rec.onend = () => this.zone.run(() => { this.listening = false; this.focus(); });
    this.recognition = rec;
    this.voiceNote = '';
    this.listening = true;
    rec.start();
  }

  private stopVoice(): void {
    try { this.recognition?.stop(); } catch { /* ignore */ }
    this.listening = false;
  }

  ngOnDestroy(): void {
    this.stopVoice();
  }
}
