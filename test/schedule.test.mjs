import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { serviceTimeToEpoch, upcoming, plan, dataStatus, nearestStation, ymdOf } from '../public/schedule.js';

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

// --- journey planner ---
// A -> B -> C. X: A 08:00, B 09:00, C 10:00 (direct). Y: A 08:30, B 09:20. Z: B 09:30, C 10:30. W: C 11:00 -> A 12:00.
const H = 3600;
const net = {
  validFrom: '20261001', validTo: '20261031',
  stations: [{}, {}, {}],
  services: { S: ['1111111', '20261001', '20261031'] },
  trips: [['X', 'S', 0, 2], ['Y', 'S', 0, 1], ['Z', 'S', 1, 2], ['W', 'S', 2, 0], ['R', 'S', 0, 2]],
  calls: [
    [[0, 8 * H, 8 * H, 1], [1, 8.5 * H, 8.5 * H, 1], [3, 12 * H, 12 * H, 2], [4, 7 * H + 3000, 7 * H + 3000, 1]],
    [[0, 9 * H, 9 * H + 60, 2], [1, 9 * H + 1200, 9 * H + 1200, 2], [2, 9.5 * H, 9.5 * H, 1]],
    [[0, 10 * H, 10 * H, 3], [2, 10.5 * H, 10.5 * H, 2], [3, 11 * H, 11 * H, 1], [4, 11 * H + 1200, 11 * H + 1200, 2]],
  ],
};
const at = (h, m = 0) => Date.parse('2026-10-11T00:00:00Z') + ((h - 3) * 60 + m) * 60000; // Sun 2026-10-11, Israel summer time

test('plan: sorted by arrival; direct and a later change both offered, dominated options dropped', () => {
  const r = plan(net, 0, 2, at(7));
  assert.deepEqual(r.slice(0, 2).map((j) => j.legs.map((l) => l.number)), [['X'], ['Y', 'Z']]);
  assert.equal(iso(r[0].arr), iso(at(10)));
  assert.equal(iso(r[1].arr), iso(at(10, 30)));
  assert.ok(r.every((j, i) => i === 0 || j.arr >= r[i - 1].arr));
  assert.ok(!r.some((j) => j.legs[0].number === 'X' && j.legs.length === 2));
});

test('plan: a slow direct train that a later train beats is still listed', () => {
  const r = plan(net, 0, 2, at(7));
  assert.deepEqual(r.slice(0, 3).map((j) => j.legs.map((l) => l.number)), [['X'], ['Y', 'Z'], ['R']]);
});

test('plan: a change needs at least 4 minutes', () => {
  const tight = structuredClone(net);
  tight.calls[1][2] = [2, 9 * H + 1320, 9 * H + 1320, 1]; // Z leaves B 2 minutes after Y arrives
  const r = plan(tight, 0, 2, at(7));
  assert.ok(r.slice(0, 2).every((j) => j.legs.length === 1));
});

test('plan: arriveBy keeps only journeys that arrive in time', () => {
  const r = plan(net, 0, 2, at(7), { arriveBy: at(10, 15) });
  assert.equal(r.length, 1);
  assert.equal(r[0].legs[0].number, 'X');
});

test('plan: arriveBy lists the latest arrival first', () => {
  const r = plan(net, 0, 2, at(7), { arriveBy: at(11) });
  assert.deepEqual(r.map((j) => j.legs.map((l) => l.number)), [['Y', 'Z'], ['X']]);
});

test('plan: same station gives nothing; reverse direction only uses trips that run that way', () => {
  assert.deepEqual(plan(net, 1, 1, at(7)), []);
  const r = plan(net, 2, 0, at(7));
  assert.equal(r[0].legs[0].number, 'W');
});

test('plan: real timetable, Beer Sheva -> Tel Aviv by arrival, both languages of data resolve', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data/timetable.json', import.meta.url)));
  const from = data.stations.findIndex((s) => s.id === '17084');
  const to = data.stations.findIndex((s) => s.id === '17038');
  const now = Date.parse('2026-10-12T06:00:00Z');
  const r = plan(data, from, to, now, { limit: 6 });
  assert.equal(r.length, 6);
  assert.ok(plan(data, from, to, now, { limit: 40 }).some((j) => j.legs.length === 1 && j.legs[0].number === '670'), 'slow 18:12 train is listed');
  for (let i = 0; i < r.length; i++) {
    assert.ok(r[i].dep >= now - 30000 && r[i].arr > r[i].dep);
    if (i) assert.ok(r[i].arr >= r[i - 1].arr);
  }
  const by = plan(data, from, to, now, { arriveBy: Date.parse('2026-10-12T09:00:00Z') });
  assert.ok(by.length > 0 && by.every((j) => j.arr <= Date.parse('2026-10-12T09:00:00Z')));
});
