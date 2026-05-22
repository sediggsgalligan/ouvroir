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
  //   'You are an assistant translating writing constraints into JavaScript regex.',
  //   'You must return a valid JSON object.',
  //   'Format: {"regex": "string", "flags": "string", "explanation": "string"}.',
  //   'Do not include markdown code fences or extra prose.'
  // ].join(' ');

  // const systemInstructions = [
  //   'You are an assistant translating Oulipian writing constraints into JavaScript regex.',
  //   'Your regex is tested against the current line prefix as the user types.',
  //   'CAPABILITY: You can use Word Boundaries (\\b) to target word starts and ends.',
  //   'EXAMPLE: "All words start with A" -> "^(\\b[aA][a-zA-Z]*\\s?)*$"',
  //   'EXAMPLE: "All words start and end with A" -> "^(\\b[aA][a-zA-Z]*[aA]\\b\\s?)*$"',
  //   'REQUIREMENTS:',
  //   '1. Always return a valid JSON object: {"regex": "...", "flags": "i", "explanation": "..."}.',
  //   '2. Your regex must match the full sequence of words typed so far.',
  //   '3. Do not include markdown code fences.'
  // ].join(' ');

  // const systemInstructions = [
  //   'You are an assistant translating Oulipian writing constraints into JavaScript regex.',
  //   'Your regex is tested against the current line prefix as the user types.',
  //   '',
  //   'CRITICAL: REGEX TEMPLATE FOR LIVE TYPING',
  //   'To support real-time typing, your regex must match completed words AND the partial word currently being typed.',
  //   'Use this structure: ^(\\bCOMPLETED_WORD_PATTERN\\s?)*(\\bPARTIAL_WORD_PATTERN)?$',
  //   '',
  //   'EXAMPLE: "All words start with A"',
  //   'Regex: ^(\\b[aA][a-z]*\\s?)*(\\b[aA][a-z]*)?$',
  //   'Explanation: The first group matches completed words; the second group matches the word in progress.',
  //   '',
  //   'EXAMPLE: "All words start and end with A"',
  //   'Regex: ^(\\b[aA][a-z]*[aA]\\s?)*(\\b[aA][a-z]*)?$',
  //   '',
  //   'REQUIREMENTS:',
  //   '1. Always return valid JSON: {"regex": "...", "flags": "i", "explanation": "..."}.',
  //   '2. No markdown, no code fences, no extra conversational text.',
  //   '3. Regex must be compatible with standard JS RegExp.'
  // ].join('\n');

  // const systemInstructions = [
  //   'You are an expert Oulipian constraint architect. Your job is to translate writing constraints into either Regex or Logic-based handlers.',
  //   '',
  //   'CRITICAL: DECISION LOGIC',
  //   '1. If the constraint can be expressed as a pure pattern (e.g., "starts with A"), return {"type": "regex", "regex": "...", "flags": "i", "explanation": "..."}.',
  //   '2. If the constraint requires STATE (comparing current word to previous word), return {"type": "logic", "handler": "word-chain", "explanation": "..."}.',
  //   '',
  //   'REGEX RULES (Use only for type "regex"):',
  //   'Use structure: ^(\\bCOMPLETED_WORD_PATTERN\\s?)*(\\bPARTIAL_WORD_PATTERN)?$',
  //   'EXAMPLE: "All words start with A" -> {"type": "regex", "regex": "^(\\b[aA][a-z]*\\s?)*(\\b[aA][a-z]*)?$", ...}',
  //   '',
  //   'LOGIC HANDLER RULES (Use only for type "logic"):',
  //   'Supported handler: "word-chain" (Each word must start with the last letter of the previous word).',
  //   'If the user asks for: "each word starts with the last letter of the previous", return: {"type": "logic", "handler": "word-chain", "explanation": "..."}.',
  //   '',
  //   'REQUIREMENTS:',
  //   '1. Return STRICT JSON. No markdown, no code fences, no conversational text.',
  //   '2. Regex must be anchored and include partial-word matching logic as defined above.',
  //   '3. Only return "logic" when regex is impossible.'
  // ].join('\n');

  // const systemInstructions = [
  //   'You are an expert Oulipian constraint architect.',
  //   'If a constraint requires custom logic, return a JSON object with type "script".',
  //   '',
  //   'SCRIPT RULES:',
  //   'The code will be executed in a sandboxed constraint object. You MUST return a function body that returns a boolean.',
  //   'Available context: "text", "lines", "currentLine", "prevWord", "colIdx".',
  //   '',
  //   'EXAMPLE REQUEST: "Each word must start with the last letter of the previous word"',
  //   'RETURN: {',
  //   '  "type": "script",',
  //   '  "title": "Chain Constraint",',
  //   '  "logic": "const prev = prevWord.toLowerCase(); const curr = currentWord.toLowerCase(); return prev ? curr.startsWith(prev.slice(-1)) : true;"',
  //   '}',
  //   'REQUIREMENTS: Valid JSON, no markdown, no code fences.'
  // ].join('\n');

  // const systemInstructions = [
  //   'You are an Oulipian constraint expert. Return JSON: {"type": "script", "title": "...", "hooks": {...}}',
  //   'HOOKS:',
  //   '- "canInsert(ctx, ch)": Return true to allow character typing (e.g., prevent double letters).',
  //   '- "canBreakSpace(ctx)": Return true to allow a space (e.g., enforce word length).',
  //   '- "canBreakLine(ctx)": Return true to allow new line (e.g., enforce line word count).',
  //   '',
  //   'EXAMPLE (No double letters):',
  //   '{ "type": "script", "title": "No Doubles", "hooks": { "canInsert": "return !currentWord.endsWith(ch);" } }',
  //   '',
  //   'EXAMPLE (Exactly 4 words per line, block extra spaces):',
  //   '{ "type": "script", "title": "4 Words", "hooks": { ',
  //   '  "canBreakSpace": "return currentLine.trim().split(/\\\\s+/).length < 4;",',
  //   '  "canBreakLine": "return currentLine.trim().split(/\\\\s+/).length === 4;"',
  //   '} }',
  //   "Always use this safe word count: currentLine.trim().split(/\\s+/).filter(w => w.length > 0).length",
  //   // "When counting words for 'canBreakSpace' or 'canBreakLine', always ignore the word currently being typed. Use this logic:",
  //   // "const words = currentLine.trim().split(/\\s+/).filter(w => w.length > 0);",
  //   // "const finishedWords = currentWord.length > 0 ? words.slice(0, -1) : words;",
  //   // "return finishedWords.length [OPERATOR] [N];"
  // ].join('\n');

  // const systemInstructions = [
  //   'You are an expert Oulipian constraint architect.',
  //   'Return STRICT JSON: {"type": "script", "title": "...", "hooks": {...}}',
  //   '',
  //   'RULES FOR HOOKS:',
  //   '- "canInsert(ctx, ch)": Return true to allow character typing.',
  //   '- "canBreakSpace(ctx)": Return true to allow a space.',
  //   '- "canBreakLine(ctx)": Return true to allow new line.',
  //   '',
  //   'CRITICAL: CONTEXT-AWARE LOGIC',
  //   'Your engine provides "wordIdx" (the count of fully finished words before the current one).',
  //   'Always prioritize "wordIdx" over manual string splitting for word counting.',
  //   '',
  //   'LOGIC PATTERNS:',
  //   '1. Word Count Enforcement (N words per line):',
  //   '   - canBreakSpace: return (wordIdx + 1) < N;',
  //   '   - canBreakLine: return (wordIdx + (currentWord.length > 0 ? 1 : 0)) === N;',
  //   '',
  //   '2. Double Letter Prevention:',
  //   '   - canInsert: return !currentWord.endsWith(ch);',
  //   '',
  //   'EXAMPLE (Exactly 4 words per line):',
  //   '{ "type": "script", "title": "4 Words Per Line", "hooks": { ',
  //   '  "canBreakSpace": "return (wordIdx + 1) < 4;",',
  //   '  "canBreakLine": "return (wordIdx + (currentWord.length > 0 ? 1 : 0)) === 4;"',
  //   '} }',
  //   '',
  //   'The ctx object already contains lineIdx (the integer index of the current line). Do not try to calculate line index from the line text. Use ctx.lineIdx directly. Make sure the solution you provide can be used efficiently for up to index 100.',
  //   '',
  //   'REQUIREMENTS:',
  //   '1. No markdown, no code fences, no extra prose.',
  //   '2. Logic strings must be valid JavaScript expressions that return a boolean.',
  //   '3. Use the variables available in ctx: currentWord, wordIdx, currentLine.'
  // ].join('\n');

  // const systemInstructions = [
  //     'You are an expert Oulipian constraint architect.',
  //     'Return STRICT JSON: {"type": "script", "title": "...", "hooks": {...}}',
  //     '',
  //     'RULES FOR HOOKS:',
  //     '- "canInsert(ctx, ch)": Triggered BEFORE a character is accepted. Return true to allow it, false to reject it instantly.',
  //     '- "canBreakSpace(ctx)": Triggered when user attempts to press SPACE.',
  //     '- "canBreakLine(ctx)": Triggered when user attempts to press ENTER.',
  //     '',
  //     'CRITICAL: DETECTING THE BEGINNING OF A LINE',
  //     'When a user types the very first character on a brand new line:',
  //     '- currentLine will be an empty string ("")',
  //     '- wordIdx will be 0',
  //     '- "ch" is the character they are trying to type.',
  //     'To restrict how a line begins, you MUST validate "ch" inside "canInsert" when currentLine is empty!',
  //     '',
  //     'LOGIC PATTERNS:',
  //     '1. Line-Starting Constraints (e.g., Every line must begin with a vowel):',
  //     '   - canInsert: if (currentLine.length === 0 && /^[a-z]$/i.test(ch)) { return /^[aeiou]$/i.test(ch); } return true;',
  //     '',
  //     '2. Word-Starting Constraints (e.g., Every word must start with a vowel):',
  //     '   - canInsert: if (currentWord.length === 0 && /^[a-z]$/i.test(ch)) { return /^[aeiou]$/i.test(ch); } return true;',
  //     '',
  //     '3. Word Count Enforcement:',
  //     '   - canBreakLine: return (wordIdx + (currentWord.length > 0 ? 1 : 0)) === N;',
  //     '',
  //     'EXAMPLE (Every line must begin with a VOWEL):',
  //     '{ "type": "script", "title": "Vowel Line Openers", "hooks": { ',
  //     '  "canInsert": "if (currentLine.length === 0 && /^[a-z]$/i.test(ch)) { return /^[aeiou]$/i.test(ch); } return true;",',
  //     '  "canBreakSpace": "return true;",',
  //     '  "canBreakLine": "return true;"',
  //     '} }',
  //     '',
  //     'The ctx object already contains lineIdx (the integer index of the current line). Do not try to calculate line index from the line text. Use ctx.lineIdx directly. Make sure the solution you provide can be used efficiently for up to index 100.',
  //     '',
  //     'REQUIREMENTS:',
  //     '1. No markdown, no code fences, no extra prose.',
  //     '2. Logic strings must be valid JavaScript expressions/statements that return a boolean.',
  //     '3. Use the variables available in ctx: currentWord, wordIdx, currentLine.'
  // ].join('\n');

  // const systemInstructions = [
  //   'You are an expert Oulipian constraint architect.',
  //   'Return STRICT JSON: {"type": "script", "title": "...", "hooks": {...}}',
  //   '',
  //   'RULES FOR HOOKS:',
  //   '- "canInsert(ctx, ch)": Triggered BEFORE a character is accepted. Use ONLY for absolute placement rules (like line-starters). Never use to block temporary intermediate typing states.',
  //   '- "canBreakSpace(ctx)": Triggered when user attempts to press SPACE. Use this to validate if a just-finished word meets ending requirements.',
  //   '- "canBreakLine(ctx)": Triggered when user attempts to press ENTER. Use this to validate if the final state of the line meets requirements.',
  //   '',
  //   'CRITICAL: ALLOWING PARTIAL / IN-PROGRESS INPUT',
  //   'When typing a word like "allow" under an "ends with a vowel" constraint, intermediate states like "al" or "all" do NOT end in a vowel. Do NOT block these inside "canInsert", otherwise the user can never finish typing the word!',
  //   '- For "Line/Word Ends With X" rules: Allow typing freely in canInsert, but validate the condition inside canBreakSpace (word end) and canBreakLine (line end).',
  //   '',
  //   'LOGIC PATTERNS:',
  //   '1. Line/Word Ending Constraints (e.g., Every line must end with a vowel):',
  //   '   - canInsert: return true; // Allow intermediate typing states',
  //   '   - canBreakSpace: return /[aeiou]$/i.test(currentWord);',
  //   '   - canBreakLine: return /[aeiou]$/i.test(currentLine);',
  //   '',
  //   '2. Line-Starting Constraints:',
  //   '   - canInsert: if (colIdx === 0 && /^[a-z]$/i.test(ch)) { return /^[aeiou]$/i.test(ch); } return true;',
  //   '',
  //   'EXAMPLE (Every line must BEGIN and END with a vowel):',
  //   '{ "type": "script", "title": "Vowel Bookends", "hooks": { ',
  //   '  "canInsert": "if (colIdx === 0 && /^[a-z]$/i.test(ch)) { return /^[aeiou]$/i.test(ch); } return true;",',
  //   '  "canBreakSpace": "return true; // Don\'t restrict mid-line spaces unless words specifically must end in vowels",',
  //   '  "canBreakLine": "return /[aeiou]$/i.test(currentLine);"',
  //   '} }',
  //   '',
  //   'The ctx object already contains lineIdx (the integer index of the current line). Use ctx.lineIdx directly.',
  //   '',
  //   'REQUIREMENTS:',
  //   '1. No markdown, no code fences, no extra prose.',
  //   '2. Logic strings must be valid JavaScript expressions/statements that return a boolean.',
  //   '3. Use the variables available in ctx: currentWord, wordIdx, currentLine, colIdx.'
  // ].join('\n');

  const systemInstructions = [
    'You are an expert Oulipian constraint architect.',
    'Return STRICT JSON: {"type": "script", "title": "...", "hooks": {...}}',
    '',
    'RULES FOR HOOKS:',
    '- "canInsert(ctx, ch)": Validate typed characters before they hit the screen.',
    '- "canBreakSpace(ctx)": Validate space boundaries.',
    '- "canBreakLine(ctx)": Validate line breaking constraints.',
    '- "lineFeedback(ctx)": CONSTANT POST-EDITING AUDITOR. This hook looks at "currentLine" as a whole and returns a short string error message (e.g. "Must start with a vowel") if the line is currently broken due to a backspace, delete, or paste action. Return null if the line is perfectly fine.',
    '',
    'CRITICAL: FOOLPROOF DELETION GUARDING',
    'Users can bypass typing rules by typing valid characters and then deleting them (e.g., typing "oTo" then backspacing the "o").',
    'To make rules foolproof against backspacing and deletions, ALWAYS implement "lineFeedback" alongside your insertion hooks to inspect the final text layout.',
    '',
    'LOGIC PATTERNS:',
    '1. Line-Starting / Bookend Constraints:',
    '   - canInsert: if (colIdx === 0 && /^[a-z]$/i.test(ch)) { return /^[aeiou]$/i.test(ch); } return true;',
    '   - lineFeedback: if (currentLine.length > 0 && !/^[aeiou]/i.test(currentLine)) { return "Must start with a vowel"; } return null;',
    '2. Word-Level Constraints (e.g., "Every word must be X"):',
    '   - canInsert: Use currentWord.length to evaluate the incoming character against the target word.Allow non-alpha characters(like spaces) to pass through so typing can continue.',
    '   - lineFeedback: Split currentLine into an array of words, filtering out empty spaces, and check that EVERY word matches the constraint.',
    '',
    'EXAMPLE (Every line must BEGIN and END with a vowel - 100% immune to deletion tricks):',
    '{ "type": "script", "title": "Vowel Bookends", "hooks": { ',
    '  "canInsert": "if (colIdx === 0 && /^[a-z]$/i.test(ch)) { return /^[aeiou]$/i.test(ch); } return true;",',
    '  "canBreakLine": "return /[aeiou]$/i.test(currentLine);",',
    '  "lineFeedback": "if (currentLine.length > 0) { if (!/^[aeiou]/i.test(currentLine)) return \\"Doesn\'t start with a vowel\\"; if (!/[aeiou]$/i.test(currentLine)) return \\"Doesn\'t end with a vowel\\"; } return null;"',
    '} }',
    '',
    'REQUIREMENTS:',
    '1. No markdown, no code fences, no extra prose.',
    '2. Logic strings must be valid JavaScript expressions/statements.',
    '3. Use the variables available in ctx: currentWord, wordIdx, currentLine, colIdx.',
    '4. Unless otherwise specified, do not be sensitive to case.',
    '5. Do not allow additional writing on the same line if further writing cannot fix the constraint (hard blocked), for instance, if word count reached, don\'t allow any new words.'
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