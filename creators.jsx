// creators.jsx — Three constraint-creator UI variations + shared NL→regex panel.
//
//   <CreatorDropdown active setActive />
//   <CreatorCards    active setActive />
//   <CreatorPalette  active setActive />
//   <NLPanel         active setActive />

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

  // ---- A. dropdown variant --------------------------------------------
  function CreatorDropdown({ active, setActive }) {
    const [formId, setFormId] = useState(Ouvroir.FORMS[0].id);
    const form = Ouvroir.FORMS.find(f => f.id === formId);
    const [params, setParams] = useState({});
    useEffect(() => { setParams({}); }, [formId]);

    const add = () => {
      const merged = {};
      (form.params || []).forEach(p => { merged[p.id] = params[p.id] ?? p.default; });
      setActive([...active, instantiate(form, merged)]);
    };

    return (
      <div className="ouv-creator ouv-creator-dropdown">
        <div className="ouv-creator-eyebrow">Pick a form</div>
        <select className="ouv-select" value={formId} onChange={e => setFormId(e.target.value)}>
          {Ouvroir.FORMS.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <div className="ouv-form-blurb">{form.blurb}</div>
        {form.params && form.params.length > 0 && (
          <div className="ouv-params">
            {form.params.map(p => (
              <ParamInput key={p.id} param={p} value={params[p.id] ?? p.default}
                onChange={v => setParams({ ...params, [p.id]: v })} />
            ))}
          </div>
        )}
        <button className="ouv-btn ouv-btn-primary" onClick={add}>Apply constraint</button>
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
      // Default params; user can edit afterwards if needed
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

  // ---- NL → regex panel ------------------------------------------------
  function NLPanel({ active, setActive }) {
    const [desc, setDesc] = useState('');
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null); // { regex, explanation }
    const [err, setErr] = useState(null);

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
        // Sanity check
        new RegExp(parsed.regex, parsed.flags || 'i');
        setResult({ regex: parsed.regex, flags: parsed.flags || 'i', explanation: parsed.explanation || '' });
      } catch (e) {
        setErr(String(e.message || e));
      } finally {
        setBusy(false);
      }
    };

    const apply = () => {
      if (!result) return;
      const form = {
        id: 'regex-custom', name: 'Custom',
        make: () => Ouvroir.makeRegexConstraint({
          source: result.regex, flags: result.flags,
          description: result.explanation || desc,
        }),
      };
      setActive([...active, instantiate(form, {})]);
      setDesc(''); setResult(null);
    };

    return (
      <div className="ouv-nl">
        <div className="ouv-creator-eyebrow">Describe a constraint</div>
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
      </div>
    );
  }

  Object.assign(window, { CreatorDropdown, CreatorCards, CreatorPalette, NLPanel, instantiate });
})();
