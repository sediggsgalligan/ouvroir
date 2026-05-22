// editor.jsx — Constrained writing surface.
// Intercepts keydowns and consults the active constraint engine. Forbidden
// keystrokes are absorbed and trigger a shake + a brief "why" toast.
//
// Exports (to window): Editor, ConstraintEngine

(function () {
  'use strict';

  const { useState, useEffect, useRef, useMemo, useCallback } = React;

  // Format engine + active constraints into one combined engine
  function buildEngine(active) {
    return Ouvroir.combine(active.map(a => a.instance));
  }

  // ---- shake util ------------------------------------------------------
  // Don't change the React key — that remounts the textarea and steals focus.
  // Instead toggle a class via a timer.
  function useShake() {
    const [shaking, setShaking] = useState(false);
    const [why, setWhy] = useState(null);
    const [tick, setTick] = useState(0);
    const shakeT = useRef(null);
    const whyT = useRef(null);
    const shake = useCallback((reason) => {
      setShaking(true);
      setWhy(reason);
      setTick(t => t + 1);
      if (shakeT.current) clearTimeout(shakeT.current);
      if (whyT.current) clearTimeout(whyT.current);
      shakeT.current = setTimeout(() => setShaking(false), 340);
      whyT.current = setTimeout(() => setWhy(null), 1800);
    }, []);
    return { shaking, why, whyKey: tick, shake };
  }

  // ---- main editor -----------------------------------------------------
  function Editor({ active, onChange, text, setText, paletteHint, gutter = 'right', showAlphabet = true }) {
    const taRef = useRef(null);
    const engine = useMemo(() => buildEngine(active), [active]);
    const { shaking, why, whyKey, shake } = useShake();
    const [caret, setCaret] = useState(0);

    // Recompute allowed letters from the caret position
    const allowed = useMemo(() => engine.allowedLetters(text, caret), [engine, text, caret]);

    const handleKeyDown = (e) => {
      const ta = taRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;

      // Always permit navigation, selection, copy/cut/undo
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (
        e.key === 'Backspace' || e.key === 'Delete' ||
        e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
        e.key === 'Home' || e.key === 'End' ||
        e.key === 'PageUp' || e.key === 'PageDown' ||
        e.key === 'Tab' || e.key === 'Escape' || e.key === 'Shift' ||
        e.key === 'CapsLock' || e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt'
      ) return;

      if (e.key === 'Enter') {
        const r = engine.canBreakLine(text, start);
        if (!r.ok) { e.preventDefault(); shake(r.why); return; }
        return;
      }

      // Printable single character (incl. space, punctuation)
      if (e.key.length === 1) {
        const ch = e.key;
        const r = engine.canInsert(text, start, ch);
        if (!r.ok) { e.preventDefault(); shake(r.why); return; }
        // If selection spans multiple chars, treat the position as start
      }
    };

    const handleChange = (e) => {
      setText(e.target.value);
      setCaret(e.target.selectionStart);
      onChange?.(e.target.value);
    };

    const handleSelect = (e) => setCaret(e.target.selectionStart);

    // Pull lines for gutter rendering
    const lines = text.split('\n');
    const gutterLines = lines.map((l, i) => engine.lineFeedback(text, caret, i)).map(s => s || '');

    return (
      <div className="ouv-editor-shell">
        <div className="ouv-constraint-bar">
          <span className="ouv-cbar-label">Current constraint:</span>
          <span className="ouv-cbar-desc">{engine.describe()}</span>
          {why && <span className="ouv-why" key={whyKey}>{why}</span>}
        </div>
        <div className={`ouv-paper-row gutter-${gutter}`}>
          {gutter === 'left' && <Gutter lines={gutterLines} />}
          <div className={`ouv-paper${shaking ? ' ouv-shaking' : ''}`}>
            <textarea
              ref={taRef}
              className="ouv-textarea"
              value={text}
              onChange={handleChange}
              onSelect={handleSelect}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              placeholder={paletteHint || 'Begin…'}
            />
          </div>
          {gutter === 'right' && <Gutter lines={gutterLines} />}
        </div>
        {showAlphabet && <AlphabetStrip allowed={allowed} />}
        <div className="ouv-actions">
          <div className="ouv-actions-meta">
            {text.trim() ? `${text.trim().split(/\s+/).length} words · ${lines.length} lines` : 'unwritten'}
          </div>
          <div className="ouv-actions-buttons">
            <button className="ouv-btn ouv-btn-ghost" type="button">Save</button>
            <button className="ouv-btn ouv-btn-primary" type="button">Publish</button>
          </div>
        </div>
      </div>
    );
  }

  function Gutter({ lines }) {
    if (!lines.some(Boolean)) return <div className="ouv-gutter ouv-gutter-empty" />;
    return (
      <div className="ouv-gutter">
        {lines.map((l, i) => (
          <div key={i} className="ouv-gutter-line">{l}</div>
        ))}
      </div>
    );
  }

  function AlphabetStrip({ allowed }) {
    return (
      <div className="ouv-alpha">
        {Ouvroir.ALPHA.split('').map(c => {
          const on = !allowed || allowed.has(c);
          return (
            <span key={c} className={`ouv-alpha-letter${on ? '' : ' off'}`}>{c}</span>
          );
        })}
      </div>
    );
  }

  // ---- JS syntax highlighter -------------------------------------------
  // function highlightJS(code) {
  //   if (!code) return '';
  //   let escaped = code
  //     .replace(/&/g, '&amp;')
  //     .replace(/</g, '&lt;')
  //     .replace(/>/g, '&gt;');

  //   escaped = escaped.replace(/(\/\/.*)/g, '<span style="color: #6a737d;">$1</span>');
  //   escaped = escaped.replace(/(["'`])(.*?)\1/g, '<span style="color: #032f62;">$1$2$1</span>');
  //   escaped = escaped.replace(/\b(const|let|var|function|return|if|else|for|while|typeof|true|false|null|undefined|in|of)\b/g, '<span style="color: #d73a49; font-weight: 500;">$1</span>');
  //   escaped = escaped.replace(/\b(\d+)\b/g, '<span style="color: #005cc5;">$1</span>');

  //   return <code style={{ fontFamily: 'var(--mono)', fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }} dangerouslySetInnerHTML={{ __html: escaped }} />;
  // }

  function highlightJS(code) {
    if (!code) return '';

    // 1. Escape HTML characters safely first
    let escaped = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 2. Match tokens in order of priority using | (OR)
    // We capture each type in its own group ()
    const tokenRegex = /(?<comment>\/\/.*)|(?<string>["'`].*?["'`])|(?<keyword>\b(?:const|let|var|function|return|if|else|for|while|typeof|true|false|null|undefined|in|of)\b)|(?<number>\b\d+\b)/g;

    // 3. Replace tokens by checking which group matched
    escaped = escaped.replace(tokenRegex, (match, comment, string, keyword, number) => {
      if (comment) return `<span style="color: #6a737d;">${match}</span>`;
      if (string) return `<span style="color: #032f62;">${match}</span>`;
      if (keyword) return `<span style="color: #d73a49; font-weight: 500;">${match}</span>`;
      if (number) return `<span style="color: #005cc5;">${match}</span>`;
      return match;
    });

    return (
      <code
        style={{ fontFamily: 'var(--mono)', fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
        dangerouslySetInnerHTML={{ __html: escaped }}
      />
    );
  }

  // ---- constraint pill list (active constraints shown above editor) ----
  function ActivePills({ active, onRemove, onUpdate }) {
    if (!active.length) return null;
    const [openUid, setOpenUid] = useState(null);
    const expanded = openUid ? active.find(a => a.uid === openUid) : null;

    return (
      <div className="ouv-pills-wrap">
        <div className="ouv-pills">
          {active.map(a => {
            const isOpen = openUid === a.uid;
            return (
              <span key={a.uid} className={`ouv-pill${isOpen ? ' is-open' : ''}`}>
                <button
                  className="ouv-pill-body"
                  onClick={() => setOpenUid(isOpen ? null : a.uid)}
                  title="View details"
                >
                  <span className="ouv-pill-title">
                    {a.instance?.title ?? 'Unknown Constraint'}
                  </span>
                  {a.community && (
                    <span className="ouv-pill-by"> · @{a.community.author}</span>
                  )}
                  <span className="ouv-pill-caret">{isOpen ? '▾' : '›'}</span>
                </button>
                <button
                  className="ouv-pill-x"
                  onClick={() => { onRemove(a.uid); if (isOpen) setOpenUid(null); }}
                  aria-label="Remove"
                >×</button>
              </span>
            );
          })}
        </div>
        {expanded && (
          <ConstraintDetails
            entry={expanded}
            onClose={() => setOpenUid(null)}
            onUpdate={(updated) => onUpdate?.(expanded.uid, updated)}
          />
        )}
      </div>
    );
  }

  function ConstraintDetails({ entry, onClose, onUpdate }) {
    const [isEditing, setIsEditing] = useState(false);
    const [regexSrc, setRegexSrc] = useState(entry.regex?.source || '');
    const [regexFlags, setRegexFlags] = useState(entry.regex?.flags || 'i');
    const [desc, setDesc] = useState(entry.instance?.description || entry.description || '');
    const [title, setTitle] = useState(entry.instance?.title || entry.title || 'Custom Constraint');
    const [err, setErr] = useState(null);

    // For script constraint hooks
    const [hooks, setHooks] = useState(() => {
      const h = { canInsert: '', canBreakSpace: '', canBreakLine: '', lineFeedback: '' };
      if (entry.script?.hooks) {
        Object.assign(h, entry.script.hooks);
      }
      return h;
    });

    // For form parameters
    const formSchema = useMemo(() => {
      if (entry.formId && window.Ouvroir?.FORMS) {
        return window.Ouvroir.FORMS.find(f => f.id === entry.formId);
      }
      return null;
    }, [entry.formId]);

    const [formParams, setFormParams] = useState(() => {
      return { ...entry.params };
    });

    const handleSave = () => {
      setErr(null);
      try {
        if (entry.regex) {
          new RegExp(regexSrc, regexFlags);
          const inst = window.Ouvroir.makeRegexConstraint({
            source: regexSrc,
            flags: regexFlags,
            description: desc
          });
          onUpdate({
            regex: { source: regexSrc, flags: regexFlags, blurb: desc },
            instance: inst
          });
        } else if (entry.script) {
          const activeHooks = {};
          Object.entries(hooks).forEach(([k, v]) => {
            if (v && v.trim()) activeHooks[k] = v;
          });
          const inst = window.Ouvroir.makeScriptedConstraint({
            title: title,
            description: desc,
            hooks: activeHooks
          });
          onUpdate({
            script: { title: title, description: desc, hooks: activeHooks },
            instance: inst
          });
        } else if (formSchema) {
          const merged = {};
          (formSchema.params || []).forEach(p => {
            merged[p.id] = formParams[p.id] ?? p.default;
          });
          const inst = formSchema.make(merged);
          inst.title = formSchema.name;
          inst.description = formSchema.blurb || '';
          onUpdate({
            params: merged,
            instance: inst
          });
        }
        setIsEditing(false);
      } catch (e) {
        setErr(e.message || String(e));
      }
    };

    if (isEditing) {
      return (
        <div className="ouv-detail" style={{ border: '1px solid var(--accent)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span className="ouv-detail-label" style={{ color: 'var(--accent)' }}>Edit Constraint</span>
            <button className="ouv-btn" style={{ fontSize: '10px', padding: '2px 6px' }} onClick={() => setIsEditing(false)}>Cancel</button>
          </div>

          {err && <div className="ouv-nl-err" style={{ marginBottom: '8px' }}>⚠ {err}</div>}

          {entry.regex && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="ouv-param">
                <span className="ouv-detail-label">Pattern (Regex)</span>
                <input
                  type="text"
                  className="ouv-input ouv-input-mono"
                  value={regexSrc}
                  onChange={e => setRegexSrc(e.target.value)}
                />
              </div>
              <div className="ouv-param">
                <span className="ouv-detail-label">Flags</span>
                <input
                  type="text"
                  className="ouv-input ouv-input-mono"
                  value={regexFlags}
                  onChange={e => setRegexFlags(e.target.value)}
                />
              </div>
              <div className="ouv-param">
                <span className="ouv-detail-label">Description</span>
                <textarea
                  className="ouv-input"
                  rows={2}
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                />
              </div>
            </div>
          )}

          {entry.script && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="ouv-param">
                <span className="ouv-detail-label">Title</span>
                <input
                  type="text"
                  className="ouv-input"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>
              <div className="ouv-param">
                <span className="ouv-detail-label">Description</span>
                <textarea
                  className="ouv-input"
                  rows={2}
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                />
              </div>
              {Object.keys(hooks).map(hookName => (
                <div className="ouv-param" key={hookName}>
                  <span className="ouv-detail-label">{hookName}(ctx, ...)</span>
                  <textarea
                    className="ouv-input ouv-input-mono"
                    rows={3}
                    placeholder="// hook code"
                    value={hooks[hookName]}
                    onChange={e => setHooks({ ...hooks, [hookName]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          )}

          {formSchema && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontWeight: 500, fontSize: '13px', fontFamily: 'var(--serif)' }}>{formSchema.name}</div>
              <div style={{ fontStyle: 'italic', fontSize: '11px', color: 'var(--mute)' }}>{formSchema.blurb}</div>
              {(formSchema.params || []).map(p => (
                <div className="ouv-param" key={p.id}>
                  <span className="ouv-detail-label">{p.name || p.id}</span>
                  {p.type === 'boolean' ? (
                    <input
                      type="checkbox"
                      checked={!!formParams[p.id]}
                      onChange={e => setFormParams({ ...formParams, [p.id]: e.target.checked })}
                    />
                  ) : (
                    <input
                      type="text"
                      className="ouv-input"
                      value={formParams[p.id] ?? ''}
                      onChange={e => setFormParams({ ...formParams, [p.id]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button className="ouv-btn ouv-btn-primary" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={handleSave}>
              Save Changes
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="ouv-detail">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="ouv-detail-label">Constraint Details</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(entry.regex || entry.script || formSchema) && (
              <button
                className="ouv-btn"
                style={{ fontSize: '10px', padding: '2px 6px', borderColor: 'var(--accent)' }}
                onClick={() => setIsEditing(true)}
              >
                Edit
              </button>
            )}
            <button className="ouv-btn" style={{ fontSize: '10px', padding: '2px 6px' }} onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="ouv-detail-row">
          <div className="ouv-detail-label">Description</div>
          <div className="ouv-detail-text">{entry.instance?.description || entry.description}</div>
        </div>

        {entry.regex && (
          <div className="ouv-detail-row">
            <div className="ouv-detail-label">Regex</div>
            <code style={{ fontFamily: 'var(--mono)', fontSize: '12px', background: 'var(--field)', padding: '4px 6px', borderRadius: '3px', wordBreak: 'break-all' }}>
              /{entry.regex.source}/{entry.regex.flags || ''}
            </code>
          </div>
        )}

        {entry.script && (
          <div className="ouv-detail-row">
            <div className="ouv-detail-label">Code Constraints</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              {Object.entries(entry.script.hooks || {}).map(([hookName, code]) => (
                <div key={hookName} style={{ background: 'var(--field)', border: '1px solid var(--rule)', borderRadius: '4px', padding: '8px' }}>
                  <div style={{ fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 600, borderBottom: '1px solid var(--rule)', paddingBottom: '3px', marginBottom: '4px' }}>
                    {hookName}(ctx, ...)
                  </div>
                  <pre style={{ margin: 0, overflowX: 'auto' }}>
                    {highlightJS(code)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}

        {entry.community && (
          <div className="ouv-detail-row">
            <div className="ouv-detail-label">Author</div>
            <div className="ouv-detail-text">
              @{entry.community.author} · <em>{entry.community.name}</em>
            </div>
          </div>
        )}
      </div>
    );
  }

  Object.assign(window, { Editor, ActivePills });
})();
