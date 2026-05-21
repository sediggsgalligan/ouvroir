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

  // Add this temporary placeholder component near the top of app.jsx
  function CommunityModal({ isOpen, onClose }) {
    if (!isOpen) return null;
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', 
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
      }}>
        <div style={{ background: '#fff', padding: 24, borderRadius: 8, maxWidth: 400, color: '#333' }}>
          <h3>Community Templates Coming Soon</h3>
          <p>This panel is currently under construction.</p>
          <button className="ouv-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

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

    const [firstName, setFirstName] = useState(() => localStorage.getItem('user_first_name'));

  useEffect(() => {
    const handleAuth = () => {
      // This forces the component to read from localStorage again
      setFirstName(localStorage.getItem('user_first_name'));
    };
    
    window.addEventListener('auth-changed', handleAuth);
    return () => window.removeEventListener('auth-changed', handleAuth);
  }, []); // Empty dependency array is correct here

    const handleSignOut = () => {
      localStorage.removeItem('google_id_token');
      localStorage.removeItem('user_first_name');
      setFirstName(null);
      window.location.reload(); // Clean reset of Google library
    };

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
            {active.length > 0 && (
              <div>
                <div className="ouv-creator-eyebrow">In play</div>
                <ActivePills active={active} onRemove={removeActive} />
              </div>
            )}

            <div style={{ flex: 1 }}></div>

            <div style={{ marginTop: 'auto', marginBottom: '10px' }}>
              {firstName ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--ink)' }}>Hi {firstName}!</span>
                  <button 
                    className="ouv-btn ouv-btn-ghost" 
                    onClick={handleSignOut} 
                    style={{ fontSize: '10px', padding: '2px 6px' }}
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <div id="google_signin_button" style={{ 
                      marginTop: 'auto', 
                      marginBottom: '10px'
                }}></div>
              )}
            </div>
          </div> {/* <--- ADDED THIS DIV TO CLOSE THE SIDEBAR */}

          <div className="ouv-stage">
            <Editor
              active={active}
              text={text}
              setText={setText}
              gutter={tweaks.gutter}
              showAlphabet={tweaks.showAlphabet} />
          </div>
        </div> {/* <--- CLOSES THE ouv-root DIV */}

        <CommunityModal
          open={browseOpen}
          onClose={() => setBrowseOpen(false)}
          onPick={pickFromBrowse} />
        
        <OuvroirTweaks tweaks={tweaks} setTweak={setTweak} />
      </>
    );

  //     return (
  //   <div className={`ouv-root theme-${theme}`}>
  //     <div className="ouv-sidebar">
  //       <div className="ouv-brand">
  //         <div className="ouv-brand-name">Ouvroir</div>
  //       </div>
        
  //       <CreatorComp active={active} setActive={setActive} />
  //       <NLPanel active={active} setActive={setActive} />
        
  //       {active.length > 0 && (
  //         <div>
  //           <div className="ouv-creator-eyebrow">In play</div>
  //           <ActivePills active={active} onRemove={removeActive} />
  //         </div>
  //       )}

  //       {/* This div acts as a spacer that fills all remaining vertical space */}
  //       <div style={{ flex: 1 }}></div>

  //       {/* The Auth Container fixed at the bottom left of the sidebar */}
  //       <div id="google_signin_button" style={{ 
  //           marginTop: 'auto', 
  //           marginBottom: '10px' 
  //       }}>
  //         {/* Google script will inject the button here automatically */}
  //       </div>
  //     </div>
      
  //     <div className="ouv-stage">
  //       <Editor active={active} text={text} setText={setText} />
  //     </div>
  //   </div>
  // );

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
