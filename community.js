// community.js — saved, named constraint configurations contributed by
// "the community". A community form is either:
//   { basis: 'form',  formId, params, name, author, blurb, poem? }
//   { basis: 'regex', source, flags, name, author, blurb, poem? }
//
// Pre-seeded with a handful of canon entries (each with a sample poem so the
// browse-modal has something to look at). User-submitted entries are merged
// on top from localStorage. A separate "favorites" list pins entries to the
// top of the main dropdown.

(function (global) {
  'use strict';

  const KEY     = 'ouvroir.community.v2';
  const FAV_KEY = 'ouvroir.favorites.v1';

  // Pre-seeded community entries. These show up as the "canon" — small
  // intentional remixes of the base forms, with author handles + a sample
  // poem written under that constraint.
  const SEED = [
    {
      id: 'seed-disparition',
      name: 'Disparition',
      author: 'perec_fan',
      blurb: 'A lipogram without the letter E. The Perec mode.',
      basis: 'form',
      formId: 'lipogram-custom',
      params: { forbidden: 'e' },
      poem:
`old shadow, walk softly past my window.
a loud sun is choking on its own gold.
what was lost? my pillows know.
April runs through us as dust.`,
    },
    {
      id: 'seed-mistral',
      name: 'Mistral',
      author: 'lou',
      blurb: 'Only the vowel O may sing here. Long, low, slow.',
      basis: 'form',
      formId: 'univocalism-pick',
      params: { vowel: 'o' },
      poem:
`fog rolls north. so cold, so soft.
lost words from old gods drown.
not for long, not for long.`,
    },
    {
      id: 'seed-crab',
      name: 'Crab walk',
      author: 'ada',
      blurb: 'Every line reads the same backward.',
      basis: 'form',
      formId: 'palindrome',
      params: {},
      poem:
`madam, I'm Adam.
no lemon, no melon.
was it a cat I saw.`,
    },
    {
      id: 'seed-tanka',
      name: 'Slow tanka',
      author: 'basho_redux',
      blurb: 'A tanka, decanted: 5-7-5-7-7 syllables across five lines.',
      basis: 'form',
      formId: 'tanka',
      params: {},
      poem:
`snowfall on the pine
a thousand quiet candles
flickering in dawn
the mountain's slow indrawn breath
nothing answers when I call`,
    },
    {
      id: 'seed-avalanche',
      name: 'Avalanche',
      author: 'orchid',
      blurb: 'A snowball that begins at three letters and keeps falling.',
      basis: 'form',
      formId: 'snowball',
      params: { start: 3 },
      poem:
`sky rain light shadow silence
sea wind river cellars heavens`,
    },
    {
      id: 'seed-stoic',
      name: 'Stoic',
      author: 'nadir',
      blurb: "The prisoner's alphabet — only letters that lie flat.",
      basis: 'form',
      formId: 'prisoner',
      params: {},
      poem:
`i am sun, raven, ice.
we swim in caves, never sure.
incense rises. someone scarce remains.`,
    },
    {
      id: 'seed-twostep',
      name: 'Two-step',
      author: 'marin',
      blurb: 'Word one starts with A, word two with B, and so on.',
      basis: 'form',
      formId: 'abecedarian-word',
      params: {},
      poem:
`Apples bend curiously, dancing every
fall, gathering hush. Ivy joins knees,
lifting moss near old porches, quiet
rivers settle, turning under villages.`,
    },
    {
      id: 'seed-whisper',
      name: 'Whisper',
      author: 'iris',
      blurb: 'Each line must end with a vowel.',
      basis: 'regex',
      source: '^([^\\n]*[aeiouAEIOU][^A-Za-z]*)?$',
      flags: '',
      poem:
`the river forgets where it goes too
something inside me is also a sea
I lean toward whatever might carry me`,
    },
  ];

  // ---- persistence ------------------------------------------------------
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function save(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) {}
  }
  function loadFavs() {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function saveFavs(arr) {
    try { localStorage.setItem(FAV_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  // ---- public API -------------------------------------------------------
  function all() {
    // user-submitted first (newest), then seeds
    return [...load(), ...SEED];
  }

  function add(entry) {
    const id = 'u-' + Math.random().toString(36).slice(2, 9);
    const e = { ...entry, id, ts: Date.now() };
    const list = load();
    list.unshift(e);
    save(list);
    notify();
    return e;
  }

  function remove(id) {
    const list = load().filter(e => e.id !== id);
    save(list);
    // also unfavorite
    saveFavs(loadFavs().filter(x => x !== id));
    notify();
  }

  function isUser(id) { return /^u-/.test(id); }

  function favorites() { return loadFavs(); }
  function isFav(id)   { return loadFavs().includes(id); }
  function toggleFav(id) {
    const favs = loadFavs();
    const next = favs.includes(id) ? favs.filter(x => x !== id) : [id, ...favs];
    saveFavs(next);
    notify();
  }

  // Build a constraint instance from a community entry, using the existing
  // form catalog + makeRegexConstraint helper.
  function instantiate(entry) {
    if (entry.basis === 'regex') {
      return global.Ouvroir.makeRegexConstraint({
        source: entry.source,
        flags: entry.flags || 'i',
        description: entry.blurb || entry.name,
      });
    }
    const form = global.Ouvroir.FORMS.find(f => f.id === entry.formId);
    if (!form) return null;
    const merged = {};
    (form.params || []).forEach(p => { merged[p.id] = entry.params?.[p.id] ?? p.default; });
    const inst = form.make(merged);
    return { ...inst, title: entry.name, description: entry.blurb || inst.description };
  }

  // ---- subscriber hook -------------------------------------------------
  const subs = new Set();
  function notify() { for (const fn of subs) try { fn(); } catch (e) {} }
  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

  global.OuvroirCommunity = {
    SEED, all, load, add, remove, isUser, instantiate, subscribe,
    favorites, isFav, toggleFav,
  };
})(typeof window !== 'undefined' ? window : globalThis);
