// app.jsx — the Ouvroir editor composed end-to-end + design canvas layout.

(function () {
  'use strict';
  const { useState, useEffect, useMemo, useCallback } = React;

  // Full editor: takes a theme and a creator variant.
  function OuvroirApp({ theme = 'paper', creator = 'dropdown', initialText = '', initialConstraints = [] }) {
    const [active, setActive] = useState(() => {
      return initialConstraints.map(id => {
        const form = window.Ouvroir.FORMS.find(f => f.id === id);
        if (!form) return null;
        return instantiate(form, {});
      }).filter(Boolean);
    });
    const [text, setText] = useState(initialText);

    const removeActive = (uid) => setActive(active.filter(a => a.uid !== uid));

    const CreatorComp = creator === 'cards' ? CreatorCards
      : creator === 'palette' ? CreatorPalette
      : CreatorDropdown;

    return (
      <div className={`ouv-root theme-${theme}`}>
        <div className="ouv-sidebar">
          <div className="ouv-brand">
            <div className="ouv-brand-name">Ouvroir</div>
          </div>
          <CreatorComp active={active} setActive={setActive} />
          <NLPanel active={active} setActive={setActive} />
          {active.length > 0 && (
            <div>
              <div className="ouv-creator-eyebrow">In play</div>
              <ActivePills active={active} onRemove={removeActive} />
            </div>
          )}
        </div>
        <div className="ouv-stage">
          <Editor active={active} text={text} setText={setText} />
        </div>
      </div>
    );
  }

  // ---- mount ----------------------------------------------------------
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
    <div className="ouv-fullbleed">
      <OuvroirApp theme="press" creator="dropdown" />
    </div>
  );
})();
