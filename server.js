// server.js
const express = require('express');
const cors = require('cors');
const { OAuth2Client } = require('google-auth-library');
const fs = require('fs');
const path = require('path');

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

  const systemInstructions = [
    'You are an expert Oulipian constraint architect scriptwriter.',
    'Return STRICT JSON: {"type": "script", "title": "...", "hooks": {"validateToken": "...", "validateStructure": "..."}}',
    '',
    'RULES FOR THE HOOK ARCHITECTURE:',
    '1. validateToken(token, ctx):',
    '   - Checks inline characters. Returns true (allowed) or false (blocked).',
    '   - Continuous Sequence Matching: When filtering characters inside validateToken using regular expressions, always use quantifiers (like `+` or `*`) instead of strict single-character matches unless otherwise implied (e.g., use `/^[aeiou]+$/` instead of `/^[aeiou]$/`). This ensures the function returns true as the word grows across multiple keystrokes.',
    '',
    '2. validateStructure(words, ctx, op):',
    '   - Evaluates macro token layout arrays. MUST return a string enum: "valid", "not-yet-satisfied", or "reject".',
    '   - Variables available in ctx includes "lines", which is a flat array of RAW strings representing previous rows (e.g. ["hello world", "test"]). Raw strings do NOT have custom properties like .words; you must manually split them via .trim().split(/\\s+/) inside your hook code.',
    '   - "valid": The row alignment meets the rule criteria exactly.',
    '   - "not-yet-satisfied": The layout is currently illegal, but COULD become valid if the user keeps adding words. This allows typing to continue.',
    '   - "reject": The structural layout has completely exceeded a threshold or broken an invariant and can NEVER be fixed by typing more words forward. This hard-blocks further input.',
    '   - Cross-Line Historical Rule: When constraints depend on comparing metrics against previous lines (e.g., decreasing word counts), do NOT mutate variables or store state locally on ctx. Instead, use the `ctx.lines` array to dynamically look back.',
    '   - Intent-Aware Word Blocking: When a structural rule places a hard cap on a specific keyword (e.g., exactly 4 instances of a word), do NOT blindly return "reject" on `op === \'space\'`. Check if the user is actively typing that specific forbidden keyword by inspecting `ctx.currentWord.toLowerCase().replace(/[^a-z]/g, \'\')`. If they are typing a different word, return "valid" so they can type freely around the restricted tokens.',
    '   - Open Baseline / Decreasing Rule: If a constraint specifies that a line pattern can start with ANY arbitrary number (e.g., "starts with any number of keywords, then strictly decreases"), line zero (ctx.lineIdx === 0) has NO MAXIMUM CAP. It must allow an infinite number of target keywords to be typed. Never return "reject" on line zero for typing a target keyword; only use "not-yet-satisfied" on op === "enter" if the user attempts to leave line zero with a count of 0.',
    '   - Terminal Baseline Rule: When constraints require metrics to strictly decrease or change relative to previous lines, always handle the zero/terminal boundary condition. If a baseline calculation hits 0, allow 0 to remain a stable, repeatable state for subsequent lines so the user does not get permanently trapped in a mathematically impossible negative dead-end row.',
    '',
    'EXAMPLE 1 (Each line must have an odd number of words):',
    '{',
    '  "type": "script",',
    '  "title": "Odd Word Count Per Line",',
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
    '  "hooks": {',
    '    "validateToken": "return true;",',
    '    "validateStructure": "const getCount = (arr) => arr.filter(w => w.toLowerCase().replace(/[^a-z]/g, \'\') === \'hello\').length; const currentCount = getCount(words); const typingTarget = ctx.currentWord.toLowerCase().replace(/[^a-z]/g, \'\') === \'hello\'; if (ctx.lineIdx === 0) { if (op === \'enter\' && currentCount === 0) return \'not-yet-satisfied\'; return \'valid\'; } const prevRawStr = ctx.lines[ctx.lineIdx - 1] || \'\'; const prevWords = prevRawStr.trim().split(/\\\\s+/).filter(Boolean); const prevCount = getCount(prevWords); if (prevCount === 0) { return currentCount === 0 ? \'valid\' : \'reject\'; } if (op === \'enter\') { return currentCount < prevCount ? \'valid\' : \'reject\'; } if (currentCount === prevCount && typingTarget) return \'reject\'; return \'valid\';"',
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

// Database utilities
const dbPath = path.join(__dirname, 'db.json');

function readDb() {
  if (!fs.existsSync(dbPath)) {
    const initDb = { poems: [], constraints: [], stars: [] };
    fs.writeFileSync(dbPath, JSON.stringify(initDb, null, 2), 'utf8');
    return initDb;
  }
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error('Error reading db.json:', e);
    return { poems: [], constraints: [], stars: [] };
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing db.json:', e);
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

// Poems endpoints
app.get('/api/poems', checkGoogleAuth, (req, res) => {
  const db = readDb();
  const userPoems = db.poems.filter(p => p.userId === req.user.email);
  res.json(userPoems);
});

app.post('/api/poems', checkGoogleAuth, (req, res) => {
  const { title, text, constraints } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Poem text is required' });
  }

  const db = readDb();
  const poemId = 'p-' + Math.random().toString(36).slice(2, 9);

  const newPoem = {
    id: poemId,
    title: title || 'Untitled Poem',
    text: text,
    constraints: constraints || [],
    userId: req.user.email,
    author: req.user.given_name || req.user.name,
    createdAt: Date.now()
  };

  db.poems.push(newPoem);

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
  res.json({ success: true, poem: newPoem });
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