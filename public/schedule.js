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

function addDays(ymd, delta) {
  const y = Math.floor(ymd / 10000), m = Math.floor(ymd / 100) % 100, d = ymd % 100;
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
}

function weekday(ymd) {
  const y = Math.floor(ymd / 10000), m = Math.floor(ymd / 100) % 100, d = ymd % 100;
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday, same as the calendar string order
}

function serviceRunsOn(service, ymd) {
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
