import { AfterViewInit, Component, ElementRef, HostListener, ViewChild, computed, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { DEFAULT_COLORS, THEME_OPTIONS, THEME_PRESETS, ThemeColors, ThemePreset, ThemeService } from '../../services/theme.service';
import { isHex } from '../../utils/color';

/**
 * Appearance panel: theme mode, preset palettes and custom accent / secondary colours.
 * Every change is applied live through ThemeService (CSS variables on <html>), so the whole app
 * — including canvases and illustrations — re-colours as you drag the picker.
 */
@Component({
  selector: 'app-psc-theme-customizer',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './psc-theme-customizer.component.html',
  styleUrl: './psc-theme-customizer.component.scss'
})
export class PscThemeCustomizerComponent implements AfterViewInit {
  @ViewChild('panel', { static: true }) private panel!: ElementRef<HTMLElement>;

  readonly closed = output<void>();
  readonly theme = inject(ThemeService);
  readonly modes = THEME_OPTIONS;
  readonly presets = THEME_PRESETS;

  /** Raw text in the hex inputs (may be mid-typing / invalid). */
  draft: ThemeColors = { ...this.theme.activeColors() };
  readonly current = computed(() => this.theme.activeColors());

  private returnFocus: HTMLElement | null = null;

  ngAfterViewInit(): void {
    this.returnFocus = document.activeElement as HTMLElement | null;
    setTimeout(() => this.panel.nativeElement.querySelector<HTMLElement>('[data-autofocus]')?.focus());
  }

  close(): void {
    this.closed.emit();
    setTimeout(() => this.returnFocus?.focus());
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  applyPreset(p: ThemePreset): void {
    this.theme.setColors({ primary: p.primary, secondary: p.secondary });
    this.draft = { primary: p.primary, secondary: p.secondary };
  }

  /** Native colour picker: fires continuously while dragging → live update. */
  onPick(key: keyof ThemeColors, value: string): void {
    this.draft = { ...this.draft, [key]: value.toUpperCase() };
    this.theme.setColors({ ...this.current(), [key]: value });
  }

  /** Hex text field: apply once the value is a valid colour. */
  onHexInput(key: keyof ThemeColors, value: string): void {
    const v = value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`;
    this.draft = { ...this.draft, [key]: v.toUpperCase() };
    if (isHex(v) && (v.length === 4 || v.length === 7)) this.theme.setColors({ ...this.current(), [key]: v });
  }

  hexInvalid(key: keyof ThemeColors): boolean {
    const v = this.draft[key];
    return !!v && !(isHex(v) && (v.length === 4 || v.length === 7));
  }

  reset(): void {
    this.theme.resetColors();
    this.draft = { ...DEFAULT_COLORS };
  }

  trackById(_: number, p: ThemePreset): string {
    return p.id;
  }
}
