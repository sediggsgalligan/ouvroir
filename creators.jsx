// creators.jsx — Constraint-creator UIs.
//
//   <CreatorDropdown active setActive onBrowse />   ← default: closed combobox
//   <CreatorCards    active setActive />            ← grid (tweak alt)
//   <CreatorPalette  active setActive />            ← inline palette (tweak alt)
//   <NLPanel         active setActive />            ← natural-language → regex
//   <CommunityModal  open onClose onPick />         ← gallery of community forms

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

  // ---- A. dropdown variant (closed combobox + "browse more") ----------
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

  // ---- Custom constraint panel: NL → regex OR raw regex --------------
  function NLPanel({ active, setActive }) {
    const [mode, setMode] = useState('nl'); // 'nl' | 'raw'

    // NL mode state
    const [desc, setDesc] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const [err, setErr] = useState(null);

    // Raw regex mode state
    const [rawSrc, setRawSrc] = useState('');
    const [rawFlags, setRawFlags] = useState('i');
    const [rawLabel, setRawLabel] = useState('');
    const [rawErr, setRawErr] = useState(null);

    const generate = async () => {
      if (!desc.trim()) return;
      setBusy(true); setErr(null); setResult(null);
      try {
        const prompt = [
          'You are translating an Oulipian/poetic writing constraint into a JavaScript regex.',
          'The regex will be tested against every PREFIX of a line as the user types — so it must match partial lines, not only the final form. Use anchored ^…$ style only when you genuinely want to constrain the whole prefix.',
          'Return STRICT JSON with shape {"regex": "<pattern>", "flags": "i", "explanation": "<one short sentence>"}. No code fences, no extra prose.',
          '',
          'Constraint description:',
          desc,
        ].join('\n');
        const raw = await window.claude.complete(prompt);
        const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        const parsed = JSON.parse(cleaned);
        if (!parsed.regex) throw new Error('No regex returned');
        new RegExp(parsed.regex, parsed.flags || 'i');
        setResult({ regex: parsed.regex, flags: parsed.flags || 'i', explanation: parsed.explanation || '' });
      } catch (e) {
        setErr(String(e.message || e));
      } finally {
        setBusy(false);
      }
    };

    const applyFromNL = () => {
      if (!result) return;
      const inst = Ouvroir.makeRegexConstraint({
        source: result.regex, flags: result.flags,
        description: result.explanation || desc,
      });
      setActive([...active, {
        uid: nextUid(),
        formId: 'regex-custom',
        params: {},
        regex: { source: result.regex, flags: result.flags, blurb: result.explanation || desc },
        instance: inst,
      }]);
      setDesc(''); setResult(null);
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
                <button className="ouv-btn ouv-btn-primary" onClick={applyFromNL}>Apply constraint</button>
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

  // ---- Community modal -------------------------------------------------
  function CommunityModal({ open, onClose, onPick }) {
    const [q, setQ] = useState('');
    const [, force] = useState(0);
    useEffect(() => OuvroirCommunity.subscribe(() => force(x => x + 1)), []);
    useEffect(() => {
      if (!open) return;
      const onKey = (e) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', onKey);
      // lock body scroll while open
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', onKey);
        document.body.style.overflow = prev;
      };
    }, [open, onClose]);

    if (!open) return null;

    const entries = OuvroirCommunity.all();
    const needle = q.toLowerCase().trim();
    const filtered = entries.filter(e =>
      !needle ||
      e.name.toLowerCase().includes(needle) ||
      e.author.toLowerCase().includes(needle) ||
      (e.blurb || '').toLowerCase().includes(needle)
    );
    const favCount = OuvroirCommunity.favorites().length;

    return (
      <div className="ouv-modal-backdrop" onClick={onClose}>
        <div className="ouv-modal" onClick={e => e.stopPropagation()}>
          <div className="ouv-modal-head">
            <div>
              <div className="ouv-modal-eyebrow">From the workshop</div>
              <div className="ouv-modal-title">Community forms</div>
              <div className="ouv-modal-sub">
                Constraints contributed by other readers. Star the ones you want to keep —
                they&rsquo;ll pin to the top of your dropdown.
                {favCount > 0 && <span className="ouv-modal-favcount"> · {favCount} starred</span>}
              </div>
            </div>
            <button className="ouv-modal-close" onClick={onClose} aria-label="Close">×</button>
          </div>
          <input
            className="ouv-modal-search"
            placeholder="Search by form, author, or feel…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <div className="ouv-modal-grid">
            {filtered.map(e => (
              <CommunityCard
                key={e.id}
                entry={e}
                onPick={() => { onPick?.(e); onClose(); }}
              />
            ))}
            {!filtered.length && (
              <div className="ouv-modal-empty">
                No form matches “{q}”.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function CommunityCard({ entry, onPick }) {
    const [, force] = useState(0);
    useEffect(() => OuvroirCommunity.subscribe(() => force(x => x + 1)), []);
    const fav = OuvroirCommunity.isFav(entry.id);
    const toggle = (e) => { e.stopPropagation(); OuvroirCommunity.toggleFav(entry.id); };
    return (
      <div
        className={`ouv-cf-card${fav ? ' is-fav' : ''}`}
        onClick={onPick}
        role="button"
        tabIndex={0}
      >
        <button
          className={`ouv-cf-star${fav ? ' on' : ''}`}
          onClick={toggle}
          aria-label={fav ? 'Unstar' : 'Star'}
          title={fav ? 'Remove from favorites' : 'Add to favorites'}
        >
          {fav ? '★' : '☆'}
        </button>
        <div className="ouv-cf-head">
          <div className="ouv-cf-name">{entry.name}</div>
          <div className="ouv-cf-author">@{entry.author}</div>
        </div>
        <div className="ouv-cf-blurb">{entry.blurb}</div>
        {entry.basis === 'regex' && (
          <CopyableRegex source={entry.source} flags={entry.flags || ''} compact />
        )}
        {entry.poem ? (
          <pre className="ouv-cf-poem">{entry.poem}</pre>
        ) : (
          <div className="ouv-cf-poem ouv-cf-poem-empty">no example yet</div>
        )}
        <div className="ouv-cf-cta">Use this form →</div>
      </div>
    );
  }

  // ---- Copyable regex chip (used in cards + pill detail) -----------
  function CopyableRegex({ source, flags, compact = false }) {
    const [copied, setCopied] = useState(false);
    const text = `/${source}/${flags || ''}`;
    const copy = (e) => {
      e.stopPropagation();
      try {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      } catch (_) {}
    };
    return (
      <div className={`ouv-regex-chip${compact ? ' compact' : ''}`} onClick={(e) => e.stopPropagation()}>
        <code className="ouv-regex-chip-text">{text}</code>
        <button className="ouv-regex-chip-copy" onClick={copy} title="Copy to clipboard">
          {copied ? '✓' : '⧉'}
        </button>
      </div>
    );
  }

  Object.assign(window, {
    CreatorDropdown, CreatorCards, CreatorPalette,
    NLPanel, CommunityModal, CopyableRegex,
    instantiate, applyCommunityEntry,
  });
})();
