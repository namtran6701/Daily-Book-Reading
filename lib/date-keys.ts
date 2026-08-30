export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function dateFromKey(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

// A stored timestamp is a UTC instant; bucket it by the viewer's local calendar
// day so a late-evening completion lands on the right day (and week).
export function localDayFromInstant(instant: string): string {
  return localDateKey(new Date(instant));
}

export function shiftDate(value: string, days: number): string {
  const date = dateFromKey(value);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

export function daysBetween(from: string, to: string): number {
  const millis = dateFromKey(to).getTime() - dateFromKey(from).getTime();
  return Math.round(millis / 86_400_000);
}

export function formatDate(value: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en", options).format(dateFromKey(value));
}

export function dayTitle(value: string, today: string): string {
  if (value === today) return "Today";
  if (value === shiftDate(today, -1)) return "Yesterday";
  if (value === shiftDate(today, 1)) return "Tomorrow";
  return formatDate(value, { weekday: "long", month: "long", day: "numeric" });
}

export function ageLabel(dayKey: string, today: string): string {
  const age = daysBetween(dayKey, today);
  if (age < 0) return formatDate(dayKey, { month: "short", day: "numeric" });
  if (age === 0) return "today";
  if (age === 1) return "yesterday";
  if (age < 7) return `${age} days ago`;
  if (age < 14) return "last week";
  if (age < 31) return `${Math.floor(age / 7)} weeks ago`;
  return formatDate(dayKey, { month: "short", day: "numeric" });
}

export function scheduleLabel(dayKey: string, today: string): string {
  const age = daysBetween(dayKey, today);
  if (age > 0) return `${age}d overdue`;
  if (age === 0) return "Today";
  if (age === -1) return "Tomorrow";
  return formatDate(dayKey, { month: "short", day: "numeric" });
}

export function monthKey(dayKey: string): string {
  return dayKey.slice(0, 7);
}

// Monday-first week, so a "this week" recap matches how a work week feels.
export function startOfWeek(dayKey: string): string {
  const offset = (dateFromKey(dayKey).getDay() + 6) % 7;
  return shiftDate(dayKey, -offset);
}

export function startOfMonth(dayKey: string): string {
  return `${monthKey(dayKey)}-01`;
}

export function rangeDays(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = shiftDate(day, 1)) days.push(day);
  return days;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + delta, 1);
  return monthKey(localDateKey(date));
}

export function monthLabel(month: string): string {
  return formatDate(`${month}-01`, { month: "long", year: "numeric" });
}

export const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

// Six rows only when the month actually needs them, so short months do not
// trail an empty week.
export function monthGrid(month: string): { dayKey: string; inMonth: boolean }[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const leading = new Date(year, monthNumber - 1, 1).getDay();
  const dayCount = new Date(year, monthNumber, 0).getDate();
  const cells: { dayKey: string; inMonth: boolean }[] = [];
  for (let offset = 0; offset < Math.ceil((leading + dayCount) / 7) * 7; offset += 1) {
    const date = new Date(year, monthNumber - 1, offset - leading + 1);
    cells.push({ dayKey: localDateKey(date), inMonth: date.getMonth() === monthNumber - 1 });
  }
  return cells;
}
