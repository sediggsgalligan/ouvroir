// app.jsx — the Ouvroir editor composed end-to-end, with tweakable controls.

(function () {
  'use strict';
  const { useState, useEffect, useMemo, useCallback } = React;

  const DEFAULTS = /*EDITMODE-BEGIN*/{
    "theme": "press",
    "creator": "dropdown",
    "gutter": "right",
    "showAlphabet": true
  } /*EDITMODE-END*/;

  function OuvroirApp({ initialText = '', initialConstraints = [] }) {
    const [tweaks, setTweak] = useTweaks(DEFAULTS);

    const [active, setActive] = useState(() => {
      return initialConstraints.map((id) => {
        const form = window.Ouvroir.FORMS.find((f) => f.id === id);
        if (!form) return null;
        return instantiate(form, {});
      }).filter(Boolean);
    });
    const [text, setText] = useState(initialText);
    const [browseOpen, setBrowseOpen] = useState(false);

    const removeActive = (uid) => setActive(active.filter((a) => a.uid !== uid));

    const CreatorComp = tweaks.creator === 'cards' ? CreatorCards :
    tweaks.creator === 'palette' ? CreatorPalette :
    CreatorDropdown;

    const pickFromBrowse = (entry) => {
      applyCommunityEntry(entry, active, setActive);
    };

    return (
      <>
        <div className={`ouv-root theme-${tweaks.theme}`}>
          <div className="ouv-sidebar">
            <div className="ouv-brand">
              <div className="ouv-brand-name" style={{ fontFamily: "EB Garamond" }}>Ouvroir</div>
              <div className="ouv-brand-tag"></div>
            </div>
            <CreatorComp
              active={active}
              setActive={setActive}
              onBrowse={() => setBrowseOpen(true)} />
            
            <NLPanel active={active} setActive={setActive} />
            {active.length > 0 &&
            <div>
                <div className="ouv-creator-eyebrow">In play</div>
                <ActivePills
                active={active}
                onRemove={removeActive} />
              
              </div>
            }
          </div>
          <div className="ouv-stage">
            <Editor
              active={active}
              text={text}
              setText={setText}
              gutter={tweaks.gutter}
              showAlphabet={tweaks.showAlphabet} />
            
          </div>
        </div>

        <CommunityModal
          open={browseOpen}
          onClose={() => setBrowseOpen(false)}
          onPick={pickFromBrowse} />
        

        <OuvroirTweaks tweaks={tweaks} setTweak={setTweak} />
      </>);

  }

  function OuvroirTweaks({ tweaks, setTweak }) {
    return (
      <TweaksPanel title="Tweaks">
        <TweakSection label="Surface">
          <TweakRadio
            label="Theme"
            value={tweaks.theme}
            options={[
            { value: 'paper', label: 'Paper' },
            { value: 'press', label: 'Press' },
            { value: 'term', label: 'Term' }]
            }
            onChange={(v) => setTweak('theme', v)} />
          
          <TweakRadio
            label="Gutter"
            value={tweaks.gutter}
            options={[
            { value: 'left', label: 'Left' },
            { value: 'right', label: 'Right' }]
            }
            onChange={(v) => setTweak('gutter', v)} />
          
        </TweakSection>

        <TweakSection label="Constraint creator">
          <TweakSelect
            label="Variant"
            value={tweaks.creator}
            options={[
            { value: 'dropdown', label: 'Dropdown (default)' },
            { value: 'cards', label: 'Card grid' },
            { value: 'palette', label: 'Command palette' }]
            }
            onChange={(v) => setTweak('creator', v)} />
          
        </TweakSection>

        <TweakSection label="Affordances">
          <TweakToggle
            label="Alphabet strip"
            value={tweaks.showAlphabet}
            onChange={(v) => setTweak('showAlphabet', v)} />
          
        </TweakSection>
      </TweaksPanel>);

  }

  // ---- mount ----------------------------------------------------------
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
    <div className="ouv-fullbleed">
      <OuvroirApp />
    </div>
  );
})();