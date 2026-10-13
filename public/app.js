import { upcoming, plan, dataStatus, nearestStation, ymdOf, addDays, serviceTimeToEpoch, TZ } from './schedule.js';

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
    to: (x) => `To ${x}`, from: (x) => `From ${x}`, startsHere: 'Starts here', endsHere: 'Ends here',
    none: 'No trains found in the coming days.',
    basis: 'Timetable times · <b>no live delays</b>',
    infoTitle: 'About these times',
    infoBody: 'Times come from the official Ministry of Transport timetable. There is no reliable public source of live train positions, so delays and cancellations are NOT shown. Treat every time as the scheduled time, and check the station board for last-minute changes.',
    expired: (d) => `This timetable ended on ${d}. Open the app with an internet connection to get the latest one.`,
    ending: (d) => `This timetable runs out on ${d}. Open the app online soon to update it.`,
    loadFail: 'Could not load the timetable. Check your connection and reload.',
    valid: (d) => `Timetable valid through ${d}`,
    source: 'Source: Israel Ministry of Transport',
    plan: 'Plan', planTitle: 'Journey planner', fromLabel: 'From', toLabel: 'To', swap: 'Swap stations',
    leaveNow: 'Leave now', arriveBy: 'Arrive by', planHead: 'Journeys, sorted by arrival',
    arrives: 'Arrives', leaves: 'Leaves', direct: 'Direct', changes: (n) => (n === 1 ? '1 change' : `${n} changes`),
    changeAt: (x, m) => `Change at ${x} · ${m} min`,
    pickStation: 'Choose station', pickDest: 'Choose your destination to see trains.',
    sameStation: 'Choose two different stations.',
    noJourneys: 'No journeys found in the coming days.',
    noJourneysBy: 'No journey arrives by then. Try a later time.',
    recent: 'Recent', allStations: 'All stations', remove: (x) => `Remove ${x} from recent`,
    planNote: 'Direct trains or one change. Timetable times only.',
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
    to: (x) => `ל${x}`, from: (x) => `מ${x}`, startsHere: 'מתחילה כאן', endsHere: 'מסיימת כאן',
    none: 'לא נמצאו רכבות בימים הקרובים.',
    basis: 'זמני לוח זמנים · <b>אין עיכובים בזמן אמת</b>',
    infoTitle: 'על הזמנים שמוצגים',
    infoBody: 'הזמנים לקוחים מלוח הזמנים הרשמי של משרד התחבורה. אין מקור ציבורי אמין למיקום רכבות בזמן אמת, ולכן עיכובים וביטולים אינם מוצגים. יש להתייחס לכל שעה כשעה המתוכננת, ולבדוק בלוח התחנה אם יש שינויים ברגע האחרון.',
    expired: (d) => `לוח הזמנים הזה הסתיים ב-${d}. פתחו את האפליקציה עם חיבור לאינטרנט כדי לקבל עדכני.`,
    ending: (d) => `לוח הזמנים הזה מסתיים ב-${d}. פתחו את האפליקציה בחיבור לאינטרנט בקרוב כדי לעדכן.`,
    loadFail: 'לא הצלחנו לטעון את לוח הזמנים. בדקו את החיבור ורעננו.',
    valid: (d) => `לוח הזמנים תקף עד ${d}`,
    source: 'מקור: משרד התחבורה',
    plan: 'תכנון', planTitle: 'תכנון מסלול', fromLabel: 'מוצא', toLabel: 'יעד', swap: 'החלפת תחנות',
    leaveNow: 'יוצאים עכשיו', arriveBy: 'להגיע עד', planHead: 'מסלולים, לפי שעת הגעה',
    arrives: 'מגיעה', leaves: 'יציאה', direct: 'ישירה', changes: (n) => (n === 1 ? 'החלפה אחת' : `${n} החלפות`),
    changeAt: (x, m) => `החלפה ב${x} · ${m} ד׳`,
    pickStation: 'בחירת תחנה', pickDest: 'בחרו יעד כדי לראות רכבות.',
    sameStation: 'בחרו שתי תחנות שונות.',
    noJourneys: 'לא נמצאו מסלולים בימים הקרובים.',
    noJourneysBy: 'אין מסלול שמגיע עד אז. נסו שעה מאוחרת יותר.',
    recent: 'אחרונות', allStations: 'כל התחנות', remove: (x) => `הסרת ${x} מהאחרונות`,
    planNote: 'רכבות ישירות או החלפה אחת. זמני לוח זמנים בלבד.',
  },
};

const $ = (id) => document.getElementById(id);
const store = {
  get: (k) => { try { return localStorage.getItem('nti.' + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem('nti.' + k, v); } catch { /* private mode */ } },
};

let data = null;
let stationIdx = -1;
let mode = ['departures', 'plan'].includes(store.get('mode')) ? store.get('mode') : 'arrivals';
let planFrom = -1;
let planTo = -1;
let planMode = store.get('planMode') === 'arrive' ? 'arrive' : 'now';
let pickerTarget = 'main';
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
  const name = (i) => stationName(data.stations[i]);
  if (mode === 'departures') {
    return { main: t().to(name(tr.destIdx)), tag: tr.startsHere ? t().startsHere : '' };
  }
  if (tr.startsHere) return { main: t().startsHere, tag: t().to(name(tr.destIdx)) };
  return { main: t().from(name(tr.originIdx)), tag: tr.endsHere ? t().endsHere : '' };
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

const durationText = (ms) => {
  const mins = Math.max(1, Math.round(ms / 60000));
  return mins < 60 ? `${mins} ${t().min}` : t().hm(Math.floor(mins / 60), mins % 60);
};

function arriveTarget(now) {
  const [h, m] = ($('arriveTime').value || '00:00').split(':').map(Number);
  const ymd = ymdOf(now);
  const at = serviceTimeToEpoch(ymd, h * 3600 + m * 60);
  return at > now ? at : serviceTimeToEpoch(addDays(ymd, 1), h * 3600 + m * 60);
}

let planCache = { key: '', list: [] };

function renderPlan(now) {
  const from = data.stations[planFrom];
  const to = data.stations[planTo];
  $('fromName').textContent = from ? stationName(from) : t().pickStation;
  $('toName').textContent = to ? stationName(to) : t().pickStation;
  $('arriveRow').hidden = planMode !== 'arrive';
  document.querySelectorAll('#planModeTabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.pm === planMode)));
  const ol = $('journeys');
  const msg = $('planMsg');
  ol.replaceChildren();
  msg.hidden = true;
  if (!from || !to) { msg.textContent = t().pickDest; msg.hidden = false; return; }
  if (planFrom === planTo) { msg.textContent = t().sameStation; msg.hidden = false; return; }

  const target = planMode === 'arrive' ? arriveTarget(now) : null;
  $('arriveDay').textContent = target ? dayLabel(target, now) : '';
  const key = [planFrom, planTo, target, Math.floor(now / 60000)].join();
  if (planCache.key !== key) planCache = { key, list: plan(data, planFrom, planTo, now, { arriveBy: target, limit: 8 }) };
  const list = planCache.list;
  if (!list.length) { msg.textContent = target ? t().noJourneysBy : t().noJourneys; msg.hidden = false; return; }

  list.forEach((j, i) => {
    const li = el('li', i === 0 ? 'row journey best' : 'row journey');
    const arrive = el('div', 'arrive');
    arrive.append(el('div', 'lbl', t().arrives), el('div', 't', clock(j.arr)));
    const arrDay = dayLabel(j.arr, now);
    if (arrDay) arrive.append(el('div', 'day', arrDay));
    const meta = el('div', 'meta');
    meta.append(el('div', 'to', `${t().leaves} ${clock(j.dep)}`));
    meta.append(el('div', 'tag', `${durationText(j.arr - j.dep)} · ${j.legs.length === 1 ? t().direct : t().changes(j.legs.length - 1)}`));
    if (j.legs.length > 1) {
      meta.append(el('div', 'tag', t().changeAt(stationName(data.stations[j.legs[0].to]), Math.round((j.legs[1].dep - j.legs[0].arr) / 60000))));
    }
    const inn = el('div', 'in', untilText(j.dep, now));
    const depDay = dayLabel(j.dep, now);
    if (depDay) inn.append(el('span', 'day', depDay));
    li.append(arrive, meta, inn);
    ol.append(li);
  });
}

function render() {
  if (!data) return;
  const now = Date.now();
  const planning = mode === 'plan';
  $('board').hidden = planning;
  $('planner').hidden = !planning;
  $('stationBtn').hidden = planning;
  $('planTitle').hidden = !planning;

  const s = data.stations[stationIdx];
  $('stationName').textContent = s ? stationName(s) : '…';
  document.title = s ? `${stationName(s)} · Next Train Israel` : 'Next Train Israel';

  if (planning) renderPlan(now);
  else {
    const list = s ? upcoming(data, stationIdx, now, { mode, limit: 7 }) : [];
    renderHero(s ? list[0] : null, now);
    $('hero').hidden = !s;
    $('list').parentElement.hidden = list.length < 2;
    renderList(list.slice(1), now);
  }

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
  document.querySelectorAll('[data-i18n-aria]').forEach((n) => { n.setAttribute('aria-label', t()[n.dataset.i18nAria]); });
  document.querySelectorAll('[data-i18n-ph]').forEach((n) => { n.placeholder = t()[n.dataset.i18nPh]; });
  $('langBtn').textContent = lang === 'he' ? 'EN' : 'עב';
  document.querySelectorAll('#modeTabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  render();
  if ($('picker').open) renderStationList();
}

function selectStation(idx) {
  stationIdx = idx;
  store.set('station', data.stations[idx].id);
  render();
}

function recentIds() {
  try {
    const ids = JSON.parse(store.get('recent') || '[]');
    return Array.isArray(ids) ? ids.filter((id) => data.stations.some((s) => s.id === id)) : [];
  } catch { return []; }
}
const saveRecent = (ids) => store.set('recent', JSON.stringify(ids.slice(0, 5)));

function choose(idx) {
  const id = data.stations[idx].id;
  saveRecent([id, ...recentIds().filter((x) => x !== id)]);
  if (pickerTarget === 'from') { planFrom = idx; store.set('planFrom', id); }
  else if (pickerTarget === 'to') { planTo = idx; store.set('planTo', id); }
  else { selectStation(idx); return; }
  render();
}

function currentPickIdx() {
  return pickerTarget === 'from' ? planFrom : pickerTarget === 'to' ? planTo : stationIdx;
}

function renderStationList() {
  const q = norm($('search').value);
  const ul = $('stationList');
  ul.replaceChildren();
  const current = currentPickIdx();
  const addStation = (i, removable) => {
    const s = data.stations[i];
    const li = el('li', removable ? 'recent-item' : '');
    const b = el('button');
    b.type = 'button';
    if (i === current) b.setAttribute('aria-current', 'true');
    b.append(el('span', '', stationName(s)), el('span', 'alt', otherName(s)));
    b.addEventListener('click', () => { choose(i); $('picker').close(); });
    li.append(b);
    if (removable) {
      const x = el('button', 'x', '✕');
      x.type = 'button';
      x.setAttribute('aria-label', t().remove(stationName(s)));
      x.addEventListener('click', () => { saveRecent(recentIds().filter((id) => id !== s.id)); renderStationList(); });
      li.append(x);
    }
    ul.append(li);
  };

  const recents = q ? [] : recentIds().map((id) => data.stations.findIndex((s) => s.id === id));
  if (recents.length) {
    ul.append(el('li', 'group', t().recent));
    recents.forEach((i) => addStation(i, true));
    ul.append(el('li', 'group', t().allStations));
  }
  data.stations
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !q || norm(s.he).includes(q) || norm(s.en).includes(q))
    .sort((a, b) => stationName(a.s).localeCompare(stationName(b.s), lang))
    .forEach(({ i }) => addStation(i, false));
}

function openPicker(target = 'main') {
  pickerTarget = target;
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
      choose(index);
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
  $('stationBtn').addEventListener('click', () => data && openPicker('main'));
  $('fromBtn').addEventListener('click', () => data && openPicker('from'));
  $('toBtn').addEventListener('click', () => data && openPicker('to'));
  $('swapBtn').addEventListener('click', () => {
    [planFrom, planTo] = [planTo, planFrom];
    store.set('planFrom', planFrom >= 0 ? data.stations[planFrom].id : '');
    store.set('planTo', planTo >= 0 ? data.stations[planTo].id : '');
    render();
  });
  document.querySelectorAll('#planModeTabs button').forEach((b) => b.addEventListener('click', () => {
    planMode = b.dataset.pm;
    store.set('planMode', planMode);
    render();
  }));
  $('arriveTime').addEventListener('change', () => { store.set('arriveTime', $('arriveTime').value); render(); });
  $('arriveTime').value = store.get('arriveTime') || clock(Date.now() + 60 * 60 * 1000);
  $('langBtn').addEventListener('click', () => { lang = lang === 'he' ? 'en' : 'he'; store.set('lang', lang); applyLanguage(); });
  $('basis').addEventListener('click', () => $('info').showModal());
  $('search').addEventListener('input', renderStationList);
  $('nearBtn').addEventListener('click', locate);
  document.querySelectorAll('#modeTabs button').forEach((b) => b.addEventListener('click', () => {
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
  const byId = (id) => data.stations.findIndex((s) => s.id === id);
  if (idx >= 0) {
    stationIdx = idx;
    if (!recentIds().length) saveRecent([saved]);
  }
  planFrom = byId(store.get('planFrom'));
  planTo = byId(store.get('planTo'));
  if (planFrom < 0) planFrom = stationIdx;
  applyLanguage();
  if (idx < 0 && mode !== 'plan') openPicker('main');
}

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
