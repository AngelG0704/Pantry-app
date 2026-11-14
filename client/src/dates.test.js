import { describe, it, expect, afterEach, vi } from 'vitest';
import { formatExpiry, daysUntil, expiryStatus, todayLocal, SOON_DAYS } from './dates.js';

const originalZone = process.env.TZ;

afterEach(() => {
  // Assigning undefined would store the string "undefined", so delete instead.
  if (originalZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalZone;
  }
  vi.useRealTimers();
});

describe('formatExpiry', () => {
  it('formats a YYYY-MM-DD date as "Mon D, YYYY"', () => {
    expect(formatExpiry('2026-11-10')).toBe('Nov 10, 2026');
  });

  it('handles the first and last day of the year and a leap day', () => {
    expect(formatExpiry('2026-01-01')).toBe('Jan 1, 2026');
    expect(formatExpiry('2026-12-31')).toBe('Dec 31, 2026');
    expect(formatExpiry('2024-02-29')).toBe('Feb 29, 2024');
  });

  // A date-only string read as UTC midnight shows the previous day west of UTC.
  // Run in zones on both sides of UTC so the test fails wherever CI runs.
  for (const zone of ['America/New_York', 'Pacific/Kiritimati', 'UTC']) {
    it(`shows the same day in ${zone}`, () => {
      process.env.TZ = zone;

      expect(formatExpiry('2026-11-10')).toBe('Nov 10, 2026');
      expect(formatExpiry('2026-01-01')).toBe('Jan 1, 2026');
    });
  }

  it('really changes the zone (otherwise the tests above prove nothing)', () => {
    process.env.TZ = 'America/New_York';

    // UTC midnight on Nov 10 is still Nov 9 in New York.
    expect(new Date(Date.UTC(2026, 10, 10)).getDate()).toBe(9);
  });
});

describe('daysUntil', () => {
  const today = '2026-11-10';

  it.each([
    ['2026-11-10', 0],
    ['2026-11-11', 1],
    ['2026-11-13', 3],
    ['2026-11-14', 4],
    ['2026-11-09', -1],
    ['2026-10-31', -10],
  ])('from 2026-11-10 to %s is %i days', (expiresOn, days) => {
    expect(daysUntil(expiresOn, today)).toBe(days);
  });

  it('counts across a month and a year boundary', () => {
    expect(daysUntil('2026-12-01', '2026-11-30')).toBe(1);
    expect(daysUntil('2027-01-02', '2026-12-30')).toBe(3);
  });

  it('counts Feb 29 as a day in a leap year', () => {
    expect(daysUntil('2028-03-01', '2028-02-27')).toBe(3);
    expect(daysUntil('2027-03-01', '2027-02-27')).toBe(2);
  });

  // Nov 1, 2026 is 25 hours long in New York; the answer must still be a whole number.
  it('gives whole days across daylight saving time', () => {
    process.env.TZ = 'America/New_York';

    expect(daysUntil('2026-11-03', '2026-10-31')).toBe(3);
  });
});

describe('expiryStatus', () => {
  const today = '2026-11-10';

  it('soon means within 3 days', () => {
    expect(SOON_DAYS).toBe(3);
  });

  it.each([
    [null, 'none'],
    ['2026-11-09', 'expired'],
    ['2025-01-01', 'expired'],
    ['2026-11-10', 'soon'],
    ['2026-11-11', 'soon'],
    ['2026-11-13', 'soon'],
    ['2026-11-14', 'ok'],
    ['2030-06-01', 'ok'],
  ])('expiresOn %s is %s when today is 2026-11-10', (expiresOn, status) => {
    expect(expiryStatus(expiresOn, today)).toBe(status);
  });

  it('counts days across a month and a year boundary', () => {
    expect(expiryStatus('2027-01-02', '2026-12-30')).toBe('soon');
    expect(expiryStatus('2027-01-03', '2026-12-30')).toBe('ok');
    expect(expiryStatus('2026-11-30', '2026-12-01')).toBe('expired');
  });

  it('counts Feb 29 as a day in a leap year', () => {
    // Feb 27 → Mar 1 is 3 days in 2028 (Feb 29 exists) but 2 in 2027.
    // So Feb 27 → Mar 2 is 3 days (soon) in 2027 but 4 (ok) in 2028.
    expect(expiryStatus('2028-03-01', '2028-02-27')).toBe('soon');
    expect(expiryStatus('2027-03-02', '2027-02-27')).toBe('soon');
    expect(expiryStatus('2028-03-02', '2028-02-27')).toBe('ok');
  });

  // Clocks go back on Nov 1, 2026 in New York, so that day is 25 hours long.
  // Counting days in local time would give 3.04 days here instead of 3.
  it('is not thrown off by daylight saving time', () => {
    process.env.TZ = 'America/New_York';

    expect(expiryStatus('2026-11-03', '2026-10-31')).toBe('soon');
    expect(expiryStatus('2026-11-04', '2026-10-31')).toBe('ok');
  });
});

describe('todayLocal', () => {
  // 9 pm in New York on Nov 10 is already 2 am on Nov 11 in UTC.
  const nineInTheEvening = new Date('2026-11-10T21:00:00-05:00');

  it('gives the calendar day where the user is, not in UTC', () => {
    process.env.TZ = 'America/New_York';

    expect(todayLocal(nineInTheEvening)).toBe('2026-11-10');
  });

  it('gives the next day for the same moment east of UTC', () => {
    process.env.TZ = 'Pacific/Kiritimati';

    expect(todayLocal(nineInTheEvening)).toBe('2026-11-11');
  });

  it('pads single-digit months and days', () => {
    process.env.TZ = 'UTC';

    expect(todayLocal(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05');
  });

  it('reads the real clock when no date is given', () => {
    process.env.TZ = 'America/New_York';
    vi.useFakeTimers();
    vi.setSystemTime(nineInTheEvening);

    expect(todayLocal()).toBe('2026-11-10');
  });

  it('really is a different day in UTC (otherwise the tests above prove nothing)', () => {
    expect(nineInTheEvening.toISOString().slice(0, 10)).toBe('2026-11-11');
  });
});