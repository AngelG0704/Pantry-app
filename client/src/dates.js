// "2026-11-10" -> "Nov 10, 2026"
//
// Don't use new Date("2026-11-10"): a date-only string is read as UTC midnight,
// and west of UTC (New York) that is still Nov 9 on screen. Build the moment in
// UTC from the parts and format it in UTC, so the day never shifts.
const EXPIRY_FORMAT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function formatExpiry(value) {
  const [year, month, day] = value.split('-').map(Number);
  return EXPIRY_FORMAT.format(new Date(Date.UTC(year, month - 1, day)));
}