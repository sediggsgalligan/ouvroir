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

  // ---- constraint pill list (active constraints shown above editor) ----
  function ActivePills({ active, onRemove }) {
    if (!active.length) return null;
    const [openUid, setOpenUid] = useState(null);
    const expanded = openUid ? active.find(a => a.uid === openUid) : null;

    // Example of how to safely map:
    {active.filter(c => c && c.instance).map((item, index) => (
      <div key={index}>
        {item.instance.title} {/* Now safe! */}
      </div>
    ))}

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
          <ConstraintDetails entry={expanded} onClose={() => setOpenUid(null)} />
        )}
      </div>
    );
  }

  function ConstraintDetails({ entry, onClose }) {
    return (
      <div className="ouv-detail">
        <div className="ouv-detail-row">
          <div className="ouv-detail-label">Description</div>
          <div className="ouv-detail-text">{entry.instance.description}</div>
        </div>
        {entry.regex ? (
          <div className="ouv-detail-row">
            <div className="ouv-detail-label">Regex</div>
            <CopyableRegex source={entry.regex.source} flags={entry.regex.flags || ''} />
          </div>
        ) : (
          <div className="ouv-detail-row">
            <div className="ouv-detail-label">Type</div>
            <div className="ouv-detail-text ouv-detail-muted">
              Predicate constraint — enforced as code, not a regex.
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
