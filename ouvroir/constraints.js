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
    const HIATUS = ['ia', 'io', 'iu', 'eo', 'ua', 'uo', 'ie'];
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

  // function makeScriptedConstraint({ title, description, hooks = {} }) {
  //   // We consolidate the developer logic down to a single master rule runner
  //   const validators = {};

  //   function createSyncSandbox(logicCode) {
  //     try {
  //       return new Function(
  //         'ctx', 'ch', 'op',
  //         `
  //       const { currentWord, currentLine, prevWord, lineIdx, wordIdx, colIdx } = ctx;
  //       const window = undefined;
  //       const globalThis = undefined;
  //       const document = undefined;

  //       try {
  //         const __user_expr__ = function() {
  //           ${logicCode}
  //         };
  //         // Expects a return string: 'valid', 'not-yet-satisfied', or 'reject'
  //         return __user_expr__() || 'valid'; 
  //       } catch (e) {
  //         return 'reject'; // Fail securely into a rejected state on runtime errors
  //       }
  //       `
  //       );
  //     } catch (e) {
  //       return () => 'valid'; // Fall open if compilation engine breaks
  //     }
  //   }

  //   // Initialize the single validator string payload hook
  //   if (hooks && hooks.validate) {
  //     validators.validate = createSyncSandbox(hooks.validate);
  //   }

  //   function serializeCtx(ctx) {
  //     return {
  //       currentWord: String(ctx.currentWord || ''),
  //       currentLine: String(ctx.currentLine || ''),
  //       prevWord: String(ctx.prevWord || ''),
  //       lineIdx: Number(ctx.lineIdx || 0),
  //       wordIdx: Number(ctx.wordIdx || 0),
  //       colIdx: Number(ctx.colIdx || 0)
  //     };
  //   }

  //   return {
  //     kind: 'scripted',
  //     title: title || 'Scripted Constraint',
  //     description: description || 'Custom 3-state evaluation script',

  //     canInsert: (ctx, ch) => {
  //       if (!validators.validate) return { ok: true };
  //       const safeCtx = serializeCtx(ctx);

  //       // Speculatively project what the context variables will look like *after* insertion
  //       safeCtx.currentLine += ch;
  //       if (ch === ' ' || ch === '\n') {
  //         safeCtx.prevWord = safeCtx.currentWord;
  //         safeCtx.currentWord = '';
  //         safeCtx.wordIdx += 1;
  //       } else {
  //         safeCtx.currentWord += ch;
  //       }
  //       safeCtx.colIdx += ch.length;

  //       const state = validators.validate(safeCtx, String(ch), 'insert');

  //       if (state === 'reject') {
  //         return { ok: false, why: 'insertion-reject: Operation breaks script rules.' };
  //       }
  //       return { ok: true };
  //     },

  //     canBreakSpace: (ctx) => {
  //       if (!validators.validate) return { ok: true };
  //       const safeCtx = serializeCtx(ctx);

  //       // Project a structural space separation boundary modification state
  //       safeCtx.currentLine += ' ';
  //       safeCtx.prevWord = safeCtx.currentWord;
  //       safeCtx.currentWord = '';
  //       safeCtx.wordIdx += 1;
  //       safeCtx.colIdx += 1;

  //       const state = validators.validate(safeCtx, ' ', 'insert');

  //       if (state === 'reject') {
  //         return { ok: false, why: 'insertion-reject: Space boundaries locked.' };
  //       }
  //       return { ok: true };
  //     },

  //     canBreakLine: (ctx) => {
  //       if (!validators.validate) return { ok: true };
  //       const safeCtx = serializeCtx(ctx);

  //       // Project carriage line return changes
  //       safeCtx.lineIdx += 1;
  //       safeCtx.wordIdx = 0;
  //       safeCtx.colIdx = 0;
  //       safeCtx.prevWord = '';
  //       safeCtx.currentWord = '';
  //       safeCtx.currentLine = '';

  //       const state = validators.validate(safeCtx, '\n', 'insert');

  //       if (state === 'reject') {
  //         return { ok: false, why: 'insertion-reject: Line breaks locked.' };
  //       }
  //       return { ok: true };
  //     },

  //     // Asynchronous Post-Editing Auditor handles deletion calculations safely
  //     lineFeedback: (ctx, i) => {
  //       if (!validators.validate) return null;

  //       const targetLine = ctx.lines[i] || '';
  //       // Build a mock rendering footprint of the line state following deletion manipulation
  //       const safeCtx = serializeCtx(ctx);
  //       safeCtx.currentLine = targetLine;
  //       safeCtx.lineIdx = i;

  //       // Recompute localized word pointers inside this specific line snapshot
  //       const words = targetLine.trim().split(/\s+/).filter(Boolean);
  //       safeCtx.wordIdx = words.length;
  //       safeCtx.currentWord = words[words.length - 1] || '';
  //       safeCtx.prevWord = words[words.length - 2] || '';

  //       try {
  //         const state = validators.validate(safeCtx, '', 'delete');
  //         if (state === 'reject') {
  //           return 'deletion-reject! Changes break validation structures.';
  //         }
  //         if (state === 'not-yet-satisfied') {
  //           return 'not-yet-satisfied · Incomplete structural pattern';
  //         }
  //         return null; // State remains cleanly valid, clear warning states
  //       } catch (e) {
  //         return null;
  //       }
  //     }
  //   };
  // }

  // function makeScriptedConstraint({ title, description, hooks = {} }) {
  //   const validators = {};

  //   function createSyncSandbox(logicCode, argPattern) {
  //     try {
  //       return new Function(
  //         argPattern,
  //         `
  //     const window = undefined;
  //     const globalThis = undefined;
  //     const document = undefined;

  //     try {
  //       const __user_expr__ = function() {
  //         ${logicCode}
  //       };
  //       return __user_expr__();
  //     } catch (e) {
  //       return 'reject'; // Fail secure on runtime errors
  //     }
  //     `
  //       );
  //     } catch (e) {
  //       return () => 'valid';
  //     }
  //   }

  //   if (hooks && hooks.validateToken) {
  //     validators.validateToken = createSyncSandbox(hooks.validateToken, 'token,ctx');
  //   }
  //   // This now explicitly expects 'valid', 'not-yet-satisfied', or 'reject'
  //   if (hooks && hooks.validateStructure) {
  //     validators.validateStructure = createSyncSandbox(hooks.validateStructure, 'words,ctx');
  //   }

  //   function serializeCtx(ctx, lineOverride = null) {
  //     const targetLine = lineOverride !== null ? lineOverride : (ctx.currentLine || '');
  //     const words = targetLine.trim().split(/\s+/).filter(Boolean);
  //     return {
  //       currentWord: String(ctx.currentWord || ''),
  //       currentLine: String(targetLine),
  //       prevWord: String(ctx.prevWord || ''),
  //       lineIdx: Number(ctx.lineIdx || 0),
  //       wordIdx: Number(words.length),
  //       colIdx: Number(ctx.colIdx || 0)
  //     };
  //   }

  //   return {
  //     kind: 'scripted',
  //     title: title || 'Scripted Constraint',
  //     description: description || 'Two-tier dynamic state validation script',

  //     // Tier 1: Character-level hard validation filter
  //     canInsert: (ctx, ch) => {
  //       const safeCtx = serializeCtx(ctx);
  //       if (validators.validateToken && ch !== ' ' && ch !== '\n') {
  //         const nextWord = safeCtx.currentWord + ch;
  //         if (!validators.validateToken(nextWord, safeCtx)) {
  //           return { ok: false, why: 'insertion-reject: Character banned.' };
  //         }
  //       }
  //       return { ok: true };
  //     },

  //     // Tier 2: Structural validation. We ONLY block if it explicitly returns 'reject'.
  //     canBreakSpace: (ctx) => {
  //       if (!validators.validateStructure) return { ok: true };

  //       const safeCtx = serializeCtx(ctx);
  //       const currentWords = safeCtx.currentLine.trim().split(/\s+/).filter(Boolean);

  //       const structuralState = validators.validateStructure(currentWords, safeCtx);
  //       if (structuralState === 'reject') {
  //         return { ok: false, why: 'insertion-reject: Hard limit boundary exceeded.' };
  //       }
  //       // 'valid' and 'not-yet-satisfied' both allow the space bar to function!
  //       return { ok: true };
  //     },

  //     // Line breaks require absolute compliance. You cannot leave a line on 'not-yet-satisfied'.
  //     canBreakLine: (ctx) => {
  //       if (!validators.validateStructure) return { ok: true };

  //       const safeCtx = serializeCtx(ctx);
  //       const currentWords = safeCtx.currentLine.trim().split(/\s+/).filter(Boolean);

  //       const structuralState = validators.validateStructure(currentWords, safeCtx);
  //       if (structuralState !== 'valid') {
  //         return { ok: false, why: 'insertion-reject: Structural conditions must be satisfied to change lines.' };
  //       }
  //       return { ok: true };
  //     },

  //     lineFeedback: (ctx, i) => {
  //       const targetLine = ctx.lines[i] || '';
  //       if (!targetLine.trim()) return null;

  //       const safeCtx = serializeCtx(ctx, targetLine);
  //       safeCtx.lineIdx = i;
  //       const currentWords = targetLine.trim().split(/\s+/).filter(Boolean);

  //       if (validators.validateToken) {
  //         for (const token of currentWords) {
  //           if (!validators.validateToken(token, safeCtx)) return 'deletion-reject! Character rule violation.';
  //         }
  //       }

  //       if (validators.validateStructure) {
  //         const structuralState = validators.validateStructure(currentWords, safeCtx);
  //         if (structuralState === 'reject') return 'structural-reject! Constraint broken permanently.';
  //         if (structuralState === 'not-yet-satisfied') return 'not-yet-satisfied · Incomplete layout structure';
  //       }

  //       return null;
  //     }
  //   };
  // }

  // function makeScriptedConstraint({ title, description, hooks = {} }) {
  //   const validators = {};

  //   function createSyncSandbox(logicCode, argPattern) {
  //     try {
  //       return new Function(
  //         argPattern,
  //         `
  //     const window = undefined;
  //     const globalThis = undefined;
  //     const document = undefined;

  //     try {
  //       // Pass the arguments cleanly down into the user expression block
  //       const __user_expr__ = function(a, b, c) {
  //         ${logicCode}
  //       };
  //       return __user_expr__(arguments[0], arguments[1], arguments[2]);
  //     } catch (e) {
  //       return 'reject';
  //     }
  //     `
  //       );
  //     } catch (e) {
  //       return () => 'valid';
  //     }
  //   }

  //   if (hooks && hooks.validateToken) {
  //     validators.validateToken = createSyncSandbox(hooks.validateToken, 'token,ctx');
  //   }
  //   // Change 'words,ctx' to 'words,ctx,op' right here:
  //   if (hooks && hooks.validateStructure) {
  //     validators.validateStructure = createSyncSandbox(hooks.validateStructure, 'words,ctx,op');
  //   }

  //   // function serializeCtx(ctx, lineOverride = null) {
  //   //   const targetLine = lineOverride !== null ? lineOverride : (ctx.currentLine || '');
  //   //   const words = targetLine.trim().split(/\s+/).filter(Boolean);
  //   //   return {
  //   //     currentWord: String(ctx.currentWord || ''),
  //   //     currentLine: String(targetLine),
  //   //     prevWord: String(ctx.prevWord || ''),
  //   //     lineIdx: Number(ctx.lineIdx || 0),
  //   //     wordIdx: Number(words.length),
  //   //     colIdx: Number(ctx.colIdx || 0)
  //   //   };
  //   // }

  //   function serializeCtx(ctx, lineOverride = null) {
  //     const targetLine = lineOverride !== null ? lineOverride : (ctx.currentLine || '');
  //     const words = targetLine.trim().split(/\s+/).filter(Boolean);
  //     return {
  //       currentWord: String(ctx.currentWord || ''),
  //       currentLine: String(targetLine),
  //       prevWord: String(ctx.prevWord || ''),
  //       lineIdx: Number(ctx.lineIdx || 0),
  //       wordIdx: Number(words.length),
  //       colIdx: Number(ctx.colIdx || 0),
  //       lines: Array.isArray(ctx.lines) ? [...ctx.lines] : []
  //     };
  //   }

  //   return {
  //     kind: 'scripted',
  //     title: title || 'Scripted Constraint',
  //     description: description || 'Two-tier dynamic state validation script',

  //     canInsert: (ctx, ch) => {
  //       const safeCtx = serializeCtx(ctx);
  //       if (validators.validateToken && ch !== ' ' && ch !== '\n') {
  //         const nextWord = safeCtx.currentWord + ch;
  //         if (!validators.validateToken(nextWord, safeCtx)) {
  //           return { ok: false, why: 'insertion-reject' };
  //         }
  //       }
  //       return { ok: true };
  //     },

  //     canBreakSpace: (ctx) => {
  //       if (!validators.validateStructure) return { ok: true };
  //       const safeCtx = serializeCtx(ctx);
  //       const currentWords = safeCtx.currentLine.trim().split(/\s+/).filter(Boolean);

  //       // Explicitly passes 'space' as the 3rd parameter
  //       const structuralState = validators.validateStructure(currentWords, safeCtx, 'space');
  //       if (structuralState === 'reject') {
  //         return { ok: false, why: 'insertion-reject: Word limit reached.' };
  //       }
  //       return { ok: true };
  //     },

  //     canBreakLine: (ctx) => {
  //       if (!validators.validateStructure) return { ok: true };
  //       const safeCtx = serializeCtx(ctx);
  //       const currentWords = safeCtx.currentLine.trim().split(/\s+/).filter(Boolean);

  //       // Explicitly passes 'enter' as the 3rd parameter
  //       const structuralState = validators.validateStructure(currentWords, safeCtx, 'enter');
  //       if (structuralState !== 'valid') {
  //         return { ok: false, why: 'insertion-reject: Line incomplete.' };
  //       }
  //       return { ok: true };
  //     },

  //     lineFeedback: (ctx, i) => {
  //       const targetLine = ctx.lines[i] || '';
  //       if (!targetLine.trim()) return null;

  //       const safeCtx = serializeCtx(ctx, targetLine);
  //       safeCtx.lineIdx = i;
  //       const currentWords = targetLine.trim().split(/\s+/).filter(Boolean);

  //       if (validators.validateToken) {
  //         for (const token of currentWords) {
  //           if (!validators.validateToken(token, safeCtx)) return 'deletion-reject!';
  //         }
  //       }

  //       if (validators.validateStructure) {
  //         const structuralState = validators.validateStructure(currentWords, safeCtx, 'audit');
  //         if (structuralState === 'reject') return 'structural-reject!';
  //         if (structuralState === 'not-yet-satisfied') return 'not-yet-satisfied';
  //       }

  //       return null;
  //     }
  //   };
  // }

  function makeScriptedConstraint({ title, description, hooks = {} }) {
    const validators = {};

    function createSyncSandbox(logicCode, argPattern) {
      try {
        return new Function(
          argPattern,
          `
    const window = undefined;
    const globalThis = undefined;
    const document = undefined;

    try {
      // Named parameter routing explicitly handles up to 3 arguments
      // to bypass inner runtime resets of the arguments array container
      const __user_expr__ = function(a, b, c) {
        ${logicCode}
      };
      return __user_expr__(arguments[0], arguments[1], arguments[2]);
    } catch (e) {
      return 'reject';
    }
    `
        );
      } catch (e) {
        return () => 'valid';
      }
    }

    if (hooks && hooks.validateToken) {
      validators.validateToken = createSyncSandbox(hooks.validateToken, 'token,ctx');
    }
    // This explicitly sets up named argument slots for token-skipping calculations
    if (hooks && hooks.validateStructure) {
      validators.validateStructure = createSyncSandbox(hooks.validateStructure, 'words,ctx,op');
    }

    function serializeCtx(ctx, lineOverride = null) {
      const targetLine = lineOverride !== null ? lineOverride : (ctx.currentLine || '');
      const words = targetLine.trim().split(/\s+/).filter(Boolean);
      return {
        currentWord: String(ctx.currentWord || ''),
        currentLine: String(targetLine),
        prevWord: String(ctx.prevWord || ''),
        lineIdx: Number(ctx.lineIdx || 0),
        wordIdx: Number(words.length),
        colIdx: Number(ctx.colIdx || 0),
        lines: Array.isArray(ctx.lines) ? [...ctx.lines] : []
      };
    }

    return {
      kind: 'scripted',
      title: title || 'Scripted Constraint',
      description: description || 'Two-tier dynamic state validation script',

      canInsert: (ctx, ch) => {
        const safeCtx = serializeCtx(ctx);
        if (validators.validateToken && ch !== ' ' && ch !== '\n') {
          const nextWord = safeCtx.currentWord + ch;
          if (!validators.validateToken(nextWord, safeCtx)) {
            return { ok: false, why: 'insertion-reject' };
          }
        }
        return { ok: true };
      },

      canBreakSpace: (ctx) => {
        if (!validators.validateStructure) return { ok: true };
        const safeCtx = serializeCtx(ctx);
        const currentWords = safeCtx.currentLine.trim().split(/\s+/).filter(Boolean);

        // Pass the 'space' operator down into the structural validator layout
        const structuralState = validators.validateStructure(currentWords, safeCtx, 'space');
        if (structuralState === 'reject') {
          return { ok: false, why: 'insertion-reject: Word limit reached.' };
        }
        return { ok: true };
      },

      canBreakLine: (ctx) => {
        if (!validators.validateStructure) return { ok: true };
        const safeCtx = serializeCtx(ctx);
        const currentWords = safeCtx.currentLine.trim().split(/\s+/).filter(Boolean);

        // Pass the 'enter' operator down into the structural validator layout
        const structuralState = validators.validateStructure(currentWords, safeCtx, 'enter');
        if (structuralState !== 'valid') {
          return { ok: false, why: 'insertion-reject: Line incomplete.' };
        }
        return { ok: true };
      },

      lineFeedback: (ctx, i) => {
        const targetLine = ctx.lines[i] || '';
        if (!targetLine.trim()) return null;

        const safeCtx = serializeCtx(ctx, targetLine);
        safeCtx.lineIdx = i;
        const currentWords = targetLine.trim().split(/\s+/).filter(Boolean);

        // Tier 1 Validation Check (Token filtering layers)
        if (validators.validateToken) {
          for (const token of currentWords) {
            if (!validators.validateToken(token, safeCtx)) return 'deletion-reject!';
          }
        }

        // Tier 2 Validation Check (Structural macro calculations layer)
        if (validators.validateStructure) {
          const structuralState = validators.validateStructure(currentWords, safeCtx, 'audit');
          if (structuralState === 'reject') return 'structural-reject!';
          if (structuralState === 'not-yet-satisfied') return 'not-yet-satisfied';
        }

        return null;
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
        let allowed = new Set('abcdefghijklmnopqrstuvwxyz'.split(''));
        console.log('init allowed', allowed);
        for (const c of constraints) {
          if (typeof c.allowedLetters !== 'function') {
            for (const l of 'abcdefghijklmnopqrstuvwxyz') {
              const r = c.canInsert(ctx, l);
              if (!r.ok) allowed.delete(l);
            }
            console.log("No Function " + c.title + "" + allowed);
            continue;
          }

          const a = c.allowedLetters(ctx);
          if (!a) continue;
          for (const x of [...allowed]) if (!a.has(x)) allowed.delete(x);
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
      params: [{ id: 'vowel', label: 'Vowel', type: 'select', options: ['a', 'e', 'i', 'o', 'u'], default: 'a' }],
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

  function serializeConstraint(c) {
    return {
      formId: c.formId,
      params: c.params || {},
      community: c.community,
      regex: c.regex,
      script: c.script,
      logic: c.logic,
      title: c.instance?.title || c.instance?.name || c.title || (c.instance ? c.instance.title : undefined),
      description: c.instance?.description || c.description
    };
  }

  function deserializeConstraint(c) {
    let instance;
    if (c.community && global.OuvroirCommunity) {
      const allComm = global.OuvroirCommunity.all();
      const entry = allComm.find(e => e.id === c.community.id);
      if (entry) {
        instance = global.OuvroirCommunity.instantiate(entry);
      }
    }

    if (!instance) {
      if (c.script && c.script.hooks) {
        instance = makeScriptedConstraint({
          title: c.script.title,
          description: c.script.description,
          hooks: c.script.hooks
        });
      } else if (c.logic && c.logic.handler === 'word-chain') {
        instance = makeChainConstraint();
      } else if (c.regex) {
        instance = makeRegexConstraint({
          source: c.regex.source,
          flags: c.regex.flags || 'i',
          description: c.regex.blurb
        });
      } else if (c.formId) {
        const form = FORMS.find(f => f.id === c.formId);
        if (form) {
          const merged = {};
          (form.params || []).forEach(p => { merged[p.id] = c.params?.[p.id] ?? p.default; });
          instance = form.make(merged);
          instance.title = form.name;
        }
      }
    }

    if (!instance) return null;

    return {
      uid: 'u-' + Math.random().toString(36).slice(2, 9),
      formId: c.formId,
      params: c.params || {},
      community: c.community,
      regex: c.regex,
      script: c.script,
      logic: c.logic,
      instance: instance
    };
  }

  // ---- expose ---------------------------------------------------------
  global.Ouvroir = {
    ALPHA, VOWELS, NO_ASC_DESC,
    countSyllables, lineSyllables, makeCtx,
    makeLipogram, makeUnivocalism, makePrisoner, makeSnowball,
    makeHaiku, makeAbecedarian, makePalindrome, makeRegexConstraint,
    combine, FORMS, makeChainConstraint, makeScriptedConstraint,
    serializeConstraint, deserializeConstraint
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
const isRealModuleContext = (function () {
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
