import { upcoming, dataStatus, nearestStation, ymdOf, TZ } from './schedule.js';

const STRINGS = {
  en: {
    station: 'Station', arrivals: 'Arriving', departures: 'Departing',
    nextArr: 'Next train arriving', nextDep: 'Next train departing',
    following: 'Following trains', chooseStation: 'Choose station', close: 'Close',
    search: 'Search station…', nearest: 'Use my location', locating: 'Finding your location…',
    locDenied: 'Location unavailable. Pick a station from the list.',
    locFar: (km) => `Nearest station is about ${Math.round(km)} km away.`,
    min: 'min', now: 'Now', today: 'Today', tomorrow: 'Tomorrow',
    hm: (h, m) => `${h}h ${String(m).padStart(2, '0')}m`,
    to: (x) => `To ${x}`, startsHere: 'Starts here', endsHere: 'Ends here',
    none: 'No trains found in the coming days.',
    basis: 'Timetable times · <b>no live delays</b>',
    infoTitle: 'About these times',
    infoBody: 'Times come from the official Ministry of Transport timetable. There is no reliable public source of live train positions, so delays and cancellations are NOT shown. Treat every time as the scheduled time, and check the station board for last-minute changes.',
    expired: (d) => `This timetable ended on ${d}. Open the app with an internet connection to get the latest one.`,
    ending: (d) => `This timetable runs out on ${d}. Open the app online soon to update it.`,
    loadFail: 'Could not load the timetable. Check your connection and reload.',
    valid: (d) => `Timetable valid through ${d}`,
    source: 'Source: Israel Ministry of Transport',
  },
  he: {
    station: 'תחנה', arrivals: 'מגיעה', departures: 'יוצאת',
    nextArr: 'הרכבת הבאה מגיעה', nextDep: 'הרכבת הבאה יוצאת',
    following: 'הרכבות הבאות', chooseStation: 'בחירת תחנה', close: 'סגירה',
    search: 'חיפוש תחנה…', nearest: 'התחנה הקרובה אליי', locating: 'מאתר מיקום…',
    locDenied: 'לא ניתן לאתר מיקום. בחרו תחנה מהרשימה.',
    locFar: (km) => `התחנה הקרובה ביותר רחוקה כ-${Math.round(km)} ק״מ.`,
    min: 'דק׳', now: 'עכשיו', today: 'היום', tomorrow: 'מחר',
    hm: (h, m) => `${h} ש׳ ${String(m).padStart(2, '0')} ד׳`,
    to: (x) => `ל${x}`, startsHere: 'מתחילה כאן', endsHere: 'מסיימת כאן',
    none: 'לא נמצאו רכבות בימים הקרובים.',
    basis: 'זמני לוח זמנים · <b>אין עיכובים בזמן אמת</b>',
    infoTitle: 'על הזמנים שמוצגים',
    infoBody: 'הזמנים לקוחים מלוח הזמנים הרשמי של משרד התחבורה. אין מקור ציבורי אמין למיקום רכבות בזמן אמת, ולכן עיכובים וביטולים אינם מוצגים. יש להתייחס לכל שעה כשעה המתוכננת, ולבדוק בלוח התחנה אם יש שינויים ברגע האחרון.',
    expired: (d) => `לוח הזמנים הזה הסתיים ב-${d}. פתחו את האפליקציה עם חיבור לאינטרנט כדי לקבל עדכני.`,
    ending: (d) => `לוח הזמנים הזה מסתיים ב-${d}. פתחו את האפליקציה בחיבור לאינטרנט בקרוב כדי לעדכן.`,
    loadFail: 'לא הצלחנו לטעון את לוח הזמנים. בדקו את החיבור ורעננו.',
    valid: (d) => `לוח הזמנים תקף עד ${d}`,
    source: 'מקור: משרד התחבורה',
  },
};

const $ = (id) => document.getElementById(id);
const store = {
  get: (k) => { try { return localStorage.getItem('nti.' + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem('nti.' + k, v); } catch { /* private mode */ } },
};

let data = null;
let stationIdx = -1;
let mode = store.get('mode') === 'departures' ? 'departures' : 'arrivals';
let lang = store.get('lang') || ((navigator.language || '').toLowerCase().startsWith('he') ? 'he' : 'en');
const t = () => STRINGS[lang];

const clock = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(ms);
const locale = () => (lang === 'he' ? 'he-IL' : 'en-GB');
const shortDate = (ms) => new Intl.DateTimeFormat(locale(), { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(ms);
const ymdStr = (ymd) => {
  const s = String(ymd);
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
};
const dayNumber = (ymd) => Date.UTC(Math.floor(ymd / 10000), Math.floor(ymd / 100) % 100 - 1, ymd % 100) / 86400000;
const norm = (s) => s.toLowerCase().replace(/['’`"״׳\-–/.]/g, '').replace(/\s+/g, ' ').trim();
const stationName = (s) => (lang === 'he' ? s.he : s.en);
const otherName = (s) => (lang === 'he' ? s.en : s.he);

function dayLabel(at, now) {
  const diff = dayNumber(ymdOf(at)) - dayNumber(ymdOf(now));
  if (diff <= 0) return '';
  return diff === 1 ? t().tomorrow : shortDate(at);
}

function untilText(at, now) {
  const mins = Math.ceil((at - now) / 60000);
  if (mins <= 0) return t().now;
  if (mins < 60) return `${mins} ${t().min}`;
  if (mins < 180) return t().hm(Math.floor(mins / 60), mins % 60);
  return '';
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function describe(tr) {
  if (tr.endsHere) return { main: t().endsHere, tag: '' };
  return { main: t().to(stationName(data.stations[tr.destIdx])), tag: tr.startsHere ? t().startsHere : '' };
}

function renderHero(first, now) {
  const hero = $('hero');
  hero.replaceChildren();
  if (!first) {
    hero.append(el('div', 'hero-empty', t().none));
    return;
  }
  hero.append(el('div', 'hero-label', mode === 'arrivals' ? t().nextArr : t().nextDep));
  const mins = Math.ceil((first.at - now) / 60000);
  const label = dayLabel(first.at, now);
  const clockInHero = !(mins <= 0 || mins < 60 || (mins < 180 && label === ''));
  if (mins <= 0) {
    hero.append(el('div', 'hero-num small', t().now));
  } else if (mins < 60) {
    hero.append(el('div', 'hero-num', String(mins)), el('div', 'hero-unit', t().min));
  } else if (!clockInHero) {
    hero.append(el('div', 'hero-num small', t().hm(Math.floor(mins / 60), mins % 60)));
  } else {
    hero.append(el('div', 'hero-num small', clock(first.at)));
  }
  const timeLine = clockInHero ? label : label ? `${label} · ${clock(first.at)}` : clock(first.at);
  if (timeLine) hero.append(el('div', 'hero-time', timeLine));
  const d = describe(first);
  hero.append(el('div', 'hero-sub', d.tag ? `${d.main} · ${d.tag}` : d.main));
}

function renderList(rest, now) {
  const ol = $('list');
  ol.replaceChildren();
  for (const tr of rest) {
    const li = el('li', 'row');
    const time = el('div', 't', clock(tr.at));
    const meta = el('div', 'meta');
    const d = describe(tr);
    meta.append(el('div', 'to', d.main));
    if (d.tag) meta.append(el('div', 'tag', d.tag));
    const inn = el('div', 'in', untilText(tr.at, now));
    const label = dayLabel(tr.at, now);
    if (label) inn.append(el('span', 'day', label));
    li.append(time, meta, inn);
    ol.append(li);
  }
}

function render() {
  if (!data) return;
  const now = Date.now();
  const s = data.stations[stationIdx];
  $('stationName').textContent = s ? stationName(s) : '…';
  document.title = s ? `${stationName(s)} · Next Train Israel` : 'Next Train Israel';

  const list = s ? upcoming(data, stationIdx, now, { mode, limit: 7 }) : [];
  renderHero(s ? list[0] : null, now);
  $('hero').hidden = !s;
  $('list').parentElement.hidden = list.length < 2;
  renderList(list.slice(1), now);

  $('basis').innerHTML = t().basis;
  const status = dataStatus(data, now);
  const notice = $('notice');
  notice.hidden = status === 'ok';
  if (status === 'expired') notice.textContent = t().expired(ymdStr(data.validTo));
  if (status === 'ending') notice.textContent = t().ending(ymdStr(data.validTo));
  $('foot').textContent = `${t().valid(ymdStr(data.validTo))} · ${t().source}`;
}

function applyLanguage() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t()[n.dataset.i18n]; });
  document.querySelectorAll('[data-i18n-ph]').forEach((n) => { n.placeholder = t()[n.dataset.i18nPh]; });
  $('langBtn').textContent = lang === 'he' ? 'EN' : 'עב';
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  render();
  if ($('picker').open) renderStationList();
}

function selectStation(idx) {
  stationIdx = idx;
  store.set('station', data.stations[idx].id);
  render();
}

function renderStationList() {
  const q = norm($('search').value);
  const ul = $('stationList');
  ul.replaceChildren();
  const items = data.stations
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !q || norm(s.he).includes(q) || norm(s.en).includes(q))
    .sort((a, b) => stationName(a.s).localeCompare(stationName(b.s), lang));
  for (const { s, i } of items) {
    const li = el('li');
    const b = el('button');
    b.type = 'button';
    if (i === stationIdx) b.setAttribute('aria-current', 'true');
    b.append(el('span', '', stationName(s)), el('span', 'alt', otherName(s)));
    b.addEventListener('click', () => { selectStation(i); $('picker').close(); });
    li.append(b);
    ul.append(li);
  }
}

function openPicker() {
  $('search').value = '';
  $('nearMsg').hidden = true;
  renderStationList();
  $('picker').showModal();
}

function locate() {
  const msg = $('nearMsg');
  msg.hidden = false;
  msg.textContent = t().locating;
  if (!navigator.geolocation) { msg.textContent = t().locDenied; return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { index, km } = nearestStation(data, pos.coords.latitude, pos.coords.longitude);
      selectStation(index);
      if (km > 40) { msg.textContent = t().locFar(km); renderStationList(); } else $('picker').close();
    },
    () => { msg.textContent = t().locDenied; },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
  );
}

async function loadData() {
  const res = await fetch('data/timetable.json');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function showLoadError() {
  const hero = $('hero');
  hero.replaceChildren(el('div', 'hero-empty', t().loadFail));
  const retry = el('button', 'pill', 'Reload / רענון');
  retry.addEventListener('click', () => location.reload());
  hero.append(retry);
}

async function init() {
  applyLanguage();
  $('stationBtn').addEventListener('click', () => data && openPicker());
  $('langBtn').addEventListener('click', () => { lang = lang === 'he' ? 'en' : 'he'; store.set('lang', lang); applyLanguage(); });
  $('basis').addEventListener('click', () => $('info').showModal());
  $('search').addEventListener('input', renderStationList);
  $('nearBtn').addEventListener('click', locate);
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    store.set('mode', mode);
    applyLanguage();
  }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  setInterval(render, 10000);

  try {
    data = await loadData();
  } catch {
    showLoadError();
    return;
  }
  const saved = store.get('station');
  const idx = data.stations.findIndex((s) => s.id === saved);
  if (idx >= 0) { stationIdx = idx; applyLanguage(); } else { applyLanguage(); openPicker(); }
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
