// constraints.js — Oulipian constraint engine.
// A constraint is a plain object with optional predicates:
//   .canInsert(ctx, char) -> {ok: bool, why?: string}
//   .canBreakLine(ctx)    -> {ok: bool, why?: string}
//   .allowedLetters(ctx)  -> Set<lowercase letter> | null  (null = all)
//   .lineFeedback(ctx, i) -> string | null                 (gutter readout)
//   .description          -> string (human-readable)
// ctx = { text, lines, lineIdx, colIdx, currentLine, currentWord, prevWord, wordIdx }
//
// The engine combines constraints by AND: keystroke is allowed iff every
// constraint allows it. A `regex` constraint is the special case the NL→regex
// pipeline emits — a single anchored pattern the *prefix of the current line*
// must satisfy.

(function (global) {
  'use strict';

  const ALPHA = 'abcdefghijklmnopqrstuvwxyz';
  const VOWELS = 'aeiou';
  // Letters with no ascender or descender (the "prisoner's" / "beautiful
  // in-laws" alphabet — what you can write on lined paper with no ink lifting
  // above or below the x-height). Plus 'a' which has an ascender in some
  // fonts but is canonical for this constraint.
  const NO_ASC_DESC = 'aceimnorsuvwxz';

  // ---- syllable counter -------------------------------------------------
  // English heuristic, good-enough for haiku-checking. Far from perfect, but
  // handles the common cases that bit us in v1:
  //   - 'qu' acts as a single consonant (silent u-glide): 'quiet' → 'kiet'
  //   - Silent trailing 'e' (but not '-le' or vowel + e like 'die/tie/pie')
  //   - Hiatus pairs that reliably split into two syllables when followed by
  //     more letters: ia, io, iu, eo, ua, uo, ie (-- 'lion', 'diet', 'quiet')
  function countSyllables(word) {
    let w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return 0;
    w = w.replace(/qu/g, 'k');
    // silent trailing e (not after l or vowel)
    w = w.replace(/([^aeiouyl])e$/, '$1');
    // also drop trailing 'es' when preceded by a non-vowel cluster
    w = w.replace(/([^aeiouy])es$/, '$1');
    // insert a marker between hiatus pairs not at word end
    const HIATUS = ['ia','io','iu','eo','ua','uo','ie'];
    for (const h of HIATUS) {
      w = w.replace(new RegExp(h[0] + h[1] + '(?=[a-z])', 'g'), h[0] + '.' + h[1]);
    }
    const groups = w.match(/[aeiouy]+/g);
    return Math.max(1, groups ? groups.length : 1);
  }
  function lineSyllables(line) {
    return line.split(/\s+/).filter(Boolean).reduce((a, w) => a + countSyllables(w), 0);
  }

  // ---- context helpers --------------------------------------------------
  function makeCtx(text, caret) {
    const before = text.slice(0, caret);
    const after = text.slice(caret);
    const lines = text.split('\n');
    // Find line index / column for caret
    let acc = 0, lineIdx = 0, colIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      const len = lines[i].length;
      if (caret <= acc + len) { lineIdx = i; colIdx = caret - acc; break; }
      acc += len + 1; // +1 for \n
      if (i === lines.length - 1) { lineIdx = i; colIdx = len; }
    }
    const currentLine = lines[lineIdx] || '';
    const linePrefix = currentLine.slice(0, colIdx);
    // current word = letters back from caret until a non-letter
    const wordMatch = linePrefix.match(/[A-Za-z']*$/);
    const currentWord = wordMatch ? wordMatch[0] : '';
    // word index within line (0-based count of full words before this one)
    const finishedWords = linePrefix.slice(0, linePrefix.length - currentWord.length)
      .split(/\s+/).filter(Boolean);
    const wordIdx = finishedWords.length;
    const prevWord = finishedWords[finishedWords.length - 1] || '';
    return {
      text, caret, before, after, lines, lineIdx, colIdx,
      currentLine, linePrefix, currentWord, prevWord, wordIdx,
    };
  }

  // ---- individual forms -------------------------------------------------
  // Each `make*` returns a constraint object.

  function makeLipogram({ forbidden = ['e'] } = {}) {
    const set = new Set(forbidden.map(c => c.toLowerCase()));
    const list = [...set].map(c => c.toUpperCase()).join(', ');
    return {
      kind: 'lipogram',
      title: 'Lipogram',
      params: { forbidden: [...set] },
      description: `No use of letter${set.size > 1 ? 's' : ''} ${list}.`,
      canInsert(ctx, ch) {
        if (set.has(ch.toLowerCase())) return { ok: false, why: `Lipogram forbids "${ch}"` };
        return { ok: true };
      },
      allowedLetters() {
        return new Set(ALPHA.split('').filter(c => !set.has(c)));
      },
    };
  }

  function makeUnivocalism({ vowel = 'a' } = {}) {
    const v = vowel.toLowerCase();
    const forbidden = new Set(VOWELS.split('').filter(c => c !== v));
    return {
      kind: 'univocalism',
      title: 'Univocalism',
      params: { vowel: v },
      description: `Only one vowel allowed: ${v.toUpperCase()}.`,
      canInsert(ctx, ch) {
        if (forbidden.has(ch.toLowerCase())) {
          return { ok: false, why: `Only "${v.toUpperCase()}" may sing here` };
        }
        return { ok: true };
      },
      allowedLetters() {
        return new Set(ALPHA.split('').filter(c => !forbidden.has(c)));
      },
    };
  }

  function makePrisoner() {
    const allowed = new Set(NO_ASC_DESC.split(''));
    return {
      kind: 'prisoner',
      title: "Prisoner's constraint",
      description: 'Only letters without ascenders or descenders (a c e i m n o r s u v w x z).',
      canInsert(ctx, ch) {
        if (!/[a-z]/i.test(ch)) return { ok: true };
        if (!allowed.has(ch.toLowerCase())) {
          return { ok: false, why: `"${ch}" rises or falls — forbidden` };
        }
        return { ok: true };
      },
      allowedLetters() { return new Set(allowed); },
    };
  }

  function makeSnowball({ start = 1, direction = 'grow' } = {}) {
    // word k (0-indexed within line) must have length start + k (grow) or
    // start - k (melt). Enforced as a hard upper bound while typing the word,
    // and as exact equality at word-end (space or newline).
    return {
      kind: 'snowball',
      title: direction === 'melt' ? 'Melting snowball' : 'Snowball',
      params: { start, direction },
      description: direction === 'melt'
        ? `Each word one letter shorter (starting at ${start}).`
        : `Each word one letter longer (starting at ${start}).`,
      canInsert(ctx, ch) {
        if (!/[A-Za-z']/.test(ch)) return { ok: true }; // punctuation always ok
        const target = direction === 'melt'
          ? Math.max(1, start - ctx.wordIdx)
          : start + ctx.wordIdx;
        if (ctx.currentWord.length >= target) {
          return { ok: false, why: `Word ${ctx.wordIdx + 1} must be ${target} letters` };
        }
        return { ok: true };
      },
      canBreakSpace(ctx) {
        const target = direction === 'melt'
          ? Math.max(1, start - ctx.wordIdx)
          : start + ctx.wordIdx;
        if (ctx.currentWord.length && ctx.currentWord.length !== target) {
          return { ok: false, why: `Word must be exactly ${target} letters` };
        }
        return { ok: true };
      },
      lineFeedback(ctx) {
        const target = direction === 'melt'
          ? Math.max(1, start - ctx.wordIdx)
          : start + ctx.wordIdx;
        return `word ${ctx.wordIdx + 1} → ${ctx.currentWord.length}/${target}`;
      },
    };
  }

  function makeHaiku({ pattern = [5, 7, 5] } = {}) {
    return {
      kind: 'haiku',
      title: pattern.length === 5 ? 'Tanka' : 'Haiku',
      params: { pattern },
      description: `${pattern.join('-')} syllables per line.`,
      canInsert(ctx, ch) {
        // Allow anything — syllable enforcement only at line break.
        if (ctx.lineIdx >= pattern.length) {
          return { ok: false, why: `Poem is ${pattern.length} lines` };
        }
        return { ok: true };
      },
      canBreakLine(ctx) {
        if (ctx.lineIdx >= pattern.length - 1) {
          return { ok: false, why: `Poem ends after ${pattern.length} lines` };
        }
        const want = pattern[ctx.lineIdx];
        const got = lineSyllables(ctx.currentLine);
        if (got !== want) return { ok: false, why: `Line ${ctx.lineIdx + 1} wants ${want} syllables (have ${got})` };
        return { ok: true };
      },
      lineFeedback(ctx, i) {
        if (i >= pattern.length) return null;
        return `${lineSyllables(ctx.lines[i] || '')}/${pattern[i]}`;
      },
    };
  }

  function makeAbecedarian({ unit = 'line', start = 0 } = {}) {
    // unit: 'line' = each line starts with successive letter
    //       'word' = each word starts with successive letter
    return {
      kind: 'abecedarian',
      title: 'Abecedarian',
      params: { unit, start },
      description: unit === 'word'
        ? 'Each word starts with the next letter of the alphabet.'
        : 'Each line starts with the next letter of the alphabet.',
      canInsert(ctx, ch) {
        if (!/[A-Za-z]/.test(ch)) return { ok: true };
        if (unit === 'line') {
          // Only enforce on first letter of the line (linePrefix has no letters yet)
          if (/[A-Za-z]/.test(ctx.linePrefix)) return { ok: true };
          const want = ALPHA[(start + ctx.lineIdx) % 26];
          if (ch.toLowerCase() !== want) {
            return { ok: false, why: `Line ${ctx.lineIdx + 1} must start with "${want.toUpperCase()}"` };
          }
        } else {
          // word: only enforce on first letter of the word
          if (ctx.currentWord.length > 0) return { ok: true };
          // Count words globally
          const wordsBefore = ctx.before.split(/\s+/).filter(Boolean).length;
          const want = ALPHA[(start + wordsBefore) % 26];
          if (ch.toLowerCase() !== want) {
            return { ok: false, why: `Word ${wordsBefore + 1} must start with "${want.toUpperCase()}"` };
          }
        }
        return { ok: true };
      },
      allowedLetters(ctx) {
        if (unit === 'line') {
          if (/[A-Za-z]/.test(ctx.linePrefix)) return null;
          return new Set([ALPHA[(start + ctx.lineIdx) % 26]]);
        } else {
          if (ctx.currentWord.length > 0) return null;
          const wordsBefore = ctx.before.split(/\s+/).filter(Boolean).length;
          return new Set([ALPHA[(start + wordsBefore) % 26]]);
        }
      },
      lineFeedback(ctx, i) {
        if (unit !== 'line') return null;
        return `→ ${ALPHA[(start + i) % 26].toUpperCase()}`;
      },
    };
  }

  function makePalindrome({ unit = 'line' } = {}) {
    // Strict letter palindrome: stripping non-letters, line reads same
    // backward. Enforced incrementally — char at position k of the in-progress
    // line must not break the existing palindromic structure assuming
    // SYMMETRY around an unknown center. The practical real-time rule we use:
    // we don't know the final length, so we don't block during typing of the
    // first half; the user signals "this is the center" by pressing Enter.
    // Enter is only allowed if the current line is already a palindrome.
    // We also enforce: if the line has length n and char k of the current
    // line breaks the palindrome assuming the full line so far IS the poem
    // line, we shake (soft warn via canBreakLine only).
    function strip(s) { return s.toLowerCase().replace(/[^a-z]/g, ''); }
    function isPal(s) {
      const t = strip(s);
      for (let i = 0, j = t.length - 1; i < j; i++, j--) if (t[i] !== t[j]) return false;
      return true;
    }
    return {
      kind: 'palindrome',
      title: 'Palindrome',
      params: { unit },
      description: 'Each line reads the same backward (ignoring spaces and punctuation).',
      canBreakLine(ctx) {
        if (!ctx.currentLine.trim()) return { ok: true }; // empty line ok
        if (!isPal(ctx.currentLine)) return { ok: false, why: 'Line is not a palindrome' };
        return { ok: true };
      },
      lineFeedback(ctx, i) {
        const l = ctx.lines[i] || '';
        if (!l.trim()) return null;
        return isPal(l) ? '↔ palindrome' : '↔ not yet';
      },
    };
  }

  function makeRegexConstraint({ source, description, flags = 'i' } = {}) {
    // The regex is treated as a pattern that EVERY PREFIX of the current line
    // must match. Caller is responsible for crafting a permissive prefix-friendly
    // pattern; the NL→regex helper handles this.
    let re;
    try { re = new RegExp(source, flags); } catch (e) { re = null; }
    return {
      kind: 'regex',
      title: 'Custom',
      params: { source, flags },
      description: description || `Pattern: /${source}/${flags}`,
      _regex: re,
      _err: re ? null : 'Invalid pattern',
      canInsert(ctx, ch) {
        if (!re) return { ok: true };
        const next = ctx.linePrefix + ch;
        if (!re.test(next)) return { ok: false, why: 'Breaks custom pattern' };
        return { ok: true };
      },
    };
  }

  // ---- engine -----------------------------------------------------------
  function combine(constraints) {
    return {
      constraints,
      canInsert(text, caret, ch) {
        const ctx = makeCtx(text, caret);
        for (const c of constraints) {
          if (typeof c.canInsert === 'function') {
            const r = c.canInsert(ctx, ch);
            if (!r.ok) return r;
          }
          // Snowball uses canBreakSpace for space; treat space specifically
          if (ch === ' ' && typeof c.canBreakSpace === 'function') {
            const r = c.canBreakSpace(ctx);
            if (!r.ok) return r;
          }
        }
        return { ok: true };
      },
      canBreakLine(text, caret) {
        const ctx = makeCtx(text, caret);
        for (const c of constraints) {
          // Snowball: enter is also a word boundary
          if (typeof c.canBreakSpace === 'function') {
            const r = c.canBreakSpace(ctx);
            if (!r.ok) return r;
          }
          if (typeof c.canBreakLine === 'function') {
            const r = c.canBreakLine(ctx);
            if (!r.ok) return r;
          }
        }
        return { ok: true };
      },
      allowedLetters(text, caret) {
        const ctx = makeCtx(text, caret);
        // Intersection of all constraint allowances
        let allowed = null;
        for (const c of constraints) {
          if (typeof c.allowedLetters === 'function') {
            const a = c.allowedLetters(ctx);
            if (a) {
              if (!allowed) allowed = new Set(a);
              else for (const x of [...allowed]) if (!a.has(x)) allowed.delete(x);
            }
          }
        }
        return allowed; // null = all allowed
      },
      lineFeedback(text, caret, i) {
        const ctx = makeCtx(text, caret);
        const parts = [];
        for (const c of constraints) {
          if (typeof c.lineFeedback === 'function') {
            const f = c.lineFeedback(ctx, i);
            if (f) parts.push(f);
          }
        }
        return parts.join(' · ');
      },
      describe() {
        if (!constraints.length) return 'No constraints — free verse.';
        return constraints.map(c => c.description).join(' · ');
      },
    };
  }

  // ---- form catalog (for the dropdown / card grid / palette) ----------
  const FORMS = [
    {
      id: 'lipogram-e', name: 'Lipogram — no E',
      blurb: 'The Perec mode. Write without the letter E.',
      make: () => makeLipogram({ forbidden: ['e'] }),
    },
    {
      id: 'lipogram-custom', name: 'Lipogram — choose letters',
      blurb: 'Pick which letters to banish.',
      params: [{ id: 'forbidden', label: 'Forbidden letters', type: 'letters', default: 'e' }],
      make: (p) => makeLipogram({ forbidden: (p.forbidden || 'e').split('').filter(c => /[a-z]/i.test(c)) }),
    },
    {
      id: 'univocalism-a', name: 'Univocalism — only A',
      blurb: 'Every vowel becomes A.',
      make: () => makeUnivocalism({ vowel: 'a' }),
    },
    {
      id: 'univocalism-pick', name: 'Univocalism — pick vowel',
      blurb: 'Choose the single vowel allowed.',
      params: [{ id: 'vowel', label: 'Vowel', type: 'select', options: ['a','e','i','o','u'], default: 'a' }],
      make: (p) => makeUnivocalism({ vowel: p.vowel || 'a' }),
    },
    {
      id: 'snowball', name: 'Snowball',
      blurb: 'Each word one letter longer than the last.',
      params: [{ id: 'start', label: 'First word length', type: 'number', default: 1, min: 1, max: 12 }],
      make: (p) => makeSnowball({ start: +p.start || 1, direction: 'grow' }),
    },
    {
      id: 'melting-snowball', name: 'Melting snowball',
      blurb: 'Each word one letter shorter.',
      params: [{ id: 'start', label: 'First word length', type: 'number', default: 8, min: 2, max: 14 }],
      make: (p) => makeSnowball({ start: +p.start || 8, direction: 'melt' }),
    },
    {
      id: 'palindrome', name: 'Palindrome',
      blurb: 'Each line reads the same backward.',
      make: () => makePalindrome(),
    },
    {
      id: 'haiku', name: 'Haiku',
      blurb: '5-7-5 syllables, three lines.',
      make: () => makeHaiku({ pattern: [5, 7, 5] }),
    },
    {
      id: 'tanka', name: 'Tanka',
      blurb: '5-7-5-7-7 syllables, five lines.',
      make: () => makeHaiku({ pattern: [5, 7, 5, 7, 7] }),
    },
    {
      id: 'abecedarian-line', name: 'Abecedarian (by line)',
      blurb: 'Line 1 starts with A, line 2 with B…',
      make: () => makeAbecedarian({ unit: 'line' }),
    },
    {
      id: 'abecedarian-word', name: 'Abecedarian (by word)',
      blurb: 'Word 1 starts with A, word 2 with B…',
      make: () => makeAbecedarian({ unit: 'word' }),
    },
    {
      id: 'prisoner', name: "Prisoner's constraint",
      blurb: 'Only letters with no ascenders or descenders.',
      make: () => makePrisoner(),
    },
  ];

  // ---- expose ---------------------------------------------------------
  global.Ouvroir = {
    ALPHA, VOWELS, NO_ASC_DESC,
    countSyllables, lineSyllables, makeCtx,
    makeLipogram, makeUnivocalism, makePrisoner, makeSnowball,
    makeHaiku, makeAbecedarian, makePalindrome, makeRegexConstraint,
    combine, FORMS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
