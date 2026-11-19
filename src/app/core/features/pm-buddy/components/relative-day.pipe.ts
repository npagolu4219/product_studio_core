import { Pipe, PipeTransform } from '@angular/core';
import { daysFromToday, relativeDay } from '../data/pm-buddy.dates';

/** "Today" / "Tomorrow" / "3 days ago" / "Mon, Nov 17". Pure — recomputed only when the date changes. */
@Pipe({ name: 'relativeDay', standalone: true })
export class RelativeDayPipe implements PipeTransform {
  transform(iso?: string | null): string {
    return relativeDay(iso ?? undefined);
  }
}

/** -1 = overdue, 0 = today, 1 = future, null = no date. */
@Pipe({ name: 'dueState', standalone: true })
export class DueStatePipe implements PipeTransform {
  transform(iso?: string | null): 'overdue' | 'today' | 'future' | null {
    if (!iso) return null;
    const n = daysFromToday(iso);
    return n < 0 ? 'overdue' : n === 0 ? 'today' : 'future';
  }
}
