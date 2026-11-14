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

// An item is "soon" from today up to this many days ahead.
export const SOON_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

// "2026-11-10" -> milliseconds at UTC midnight. Every UTC day is exactly 24 hours,
// so differences between these are whole days, even across daylight saving time.
function utcMidnight(value) {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

// Whole days from today to expiresOn: 0 today, 1 tomorrow, negative once past.
// Both arguments are "YYYY-MM-DD" (no null: callers check for a missing date first).
export function daysUntil(expiresOn, today) {
  return (utcMidnight(expiresOn) - utcMidnight(today)) / DAY_MS;
}

// 'none' (no date), 'expired' (before today), 'soon' (today to SOON_DAYS ahead), or 'ok'.
// Both arguments are "YYYY-MM-DD"; today is passed in so tests don't depend on the clock.
export function expiryStatus(expiresOn, today) {
  if (expiresOn === null) {
    return 'none';
  }
  const daysLeft = daysUntil(expiresOn, today);
  if (daysLeft < 0) {
    return 'expired';
  }
  return daysLeft <= SOON_DAYS ? 'soon' : 'ok';
}

// Today's calendar day where the user is, as "YYYY-MM-DD".
// Not toISOString(): that is the UTC day, which is already tomorrow from 7 pm in New York.
export function todayLocal(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}