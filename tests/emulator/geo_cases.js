'use strict';
// Unit tests for rbx/geo.js (no network: fetch is faked).
const G = require('../../rbx/geo');
module.exports = async function () {
  let ok = 0, fail = 0;
  const check = (cond, name) => { if (cond) ok++; else { fail++; console.log('  geo_cases.js: FAIL ' + name); } };
  const resp = (text, status) => ({ ok: (status || 200) < 400, status: status || 200, text: async () => text });
  // parsing / normalisation
  check(G.validCountry(' ru ') === 'RU', 'validCountry trims/uppercases');
  check(G.validCountry('XX') === null && G.validCountry('T1') === null && G.validCountry('USA') === null, 'validCountry rejects XX/T1/3 letters');
  check(G.normLocale('ru-RU') === 'ru-ru' && G.normLocale('ru') === 'ru-ru' && G.normLocale('en') === 'en-us' && G.normLocale('pt_BR') === 'pt-br' && G.normLocale('') === 'en-us', 'normLocale');
  check(G.SERVICES[0].parse('fl=1\nloc=KZ\ntls=TLSv1.3\n') === 'KZ', 'cloudflare trace parse');
  check(G.SERVICES[2].parse('{"ip":"x","country":"BY"}') === 'BY', 'country.is parse');
  // language policy (same as the game)
  check(G.langFor('RU', 'en-us') === 'ru' && G.langFor('BY', 'en-us') === 'ru' && G.langFor('UZ', 'de-de') === 'ru', 'ru countries -> ru');
  check(G.langFor('UA', 'uk-ua') === 'en' && G.langFor('UA', 'ru-ru') === 'ru', 'UA -> ru only with ru locale');
  check(G.langFor('US', 'ru-ru') === 'en' && G.langFor('DE', 'de-de') === 'en', 'other countries -> en');
  check(G.langFor(null, 'ru-ru') === 'ru' && G.langFor(null, 'en-gb') === 'en', 'unknown country -> by locale');
  // URL overrides
  let g = G.create({ search: '?country=by', navigatorLanguage: 'en-US', fetch: () => { throw new Error('must not fetch'); } });
  await g.start();
  check(g.status === 'ok' && g.country === 'BY' && g.source === 'param' && g.lang() === 'ru', '?country=BY -> ok without network');
  g = G.create({ search: '?lang=en', navigatorLanguage: 'ru-RU', fetch: () => { throw new Error('must not fetch'); } });
  await g.start();
  check(g.status === 'skipped' && g.localeId === 'en-us' && g.lang() === 'en', '?lang=en forces LocaleId and skips lookup');
  g = G.create({ search: '?lang=ru&country=US', navigatorLanguage: 'en-US' });
  await g.start();
  check(g.country === 'US' && g.localeId === 'ru-ru' && g.lang() === 'en', '?country wins over ?lang for the country');
  g = G.create({ search: '?geo=0', navigatorLanguage: 'ru' });
  await g.start();
  check(g.status === 'skipped' && g.lang() === 'ru', '?geo=0 -> navigator.language');
  g = G.create({ navigatorLanguage: 'ru-RU' });
  await g.start();
  check(g.status === 'fail' && g.source === 'no-fetch' && g.lang() === 'ru', 'no fetch -> fail, language from LocaleId');
  // fallback chain
  const calls = [];
  g = G.create({ fetch: async (u) => { calls.push(u); if (u.includes('cloudflare')) return resp('', 403); if (u.includes('geojs')) return resp('XX'); return resp('{"country":"KZ"}'); } });
  await g.start();
  check(g.country === 'KZ' && g.source === 'country.is' && calls.length === 3, 'chain: 403 -> XX -> country.is');
  check(g.tried.length === 3 && !g.tried[0].ok && !g.tried[1].ok && g.tried[2].ok, 'chain records attempts');
  // timeouts: hanging services must not exceed the budget
  const t0 = Date.now();
  g = G.create({ fetch: () => new Promise(() => {}), budgetMs: 600, perServiceMs: 250 });
  let doneCalled = 0; g.onDone(() => doneCalled++);
  await g.start();
  const took = Date.now() - t0;
  check(g.status === 'fail' && took < 900 && doneCalled === 1, 'hanging services -> fail within budget (' + took + 'ms)');
  // network error then success
  g = G.create({ fetch: async (u) => { if (u.includes('cloudflare')) throw new TypeError('Failed to fetch'); return resp('de\n'); } });
  await g.start();
  check(g.country === 'DE' && g.source === 'geojs' && g.lang() === 'en', 'CORS/network error -> next service');
  return { ok, fail };
};
