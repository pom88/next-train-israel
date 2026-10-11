#!/usr/bin/env node
// Builds public/data/timetable.json from the Ministry of Transport GTFS feed (Israel Railways only).
// Usage: node scripts/build-data.mjs [--zip path/to/gtfs.zip]
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const GTFS_URL = 'https://gtfs.mot.gov.il/gtfsfiles/israel-public-transportation.zip';
const RAIL_AGENCY_ID = '2';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = resolve(root, 'public/data/timetable.json');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function* readTable(zip, name) {
  const proc = spawn('unzip', ['-p', zip, name], { stdio: ['ignore', 'pipe', 'inherit'] });
  const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
  let header = null;
  for await (const raw of rl) {
    const line = raw.replace(/^﻿/, '');
    if (!line) continue;
    const cells = parseCsvLine(line);
    if (!header) { header = cells; continue; }
    const row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i];
    yield row;
  }
  const code = await new Promise((r) => proc.on('close', r));
  if (code !== 0) throw new Error(`unzip failed for ${name} (exit ${code})`);
}

function toSeconds(t) {
  const [h, m, s] = t.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

async function exists(p) { try { await access(p); return true; } catch { return false; } }

async function getZip() {
  const i = process.argv.indexOf('--zip');
  if (i !== -1) return resolve(process.argv[i + 1]);
  const dest = resolve(tmpdir(), 'israel-gtfs.zip');
  console.log(`Downloading ${GTFS_URL}`);
  const res = await fetch(GTFS_URL);
  if (!res.ok) throw new Error(`GTFS download failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  return dest;
}

const zip = await getZip();
if (!(await exists(zip))) throw new Error(`Zip not found: ${zip}`);

// 1. Rail routes -> trips
const railRoutes = new Set();
for await (const r of readTable(zip, 'routes.txt')) if (r.agency_id === RAIL_AGENCY_ID) railRoutes.add(r.route_id);

const trips = new Map(); // trip_id -> { serviceId, number }
for await (const r of readTable(zip, 'trips.txt')) {
  if (railRoutes.has(r.route_id)) trips.set(r.trip_id, { serviceId: r.service_id, number: r.trip_headsign });
}
console.log(`rail routes: ${railRoutes.size}, trips: ${trips.size}`);

// 2. Stop times for rail trips
const tripCalls = new Map(); // trip_id -> [{seq, stopId, arr, dep}]
let skippedNoService = 0;
for await (const r of readTable(zip, 'stop_times.txt')) {
  if (!trips.has(r.trip_id)) continue;
  if (r.pickup_type === '1' && r.drop_off_type === '1') { skippedNoService++; continue; }
  let list = tripCalls.get(r.trip_id);
  if (!list) tripCalls.set(r.trip_id, (list = []));
  list.push({ seq: Number(r.stop_sequence), stopId: r.stop_id, arr: toSeconds(r.arrival_time), dep: toSeconds(r.departure_time) });
}
console.log(`trips with calls: ${tripCalls.size}, non-stopping rows skipped: ${skippedNoService}`);

// 3. Stops
const usedStopIds = new Set();
for (const list of tripCalls.values()) for (const c of list) usedStopIds.add(c.stopId);
const stopRows = new Map();
for await (const r of readTable(zip, 'stops.txt')) if (usedStopIds.has(r.stop_id)) stopRows.set(r.stop_id, r);

// 4. English names (translations.txt: trans_id = Hebrew text, lang, translation)
const hebrewNames = new Set([...stopRows.values()].map((s) => s.stop_name));
const english = new Map();
for await (const r of readTable(zip, 'translations.txt')) {
  if (r.lang === 'EN' && hebrewNames.has(r.trans_id)) english.set(r.trans_id, r.translation);
}

// 5. Calendar
const serviceIds = new Set([...trips.values()].map((t) => t.serviceId));
const services = {};
for await (const r of readTable(zip, 'calendar.txt')) {
  if (!serviceIds.has(r.service_id)) continue;
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => r[d]).join('');
  services[r.service_id] = [days, r.start_date, r.end_date];
}
const missingServices = [...serviceIds].filter((s) => !services[s]);
if (missingServices.length) console.warn(`warning: ${missingServices.length} services missing from calendar.txt (their trips are dropped)`);

// The feed's English names are inconsistent (e.g. "Be'er Sheba") and some are missing, so the common
// spellings below take priority. Keyed by station code (stop_code).
const ENGLISH = {
  17000: "Modi'in Outskirts", 17002: "Modi'in Center", 17004: 'Haifa Kiryat Haim', 17008: 'Haifa Mifrats Central (Coast line)',
  17010: 'Haifa Hutsot HaMifrats', 17012: 'Acre', 17014: 'Nahariya', 17016: 'Haifa Center HaShmona', 17018: 'Haifa Bat Galim',
  17020: 'Haifa Hof HaCarmel', 17022: 'Atlit', 17024: 'Binyamina', 17026: 'Caesarea–Pardes Hanna', 17028: 'Hadera West',
  17030: 'Netanya', 17032: 'Beit Yehoshua', 17034: 'Herzliya', 17036: 'Tel Aviv University', 17038: 'Tel Aviv Savidor Center',
  17040: 'Bnei Brak', 17042: 'Kiryat Arie', 17044: 'Segula', 17046: 'Tel Aviv HaShalom', 17048: 'Holon Junction',
  17050: 'Holon Wolfson', 17052: 'Bat Yam Yoseftal', 17054: 'Bat Yam Komemiyut', 17056: 'Kfar Chabad', 17058: 'Lod',
  17060: 'Ramla', 17062: 'Lod Ganei Aviv', 17064: 'Rehovot', 17066: "Be'er Ya'akov", 17068: 'Yavne East', 17070: 'Ashdod Ad Halom',
  17072: 'Ashkelon', 17074: 'Beit Shemesh', 17080: 'Kiryat Gat', 17082: 'Beer Sheva North', 17084: 'Beer Sheva Center',
  17086: 'Dimona', 17088: 'Lehavim–Rahat', 17090: 'Ben Gurion Airport', 17092: 'Kfar Saba', 17094: 'Rosh HaAyin North',
  17096: 'Yavne West', 17098: 'Rishonim', 17100: 'Hod HaSharon', 17102: 'Rishon LeZion Moshe Dayan', 17104: 'Tel Aviv HaHagana',
  17106: 'Sderot', 17108: 'Netivot', 17109: 'Ofakim', 17110: 'Kfar Yehoshua', 17111: "Beit She'an", 17112: 'Afula',
  17113: 'Kfar Barukh', 17114: 'Netanya Sapir', 17115: 'Karmiel', 17116: 'Ahihud', 17117: 'Kiryat Motzkin',
  17118: 'Jerusalem Yitzhak Navon', 17119: 'Kiryat Malakhi', 17120: 'Mazkeret Batya', 17121: "Ra'anana West",
  17122: "Ra'anana South", 17123: 'Haifa Mifrats Central', 2643: 'Tira–Kochav Yair', 2652: 'Tayibe–Shomron', 2653: 'Hadera East',
};

// 6. Assemble
const stationList = [...stopRows.values()]
  .map((s) => ({ stopId: s.stop_id, id: s.stop_code, he: s.stop_name, en: ENGLISH[s.stop_code] || english.get(s.stop_name) || s.stop_name, lat: Number(s.stop_lat), lon: Number(s.stop_lon) }))
  .sort((a, b) => a.he.localeCompare(b.he, 'he'));
const stationIndex = new Map(stationList.map((s, i) => [s.stopId, i]));

const outTrips = [];
const calls = stationList.map(() => []);
for (const [tripId, list] of tripCalls) {
  const trip = trips.get(tripId);
  if (!services[trip.serviceId]) continue;
  list.sort((a, b) => a.seq - b.seq);
  if (list.length < 2) continue;
  const tripIdx = outTrips.length;
  outTrips.push([trip.number, trip.serviceId, stationIndex.get(list[0].stopId), stationIndex.get(list[list.length - 1].stopId)]);
  for (const c of list) calls[stationIndex.get(c.stopId)].push([tripIdx, c.arr, c.dep, c.seq]);
}
for (const c of calls) c.sort((a, b) => a[1] - b[1]);

const dates = Object.values(services);
const validFrom = dates.map((d) => d[1]).sort()[0];
const validTo = dates.map((d) => d[2]).sort().at(-1);

const out = {
  v: 1,
  generatedAt: new Date().toISOString(),
  validFrom,
  validTo,
  source: 'Israel Ministry of Transport GTFS (gtfs.mot.gov.il), Israel Railways',
  stations: stationList.map(({ stopId, ...s }) => s),
  services,
  trips: outTrips,
  calls,
};

await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify(out));
console.log(`wrote ${outFile}: ${stationList.length} stations, ${outTrips.length} trips, ${calls.reduce((n, c) => n + c.length, 0)} calls, valid ${validFrom}..${validTo}`);
