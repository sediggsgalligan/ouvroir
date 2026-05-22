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

  // Global Session Expiry Sign-out Handler
  window.forceSignOut = () => {
    localStorage.removeItem('google_id_token');
    localStorage.removeItem('user_first_name');
    window.dispatchEvent(new Event('auth-changed'));
    window.location.reload();
  };

  // Marketplace Modal
  function CommunityModal({ open, onClose, onPick }) {
    if (!open) return null;
    const [q, setQ] = useState('');
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [token] = useState(() => localStorage.getItem('google_id_token') || null);

    const fetchMarketplace = useCallback(async () => {
      if (!token) return;
      setLoading(true);
      try {
        const res = await fetch('http://localhost:3000/api/constraints', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401 || res.status === 403) {
          window.forceSignOut();
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setList(data);
        }
      } catch (err) {
        console.error('Error fetching marketplace:', err);
      } finally {
        setLoading(false);
      }
    }, [token]);

    useEffect(() => {
      fetchMarketplace();
    }, [fetchMarketplace]);

    const toggleStar = async (id, e) => {
      e.stopPropagation(); // prevent adding when clicking star
      if (!token) return;
      try {
        const res = await fetch(`http://localhost:3000/api/constraints/${id}/star`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401 || res.status === 403) {
          window.forceSignOut();
          return;
        }
        if (res.ok) {
          fetchMarketplace();
          window.dispatchEvent(new Event('auth-changed'));
        }
      } catch (err) {
        console.error('Error toggling star:', err);
      }
    };

    const filtered = list.filter(c => {
      const needle = q.toLowerCase().trim();
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        c.blurb.toLowerCase().includes(needle) ||
        (c.author && c.author.toLowerCase().includes(needle))
      );
    });

    return (
      <div className="ouv-modal-backdrop" onClick={onClose}>
        <div className="ouv-modal" onClick={e => e.stopPropagation()}>
          <div className="ouv-modal-head">
            <div className="ouv-modal-eyebrow">Marketplace</div>
            <div className="ouv-modal-title">Constraint Marketplace</div>
            <div className="ouv-modal-sub">
              Browse constraints used by other writers. Star them to add them to "My Constraints" in your picker, or click to apply them directly.
            </div>
            <button className="ouv-modal-close" onClick={onClose}>×</button>
          </div>

          {!token ? (
            <div style={{ padding: 48, textAlign: 'center', fontStyle: 'italic', color: 'var(--mute)' }}>
              Please sign in or enter a guest handle in the sidebar to view the marketplace.
            </div>
          ) : (
            <>
              <input
                className="ouv-modal-search"
                placeholder="Search marketplace..."
                value={q}
                onChange={e => setQ(e.target.value)}
                autoFocus
              />

              <div className="ouv-modal-grid">
                {loading && <div className="ouv-modal-empty">Loading constraints...</div>}

                {!loading && filtered.length === 0 && (
                  <div className="ouv-modal-empty">
                    {q ? 'No matching constraints found.' : 'Marketplace is empty. Publish constraints by saving a poem!'}
                  </div>
                )}

                {!loading && filtered.map(c => (
                  <div
                    key={c.id}
                    className={`ouv-cf-card${c.starred ? ' is-fav' : ''}`}
                    onClick={() => {
                      onPick(c);
                      onClose();
                    }}
                  >
                    <button
                      className={`ouv-cf-star${c.starred ? ' on' : ''}`}
                      onClick={e => toggleStar(c.id, e)}
                      title={c.starred ? 'Unstar' : 'Star'}
                    >
                      ★
                    </button>
                    <div className="ouv-cf-head">
                      <div className="ouv-cf-name">{c.name}</div>
                      {c.author && <div className="ouv-cf-author">@{c.author}</div>}
                    </div>
                    <div className="ouv-cf-blurb">{c.blurb}</div>
                    <div className="ouv-cf-cta">Apply constraint →</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Public/Shared Poetry View
  function PublicPoemsView({ onBack, onLoadPoem }) {
    const [poems, setPoems] = useState([]);
    const [q, setQ] = useState('');
    const [loading, setLoading] = useState(true);
    const [token] = useState(() => localStorage.getItem('google_id_token') || null);

    const fetchAllPoems = useCallback(async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch('http://localhost:3000/api/poems/all', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401 || res.status === 403) {
          window.forceSignOut();
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setPoems(data);
        }
      } catch (err) {
        console.error('Error fetching all poems:', err);
      } finally {
        setLoading(false);
      }
    }, [token]);

    useEffect(() => {
      fetchAllPoems();
    }, [fetchAllPoems]);

    const filtered = poems.filter(p => {
      const needle = q.toLowerCase().trim();
      if (!needle) return true;
      const matchText = p.text.toLowerCase().includes(needle);
      const matchTitle = p.title.toLowerCase().includes(needle);
      const matchAuthor = (p.author || '').toLowerCase().includes(needle);
      const matchConstraints = (p.constraints || []).some(c =>
        (c.title || c.name || '').toLowerCase().includes(needle) ||
        (c.description || c.blurb || '').toLowerCase().includes(needle)
      );
      return matchText || matchTitle || matchAuthor || matchConstraints;
    });

    return (
      <div className="ouv-stage" style={{ height: '100%', overflowY: 'auto', padding: 'var(--pad)', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--rule)', paddingBottom: '16px' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: 500, margin: '0 0 4px 0', color: 'var(--ink)' }}>Community Poetry</h1>
            <p style={{ margin: 0, color: 'var(--mute)', fontStyle: 'italic', fontSize: '13px' }}>Everyone's saved constrained poems and layouts</p>
          </div>
          <button className="ouv-btn ouv-btn-primary" onClick={onBack}>
            ← Back to Editor
          </button>
        </div>

        {!token ? (
          <div style={{ padding: '64px', textAlign: 'center', fontStyle: 'italic', color: 'var(--mute)', fontFamily: 'var(--serif)' }}>
            Please sign in or enter a guest handle in the sidebar to view community poetry.
          </div>
        ) : (
          <>
            <input
              className="ouv-input"
              placeholder="Search poems by title, text, author, or constraint..."
              value={q}
              onChange={e => setQ(e.target.value)}
              style={{ fontSize: '14px', padding: '10px' }}
            />

            {loading ? (
              <div style={{ textAlign: 'center', padding: '48px', color: 'var(--mute)', fontStyle: 'italic', fontFamily: 'var(--serif)' }}>
                Loading poems...
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px', color: 'var(--mute)', fontStyle: 'italic', fontFamily: 'var(--serif)' }}>
                {q ? 'No poems match your search query.' : 'No poems saved yet. Write and save the first one!'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {filtered.map(p => (
                  <div
                    key={p.id}
                    className="ouv-cf-card"
                    style={{
                      cursor: 'default',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      padding: '16px',
                      minHeight: '220px',
                      alignItems: 'stretch'
                    }}
                  >
                    <div className="ouv-cf-head">
                      <div className="ouv-cf-name" style={{ fontSize: '18px' }}>{p.title}</div>
                      {p.author && <div className="ouv-cf-author" style={{ fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--accent)' }}>@{p.author}</div>}
                    </div>

                    <pre
                      className="ouv-cf-poem"
                      style={{
                        maxHeight: '160px',
                        overflowY: 'auto',
                        padding: '10px',
                        background: 'var(--field)',
                        borderLeft: '2px solid var(--accent)',
                        borderRadius: '2px',
                        margin: 0,
                        fontFamily: 'var(--serif)',
                        fontSize: '13px',
                        whiteSpace: 'pre-wrap'
                      }}
                    >
                      {p.text}
                    </pre>

                    {p.constraints && p.constraints.length > 0 && (
                      <div>
                        <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--mute)', marginBottom: '4px', fontWeight: 600 }}>
                          Constraints used:
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {p.constraints.map((c, idx) => (
                            <span
                              key={idx}
                              style={{
                                fontSize: '10px',
                                background: 'var(--field)',
                                border: '1px solid var(--rule)',
                                padding: '2px 6px',
                                borderRadius: '3px',
                                color: 'var(--ink)'
                              }}
                              title={c.description || c.blurb}
                            >
                              {c.title || c.name || 'Custom'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{ marginTop: 'auto', paddingTop: '8px', borderTop: '1px dashed var(--rule)', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        className="ouv-btn ouv-btn-secondary"
                        onClick={() => onLoadPoem(p)}
                        style={{ fontSize: '11px', padding: '4px 10px' }}
                      >
                        Open in Editor
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
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
    const [starredConstraints, setStarredConstraints] = useState([]);
    const [poems, setPoems] = useState([]);
    const [poemTitle, setPoemTitle] = useState('');
    const [statusMessage, setStatusMessage] = useState('');

    // Page view routing
    const [currentView, setCurrentView] = useState(() => {
      const path = window.location.pathname;
      const hash = window.location.hash;
      if (path === '/poems' || path.endsWith('/poems') || hash === '#poems') {
        return 'poems';
      }
      return 'editor';
    });

    const navigateTo = (view) => {
      setCurrentView(view);
      if (view === 'poems') {
        window.location.hash = '#poems';
      } else {
        window.location.hash = '';
      }
    };

    useEffect(() => {
      const handleHashChange = () => {
        if (window.location.hash === '#poems') {
          setCurrentView('poems');
        } else {
          setCurrentView('editor');
        }
      };
      window.addEventListener('hashchange', handleHashChange);
      return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    const fetchData = useCallback(async () => {
      const token = localStorage.getItem('google_id_token');
      if (!token) {
        setStarredConstraints([]);
        setPoems([]);
        return;
      }
      try {
        const cRes = await fetch('http://localhost:3000/api/constraints', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (cRes.status === 401 || cRes.status === 403) {
          window.forceSignOut();
          return;
        }
        if (cRes.ok) {
          const cData = await cRes.json();
          setStarredConstraints(cData.filter(c => c.starred));
        }

        const pRes = await fetch('http://localhost:3000/api/poems', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (pRes.status === 401 || pRes.status === 403) {
          window.forceSignOut();
          return;
        }
        if (pRes.ok) {
          const pData = await pRes.json();
          setPoems(pData);
        }
      } catch (err) {
        console.error('Error fetching user data:', err);
      }
    }, []);

    useEffect(() => {
      fetchData();
      window.addEventListener('auth-changed', fetchData);
      return () => window.removeEventListener('auth-changed', fetchData);
    }, [fetchData]);

    const handleAuth = () => {
      setFirstName(localStorage.getItem('user_first_name'));
    };

    useEffect(() => {
      window.addEventListener('auth-changed', handleAuth);
      return () => window.removeEventListener('auth-changed', handleAuth);
    }, []);

    const handleSignOut = () => {
      window.forceSignOut();
    };

    const removeActive = (uid) => setActive(active.filter((a) => a.uid !== uid));

    const updateActive = (uid, updated) => {
      setActive(prev => prev.map(a => a.uid === uid ? { ...a, ...updated } : a));
    };

    const CreatorComp = tweaks.creator === 'cards' ? CreatorCards :
      tweaks.creator === 'palette' ? CreatorPalette :
        CreatorDropdown;

    const pickFromBrowse = (entry) => {
      if (entry.key) {
        const deserialized = window.Ouvroir.deserializeConstraint(entry);
        if (deserialized) {
          deserialized.community = { name: entry.name, author: entry.author, id: entry.id };
          setActive([...active, deserialized]);
        }
      } else {
        applyCommunityEntry(entry, active, setActive);
      }
    };

    const pickStarred = useCallback((c) => {
      const deserialized = window.Ouvroir.deserializeConstraint(c);
      if (deserialized) {
        deserialized.community = { name: c.name, author: c.author, id: c.id };
        setActive(prev => [...prev, deserialized]);
      }
    }, [active]);

    const savePoem = async () => {
      const token = localStorage.getItem('google_id_token');
      if (!token) {
        setStatusMessage('Please sign in or enter a guest handle to save.');
        return;
      }
      if (!text.trim()) {
        setStatusMessage('Poem text is empty.');
        return;
      }

      setStatusMessage('Saving...');
      try {
        const serialized = active.map(c => window.Ouvroir.serializeConstraint(c));
        const res = await fetch('http://localhost:3000/api/poems', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            title: poemTitle.trim() || 'Untitled Poem',
            text: text,
            constraints: serialized
          })
        });

        if (res.status === 401 || res.status === 403) {
          window.forceSignOut();
          return;
        }

        if (res.ok) {
          setStatusMessage('Saved! Constraints published.');
          setPoemTitle('');
          fetchData();
          setTimeout(() => setStatusMessage(''), 3000);
        } else {
          const data = await res.json();
          setStatusMessage(`Error: ${data.error || 'Failed to save'}`);
        }
      } catch (err) {
        setStatusMessage(`Error: ${err.message}`);
      }
    };

    const loadPoem = (poem) => {
      setText(poem.text);
      setPoemTitle(poem.title || '');
      const deserializedList = (poem.constraints || [])
        .map(c => window.Ouvroir.deserializeConstraint(c))
        .filter(Boolean);
      setActive(deserializedList);
      navigateTo('editor');
      setStatusMessage(`Loaded: "${poem.title}"`);
      setTimeout(() => setStatusMessage(''), 3000);
    };

    useEffect(() => {
      const handleHashLoad = async () => {
        const hash = window.location.hash;
        if (hash.startsWith('#load-')) {
          const token = localStorage.getItem('google_id_token');
          if (!token) return;
          const targetId = hash.replace('#load-', '');
          try {
            const res = await fetch('http://localhost:3000/api/poems/all', {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
              const list = await res.json();
              const found = list.find(p => p.id === targetId);
              if (found) {
                loadPoem(found);
                // Clear hash to prevent reloading on subsequent interactions
                window.location.hash = '';
              }
            }
          } catch (err) {
            console.error('Error auto-loading poem from hash:', err);
          }
        }
      };

      handleHashLoad();
      window.addEventListener('hashchange', handleHashLoad);
      return () => window.removeEventListener('hashchange', handleHashLoad);
    }, [loadPoem]);

    return (
      <>
        <div className={`ouv-root theme-${tweaks.theme}`}>
          <div className="ouv-sidebar">
            <div className="ouv-brand" style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                {/* <div className="ouv-brand-name" style={{ fontFamily: "EB Garamond" }}>Ouvroir</div> */}
                <img src="ouvroir_logo.svg" style={{ overflow: 'auto', justifySelf: 'center' }} />
              </div>
              <a
                href="poems.html"
                className="ouv-btn"
                style={{ fontSize: '11px', padding: '4px 8px', alignSelf: 'stretch', textAlign: 'center', textDecoration: 'none' }}
              >
                View Shared Poetry
              </a>
            </div>

            {currentView === 'editor' && (
              <>
                <CreatorComp
                  active={active}
                  setActive={setActive}
                  onBrowse={() => setBrowseOpen(true)}
                  starredConstraints={starredConstraints}
                  pickStarred={pickStarred}
                />

                <NLPanel active={active} setActive={setActive} />
              </>
            )}

            {active.length > 0 && (
              <div>
                <div className="ouv-creator-eyebrow">In play</div>
                <ActivePills active={active} onRemove={removeActive} onUpdate={updateActive} />
              </div>
            )}

            {/* Saved Poems Sidebar Section */}
            <div className="ouv-poems-section" style={{ borderTop: '1px dashed var(--rule)', paddingTop: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="ouv-creator-eyebrow">Poems</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="Poem Title..."
                  value={poemTitle}
                  onChange={e => setPoemTitle(e.target.value)}
                  className="ouv-input"
                  style={{ fontSize: '13px' }}
                />
                <button
                  className="ouv-btn ouv-btn-primary"
                  onClick={savePoem}
                  disabled={!text.trim()}
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                >
                  Save Poem
                </button>
                {statusMessage && (
                  <div style={{ fontSize: '11px', color: 'var(--accent)', fontStyle: 'italic' }}>
                    {statusMessage}
                  </div>
                )}
              </div>

              {poems.length > 0 && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontStyle: 'italic', fontSize: '11px', color: 'var(--mute)', marginBottom: '2px' }}>Saved Poems:</div>
                  <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {poems.map(p => (
                      <button
                        key={p.id}
                        onClick={() => loadPoem(p)}
                        className="ouv-btn ouv-btn-ghost"
                        style={{
                          textAlign: 'left',
                          justifyContent: 'flex-start',
                          padding: '6px 8px',
                          fontSize: '12px',
                          width: '100%',
                          border: '1px solid var(--rule)',
                          background: 'var(--field)',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.title}</span>
                        <span style={{ fontSize: '10px', color: 'var(--mute)', marginLeft: '6px' }}>
                          {p.constraints ? `${p.constraints.length} c` : '0 c'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div id="google_signin_button"></div>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="Or enter Guest handle..."
                      className="ouv-input"
                      style={{ fontSize: '11px', padding: '4px 6px' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          const handle = e.target.value.trim();
                          localStorage.setItem('google_id_token', 'guest:' + handle);
                          localStorage.setItem('user_first_name', handle);
                          window.dispatchEvent(new Event('auth-changed'));
                          window.location.reload();
                        }
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {currentView === 'poems' ? (
            <PublicPoemsView
              onBack={() => navigateTo('editor')}
              onLoadPoem={loadPoem}
            />
          ) : (
            <div className="ouv-stage">
              <Editor
                active={active}
                text={text}
                setText={setText}
                gutter={tweaks.gutter}
                showAlphabet={tweaks.showAlphabet} />
            </div>
          )}
        </div>

        <CommunityModal
          open={browseOpen}
          onClose={() => setBrowseOpen(false)}
          onPick={pickFromBrowse} />

        <OuvroirTweaks tweaks={tweaks} setTweak={setTweak} />
      </>
    );
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
              { value: 'term', label: 'Term' }
            ]}
            onChange={(v) => setTweak('theme', v)}
          />

          <TweakRadio
            label="Gutter"
            value={tweaks.gutter}
            options={[
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' }
            ]}
            onChange={(v) => setTweak('gutter', v)}
          />
        </TweakSection>

        <TweakSection label="Constraint creator">
          <TweakSelect
            label="Variant"
            value={tweaks.creator}
            options={[
              { value: 'dropdown', label: 'Dropdown (default)' },
              { value: 'cards', label: 'Card grid' },
              { value: 'palette', label: 'Command palette' }
            ]}
            onChange={(v) => setTweak('creator', v)}
          />
        </TweakSection>

        <TweakSection label="Affordances">
          <TweakToggle
            label="Alphabet strip"
            value={tweaks.showAlphabet}
            onChange={(v) => setTweak('showAlphabet', v)}
          />
        </TweakSection>
      </TweaksPanel>
    );
  }

  // ---- mount ----------------------------------------------------------
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
    <div className="ouv-fullbleed">
      <OuvroirApp />
    </div>
  );
})();
