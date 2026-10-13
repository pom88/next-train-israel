// Pure timetable logic. No DOM, no network.
export const TZ = 'Asia/Jerusalem';

const dtf = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function localParts(ms) {
  const p = {};
  for (const { type, value } of dtf.formatToParts(ms)) p[type] = Number(value);
  return p;
}

function offsetMs(ms) {
  const p = localParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

// GTFS times count from "noon minus 12h" on the service day, which stays correct across DST changes.
export function serviceTimeToEpoch(ymd, seconds) {
  const y = Math.floor(ymd / 10000), m = Math.floor(ymd / 100) % 100, d = ymd % 100;
  const guess = Date.UTC(y, m - 1, d, 12);
  const noonLocal = guess - offsetMs(guess);
  return noonLocal - 12 * 3600 * 1000 + seconds * 1000;
}

export function ymdOf(ms) {
  const p = localParts(ms);
  return p.year * 10000 + p.month * 100 + p.day;
}

export function addDays(ymd, delta) {
  const y = Math.floor(ymd / 10000), m = Math.floor(ymd / 100) % 100, d = ymd % 100;
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
}

function weekday(ymd) {
  const y = Math.floor(ymd / 10000), m = Math.floor(ymd / 100) % 100, d = ymd % 100;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday, same as the calendar string order
}

export function serviceRunsOn(service, ymd) {
  if (!service) return false;
  const [days, from, to] = service;
  return ymd >= Number(from) && ymd <= Number(to) && days[weekday(ymd)] === '1';
}

/**
 * Upcoming trains calling at a station, sorted by time.
 * mode 'arrivals': time = arrival (departure for trains that start here); includes trains that end here.
 * mode 'departures': time = departure; excludes trains that end here.
 */
export function upcoming(data, stationIdx, nowMs, { mode = 'arrivals', limit = 8 } = {}) {
  const today = ymdOf(nowMs);
  const out = [];
  // Yesterday covers after-midnight (24:xx+) calls; several days ahead covers Shabbat and holidays with no service.
  for (let delta = -1; delta <= 5; delta++) {
    const ymd = addDays(today, delta);
    for (const [tripIdx, arr, dep] of data.calls[stationIdx]) {
      const [number, serviceId, originIdx, destIdx] = data.trips[tripIdx];
      if (!serviceRunsOn(data.services[serviceId], ymd)) continue;
      const startsHere = originIdx === stationIdx;
      const endsHere = destIdx === stationIdx;
      if (mode === 'departures' && endsHere) continue;
      const secs = mode === 'departures' || startsHere ? dep : arr;
      const at = serviceTimeToEpoch(ymd, secs);
      if (at < nowMs - 30 * 1000) continue;
      out.push({ at, number, startsHere, endsHere, destIdx, originIdx, tripKey: `${ymd}-${tripIdx}` });
    }
  }
  out.sort((a, b) => a.at - b.at);
  return out.slice(0, limit);
}

export function dataStatus(data, nowMs) {
  const today = ymdOf(nowMs);
  if (today > Number(data.validTo) || today < Number(data.validFrom)) return 'expired';
  if (addDays(today, 3) > Number(data.validTo)) return 'ending';
  return 'ok';
}

export function nearestStation(data, lat, lon) {
  let best = -1, bestD = Infinity;
  const k = Math.cos((lat * Math.PI) / 180);
  data.stations.forEach((s, i) => {
    const d = (s.lat - lat) ** 2 + ((s.lon - lon) * k) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  });
  return { index: best, km: Math.sqrt(bestD) * 111.2 };
}

const tripStopsCache = new WeakMap();

// Stops of every trip in order: tripStops(data)[tripIdx] = [[stationIdx, arrSecs, depSecs], ...]
function tripStops(data) {
  let cached = tripStopsCache.get(data);
  if (cached) return cached;
  cached = data.trips.map(() => []);
  data.calls.forEach((list, stationIdx) => {
    for (const [tripIdx, arr, dep, seq] of list) cached[tripIdx].push([seq, stationIdx, arr, dep]);
  });
  cached = cached.map((stops) => stops.sort((a, b) => a[0] - b[0]).map(([, s, arr, dep]) => [s, arr, dep]));
  tripStopsCache.set(data, cached);
  return cached;
}

const MIN_TRANSFER_MS = 4 * 60 * 1000;
const MAX_WAIT_MS = 3 * 3600 * 1000;

/**
 * Journeys from one station to another with at most one change, ranked by ARRIVAL time.
 * Default: journeys leaving from now on, earliest arrival first.
 * With arriveBy (epoch ms): journeys arriving no later than that, latest arrival first (leave as late as possible).
 */
export function plan(data, fromIdx, toIdx, nowMs, { arriveBy = null, limit = 8, maxChanges = 1 } = {}) {
  if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return [];
  const stops = tripStops(data);
  const today = ymdOf(nowMs);
  const days = [];
  for (let delta = -1; delta <= 6; delta++) days.push(addDays(today, delta));
  const runs = (tripIdx, ymd) => serviceRunsOn(data.services[data.trips[tripIdx][1]], ymd);

  // Trains reaching the destination, grouped by the station they could be boarded at.
  const intoDest = new Map();
  const direct = [];
  const candidates = [];
  for (const ymd of days) {
    for (const [tripIdx, arr, , seq] of data.calls[toIdx]) {
      if (!runs(tripIdx, ymd)) continue;
      const list = stops[tripIdx];
      const at = list.findIndex(([s]) => s === toIdx);
      for (let i = 0; i < at; i++) {
        const [s, , dep] = list[i];
        const leg = { tripIdx, number: data.trips[tripIdx][0], from: s, to: toIdx, dep: serviceTimeToEpoch(ymd, dep), arr: serviceTimeToEpoch(ymd, arr) };
        if (s === fromIdx) direct.push(leg);
        else if (maxChanges > 0) {
          if (!intoDest.has(s)) intoDest.set(s, []);
          intoDest.get(s).push(leg);
        }
      }
    }
  }
  for (const leg of direct) candidates.push({ dep: leg.dep, arr: leg.arr, legs: [leg] });

  if (maxChanges > 0) {
    for (const list of intoDest.values()) list.sort((a, b) => a.dep - b.dep);
    for (const ymd of days) {
      for (const [tripIdx, , dep] of data.calls[fromIdx]) {
        if (!runs(tripIdx, ymd)) continue;
        const list = stops[tripIdx];
        const at = list.findIndex(([s]) => s === fromIdx);
        for (let i = at + 1; i < list.length; i++) {
          const [hub, hubArr] = list[i];
          if (hub === toIdx) break;
          const options = intoDest.get(hub);
          if (!options) continue;
          const first = { tripIdx, number: data.trips[tripIdx][0], from: fromIdx, to: hub, dep: serviceTimeToEpoch(ymd, dep), arr: serviceTimeToEpoch(ymd, hubArr) };
          let best = null;
          for (const second of options) {
            if (second.dep < first.arr + MIN_TRANSFER_MS) continue;
            if (second.dep > first.arr + MAX_WAIT_MS) break;
            if (second.tripIdx === tripIdx) continue;
            if (!best || second.arr < best.arr) best = second;
          }
          if (best) candidates.push({ dep: first.dep, arr: best.arr, legs: [first, best], wait: best.dep - first.arr });
        }
      }
    }
  }

  const inWindow = candidates.filter((c) => (arriveBy == null ? c.dep >= nowMs - 30 * 1000 : c.arr <= arriveBy && c.dep >= nowMs - 30 * 1000));

  // Every direct train is listed. A journey with a change is dropped when another journey leaves later and arrives earlier.
  const best = [];
  for (const c of inWindow) {
    if (c.legs.length === 1) { best.push(c); continue; }
    const beaten = inWindow.some((o) => o !== c && o.dep >= c.dep && o.arr <= c.arr &&
      (o.dep > c.dep || o.arr < c.arr || o.legs.length < c.legs.length));
    if (!beaten) best.push(c);
  }
  // The same two trains can connect at several stations; keep the connection with the most time to change.
  const byTrains = new Map();
  for (const c of best) {
    const key = c.legs.map((l) => l.tripIdx).join('>') + '@' + c.dep;
    const prev = byTrains.get(key);
    if (!prev || (c.wait ?? 0) > (prev.wait ?? 0)) byTrains.set(key, c);
  }
  const unique = [...byTrains.values()];

  if (arriveBy == null) {
    unique.sort((a, b) => a.arr - b.arr || a.dep - b.dep);
    return unique.slice(0, limit);
  }
  unique.sort((a, b) => b.arr - a.arr || b.dep - a.dep);
  return unique.slice(0, limit);
}
