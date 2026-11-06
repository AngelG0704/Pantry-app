import { describe, it, expect, afterEach } from 'vitest';
import { formatExpiry } from './dates.js';

const originalZone = process.env.TZ;

afterEach(() => {
  // Assigning undefined would store the string "undefined", so delete instead.
  if (originalZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalZone;
  }
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