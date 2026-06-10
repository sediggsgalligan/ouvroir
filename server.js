// server.js
const express = require('express');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
app.use(express.json());
app.use(cors()); // Permits your static frontend domain to execute calls here

const ALLOW_GUESTS = false;

// Configure environments using variables managed safely on Render
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Token Verification Middleware
async function checkGoogleAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header token' });
  }

  const idToken = authHeader.split(' ')[1];

  if (idToken.startsWith('guest:')) {
    if (!ALLOW_GUESTS) {
      return res.status(403).json({ error: 'Guest accounts are disabled. Please sign in.' });
    }
    const guestName = idToken.split(':')[1] || 'Guest';
    req.user = {
      email: `guest-${guestName.toLowerCase()}@example.com`,
      name: guestName,
      given_name: guestName
    };
    return next();
  }

  try {
    // Verifies the token structure cryptographically directly against Google's public keys
    const ticket = await googleClient.verifyIdToken({
      idToken: idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    req.user = payload; // Passes authenticated email, name metadata forward
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid Google Authentication Token' });
  }
}

// // Secured endpoint proxying regular expressions to DeepSeek
// app.post('/api/generate', checkGoogleAuth, async (req, res) => {
//   try {
//     const response = await fetch('https://api.deepseek.com/chat/completions', {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//         'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
//       },
//       body: JSON.stringify(req.body)
//     });

//     if (!response.ok) {
//       const errorText = await response.text();
//       return res.status(response.status).json({ error: `DeepSeek Error: ${errorText}` });
//     }

//     const data = await response.json();
//     res.json(data);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

// server.js
app.post('/api/generate', checkGoogleAuth, async (req, res) => {
  const { userPrompt } = req.body; // The frontend now just sends the raw text

  console.log('Received generation request with prompt:', userPrompt);

  // const systemInstructions = [
  //   'You are an expert Oulipian constraint architect scriptwriter.',
  //   'Return STRICT JSON: {"type": "script", "title": "...", "hooks": {"validate": "..."}}',
  //   '',
  //   'RULES FOR THE VALIDATE HOOK:',
  //   'You must write a single unified JavaScript expression string assigned to the "validate" key.',
  //   'It will evaluate variables found in "ctx" to compute textual integrity.',
  //   'Your code MUST return exactly one of three string status options: "valid", "not-yet-satisfied", or "reject".',
  //   '',
  //   'Variables accessible to you inside the evaluation frame:',
  //   ' - currentLine: String value of the current active text row line layout.',
  //   ' - currentWord: String value of the current active token slice block segment.',
  //   ' - prevWord: String value of the word preceding the selection index pointer.',
  //   ' - wordIdx: Zero-indexed integer index representing the absolute position count of words on this line.',
  //   ' - colIdx: Integer reflecting character spacing indices.',
  //   '',
  //   'CRITICAL: PROGRESSIVE TOKEN TYPING RULE',
  //   'Do not return "reject" for an intermediate typing state that COULD become valid with more characters.',
  //   'If a word, number, or token is currently invalid because it is incomplete, but the user is actively typing it (the line ends with a letter or digit), you MUST return "not-yet-satisfied".',
  //   'Only return "reject" if the token is fundamentally unrecoverable, or if the user types a space or punctuation attempting to lock in and exit the invalid token.',
  //   'Exception to Progressive Typing: Character-level filters (e.g., banning specific letters, like Lipograms or Vowels Only rules) are instantly unrecoverable. If a user types a strictly forbidden character, return "reject" immediately. Do NOT use "not-yet-satisfied" for character-level bans, as a forbidden letter can never become valid by adding more text.',
  //   'Structural Boundary Rule (Word/Syllable Counters): When counting discrete tokens like words or syllables, pressing a space bar or trailing whitespace represents the active creation of the NEXT token. Do NOT reject trailing spaces on sequential constraints unless an absolute maximum limit has been exceeded. If a sequence is currently even/invalid but can become odd/valid by adding another word, a trailing space should return "valid" or "not-yet-satisfied", never "reject".',
  //   'Continuous Token Typing Extension: When a constraint limits word or token sequences, always check if the user is actively typing inside a token via alphanumeric regex match (`/[a-zA-Z0-9]$/.test(currentLine)`). If the count is currently invalid but a token is actively being typed, you must return "not-yet-satisfied" to allow the word to be spelled out. Only return "reject" if the user attempts to finalize the token layout with a space, punctuation, or line-break.',
  //   '',
  //   'EXAMPLE 1 (Every line must contain exactly 4 words):',
  //   '{',
  //   '  "type": "script",',
  //   '  "title": "Strict Quad Word Counter",',
  //   '  "hooks": {',
  //   '    "validate": "const words = currentLine.trim().split(/\\\\s+/).filter(Boolean); if (words.length < 4) return \'not-yet-satisfied\'; if (words.length === 4) return \'valid\'; return \'reject\';"',
  //   '  }',
  //   '}',
  //   '',
  //   'EXAMPLE 2 (Every number must be an even number - Progressive Rule Example):',
  //   '{',
  //   '  "type": "script",',
  //   '  "title": "Even Numbers Only",',
  //   '  "hooks": {',
  //   '    "validate": "const nums = currentLine.match(/\\\\d+/g); if (!nums) return \'valid\'; const typingInProgress = /\\\\d$/.test(currentLine); for (let i = 0; i < nums.length; i++) { if (parseInt(nums[i]) % 2 !== 0) { if (i === nums.length - 1 && typingInProgress) return \'not-yet-satisfied\'; return \'reject\'; } } return \'valid\';"',
  //   '  }',
  //   '}'
  // ].join('\n');

  // const systemInstructions = [
  //   'You are an expert Oulipian constraint architect scriptwriter.',
  //   'Return STRICT JSON: {"type": "script", "title": "...", "hooks": {"validateToken": "...", "validateStructure": "..."}}',
  //   '',
  //   'RULES FOR THE HOOK ARCHITECTURE:',
  //   '1. validateToken(token, ctx):',
  //   '   - Checks inline characters. Returns true (allowed) or false (blocked).',
  //   '   - Continuous Sequence Matching: When filtering characters inside validateToken using regular expressions, always use quantifiers (like `+` or `*`) instead of strict single-character matches unless otherwise implied (e.g., use `/^[aeiou]+$/` instead of `/^[aeiou]$/`). This ensures the function returns true as the word grows across multiple keystrokes.',
  //   '',
  //   '2. validateStructure(words, ctx):',
  //   '   - Evaluates macro token layout arrays. MUST return a string enum: "valid", "not-yet-satisfied", or "reject".',
  //   '   - "valid": The row alignment meets the rule criteria exactly.',
  //   '   - "not-yet-satisfied": The layout is currently illegal, but COULD become valid if the user keeps adding words (e.g., having 2 words when you want an odd number). This allows typing to continue.',
  //   '   - "reject": The structural layout has completely exceeded a threshold and can NEVER be fixed by typing more words forward (e.g., having 4 words when the limit is a max of 3). This hard-blocks further input.',
  //   '   - Cross-Line Historical Rule: When constraints depend on comparing text layout metrics against previous lines (e.g., rhyming structural maps, or decreasing word counts), do NOT mutate variables or store state locally on ctx. Instead, use the `ctx.lines` array to dynamically scan backward and evaluate the previous line fields natively (e.g., scan `ctx.lines[ctx.lineIdx - 1]`). For progressive lines, keep validation in fluid editing states, but return "reject" on `op === \'enter\'` if the structural comparison matrix fails.'
  //   '',
  //   'EXAMPLE 1 (Each line must have an odd number of words):',
  //   '{',
  //   '  "type": "script",',
  //   '  "title": "Odd Word Count Per Line",',
  //   '  "hooks": {',
  //   '    "validateToken": "return true;",',
  //   '    "validateStructure": "if (words.length % 2 === 1) return \'valid\'; return \'not-yet-satisfied\';"',
  //   '  }',
  //   '}',
  //   '',
  //   'EXAMPLE 2 (Exactly 4 words per line - Hard Cap Space Block):',
  //   '{',
  //   '  "type": "script",',
  //   '  "title": "4 Words Per Line",',
  //   '  "hooks": {',
  //   '    "validateToken": "return true;",',
  //   '    "validateStructure": "if (words.length < 4) return \'not-yet-satisfied\'; if (words.length === 4) { return op === \'space\' ? \'reject\' : \'valid\'; } return \'reject\';"',
  //   '  }',
  //   '}',
  //   'EXAMPLE 3 (Dynamic line-dependent counts - Progressive Line Progression):',
  //   '{',
  //   '  "type": "script",',
  //   '  "title": "Incrementing Line Word Counter",',
  //   '  "hooks": {',
  //   '    "validateToken": "return true;",',
  //   '    "validateStructure": "const target = ctx.lineIdx + 1; if (words.length < target) return \'not-yet-satisfied\'; if (words.length === target) { return op === \'space\' ? \'reject\' : \'valid\'; } return \'reject\';"',
  //   '  }',
  //   '}'
  // ].join('\n');

 // System prompt for the Ouvroir constraint compiler (DeepSeek)
// Changes:
//   - Schema + every example now carries a "user_input" field: natural-language
//     phrasings a user might type for that constraint.
//   - Two new architecture rules: Boundary-Only Word Validation, Token-First Principle.
//   - New examples 5-11: fib poem, no repeated words, same first letter per line,
//     words beginning/ending with the same letter, no double letters, lipogram, snowball.

const CONSTRAINT_SYSTEM_PROMPT = [
    'You are an expert Oulipian constraint architect scriptwriter.',
    'Return STRICT JSON: {"type": "script", "title": "...", "user_input": ["..."], "hooks": {"validateToken": "...", "validateStructure": "..."}}',
    '',
    'The "user_input" field is an array of one or more natural-language phrasings of the constraint being implemented. In the examples below it shows how a user might have described that constraint. In your own output, echo the actual request you were given (lightly normalized) as the first entry.',
    '',
    'RULES FOR THE HOOK ARCHITECTURE:',
    '1. validateToken(token, ctx):',
    '   - Checks inline characters. Returns true (allowed) or false (blocked).',
    '   - Continuous Sequence Matching: When filtering characters inside validateToken using regular expressions, always use quantifiers (like `+` or `*`) instead of strict single-character matches unless otherwise implied (e.g., use `/^[aeiou]+$/` instead of `/^[aeiou]$/`). This ensures the function returns true as the word grows across multiple keystrokes.',
    '   - Token-First Principle: Constraints that operate purely on the characters inside a single word (lipograms, banned letters, doubled letters, allowed alphabets) belong in validateToken, which blocks illegal keystrokes immediately. In those cases keep validateStructure as a trivial "return \'valid\';".',
    '',
    '2. validateStructure(words, ctx, op):',
    '   - Evaluates macro token layout arrays. MUST return a string enum: "valid", "not-yet-satisfied", or "reject".',
    '   - Variables available in ctx includes "lines", which is a flat array of RAW strings representing previous rows (e.g. ["hello world", "test"]). Raw strings do NOT have custom properties like .words; you must manually split them via .trim().split(/\\\\s+/) inside your hook code.',
    '   - "valid": The row alignment meets the rule criteria exactly.',
    '   - "not-yet-satisfied": The layout is currently illegal, but COULD become valid if the user keeps adding words. This allows typing to continue.',
    '   - "reject": The structural layout has completely exceeded a threshold or broken an invariant and can NEVER be fixed by typing more words forward. This hard-blocks further input.',
    '   - Cross-Line Historical Rule: When constraints depend on comparing metrics against previous lines (e.g., decreasing word counts), do NOT mutate variables or store state locally on ctx. Instead, use the `ctx.lines` array to dynamically look back.',
    '   - Intent-Aware Word Blocking: When a structural rule places a hard cap on a specific keyword (e.g., exactly 4 instances of a word), do NOT blindly return "reject" on `op === \'space\'`. Check if the user is actively typing that specific forbidden keyword by inspecting `ctx.currentWord.toLowerCase().replace(/[^a-z]/g, \'\')`. If they are typing a different word, return "valid" so they can type freely around the restricted tokens.',
    '   - Open Baseline / Decreasing Rule: If a constraint specifies that a line pattern can start with ANY arbitrary number (e.g., "starts with any number of keywords, then strictly decreases"), line zero (ctx.lineIdx === 0) has NO MAXIMUM CAP. It must allow an infinite number of target keywords to be typed. Never return "reject" on line zero for typing a target keyword; only use "not-yet-satisfied" on op === "enter" if the user attempts to leave line zero with a count of 0.',
    '   - Terminal Baseline Rule: When constraints require metrics to strictly decrease or change relative to previous lines, always handle the zero/terminal boundary condition. If a baseline calculation hits 0, allow 0 to remain a stable, repeatable state for subsequent lines so the user does not get permanently trapped in a mathematically impossible negative dead-end row.',
    '   - Boundary-Only Word Validation: Word-level rules that the user could still satisfy by typing MORE LETTERS into the current word (e.g., a word must end with a given letter, or must reach a target length) must NEVER return "reject" mid-word. Only validate completed words: when op is \'space\' or \'enter\', validate every entry in `words`; otherwise exclude the final in-progress word from the check. Return "not-yet-satisfied" (not "reject") when the failing word can still be extended into a legal one, so the boundary keystroke is withheld but typing continues.',
    '',
    'EXAMPLE 1 (Each line must have an odd number of words):',
    '{',
    '  "type": "script",',
    '  "title": "Odd Word Count Per Line",',
    '  "user_input": ["every line must have an odd number of words", "odd word counts only"],',
    '  "hooks": {',
    '    "validateToken": "return true;",',
    '    "validateStructure": "if (words.length % 2 === 1) return \'valid\'; return \'not-yet-satisfied\';"',
    '  }',
    '}',
    '',
    'EXAMPLE 2 (Exactly 4 words per line - Hard Cap Space Block):',
    '{',
    '  "type": "script",',
    '  "title": "4 Words Per Line",',
    '  "user_input": ["exactly four words per line", "each line is 4 words long"],',
    '  "hooks": {',
    '    "validateToken": "return true;",',
    '    "validateStructure": "if (words.length < 4) return \'not-yet-satisfied\'; if (words.length === 4) { return op === \'space\' ? \'reject\' : \'valid\'; } return \'reject\';"',
    '  }',
    '}',
    '',
    'EXAMPLE 3 (Dynamic line-dependent counts - Progressive Line Progression):',
    '{',
    '  "type": "script",',
    '  "title": "Incrementing Line Word Counter",',
    '  "user_input": ["line one has one word, line two has two words, and so on", "each line gets one more word than the last"],',
    '  "hooks": {',
    '    "validateToken": "return true;",',
    '    "validateStructure": "const target = ctx.lineIdx + 1; if (words.length < target) return \'not-yet-satisfied\'; if (words.length === target) { return op === \'space\' ? \'reject\' : \'valid\'; } return \'reject\';"',
    '  }',
    '}',
    '',
    'EXAMPLE 4 (Strictly Decreasing Word Occurrences - Open Baseline/Start at Any Number):',
    '{',
    '  "type": "script",',
    '  "title": "Strictly Decreasing Keyword Count",',
    '  "user_input": ["start with any number of hellos, then each line must say hello fewer times than the line before"],',
    '  "hooks": {',
    '    "validateToken": "return true;",',
    '    "validateStructure": "const getCount = (arr) => arr.filter(w => w.toLowerCase().replace(/[^a-z]/g, \'\') === \'hello\').length; const currentCount = getCount(words); const typingTarget = ctx.currentWord.toLowerCase().replace(/[^a-z]/g, \'\') === \'hello\'; if (ctx.lineIdx === 0) { if (op === \'enter\' && currentCount === 0) return \'not-yet-satisfied\'; return \'valid\'; } const prevRawStr = ctx.lines[ctx.lineIdx - 1] || \'\'; const prevWords = prevRawStr.trim().split(/\\\\s+/).filter(Boolean); const prevCount = getCount(prevWords); if (prevCount === 0) { return currentCount === 0 ? \'valid\' : \'reject\'; } if (op === \'enter\') { return currentCount < prevCount ? \'valid\' : \'reject\'; } if (currentCount === prevCount && typingTarget) return \'reject\'; return \'valid\';"',
    '  }',
    '}',
    '',
    'EXAMPLE 5 (Fibonacci poem - syllable count per line follows 1/1/2/3/5/8/13...):',
    '{',
    '  "type": "script",',
    '  "title": "Fib Poem (Fibonacci Syllables)",',
    '  "user_input": ["fib poem", "fibonacci poem where syllables per line follow 1, 1, 2, 3, 5, 8", "write a fib"],',
    '  "hooks": {',
    '    "validateToken": "return true;",',
    '    "validateStructure": "const syl = (w) => { const s = w.toLowerCase().replace(/[^a-z]/g, \'\'); if (!s) return 0; let n = (s.match(/[aeiouy]+/g) || []).length; if (s.length > 2 && s.charAt(s.length - 1) === \'e\' && s.charAt(s.length - 2) !== \'l\' && n > 1) { n = n - 1; } return n > 0 ? n : 1; }; const fib = (i) => { let a = 1, b = 1; for (let k = 0; k < i; k++) { const t = a + b; a = b; b = t; } return a; }; const target = fib(ctx.lineIdx); let total = 0; for (const w of words) { total += syl(w); } if (total < target) return \'not-yet-satisfied\'; if (total === target) { return op === \'space\' ? \'reject\' : \'valid\'; } return \'reject\';"',
    '  }',
    '}',
    '',
    'EXAMPLE 6 (No repeated words anywhere in the poem - Boundary-Only duplicate check):',
    '{',
    '  "type": "script",',
    '  "title": "No Repeated Words",',
    '  "user_input": ["no repeated words", "every word in the poem must be unique", "never use the same word twice"],',
    '  "hooks": {',
    '    "validateToken": "return true;",',
    '    "validateStructure": "const norm = (w) => w.toLowerCase().replace(/[^a-z]/g, \'\'); const isBoundary = (op === \'space\' || op === \'enter\'); const pool = []; for (let i = 0; i < ctx.lineIdx; i++) { const ws = (ctx.lines[i] || \'\').trim().split(/\\\\s+/).filter(Boolean); for (const w of ws) { const n = norm(w); if (n) pool.push(n); } } const curArr = isBoundary ? words : words.slice(0, words.length - 1); for (const w of curArr) { const n = norm(w); if (n) pool.push(n); } const seen = {}; for (const w of pool) { if (seen[w]) return \'reject\'; seen[w] = true; } return \'valid\';"',
    '  }',
    '}',
    '',
    'EXAMPLE 7 (First letter of every line must match line one - immediate reject on wrong first keystroke):',
    '{',
    '  "type": "script",',
    '  "title": "Anaphoric First Letter",',
    '  "user_input": ["the first letter of every line must be the same", "all lines start with the same letter as the first line"],',
    '  "hooks": {',
    '    "validateToken": "return true;",',
    '    "validateStructure": "const firstLetter = (arr) => { for (const w of arr) { const s = w.toLowerCase().replace(/[^a-z]/g, \'\'); if (s) return s.charAt(0); } return null; }; if (ctx.lineIdx === 0) { if (op === \'enter\' && !firstLetter(words)) return \'not-yet-satisfied\'; return \'valid\'; } const baseWords = (ctx.lines[0] || \'\').trim().split(/\\\\s+/).filter(Boolean); const required = firstLetter(baseWords); if (!required) return \'valid\'; const current = firstLetter(words); if (!current) { return op === \'enter\' ? \'not-yet-satisfied\' : \'valid\'; } return current === required ? \'valid\' : \'reject\';"',
    '  }',
    '}',
    '',
    'EXAMPLE 8 (Each word must begin and end with the same letter - Boundary-Only, word can grow to fix itself):',
    '{',
    '  "type": "script",',
    '  "title": "Matching First and Last Letters",',
    '  "user_input": ["each word must begin and end with the same letter", "words start and end with the same letter"],',
    '  "hooks": {',
    '    "validateToken": "return true;",',
    '    "validateStructure": "const ok = (w) => { const s = w.toLowerCase().replace(/[^a-z]/g, \'\'); if (!s) return true; return s.charAt(0) === s.charAt(s.length - 1); }; const isBoundary = (op === \'space\' || op === \'enter\'); const toCheck = isBoundary ? words : words.slice(0, words.length - 1); for (const w of toCheck) { if (!ok(w)) return \'not-yet-satisfied\'; } return \'valid\';"',
    '  }',
    '}',
    '',
    'EXAMPLE 9 (No double letters - pure token-level constraint, blocked at the keystroke):',
    '{',
    '  "type": "script",',
    '  "title": "No Double Letters",',
    '  "user_input": ["no double letters", "no letter may appear twice in a row inside a word"],',
    '  "hooks": {',
    '    "validateToken": "const s = token.toLowerCase(); for (let i = 1; i < s.length; i++) { if (s.charAt(i) === s.charAt(i - 1) && s.charAt(i) >= \'a\' && s.charAt(i) <= \'z\') return false; } return true;",',
    '    "validateStructure": "return \'valid\';"',
    '  }',
    '}'
    'EXAMPLE 10 (Every line must end with the same word - Enter-Only Suffix Validation, baseline set by line one):',
    '{',
    '  "type": "script",',
    '  "title": "Shared Final Word",',
    '  "user_input": ["every line should end with the same word", "all lines must finish on the word that ends the first line"],',
    '  "hooks": {',
    '    "validateToken": "return true;",',
    '    "validateStructure": "if (op !== \'enter\') return \'valid\'; const norm = (w) => w.toLowerCase().replace(/[^a-z]/g, \'\'); const lastWord = (arr) => { for (let i = arr.length - 1; i >= 0; i--) { const n = norm(arr[i]); if (n) return n; } return null; }; const cur = lastWord(words); if (!cur) return \'not-yet-satisfied\'; if (ctx.lineIdx === 0) return \'valid\'; const baseWords = (ctx.lines[0] || \'\').trim().split(/\\\\s+/).filter(Boolean); const required = lastWord(baseWords); if (!required) return \'valid\'; return cur === required ? \'valid\' : \'not-yet-satisfied\';"',
    '  }',
    '}'
].join('\n');

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemInstructions },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      })
    });

    console.log('prompt', [
      { role: 'system', content: systemInstructions },
      { role: 'user', content: userPrompt }
    ]);

    const data = await response.json();
    console.log('DeepSeek response:', data.choices[0].message);
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Database utilities (SQLite)
const dbDir = process.env.DISK_PATH || __dirname;
const sqlitePath = path.join(dbDir, 'ouvroir.sqlite');

if (!process.env.DISK_PATH && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(sqlitePath);
sqlite.pragma('journal_mode = WAL');
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS poems (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS constraints (
    id TEXT PRIMARY KEY,
    key TEXT UNIQUE,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stars (
    userId TEXT NOT NULL,
    constraintId TEXT NOT NULL,
    PRIMARY KEY (userId, constraintId)
  );

  CREATE TABLE IF NOT EXISTS poem_stars (
    userId TEXT NOT NULL,
    poemId TEXT NOT NULL,
    PRIMARY KEY (userId, poemId)
  );
`);

function safeParseJson(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch (_err) {
    return fallback;
  }
}

function readDb() {
  try {
    const poems = sqlite.prepare('SELECT data FROM poems').all()
      .map(r => safeParseJson(r.data, null))
      .filter(Boolean);

    const constraints = sqlite.prepare('SELECT data FROM constraints').all()
      .map(r => safeParseJson(r.data, null))
      .filter(Boolean);

    const stars = sqlite.prepare('SELECT userId, constraintId FROM stars').all();
    const poemStars = sqlite.prepare('SELECT userId, poemId FROM poem_stars').all();

    return { poems, constraints, stars, poemStars };
  } catch (e) {
    console.error('Error reading SQLite database:', e);
    return { poems: [], constraints: [], stars: [], poemStars: [] };
  }
}

function writeDb(data) {
  try {
    const tx = sqlite.transaction((payload) => {
      sqlite.prepare('DELETE FROM poems').run();
      sqlite.prepare('DELETE FROM constraints').run();
      sqlite.prepare('DELETE FROM stars').run();
      sqlite.prepare('DELETE FROM poem_stars').run();

      const insertPoem = sqlite.prepare('INSERT INTO poems (id, data) VALUES (?, ?)');
      const insertConstraint = sqlite.prepare('INSERT INTO constraints (id, key, data) VALUES (?, ?, ?)');
      const insertStar = sqlite.prepare('INSERT INTO stars (userId, constraintId) VALUES (?, ?)');
      const insertPoemStar = sqlite.prepare('INSERT INTO poem_stars (userId, poemId) VALUES (?, ?)');

      (payload.poems || []).forEach((p) => {
        if (!p || !p.id) return;
        insertPoem.run(p.id, JSON.stringify(p));
      });

      (payload.constraints || []).forEach((c) => {
        if (!c || !c.id) return;
        insertConstraint.run(c.id, c.key || null, JSON.stringify(c));
      });

      (payload.stars || []).forEach((s) => {
        if (!s || !s.userId || !s.constraintId) return;
        insertStar.run(s.userId, s.constraintId);
      });

      (payload.poemStars || []).forEach((s) => {
        if (!s || !s.userId || !s.poemId) return;
        insertPoemStar.run(s.userId, s.poemId);
      });
    });

    tx(data || {});
  } catch (e) {
    console.error('Error writing SQLite database:', e);
  }
}

function getConstraintKey(c) {
  if (c.regex) {
    return `regex:${c.regex.source}:${c.regex.flags || ''}`;
  } else if (c.script) {
    const hooksKey = Object.entries(c.script.hooks || {})
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join(';');
    return `script:${c.script.title}:${hooksKey}`;
  } else if (c.logic) {
    return `logic:${c.logic.handler}`;
  } else if (c.formId) {
    const paramsKey = Object.entries(c.params || {})
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join(';');
    return `form:${c.formId}:${paramsKey}`;
  }
  return null;
}

// Ancestry chain walker
function getAncestryChain(poem, db) {
  const chain = [];
  let current = poem;
  const visited = new Set();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift({
      id: current.id,
      title: current.title,
      author: current.author,
      userId: current.userId,
      createdAt: current.createdAt || current.updatedAt || Date.now(),
      public: current.public
    });
    if (current.parentPoemId) {
      current = db.poems.find(p => p.id === current.parentPoemId);
    } else {
      break;
    }
  }
  return chain;
}

function enrichPoemForViewer(poem, db, viewerUserId) {
  const chain = getAncestryChain(poem, db);
  const original = chain[0] || null;
  const currentAuthor = poem.author;
  const currentHandle = currentAuthor ? `@${currentAuthor}` : '@Unknown';
  const originalHandle = original?.author ? `@${original.author}` : '@Unknown';

  return {
    ...poem,
    ancestry: chain,
    originalAuthor: original?.author || null,
    originalUserId: original?.userId || null,
    isRiff: !!original && !!currentAuthor && original.author !== currentAuthor,
    riffSummary: !!original && !!currentAuthor && original.author !== currentAuthor
      ? `${currentHandle} - riffing off of ${originalHandle} et al.`
      : currentHandle,
    viewerOwnsPoem: poem.userId === viewerUserId
  };
}

// Poems endpoints
app.get('/api/poems', checkGoogleAuth, (req, res) => {
  const db = readDb();
  const userPoems = db.poems.filter(p => p.userId === req.user.email);
  res.json(userPoems);
});

app.get('/api/poems/mine', checkGoogleAuth, (req, res) => {
  const db = readDb();
  const userPoems = db.poems.filter(p => p.userId === req.user.email);

  if (!db.poemStars) {
    db.poemStars = [];
  }

  const result = userPoems.map(p => {
    const starCount = db.poemStars.filter(s => s.poemId === p.id).length;
    const starred = db.poemStars.some(s => s.userId === req.user.email && s.poemId === p.id);
    const enriched = enrichPoemForViewer(p, db, req.user.email);
    return {
      ...enriched,
      starred,
      starCount
    };
  });

  res.json(result);
});

app.get('/api/poems/all', checkGoogleAuth, (req, res) => {
  const db = readDb();
  const publicPoems = db.poems.filter(p => p.public === true && p.archived !== true);

  if (!db.poemStars) {
    db.poemStars = [];
  }

  const result = publicPoems.map(p => {
    const starCount = db.poemStars.filter(s => s.poemId === p.id).length;
    const starred = db.poemStars.some(s => s.userId === req.user.email && s.poemId === p.id);
    const enriched = enrichPoemForViewer(p, db, req.user.email);
    return {
      ...enriched,
      starred,
      starCount
    };
  });

  res.json(result);
});

app.get('/api/poems/:id/checkpoints', checkGoogleAuth, (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const poem = db.poems.find(p => p.id === id);

  if (!poem) {
    return res.status(404).json({ error: 'Poem not found' });
  }

  if (poem.userId !== req.user.email) {
    return res.status(403).json({ error: 'Only the poem owner can view checkpoints' });
  }

  const checkpoints = (poem.checkpoints || []).slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return res.json({ poemId: poem.id, checkpoints });
});

app.post('/api/poems', checkGoogleAuth, (req, res) => {
  const { id, title, text, constraints, public: isPublic } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Poem text is required' });
  }

  const db = readDb();
  let poem = null;

  // Check if we are updating an existing poem owned by this user
  if (id) {
    const existing = db.poems.find(p => p.id === id);
    if (existing && existing.userId === req.user.email) {
      poem = existing;
    }
  }

  if (poem) {
    // Overwrite the existing poem
    poem.title = title || 'Untitled Poem';
    poem.text = text;
    poem.constraints = constraints || [];
    poem.public = isPublic === true;
    if (typeof poem.archived !== 'boolean') {
      poem.archived = false;
    }
    poem.updatedAt = Date.now();

    if (!poem.checkpoints) {
      poem.checkpoints = [];
    }
    poem.checkpoints.push({
      id: 'cp-' + Math.random().toString(36).slice(2, 9),
      timestamp: Date.now(),
      title: poem.title,
      text: poem.text,
      constraints: poem.constraints,
      public: poem.public,
      author: req.user.given_name || req.user.name,
      userId: req.user.email
    });
  } else {
    // Create new poem (or fork)
    const newId = 'p-' + Math.random().toString(36).slice(2, 9);
    let parentPoemId = null;

    if (id) {
      const parent = db.poems.find(p => p.id === id);
      if (parent) {
        parentPoemId = parent.id;
      }
    }

    poem = {
      id: newId,
      title: title || 'Untitled Poem',
      text: text,
      constraints: constraints || [],
      userId: req.user.email,
      author: req.user.given_name || req.user.name,
      public: isPublic === true,
      archived: false,
      parentPoemId: parentPoemId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      checkpoints: [
        {
          id: 'cp-' + Math.random().toString(36).slice(2, 9),
          timestamp: Date.now(),
          title: title || 'Untitled Poem',
          text: text,
          constraints: constraints || [],
          public: isPublic === true,
          author: req.user.given_name || req.user.name,
          userId: req.user.email
        }
      ]
    };
    db.poems.push(poem);
  }

  // Publish each used constraint to the marketplace
  if (Array.isArray(constraints)) {
    constraints.forEach(c => {
      const key = getConstraintKey(c) || `legacy:${c.title || c.name || 'unnamed'}`;
      const existing = db.constraints.find(pc => pc.key === key);

      if (!existing) {
        const constraintId = 'c-' + Math.random().toString(36).slice(2, 9);
        const newConstraint = {
          id: constraintId,
          key: key,
          name: c.title || c.instance?.title || 'Unnamed Constraint',
          blurb: c.description || c.instance?.description || '',
          author: req.user.given_name || req.user.name,
          formId: c.formId,
          params: c.params,
          regex: c.regex,
          script: c.script,
          logic: c.logic,
          ts: Date.now()
        };
        db.constraints.push(newConstraint);
      }
    });
  }

  writeDb(db);
  res.json({ success: true, poem: enrichPoemForViewer(poem, db, req.user.email) });
});

app.post('/api/poems/:id/publish-checkpoint', checkGoogleAuth, (req, res) => {
  const { id } = req.params;
  const { checkpointId } = req.body || {};

  if (!checkpointId) {
    return res.status(400).json({ error: 'checkpointId is required' });
  }

  const db = readDb();
  const poem = db.poems.find(p => p.id === id);

  if (!poem) {
    return res.status(404).json({ error: 'Poem not found' });
  }

  if (poem.userId !== req.user.email) {
    return res.status(403).json({ error: 'Only the poem owner can publish checkpoints' });
  }

  const checkpoint = (poem.checkpoints || []).find(cp => cp.id === checkpointId);
  if (!checkpoint) {
    return res.status(404).json({ error: 'Checkpoint not found' });
  }

  poem.title = checkpoint.title || poem.title;
  poem.text = checkpoint.text || poem.text;
  poem.constraints = Array.isArray(checkpoint.constraints) ? checkpoint.constraints : (poem.constraints || []);
  poem.public = true;
  poem.updatedAt = Date.now();

  if (!Array.isArray(poem.checkpoints)) {
    poem.checkpoints = [];
  }

  poem.checkpoints.push({
    id: 'cp-' + Math.random().toString(36).slice(2, 9),
    timestamp: Date.now(),
    title: poem.title,
    text: poem.text,
    constraints: poem.constraints,
    public: poem.public,
    author: req.user.given_name || req.user.name,
    userId: req.user.email,
    sourceCheckpointId: checkpointId
  });

  writeDb(db);
  return res.json({ success: true, poem: enrichPoemForViewer(poem, db, req.user.email), publishedCheckpointId: checkpointId });
});

app.post('/api/poems/:id/publish', checkGoogleAuth, (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const poem = db.poems.find(p => p.id === id);

  if (!poem) {
    return res.status(404).json({ error: 'Poem not found' });
  }

  if (poem.userId !== req.user.email) {
    return res.status(403).json({ error: 'Only the poem owner can publish this poem' });
  }

  poem.public = true;
  poem.archived = false;
  poem.updatedAt = Date.now();

  if (!Array.isArray(poem.checkpoints)) {
    poem.checkpoints = [];
  }

  poem.checkpoints.push({
    id: 'cp-' + Math.random().toString(36).slice(2, 9),
    timestamp: Date.now(),
    title: poem.title,
    text: poem.text,
    constraints: poem.constraints || [],
    public: poem.public,
    author: req.user.given_name || req.user.name,
    userId: req.user.email,
    source: 'publish'
  });

  writeDb(db);
  return res.json({ success: true, poem: enrichPoemForViewer(poem, db, req.user.email) });
});

app.post('/api/poems/:id/archive', checkGoogleAuth, (req, res) => {
  const { id } = req.params;
  const { archived = true } = req.body || {};
  const db = readDb();
  const poem = db.poems.find(p => p.id === id);

  if (!poem) {
    return res.status(404).json({ error: 'Poem not found' });
  }

  if (poem.userId !== req.user.email) {
    return res.status(403).json({ error: 'Only the poem owner can archive this poem' });
  }

  poem.archived = archived === true;
  poem.updatedAt = Date.now();

  writeDb(db);
  return res.json({ success: true, poem: enrichPoemForViewer(poem, db, req.user.email) });
});

app.delete('/api/poems/:id', checkGoogleAuth, (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const idx = db.poems.findIndex(p => p.id === id);

  if (idx === -1) {
    return res.status(404).json({ error: 'Poem not found' });
  }

  const poem = db.poems[idx];
  if (poem.userId !== req.user.email) {
    return res.status(403).json({ error: 'Only the poem owner can delete this poem' });
  }

  db.poems.splice(idx, 1);
  if (Array.isArray(db.poemStars)) {
    db.poemStars = db.poemStars.filter(s => s.poemId !== id);
  }

  writeDb(db);
  return res.json({ success: true, id });
});

app.post('/api/poems/:id/star', checkGoogleAuth, (req, res) => {
  const { id } = req.params;
  const db = readDb();

  const poem = db.poems.find(p => p.id === id);
  if (!poem) {
    return res.status(404).json({ error: 'Poem not found' });
  }

  if (!db.poemStars) {
    db.poemStars = [];
  }

  const starIndex = db.poemStars.findIndex(s => s.userId === req.user.email && s.poemId === id);
  let starred = false;

  if (starIndex > -1) {
    db.poemStars.splice(starIndex, 1);
  } else {
    db.poemStars.push({
      userId: req.user.email,
      poemId: id
    });
    starred = true;
  }

  writeDb(db);
  res.json({ success: true, starred });
});

// Marketplace & starring endpoints
app.get('/api/constraints', checkGoogleAuth, (req, res) => {
  const db = readDb();
  const userStars = db.stars
    .filter(s => s.userId === req.user.email)
    .map(s => s.constraintId);

  const list = db.constraints.map(c => ({
    ...c,
    starred: userStars.includes(c.id)
  }));

  res.json(list);
});

app.post('/api/constraints/:id/star', checkGoogleAuth, (req, res) => {
  const { id } = req.params;
  const db = readDb();

  const constraint = db.constraints.find(c => c.id === id);
  if (!constraint) {
    return res.status(404).json({ error: 'Constraint not found in marketplace' });
  }

  const starIndex = db.stars.findIndex(s => s.userId === req.user.email && s.constraintId === id);
  let starred = false;

  if (starIndex > -1) {
    db.stars.splice(starIndex, 1);
  } else {
    db.stars.push({
      userId: req.user.email,
      constraintId: id
    });
    starred = true;
  }

  writeDb(db);
  res.json({ success: true, starred });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Secure Proxy listening on port ${PORT}`));
