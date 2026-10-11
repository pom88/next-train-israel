import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { serviceTimeToEpoch, upcoming, dataStatus, nearestStation, ymdOf } from '../public/schedule.js';

const iso = (ms) => new Date(ms).toISOString();

test('serviceTimeToEpoch: Israel summer (UTC+3) and winter (UTC+2)', () => {
  assert.equal(iso(serviceTimeToEpoch(20260715, 8 * 3600)), '2026-07-15T05:00:00.000Z');
  assert.equal(iso(serviceTimeToEpoch(20261215, 8 * 3600)), '2026-12-15T06:00:00.000Z');
});

test('serviceTimeToEpoch: DST end on 2026-10-25 (clocks go back at 02:00)', () => {
  assert.equal(iso(serviceTimeToEpoch(20261024, 23 * 3600)), '2026-10-24T20:00:00.000Z');
  assert.equal(iso(serviceTimeToEpoch(20261025, 12 * 3600)), '2026-10-25T10:00:00.000Z');
  // 25:30 on the 24th is after midnight on the 25th, still before the clocks change
  assert.equal(iso(serviceTimeToEpoch(20261024, 25.5 * 3600)), '2026-10-24T22:30:00.000Z');
});

test('ymdOf uses Israel local date, not UTC', () => {
  assert.equal(ymdOf(Date.parse('2026-10-11T21:30:00Z')), 20261012); // 00:30 Israel
});

const tiny = {
  validFrom: '20261001', validTo: '20261031',
  stations: [{ lat: 32, lon: 34.8 }, { lat: 31.2, lon: 34.8 }, { lat: 31.9, lon: 34.9 }],
  services: { A: ['1111100', '20261001', '20261031'] }, // Sun-Thu
  trips: [
    ['100', 'A', 0, 1], // starts at station 0, ends at station 1, passes station 2
    ['200', 'A', 1, 0],
  ],
  calls: [
    [[0, 8 * 3600, 8 * 3600], [1, 25 * 3600 - 600, 25 * 3600]], // station 0
    [[0, 9 * 3600, 9 * 3600 + 120], [1, 7 * 3600, 7 * 3600]],
    [[0, 8 * 3600 + 1800, 8 * 3600 + 1860]],
  ],
};

test('upcoming: sorted, arrivals use dep time for trains that start here', () => {
  const now = Date.parse('2026-10-11T04:00:00Z'); // Sunday 07:00 Israel
  const r = upcoming(tiny, 0, now, { mode: 'arrivals' });
  assert.equal(r[0].number, '100');
  assert.equal(iso(r[0].at), '2026-10-11T05:00:00.000Z'); // 08:00 Israel
  assert.equal(r[0].startsHere, true);
});

test('upcoming: after-midnight (25:00) belongs to previous service day and is found at 00:30', () => {
  // Sunday service day: trip 200 reaches station 0 at 24:50 -> Monday 00:50 Israel
  const now = Date.parse('2026-10-11T21:30:00Z'); // Monday 00:30 Israel
  const r = upcoming(tiny, 0, now, { mode: 'arrivals' });
  assert.equal(r[0].number, '200');
  assert.equal(iso(r[0].at), '2026-10-11T21:50:00.000Z');
  assert.equal(r[0].endsHere, true);
});

test('upcoming: departures mode excludes trains that end here', () => {
  const now = Date.parse('2026-10-11T04:00:00Z');
  const r = upcoming(tiny, 0, now, { mode: 'departures', limit: 20 });
  assert.ok(r.every((x) => !x.endsHere));
});

test('upcoming: nothing on Friday/Saturday (service not running)', () => {
  const now = Date.parse('2026-10-16T04:00:00Z'); // Friday 07:00 Israel
  const r = upcoming(tiny, 2, now, { mode: 'arrivals', limit: 20 });
  // Friday: no service. Next is Sunday 2026-10-18 (Saturday's 24h+ spill-over not applicable here)
  assert.equal(iso(r[0].at), '2026-10-18T05:30:00.000Z');
});

test('upcoming: a train that left 2 minutes ago is not listed', () => {
  const now = Date.parse('2026-10-11T05:32:00Z'); // 08:32 Israel; train at station 2 was 08:30
  const r = upcoming(tiny, 2, now, { mode: 'arrivals' });
  assert.notEqual(iso(r[0].at), '2026-10-11T05:30:00.000Z');
});

test('dataStatus', () => {
  assert.equal(dataStatus(tiny, Date.parse('2026-10-10T09:00:00Z')), 'ok');
  assert.equal(dataStatus(tiny, Date.parse('2026-10-29T09:00:00Z')), 'ending');
  assert.equal(dataStatus(tiny, Date.parse('2026-11-02T09:00:00Z')), 'expired');
});

test('nearestStation', () => {
  assert.equal(nearestStation(tiny, 31.25, 34.79).index, 1);
});

test('real timetable: every weekday morning in the valid window has a train within the hour at Beer Sheva Center', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data/timetable.json', import.meta.url)));
  const idx = data.stations.findIndex((s) => s.he === 'באר שבע מרכז');
  assert.ok(idx >= 0);
  const from = data.validFrom;
  const start = Date.UTC(+from.slice(0, 4), +from.slice(4, 6) - 1, +from.slice(6, 8));
  let checkedDays = 0;
  for (let d = 0; d < 14; d++) {
    const day = new Date(start + d * 86400000);
    if ([5, 6].includes(day.getUTCDay())) continue; // Fri/Sat: reduced or no service
    const now = day.getTime() + 5 * 3600 * 1000; // 08:00 Israel (UTC+3) or 07:00 (UTC+2), both mid-morning
    const r = upcoming(data, idx, now, { limit: 5 });
    assert.equal(r.length, 5);
    for (let i = 1; i < r.length; i++) assert.ok(r[i].at >= r[i - 1].at);
    assert.ok(r[0].at - now < 60 * 60 * 1000, `no train within an hour on ${day.toISOString().slice(0, 10)}`);
    checkedDays++;
  }
  assert.ok(checkedDays >= 8);
});
