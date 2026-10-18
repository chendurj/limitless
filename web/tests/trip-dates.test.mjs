import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateTripDates } from '../lib/trip-dates.ts';
const today = '2026-10-18';
for (const [name, start, end, nights] of [
  ['one night', '2030-10-22', '2030-10-23', 1],
  ['three nights', '2030-10-22', '2030-10-25', 3],
  ['maximum seven nights', '2030-10-22', '2030-10-29', 7],
  ['spring daylight-saving transition', '2027-03-13', '2027-03-15', 2],
  ['autumn daylight-saving transition', '2027-11-06', '2027-11-08', 2],
  ['leap day', '2028-02-28', '2028-03-01', 2],
  ['month and year boundary', '2030-12-30', '2031-01-02', 3],
]) test(`date range: ${name}`, () => assert.deepEqual(validateTripDates(start, end, today), { start_date: start, end_date: end, nights }));
for (const [name, start, end] of [
  ['start only', '2030-10-22', ''],
  ['end only', '', '2030-10-25'],
  ['reversed range', '2030-10-25', '2030-10-22'],
  ['same day unsupported by overnight demo', '2030-10-22', '2030-10-22'],
  ['past start', '2026-10-17', '2026-10-20'],
  ['impossible date', '2030-02-30', '2030-03-02'],
  ['over seven nights', '2030-10-22', '2030-10-30'],
  ['malformed start', 'tomorrow', '2030-10-25'],
  ['malformed end', '2030-10-22', '2030-10-25T00:00:00Z'],
]) test(`date range rejects ${name}`, () => assert.ok(validateTripDates(start, end, today).error));
test('undecided dates stay unknown', () => assert.deepEqual(validateTripDates('', '', today), {}));
