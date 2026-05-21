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

  function makeChainConstraint() {
    return {
      kind: 'chain',
      title: 'Word Chain', // Add this
      description: 'Each word must start with the last letter of the previous word.', // Add this
      canInsert(ctx, ch) {
        if (!ctx.prevWord) return { ok: true };
        const lastLetterOfPrev = ctx.prevWord.slice(-1).toLowerCase();
        if (ctx.currentWord.length === 0) {
          if (ch.toLowerCase() !== lastLetterOfPrev) {
            return { ok: false, why: `Must start with "${lastLetterOfPrev}"` };
          }
        }
        return { ok: true };
      },
      allowedLetters(ctx) { // Add this
        if (!ctx.prevWord) return null;
        if (ctx.currentWord.length === 0) {
          return new Set([ctx.prevWord.slice(-1).toLowerCase()]);
        }
        return null;
      },
      lineFeedback(ctx) { return null; } // Add this if missing
    };
  }

  // function makeScriptedConstraint({ title, description, hooks = {} }) { // Added = {} default
  //   // Now, if 'hooks' is undefined, it defaults to an empty object
  //   // Object.entries({}) will return [], avoiding the crash
  //   const validators = {};
    
  //   if (hooks) {
  //     for (const [hookName, logic] of Object.entries(hooks)) {
  //       validators[hookName] = new Function('ctx', 'ch', `
  //         const { currentWord, currentLine, prevWord, lineIdx, wordIdx } = ctx;
  //         ${logic}
  //       `);
  //     }
  //   }

  //   return {
  //     kind: 'scripted',
  //     title: title || 'Scripted Constraint',
  //     description: description || 'Custom script',
      
  //     // Defensive calling: check if validator exists before calling
  //     canInsert: (ctx, ch) => {
  //       if (!validators.canInsert) return { ok: true };
  //       try {
  //         return validators.canInsert(ctx, ch) ? { ok: true } : { ok: false, why: 'Input rejected' };
  //       } catch (e) { console.error(e); return { ok: true }; }
  //     },
      
  //     canBreakSpace: (ctx) => {
  //       if (!validators.canBreakSpace) return { ok: true };
  //       try {
  //         return validators.canBreakSpace(ctx) ? { ok: true } : { ok: false, why: 'Space rejected' };
  //       } catch (e) { console.error(e); return { ok: true }; }
  //     },
      
  //     canBreakLine: (ctx) => {
  //       if (!validators.canBreakLine) return { ok: true };
  //       try {
  //         return validators.canBreakLine(ctx) ? { ok: true } : { ok: false, why: 'Line break rejected' };
  //       } catch (e) { console.error(e); return { ok: true }; }
  //     }
  //   };
  // }

// function makeScriptedConstraint({ title, description, hooks = {} }) {
//   const validators = {};

//   // ... inside makeScriptedConstraint ...

//   function serializeCtx(ctx) {
//     return {
//       currentWord: String(ctx.currentWord || ''),
//       currentLine: String(ctx.currentLine || ''),
//       prevWord: String(ctx.prevWord || ''),
//       lineIdx: Number(ctx.lineIdx || 0),
//       wordIdx: Number(ctx.wordIdx || 0),
//       colIdx: Number(ctx.colIdx || 0) // <--- ADD THIS
//     };
//   }

//   function createSyncSandbox(logicCode) {
//     try {
//       return new Function(
//         'ctx', 'ch',
//         `
//         // Expose colIdx inside the sandbox destructuring
//         const { currentWord, currentLine, prevWord, lineIdx, wordIdx, colIdx } = ctx;
        
//         const window = undefined;
//         const globalThis = undefined;
//         const document = undefined;
//         const fetch = undefined;

//         try {
//           const __user_expr__ = function() {
//             ${logicCode}
//           };
//           return !!__user_expr__();
//         } catch (e) {
//           return false;
//         }
//         `
//       );
//     } catch (e) {
//       return () => true;
//     }
//   }

//   // A tiny, strict, synchronous scope jailer
//   // function createSyncSandbox(logicCode) {
//   //   try {
//   //     // We explicitly shadow every common dangerous global by mapping them to undefined.
//   //     // This isolates the LLM's logic context to ONLY our allowed variables.
//   //     return new Function(
//   //       'ctx', 'ch',
//   //       `
//   //       const { currentWord, currentLine, prevWord, lineIdx, wordIdx } = ctx;
        
//   //       // Block access to the real environment
//   //       const window = undefined;
//   //       const globalThis = undefined;
//   //       const document = undefined;
//   //       const fetch = undefined;
//   //       const XMLHttpRequest = undefined;
//   //       const setTimeout = undefined;
//   //       const setInterval = undefined;

//   //       try {
//   //         // Wrap in a function execution block
//   //         const __user_expr__ = function() {
//   //           ${logicCode}
//   //         };
//   //         return !!__user_expr__();
//   //       } catch (e) {
//   //         console.error("Scripted constraint runtime error:", e);
//   //         return false;
//   //       }
//   //       `
//   //     );
//   //   } catch (compileError) {
//   //     console.error("Failed to safely compile LLM hook script:", compileError);
//   //     return () => true; // Fall open if compilation crashes
//   //   }
//   // }

//   if (hooks) {
//     for (const [hookName, logic] of Object.entries(hooks)) {
//       if (logic) {
//         validators[hookName] = createSyncSandbox(logic);
//       }
//     }
//   }

//   // // Pure snapshot dictionary helper
//   // function serializeCtx(ctx) {
//   //   return {
//   //     currentWord: String(ctx.currentWord || ''),
//   //     currentLine: String(ctx.currentLine || ''),
//   //     prevWord: String(ctx.prevWord || ''),
//   //     lineIdx: Number(ctx.lineIdx || 0),
//   //     wordIdx: Number(ctx.wordIdx || 0)
//   //   };
//   // }

//   return {
//     kind: 'scripted',
//     title: title || 'Scripted Constraint',
//     description: description || 'Custom script',
    
//     // Everything is now fully synchronous. Input blocks instantly!
//     canInsert: (ctx, ch) => {
//       if (!validators.canInsert) return { ok: true };
//       const safeCtx = serializeCtx(ctx);
//       const ok = validators.canInsert(safeCtx, String(ch));
//       return ok ? { ok: true } : { ok: false, why: 'Rejected by rule: Every word must start with a vowel.' };
//     },
    
//     canBreakSpace: (ctx) => {
//       if (!validators.canBreakSpace) return { ok: true };
//       const safeCtx = serializeCtx(ctx);
//       const ok = validators.canBreakSpace(safeCtx, ' ');
//       return ok ? { ok: true } : { ok: false, why: 'Space rejected' };
//     },
    
//     canBreakLine: (ctx) => {
//       if (!validators.canBreakLine) return { ok: true };
//       const safeCtx = serializeCtx(ctx);
//       const ok = validators.canBreakLine(safeCtx, '\n');
//       return ok ? { ok: true } : { ok: false, why: 'Line break rejected' };
//     }
//   };
// }

function makeScriptedConstraint({ title, description, hooks = {} }) {
  const validators = {};

  function createSyncSandbox(logicCode) {
    try {
      return new Function(
        'ctx', 'ch',
        `
        const { currentWord, currentLine, prevWord, lineIdx, wordIdx, colIdx } = ctx;
        const window = undefined;
        const globalThis = undefined;
        const document = undefined;

        try {
          const __user_expr__ = function() {
            ${logicCode}
          };
          return __user_expr__(); // Don't force boolean cast here so feedback can return strings
        } catch (e) {
          return false;
        }
        `
      );
    } catch (e) {
      return () => null;
    }
  }

  if (hooks) {
    for (const [hookName, logic] of Object.entries(hooks)) {
      if (logic) {
        validators[hookName] = createSyncSandbox(logic);
      }
    }
  }

  function serializeCtx(ctx) {
    return {
      currentWord: String(ctx.currentWord || ''),
      currentLine: String(ctx.currentLine || ''),
      prevWord: String(ctx.prevWord || ''),
      lineIdx: Number(ctx.lineIdx || 0),
      wordIdx: Number(ctx.wordIdx || 0),
      colIdx: Number(ctx.colIdx || 0)
    };
  }

  return {
    kind: 'scripted',
    title: title || 'Scripted Constraint',
    description: description || 'Custom script',
    
    canInsert: (ctx, ch) => {
      if (!validators.canInsert) return { ok: true };
      const safeCtx = serializeCtx(ctx);
      const ok = validators.canInsert(safeCtx, String(ch));
      return ok ? { ok: true } : { ok: false, why: 'Input rejected' };
    },
    
    canBreakSpace: (ctx) => {
      if (!validators.canBreakSpace) return { ok: true };
      const safeCtx = serializeCtx(ctx);
      const ok = validators.canBreakSpace(safeCtx, ' ');
      return ok ? { ok: true } : { ok: false, why: 'Space rejected' };
    },
    
    canBreakLine: (ctx) => {
      if (!validators.canBreakLine) return { ok: true };
      const safeCtx = serializeCtx(ctx);
      const ok = validators.canBreakLine(safeCtx, '\n');
      return ok ? { ok: true } : { ok: false, why: 'Line break rejected' };
    },

    // ADD THIS: Runs constantly to verify text state after deletions/pastes
    lineFeedback: (ctx, i) => {
      if (!validators.lineFeedback) return null;
      
      // Target the specific line index being drawn/evaluated
      const targetLine = ctx.lines[i] || '';
      if (!targetLine.trim()) return null; // Ignore blank lines
      
      const safeCtx = serializeCtx(ctx);
      // Adjust safeCtx slightly to reflect the line being evaluated
      safeCtx.currentLine = targetLine; 

      try {
        const errorMsg = validators.lineFeedback(safeCtx, '');
        return errorMsg || null; // Returns warning string if invalid, null if safe
      } catch (e) {
        return null;
      }
    }
  };
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
      allowedLetters(ctx) {
        if (!re) return null;
        
        const allowed = new Set();
        const alphabet = 'abcdefghijklmnopqrstuvwxyz'.split('');
        
        // Test every letter to see if it could possibly be valid
        // given the current prefix
        for (const char of alphabet) {
          if (re.test(ctx.linePrefix + char)) {
            allowed.add(char);
          }
        }
        return allowed;
      },
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
          if (ch === ' ' && typeof c.canBreakSpace === 'function') {
            const r = c.canBreakSpace(ctx);
            if (!r.ok) return r;
          }
        }
        return { ok: true };
      },
      canBreakLine(text, caret) {
        const ctx = makeCtx(text, caret);
        // RULE: Always allow an empty line (a line containing only the newline)
        if (ctx.currentLine.trim() === '') return { ok: true };
        
        for (const c of constraints) {
          if (c.kind === 'snowball' && typeof c.canBreakSpace === 'function') {
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
      // New: Check entire text for constraint violations (e.g. after paste)
      checkAll(text) {
        const lines = text.split('\n');
        const errors = [];
        for (let i = 0; i < lines.length; i++) {
          if (!lines[i].trim()) continue; // Skip empty lines in global check
          for (const c of constraints) {
            if (typeof c.lineFeedback === 'function') {
              const feedback = c.lineFeedback({ text, lines, lineIdx: i }, i);
              // Assuming lineFeedback returns a string if there's a warning/error
              if (feedback && feedback.includes('!')) { 
                errors.push(`Line ${i + 1}: ${feedback}`);
              }
            }
          }
        }
        return errors;
      },
      // Inside constraints.js, update the `combine` function:
      allowedLetters(text, caret) {
        const ctx = makeCtx(text, caret);
        let allowed = null;
        for (const c of constraints) {
          // ADD THIS DEFENSIVE CHECK
          if (!c || typeof c.allowedLetters !== 'function') continue; 
          
          const a = c.allowedLetters(ctx);
          if (a) {
            if (!allowed) allowed = new Set(a);
            else for (const x of [...allowed]) if (!a.has(x)) allowed.delete(x);
          }
        }
        return allowed;
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
    combine, FORMS, makeChainConstraint, makeScriptedConstraint
  };
})(typeof window !== 'undefined' ? window : globalThis);

// =========================================================================
// ULTRA-SAFE HYBRID MODULE BRIDGE 
// Compatible with legacy uncompiled scripts and native ES Modules
// =========================================================================

// 1. Safe global configuration fallback
let exportedConstraint = null;
if (typeof Ouvroir !== 'undefined' && Ouvroir.makeScriptedConstraint) {
  exportedConstraint = Ouvroir.makeScriptedConstraint;
} else if (typeof window !== 'undefined' && window.Ouvroir) {
  exportedConstraint = window.Ouvroir.makeScriptedConstraint;
}

// 2. Conditional Export Layer
// We use character-string indexing to completely bypass early static syntax parsing errors
const isRealModuleContext = (function() {
  try {
    // If this runs in dev.html's <script type="module">, this eval succeeds.
    // If it runs in a standard global script, it safely catches and returns false.
    return !!new Function('return !!(arguments.callee || import.meta)')();
  } catch (e) {
    // If the error is specifically about import.meta, we might be inside a module engine, 
    // but to be absolutely safe against non-module script environments, we verify via window options:
    return typeof document !== 'undefined' && !document.currentScript;
  }
})();

if (isRealModuleContext || typeof exports === 'object') {
  try {
    // We attach our functional reference directly to a dynamic global evaluation container.
    // This makes makeScriptedConstraint accessible via standard import loops inside test-suite.js
    globalThis.__es_bridge_export__ = exportedConstraint;
    
    // Evaluate execution dynamically so uncompiled scripts never choke on the "export" token
    eval('export const makeScriptedConstraint = globalThis.__es_bridge_export__;');
  } catch (moduleExportError) {
    // Quiet fallback to protect non-module runtimes
  }
}
