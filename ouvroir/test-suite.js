// test-suite.js
import { makeScriptedConstraint } from './constraints.js';

export function runEditSequence(constraint, editHistory) {
  let text = "";
  let caret = 0;
  let lines = [""];

  function getMockCtx() {
    const currentLine = lines[lines.length - 1] || "";
    const wordMatch = currentLine.match(/[A-Za-z']*$/);
    const currentWord = wordMatch ? wordMatch[0] : "";
    const finishedWords = currentLine.slice(0, currentLine.length - currentWord.length).split(/\s+/).filter(Boolean);
    
    return {
      currentWord,
      currentLine,
      prevWord: finishedWords[finishedWords.length - 1] || "",
      lineIdx: lines.length - 1,
      wordIdx: finishedWords.length,
      colIdx: caret,
      lines: [...lines]
    };
  }

  for (const [idx, op] of editHistory) {
    caret = idx;
    const ctx = getMockCtx();

    if (op === "backspace" || op === "delete") {
      let curLine = lines[lines.length - 1];
      lines[lines.length - 1] = curLine.slice(0, idx) + curLine.slice(idx + 1);
    } else if (op === "\n") {
      const res = constraint.canBreakLine(ctx);
      if (!res.ok) return { ok: false, failedAt: '\\n', reason: res.why };
      lines.push("");
    } else if (op === " ") {
      const res = constraint.canBreakSpace(ctx);
      if (!res.ok) return { ok: false, failedAt: 'SPACE', reason: res.why };
      lines[lines.length - 1] += " ";
    } else {
      const res = constraint.canInsert(ctx, op);
      if (!res.ok) return { ok: false, failedAt: op, reason: res.why };
      lines[lines.length - 1] = lines[lines.length - 1].slice(0, idx) + op + lines[lines.length - 1].slice(idx);
    }
  }

  if (constraint.lineFeedback) {
    for (let i = 0; i < lines.length; i++) {
      const ctx = getMockCtx();
      const feedback = constraint.lineFeedback(ctx, i);
      if (feedback) return { ok: false, failedAt: 'lineFeedback', reason: feedback };
    }
  }

  return { ok: true, text: lines.join("\n") };
}

export const PRESET_TESTS = [
  {
    name: "Bug #1 Fix: Every word starts with a vowel (Instant blocking)",
    constraint: makeScriptedConstraint({
      hooks: { canInsert: "if (currentWord.length === 0 && /^[a-z]$/i.test(ch)) { return /^[aeiou]$/i.test(ch); } return true;" }
    }),
    history: [[0, "a"], [1, "l"], [2, "l"], [3, "o"], [4, "w"], [5, " "], [6, "m"]],
    expectedOk: false,
    expectedFailureAt: "m"
  },
  {
    name: "Bug #2 Fix: Odd words per line parity (Allow typing past word 2)",
    constraint: makeScriptedConstraint({
      hooks: { canBreakSpace: "return true;", canBreakLine: "return (wordIdx + (currentWord.length > 0 ? 1 : 0)) % 2 === 1;" }
    }),
    history: [[0, "A"], [1, "m"], [2, " "], [3, "I"], [4, " "]],
    expectedOk: true
  },
  {
    name: "Bug #4 Fix: Backspace exploit vulnerability catch ('oTo' variant)",
    constraint: makeScriptedConstraint({
      hooks: {
        canInsert: "if (colIdx === 0 && /^[a-z]$/i.test(ch)) { return /^[aeiou]$/i.test(ch); } return true;",
        lineFeedback: "if (currentLine.length > 0) { if (!/^[aeiou]/i.test(currentLine)) return 'Doesn\\'t start with a vowel'; } return null;"
      }
    }),
    history: [[0, "o"], [1, "T"], [2, "o"], [0, "backspace"]],
    expectedOk: false,
    expectedFailureAt: "lineFeedback"
  }
];