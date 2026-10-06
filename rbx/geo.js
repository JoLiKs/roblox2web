'use strict';
// Geolocation + locale for LocalizationService in the browser emulator.
//  - GetCountryRegionForPlayerAsync: real IP-geolocation through key-less CORS services, tried in order
//    (Cloudflare cdn-cgi/trace -> get.geojs.io -> api.country.is -> ipapi.co) within a ~2 s budget;
//    if all fail the call errors like on Roblox (games wrap it in pcall and fall back to LocaleId).
//  - Player.LocaleId / LocalizationService.RobloxLocaleId: from navigator.language.
//  - URL overrides: ?country=RU (no network lookup), ?lang=en (LocaleId=en-us and no lookup unless ?country is given),
//    ?geo=0 (no network lookup).
// Pure module: fetch / navigator / location are injected, so it is unit-testable in node.

const RU_COUNTRIES = ['RU', 'BY', 'KZ', 'KG', 'AM', 'AZ', 'MD', 'TJ', 'UZ', 'TM'];

const SERVICES = [
  { name: 'cloudflare', url: 'https://www.cloudflare.com/cdn-cgi/trace', parse: (t) => { const m = /^loc=([A-Za-z]{2})\s*$/m.exec(t); return m ? m[1] : null; } },
  { name: 'geojs', url: 'https://get.geojs.io/v1/ip/country', parse: (t) => t.trim() },
  { name: 'country.is', url: 'https://api.country.is/', parse: (t) => JSON.parse(t).country },
  { name: 'ipapi.co', url: 'https://ipapi.co/country/', parse: (t) => t.trim() },
];

function validCountry(c) {
  c = String(c == null ? '' : c).trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) && c !== 'XX' && c !== 'T1' ? c : null; // XX = unknown, T1 = Tor (Cloudflare)
}

// 'ru-RU' -> 'ru-ru', 'ru' -> 'ru-ru', 'en' -> 'en-us', 'pt_BR' -> 'pt-br'
function normLocale(s) {
  s = String(s || '').trim().replace(/_/g, '-').toLowerCase();
  if (!/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/.test(s)) return 'en-us';
  if (!s.includes('-')) return s === 'en' ? 'en-us' : s + '-' + s;
  return s;
}

// Same policy as the game (Locale.detect): ru for the RU list, UA only with a Russian locale, else en.
function langFor(country, localeId) {
  const ru = /^ru/.test(String(localeId || '').toLowerCase());
  if (!country) return ru ? 'ru' : 'en';
  if (RU_COUNTRIES.includes(country)) return 'ru';
  if (country === 'UA') return ru ? 'ru' : 'en';
  return 'en';
}

function param(search, k) {
  const m = new RegExp('[?&]' + k + '(=([^&]*))?').exec(search || '');
  return m ? (m[2] === undefined ? '1' : decodeURIComponent(m[2])) : null;
}

function create(opts) {
  opts = opts || {};
  const search = opts.search || '';
  const now = opts.now || (() => Date.now());
  const g = {
    status: 'pending', country: null, source: null, tried: [], listeners: [],
    budgetMs: opts.budgetMs || 2000, perServiceMs: opts.perServiceMs || 1200, deadline: 0,
    services: opts.services || SERVICES,
  };
  const forced = (param(search, 'lang') || '').toLowerCase();
  g.forcedLang = /^[a-z]{2}$/.test(forced) ? forced : null;
  g.localeId = g.forcedLang ? normLocale(g.forcedLang) : normLocale(opts.navigatorLanguage || 'en-US');
  const pc = validCountry(param(search, 'country'));
  const finish = (status, country, source) => {
    if (g.status !== 'pending') return;
    g.status = status; g.country = country; g.source = source;
    for (const fn of g.listeners.splice(0)) { try { fn(g); } catch (e) { /* listener errors are not fatal */ } }
  };
  g.onDone = (fn) => { if (g.status !== 'pending') fn(g); else g.listeners.push(fn); };
  g.lang = () => langFor(g.country, g.localeId);
  g.start = () => {
    if (g.started) return g.promise; g.started = true;
    if (pc) { finish('ok', pc, 'param'); return (g.promise = Promise.resolve(g)); }
    if (g.forcedLang || param(search, 'geo') === '0') { finish('skipped', null, g.forcedLang ? 'lang-param' : 'geo=0'); return (g.promise = Promise.resolve(g)); }
    const fetchFn = opts.fetch;
    if (typeof fetchFn !== 'function') { finish('fail', null, 'no-fetch'); return (g.promise = Promise.resolve(g)); }
    g.deadline = now() + g.budgetMs;
    g.promise = (async () => {
      for (const s of g.services) {
        const left = g.deadline - now();
        if (left <= 50) break;
        const ms = Math.min(g.perServiceMs, left);
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        let timer = null;
        const t0 = now();
        try {
          const res = await Promise.race([
            fetchFn(s.url, { signal: ctl ? ctl.signal : undefined, cache: 'no-store', credentials: 'omit' }),
            new Promise((_, rej) => { timer = setTimeout(() => { if (ctl) ctl.abort(); rej(new Error('timeout')); }, ms); }),
          ]);
          if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
          const c = validCountry(s.parse(await res.text()));
          g.tried.push({ name: s.name, ok: !!c, ms: now() - t0, country: c });
          if (c) { finish('ok', c, s.name); return g; }
        } catch (e) {
          g.tried.push({ name: s.name, ok: false, ms: now() - t0, error: String(e && e.message || e) });
        } finally { if (timer) clearTimeout(timer); }
      }
      finish('fail', null, 'all-failed');
      return g;
    })();
    return g.promise;
  };
  return g;
}

module.exports = { create, validCountry, normLocale, langFor, param, SERVICES, RU_COUNTRIES };
