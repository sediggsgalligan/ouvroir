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
    
    // Calculate finished words before the current one
    const finishedWords = currentLine.slice(0, currentLine.length - currentWord.length)
      .split(/\s+/)
      .filter(Boolean);
      
    const wordIdx = finishedWords.length;
    const prevWord = finishedWords[finishedWords.length - 1] || "";
    
    return {
      currentWord,
      currentLine,
      prevWord,
      lineIdx: lines.length - 1,
      wordIdx,
      colIdx: caret,
      lines: [...lines]
    };
  }

  for (const [idx, op] of editHistory) {
    caret = idx;
    const ctx = getMockCtx();

    if (op === "backspace") {
      let curLine = lines[lines.length - 1];
      // Backspace removes the character sitting right before the cursor index
      if (idx >= 0) {
        lines[lines.length - 1] = curLine.slice(0, idx) + curLine.slice(idx + 1);
      }
    } else if (op === "delete") {
      let curLine = lines[lines.length - 1];
      // Delete removes the character sitting right at the cursor index
      lines[lines.length - 1] = curLine.slice(0, idx) + curLine.slice(idx + 1);
    } else if (op === "\n") {
      const res = constraint.canBreakLine(ctx);
      if (!res.ok) return { ok: false, failedAt: '\\n', reason: res.why };
      lines.push("");
      caret = 0;
    } else if (op === " ") {
      const res = constraint.canBreakSpace(ctx);
      if (!res.ok) return { ok: false, failedAt: 'SPACE', reason: res.why };
      lines[lines.length - 1] = lines[lines.length - 1].slice(0, idx) + " " + lines[lines.length - 1].slice(idx);
      caret++;
    } else {
      // Normal character insertion step
      const res = constraint.canInsert(ctx, op);
      if (!res.ok) return { ok: false, failedAt: op, reason: res.why };
      lines[lines.length - 1] = lines[lines.length - 1].slice(0, idx) + op + lines[lines.length - 1].slice(idx);
      caret++;
    }
  }

  // Run our foolproof post-deletion line auditor check across the generated text block
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
    name: "Scenario #1: Every word starts with a vowel (Instant blocking)",
    constraint: makeScriptedConstraint({
      title: "Vowel Starters",
      description: "Every word must start with a vowel.",
      hooks: {
        canInsert: "if (currentWord.length === 0 && /^[a-z]$/i.test(ch)) { return /^[aeiou]$/i.test(ch); } return true;",
        canBreakSpace: "return true;",
        canBreakLine: "return true;"
      }
    }),
    history: [[0, "a"], [1, "l"], [2, "l"], [3, "o"], [4, "w"], [5, " "], [6, "m"]],
    expectedOk: false,
    expectedFailureAt: "m"
  },
  {
    name: "Scenario #2: Odd words per line parity rule (Normal spacing check)",
    constraint: makeScriptedConstraint({
      title: "Odd Words Per Line",
      description: "Lines must end with an odd word count.",
      hooks: {
        canInsert: "return true;",
        canBreakSpace: "return true; // Continues typing cleanly",
        canBreakLine: "return (wordIdx + (currentWord.length > 0 ? 1 : 0)) % 2 === 1;"
      }
    }),
    history: [[0, "A"], [1, "m"], [2, " "], [3, "I"], [4, " "]],
    expectedOk: true
  },
  {
    name: "Scenario #3: Every line must begin and end with a vowel (Partial flow toleration)",
    constraint: makeScriptedConstraint({
      title: "Vowel Bookends",
      description: "Lines begin and end with vowels.",
      hooks: {
        canInsert: "if (colIdx === 0 && /^[a-z]$/i.test(ch)) { return /^[aeiou]$/i.test(ch); } return true;",
        canBreakSpace: "return true;",
        canBreakLine: "return /[aeiou]$/i.test(currentLine);"
      }
    }),
    history: [[0, "a"], [1, "l"], [2, "l"], [3, "o"], [4, "w"]],
    expectedOk: true
  },
  {
    name: "Scenario #4: Foolproof Deletion Safety Audit ('oTo' exploit catch)",
    constraint: makeScriptedConstraint({
      title: "Foolproof Vowel Bookends",
      description: "Uses layout validation against deletion tricks.",
      hooks: {
        canInsert: "if (colIdx === 0 && /^[a-z]$/i.test(ch)) { return /^[aeiou]$/i.test(ch); } return true;",
        canBreakSpace: "return true;",
        canBreakLine: "return /[aeiou]$/i.test(currentLine);",
        lineFeedback: "if (currentLine.length > 0) { if (!/^[aeiou]/i.test(currentLine)) return 'Doesn\\'t start with a vowel'; if (!/[aeiou]$/i.test(currentLine)) return 'Doesn\\'t end with a vowel'; } return null;"
      }
    }),
    history: [
      [0, "o"], [1, "T"], [2, "o"], // User types "oTo" successfully
      [0, "backspace"]              // User goes back to index 0 and deletes the 'o'
    ],
    expectedOk: false,
    expectedFailureAt: "lineFeedback"
  }
];