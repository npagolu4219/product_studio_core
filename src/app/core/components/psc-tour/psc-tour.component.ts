import { Component, ElementRef, HostListener, OnDestroy, ViewChild, effect, inject, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { TourService, TourStep } from '../../services/tour.service';

interface Box { top: number; left: number; width: number; height: number; }
type Side = 'top' | 'bottom' | 'left' | 'right' | 'center';

const PAD = 8;      // space between the element and the spotlight edge
const GAP = 16;     // space between the spotlight and the card
const EDGE = 12;    // minimum distance from the viewport edge
const CARD_W = 344;

/**
 * Overlay for TourService: dims the page, cuts a spotlight around the step's element,
 * and places an explanation card beside it (flipping to whichever side has room).
 */
@Component({
  selector: 'app-psc-tour',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './psc-tour.component.html',
  styleUrl: './psc-tour.component.scss'
})
export class PscTourComponent implements OnDestroy {
  readonly tour = inject(TourService);
  @ViewChild('card') private card?: ElementRef<HTMLElement>;

  spot: Box | null = null;
  cardPos = { top: 0, left: 0 };
  side: Side = 'center';
  /** Arrow offset along the card edge (px). */
  arrow = 0;
  /** Hidden for one frame while the next position is measured, so the card never jumps. */
  settling = true;

  private raf = 0;
  private timer = 0;

  constructor() {
    effect(() => {
      const step = this.tour.step();
      untracked(() => this.show(step));
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.timer);
  }

  get index(): number {
    return this.tour.active()?.index ?? 0;
  }

  get total(): number {
    return this.tour.active()?.steps.length ?? 0;
  }

  get isLast(): boolean {
    return this.index === this.total - 1;
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  onViewportChange(): void {
    if (!this.tour.step()) return;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.measure(this.tour.step()));
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (!this.tour.step()) return;
    if (e.key === 'Escape') { e.preventDefault(); this.tour.finish(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); this.tour.next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); this.tour.prev(); }
  }

  /** New step: bring its element into view, then position the spotlight and card. */
  private show(step: TourStep | null): void {
    window.clearTimeout(this.timer);
    if (!step) { this.spot = null; return; }
    this.settling = true;
    const el = this.element(step);
    if (el) {
      const r = el.getBoundingClientRect();
      const offscreen = r.top < 80 || r.bottom > window.innerHeight - 80;
      if (offscreen) el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      this.timer = window.setTimeout(() => this.measure(step, true), offscreen ? 380 : 30);
    } else {
      this.timer = window.setTimeout(() => this.measure(step, true), 30);
    }
  }

  private element(step: TourStep | null): HTMLElement | null {
    return step?.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
  }

  private measure(step: TourStep | null, focus = false): void {
    if (!step) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardW = Math.min(CARD_W, vw - EDGE * 2);
    const cardH = this.card?.nativeElement.offsetHeight || 230;
    const el = this.element(step);

    if (!el) {
      this.spot = null;
      this.side = 'center';
      this.cardPos = { top: Math.max(EDGE, (vh - cardH) / 2), left: (vw - cardW) / 2 };
    } else {
      const r = el.getBoundingClientRect();
      this.spot = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
      const s = this.spot;
      const room = {
        bottom: vh - (s.top + s.height) - GAP,
        top: s.top - GAP,
        right: vw - (s.left + s.width) - GAP,
        left: s.left - GAP
      };
      const fits = (side: Exclude<Side, 'center'>) =>
        side === 'top' || side === 'bottom' ? room[side] >= cardH + EDGE : room[side] >= cardW + EDGE;
      const order: Exclude<Side, 'center'>[] = [step.placement ?? 'bottom', 'bottom', 'top', 'right', 'left'];
      const side = order.find(fits) ?? (room.bottom >= room.top ? 'bottom' : 'top');
      this.side = side;

      const cx = s.left + s.width / 2;
      const cy = s.top + s.height / 2;
      let top: number;
      let left: number;
      if (side === 'bottom' || side === 'top') {
        top = side === 'bottom' ? s.top + s.height + GAP : s.top - GAP - cardH;
        left = cx - cardW / 2;
      } else {
        left = side === 'right' ? s.left + s.width + GAP : s.left - GAP - cardW;
        top = cy - cardH / 2;
      }
      left = Math.min(Math.max(EDGE, left), vw - cardW - EDGE);
      top = Math.min(Math.max(EDGE, top), vh - cardH - EDGE);
      this.cardPos = { top, left };
      // Arrow points at the element's centre, kept inside the card's rounded corners.
      this.arrow = side === 'bottom' || side === 'top'
        ? Math.min(Math.max(22, cx - left), cardW - 22)
        : Math.min(Math.max(22, cy - top), cardH - 22);
    }
    this.settling = false;
    if (focus) requestAnimationFrame(() => this.card?.nativeElement.focus({ preventScroll: true }));
  }
}
