// creators.jsx — Three constraint-creator UI variations + shared NL→regex panel securely wired to local Node.js proxy.

(function () {
  'use strict';
  const { useState, useEffect, useRef, useMemo, useCallback } = React;

  let _uid = 0;
  const nextUid = () => `c${++_uid}`;

  function instantiate(form, params) {
    const merged = {};
    (form.params || []).forEach(p => { merged[p.id] = params?.[p.id] ?? p.default; });
    return { uid: nextUid(), formId: form.id, params: merged, instance: form.make(merged) };
  }

    // Apply a community entry to the active list, carrying the author handle
  // and entry id along on the wrapped object so pills can show "· @author".
  function applyCommunityEntry(entry, active, setActive) {
    const inst = OuvroirCommunity.instantiate(entry);
    if (!inst) return;
    setActive([
      ...active,
      {
        uid: nextUid(),
        formId: entry.basis === 'regex' ? 'regex-custom' : entry.formId,
        params: entry.params || {},
        community: { name: entry.name, author: entry.author, id: entry.id },
        // Carry regex source so resharing remains lossless.
        regex: entry.basis === 'regex'
          ? { source: entry.source, flags: entry.flags || 'i', blurb: entry.blurb }
          : undefined,
        instance: inst,
      },
    ]);
  }

  // Helper to decode JWT without external libraries
  function parseJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(window.atob(base64));
  }

  // ---- A. dropdown variant --------------------------------------------
  function CreatorDropdown({ active, setActive, onBrowse }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [pickedKey, setPickedKey] = useState(null); // 'form:<id>'
    const [params, setParams] = useState({});
    const [, force] = useState(0);
    useEffect(() => OuvroirCommunity.subscribe(() => force(x => x + 1)), []);

    const FORMS = Ouvroir.FORMS;
    const allComm = OuvroirCommunity.all();
    const favEntries = OuvroirCommunity.favorites()
      .map(id => allComm.find(e => e.id === id))
      .filter(Boolean);

    const picked = useMemo(() => {
      if (!pickedKey) return null;
      const [kind, id] = pickedKey.split(':');
      if (kind === 'form') {
        const f = FORMS.find(f => f.id === id);
        return f ? { kind: 'form', form: f } : null;
      }
      return null;
    }, [pickedKey, FORMS]);

    const buttonLabel = picked ? picked.form.name : 'Pick a form…';

    const filtered = useMemo(() => {
      const needle = q.toLowerCase().trim();
      const m = (s) => !needle || s.toLowerCase().includes(needle);
      return {
        favs:  favEntries.filter(e => m(e.name) || m(e.author) || m(e.blurb || '')),
        forms: FORMS.filter(f => m(f.name) || m(f.blurb)),
      };
    }, [q, favEntries, FORMS]);

    const pickForm = (f) => {
      setPickedKey(`form:${f.id}`);
      setParams({});
      setOpen(false);
      setQ('');
    };
    const pickComm = (e) => {
      applyCommunityEntry(e, active, setActive);
      setOpen(false);
      setQ('');
    };
    const apply = () => {
      if (!picked) return;
      const merged = {};
      (picked.form.params || []).forEach(p => { merged[p.id] = params[p.id] ?? p.default; });
      setActive([...active, instantiate(picked.form, merged)]);
      setPickedKey(null);
      setParams({});
    };

    // close dropdown on outside click / escape
    const rootRef = useRef(null);
    useEffect(() => {
      if (!open) return;
      const onDoc = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
      const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onDoc);
        document.removeEventListener('keydown', onKey);
      };
    }, [open]);

    return (
      <div className="ouv-creator ouv-creator-combo" ref={rootRef}>
        <div className="ouv-creator-eyebrow">Pick a form</div>
        <button
          className={`ouv-combo-btn${open ? ' is-open' : ''}`}
          onClick={() => setOpen(o => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="ouv-combo-label">{buttonLabel}</span>
          <span className="ouv-combo-caret">▾</span>
        </button>

        {open && (
          <div className="ouv-combo-panel" role="listbox">
            <input
              className="ouv-combo-search"
              autoFocus
              placeholder="Search forms…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="ouv-combo-list">
              <button
                className="ouv-combo-special"
                onClick={() => { setOpen(false); onBrowse?.(); }}
              >
                <span className="ouv-combo-special-icon">✦</span>
                <span className="ouv-combo-special-text">
                  <span className="ouv-combo-name">Browse community forms…</span>
                  <span className="ouv-combo-blurb">Constraints written by others.</span>
                </span>
              </button>

              {filtered.favs.length > 0 && (
                <>
                  <div className="ouv-combo-divider" />
                  <div className="ouv-combo-group">Favorites</div>
                  {filtered.favs.map(e => (
                    <button
                      key={`comm:${e.id}`}
                      className="ouv-combo-item is-fav"
                      onClick={() => pickComm(e)}
                    >
                      <span className="ouv-combo-name">
                        <span className="ouv-combo-star">★</span> {e.name}
                        <span className="ouv-combo-by"> · @{e.author}</span>
                      </span>
                      <span className="ouv-combo-blurb">{e.blurb}</span>
                    </button>
                  ))}
                </>
              )}

              <div className="ouv-combo-divider" />
              <div className="ouv-combo-group">Forms</div>
              {filtered.forms.map(f => (
                <button
                  key={`form:${f.id}`}
                  className="ouv-combo-item"
                  onClick={() => pickForm(f)}
                >
                  <span className="ouv-combo-name">{f.name}</span>
                  <span className="ouv-combo-blurb">{f.blurb}</span>
                </button>
              ))}
              {!filtered.forms.length && !filtered.favs.length && q && (
                <div className="ouv-combo-empty">No matching form.</div>
              )}
            </div>
          </div>
        )}

        {picked && (
          <>
            <div className="ouv-form-blurb">{picked.form.blurb}</div>
            {picked.form.params && picked.form.params.length > 0 && (
              <div className="ouv-params">
                {picked.form.params.map(p => (
                  <ParamInput
                    key={p.id}
                    param={p}
                    value={params[p.id] ?? p.default}
                    onChange={v => setParams({ ...params, [p.id]: v })}
                  />
                ))}
              </div>
            )}
            <button className="ouv-btn ouv-btn-primary" onClick={apply}>Apply constraint</button>
          </>
        )}
      </div>
    );
  }

  function ParamInput({ param, value, onChange }) {
    if (param.type === 'select') {
      return (
        <label className="ouv-param">
          <span>{param.label}</span>
          <select className="ouv-select" value={value} onChange={e => onChange(e.target.value)}>
            {param.options.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
          </select>
        </label>
      );
    }
    if (param.type === 'number') {
      return (
        <label className="ouv-param">
          <span>{param.label}</span>
          <input className="ouv-input" type="number" min={param.min} max={param.max}
            value={value} onChange={e => onChange(e.target.value)} />
        </label>
      );
    }
    if (param.type === 'letters') {
      return (
        <label className="ouv-param">
          <span>{param.label}</span>
          <input className="ouv-input" type="text" value={value}
            placeholder="e.g. eaiou"
            onChange={e => onChange(e.target.value.replace(/[^A-Za-z]/g, ''))} />
        </label>
      );
    }
    return null;
  }

  // ---- B. card grid variant -------------------------------------------
  function CreatorCards({ active, setActive }) {
    const [openId, setOpenId] = useState(null);
    const [params, setParams] = useState({});
    const form = openId ? Ouvroir.FORMS.find(f => f.id === openId) : null;
    const add = () => {
      setActive([...active, instantiate(form, params)]);
      setOpenId(null);
      setParams({});
    };
    return (
      <div className="ouv-creator ouv-creator-cards">
        <div className="ouv-creator-eyebrow">Pick a form</div>
        <div className="ouv-cardgrid">
          {Ouvroir.FORMS.map(f => (
            <button
              key={f.id}
              className={`ouv-card${openId === f.id ? ' open' : ''}`}
              onClick={() => {
                if (f.params && f.params.length) setOpenId(openId === f.id ? null : f.id);
                else setActive([...active, instantiate(f, {})]);
              }}
            >
              <div className="ouv-card-name">{f.name}</div>
              <div className="ouv-card-blurb">{f.blurb}</div>
            </button>
          ))}
        </div>
        {form && form.params && (
          <div className="ouv-card-config">
            <div className="ouv-config-title">{form.name}</div>
            <div className="ouv-params">
              {form.params.map(p => (
                <ParamInput key={p.id} param={p} value={params[p.id] ?? p.default}
                  onChange={v => setParams({ ...params, [p.id]: v })} />
              ))}
            </div>
            <button className="ouv-btn ouv-btn-primary" onClick={add}>Apply</button>
            <button className="ouv-btn ouv-btn-ghost" onClick={() => setOpenId(null)}>Cancel</button>
          </div>
        )}
      </div>
    );
  }

  // ---- C. command palette variant -------------------------------------
  function CreatorPalette({ active, setActive }) {
    const [q, setQ] = useState('');
    const [sel, setSel] = useState(0);
    const inputRef = useRef(null);
    const filtered = useMemo(() => {
      const needle = q.toLowerCase().trim();
      if (!needle) return Ouvroir.FORMS;
      return Ouvroir.FORMS.filter(f =>
        f.name.toLowerCase().includes(needle) || f.blurb.toLowerCase().includes(needle));
    }, [q]);
    useEffect(() => { setSel(0); }, [q]);

    const commit = (f) => {
      if (!f) return;
      setActive([...active, instantiate(f, {})]);
      setQ('');
      inputRef.current?.focus();
    };

    const onKey = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(filtered.length - 1, s + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
      else if (e.key === 'Enter') { e.preventDefault(); commit(filtered[sel]); }
    };

    return (
      <div className="ouv-creator ouv-creator-palette">
        <div className="ouv-creator-eyebrow">⌘  Pick a form</div>
        <div className="ouv-palette-box">
          <input
            ref={inputRef}
            className="ouv-palette-input"
            placeholder="Search forms…"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKey}
            autoFocus
          />
          <div className="ouv-palette-list">
            {filtered.map((f, i) => (
              <div
                key={f.id}
                className={`ouv-palette-item${i === sel ? ' sel' : ''}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => commit(f)}
              >
                <div className="ouv-palette-name">{f.name}</div>
                <div className="ouv-palette-blurb">{f.blurb}</div>
              </div>
            ))}
            {!filtered.length && <div className="ouv-palette-empty">No matching form.</div>}
          </div>
          <div className="ouv-palette-hint">↑↓ to navigate · ↵ to add</div>
        </div>
      </div>
    );
  }

  // ---- NL → regex panel (Secured with local proxy authentication server) ------------------
  function NLPanel({ active, setActive }) {
    const [mode, setMode] = useState('nl'); // 'nl' | 'raw'
    // const [desc, setDesc] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null); // { regex, explanation }
    const [err, setErr] = useState(null);

    const [rawSrc, setRawSrc] = useState('');
    const [rawFlags, setRawFlags] = useState('i');
    const [rawLabel, setRawLabel] = useState('');
    const [rawErr, setRawErr] = useState(null);

    const [desc, setDesc] = useState('');
    
    // Read past saved auth token states from client memory if available
    const [authToken, setAuthToken] = useState(() => localStorage.getItem('google_id_token') || null);

    // useEffect(() => {
    //   if (typeof google === 'undefined') return;

    //   // window.handleCredentialResponse = (response) => {
    //   //   localStorage.setItem('google_id_token', response.credential);
    //   //   setAuthToken(response.credential);
    //   // };

    //   window.handleCredentialResponse = (response) => {
    //     localStorage.setItem('google_id_token', response.credential);
        
    //     // Decode the token to get the user's name
    //     const user = parseJwt(response.credential);
    //     localStorage.setItem('user_first_name', user.given_name); // Save for later
        
    //     window.dispatchEvent(new Event('auth-changed'));
    //   };

    //   // Set up Google Client UI element configs
    //   google.accounts.id.initialize({
    //     client_id: "956217831164-hvtajjcljt7nc50h012fml987k1tsip7.apps.googleusercontent.com", // Ensure your exact ID sits here
    //     callback: window.handleCredentialResponse
    //   });

    //   google.accounts.id.renderButton(
    //     document.getElementById("google_signin_button"),
    //     { theme: "outline", size: "medium", text: "signin_with" }
    //   );
    // }, []);

    useEffect(() => {
      const initGoogleButton = () => {
        if (typeof google === 'undefined') {
          setTimeout(initGoogleButton, 250);
          return;
        }

        window.handleCredentialResponse = (response) => {
          localStorage.setItem('google_id_token', response.credential);
          const user = parseJwt(response.credential);
          localStorage.setItem('user_first_name', user.given_name);
          window.dispatchEvent(new Event('auth-changed'));
        };

        google.accounts.id.initialize({
          client_id: "956217831164-hvtajjcljt7nc50h012fml987k1tsip7.apps.googleusercontent.com",
          callback: window.handleCredentialResponse
        });

        const btn = document.getElementById("google_signin_button");
        if (btn) {
          google.accounts.id.renderButton(btn, { theme: "outline", size: "medium", text: "signin_with" });
        }
      };

      initGoogleButton();
    }, []);

    const generate = async () => {
      if (!desc.trim()) return;
      setBusy(true); setErr(null);

      try {
        const response = await fetch('http://localhost:3000/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
          },
          // We only send the raw input here
          body: JSON.stringify({ userPrompt: desc }) 
        });

        const data = await response.json();

        if (!response.ok) throw new Error(data.error?.message || "Generation failed");

        // DeepSeek returns the JSON string in content
        const parsed = JSON.parse(data.choices[0].message.content);
        setResult(parsed);
      } catch (e) {
        setErr(e.message);
      } finally {
        setBusy(false);
      }
    };

    // const generate = async () => {
    //   if (!desc.trim()) return;
      
    //   setBusy(true); 
    //   setErr(null); 
    //   setResult(null);

    //   try {
    //     const response = await fetch('http://localhost:3000/api/generate', {
    //       method: 'POST',
    //       headers: {
    //         'Content-Type': 'application/json',
    //         'Authorization': `Bearer ${authToken}`
    //       },
    //       body: JSON.stringify({
    //         model: 'deepseek-chat',
    //         messages: [{ role: 'user', content: prompt }],
    //         response_format: { type: 'json_object' },
    //         temperature: 0.1
    //       })
    //     });

    //     // 1. ADD THIS: Check for HTTP errors explicitly
    //     if (!response.ok) {
    //       const errorText = await response.text();
    //       throw new Error(`Server Error (${response.status}): ${errorText}`);
    //     }

    //     const data = await response.json();
        
    //     // 2. ADD THIS: Check if DeepSeek actually returned a message
    //     if (!data.choices || data.choices.length === 0) {
    //       throw new Error("DeepSeek returned an empty response.");
    //     }

    //     const rawContent = data.choices[0].message.content.trim();
    //     const cleaned = rawContent.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        
    //     // 3. ADD THIS: Catch JSON parsing errors specifically
    //     try {
    //       const parsed = JSON.parse(cleaned);
    //       if (!parsed.regex) throw new Error("JSON missing 'regex' field.");
    //       setResult({ regex: parsed.regex, flags: parsed.flags || 'i', explanation: parsed.explanation || '' });
    //     } catch (parseErr) {
    //       throw new Error(`Failed to parse AI response: ${cleaned.substring(0, 50)}...`);
    //     }

    //   } catch (e) {
    //     console.error("DEBUG NL ERROR:", e); // This is vital for your Console
    //     setErr(e.message); // This displays it in the UI
    //   } finally {
    //     setBusy(false);
    //   }
    // };

    // const apply = () => {
    //   if (!result) return;
    //   const form = {
    //     id: 'regex-custom', name: 'Custom',
    //     make: () => Ouvroir.makeRegexConstraint({
    //       source: result.regex, flags: result.flags,
    //       description: result.explanation || desc,
    //     }),
    //   };
    //   setActive([...active, instantiate(form, {})]);
    //   setDesc(''); setResult(null);
    // };

    const apply = async () => {
      if (!result) return;
      
      let constraintInstance;

      // 1. Convert the AI response into a formal Constraint Object
      if (result.type === 'logic') {
        if (result.handler === 'word-chain') {
          constraintInstance = Ouvroir.makeChainConstraint();
        }
      } else {
        // Standard Regex approach
        constraintInstance = Ouvroir.makeRegexConstraint({
          source: result.regex,
          flags: result.flags,
          description: result.explanation
        });
      }

      // if (result.type == "script") {
      //   constraintInstance = Ouvroir.makeScriptedConstraint({
      //     title: result.title,
      //     logic: result.logic,
      //     trigger: 'canBreakLine' // Hardcode or extract from AI
      //   });
      // }

      // Inside your apply function
      if (result.type === 'script') {
        constraintInstance = Ouvroir.makeScriptedConstraint({
          title: result.title,
          description: result.explanation,
          hooks: result.hooks // <--- Ensure this exists and is an object
        });
      }

      // 2. Validate before saving
      if (constraintInstance && constraintInstance.title) {
        setActive([...active, {
          uid: nextUid(),
          formId: result.type === 'logic' ? 'logic-custom' : 'regex-custom',
          params: {},
          instance: constraintInstance // This must be the full object
        }]);
      } else {
        console.error("The constraint was not created correctly.");
      }

      setResult(null);
    };

    const applyRaw = () => {
      try { new RegExp(rawSrc, rawFlags); }
      catch (e) { setRawErr(String(e.message || e)); return; }
      const blurb = rawLabel.trim() || `Pattern: /${rawSrc}/${rawFlags}`;
      const inst = Ouvroir.makeRegexConstraint({
        source: rawSrc, flags: rawFlags, description: blurb,
      });
      setActive([...active, {
        uid: nextUid(),
        formId: 'regex-custom',
        params: {},
        regex: { source: rawSrc, flags: rawFlags, blurb },
        instance: inst,
      }]);
      setRawSrc(''); setRawFlags('i'); setRawLabel(''); setRawErr(null);
    };

    return (
      <div className="ouv-nl">
        <div className="ouv-creator-eyebrow">Custom constraint</div>
        <div className="ouv-nl-tabs" role="tablist">
          <button
            role="tab"
            className={`ouv-nl-tab${mode === 'nl' ? ' is-on' : ''}`}
            onClick={() => setMode('nl')}
          >Describe</button>
          <button
            role="tab"
            className={`ouv-nl-tab${mode === 'raw' ? ' is-on' : ''}`}
            onClick={() => setMode('raw')}
          >Regex</button>
        </div>

        {mode === 'nl' && (
          <>
        <textarea
          className="ouv-nl-input"
          placeholder="e.g. every word starts with a different letter than the previous one"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          rows={3}
        />
        <button
          className="ouv-btn ouv-btn-secondary"
          onClick={generate}
          disabled={busy || !desc.trim()}
        >
          {busy ? 'Translating…' : 'Generate constraint'}
        </button>
        {err && <div className="ouv-nl-err">⚠ {err}</div>}
        {result && (
          <div className="ouv-nl-result">
            <div className="ouv-nl-label">Description</div>
            <div className="ouv-nl-explain">{result.explanation || desc}</div>
            <div className="ouv-nl-label">Regex</div>
            <code className="ouv-nl-regex">/{result.regex}/{result.flags}</code>
            <button className="ouv-btn ouv-btn-primary" onClick={apply}>Apply constraint</button>
            </div>
            )}
          </>
        )}

        {mode === 'raw' && (
          <>
            <label className="ouv-param">
              <span>Pattern</span>
              <div className="ouv-regex-row">
                <span className="ouv-regex-slash">/</span>
                <input
                  className="ouv-input ouv-input-mono ouv-regex-source"
                  value={rawSrc}
                  onChange={e => { setRawSrc(e.target.value); setRawErr(null); }}
                  placeholder="^[bcdfghjklmnpqrstvwxyz]*$"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                <span className="ouv-regex-slash">/</span>
                <input
                  className="ouv-input ouv-input-mono ouv-regex-flags"
                  value={rawFlags}
                  onChange={e => setRawFlags(e.target.value.replace(/[^gimsuy]/g, '').slice(0, 6))}
                  placeholder="i"
                  spellCheck={false}
                />
              </div>
            </label>
            <label className="ouv-param">
              <span>Label (optional)</span>
              <input
                className="ouv-input"
                value={rawLabel}
                onChange={e => setRawLabel(e.target.value.slice(0, 80))}
                placeholder="what this pattern asks of you"
              />
            </label>
            <div className="ouv-regex-hint">
              The pattern is tested against every <em>prefix</em> of the current line as you type.
            </div>
            {rawErr && <div className="ouv-nl-err">⚠ {rawErr}</div>}
            <button
              className="ouv-btn ouv-btn-primary"
              onClick={applyRaw}
              disabled={!rawSrc.trim()}
            >Apply constraint</button>
          </>
        )}
      </div>
    );
  }

  Object.assign(window, { CreatorDropdown, CreatorCards, CreatorPalette, NLPanel, instantiate });
})();