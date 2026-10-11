import { titleCase } from '../util/strings.ts';

export function weekLabel(weekStart: string): string {
  return `Week of ${weekStart}`;
}

export function carrierLabel(id: string): string {
  return titleCase(id);
}
