import { useState, useEffect, useRef } from "react";

// ─── Design tokens ────────────────────────────────────────────────────────────
// Netflix-dark base (#141414) × Letterboxd slate (#2c3440) hybrid
// Accent: Letterboxd green (#00e054) for ratings/active; Netflix red (#e50914) for CTA
// Type: 'Bebas Neue' display, system-ui body, monospace for data labels

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";


function StarRating({ score }) {
  const stars = Math.round((score / 100) * 5 * 2) / 2;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => {
        const filled = stars >= s ? 1 : stars >= s - 0.5 ? 0.5 : 0;
        return (
          <svg key={s} width="12" height="12" viewBox="0 0 12 12">
            <defs>
              <linearGradient id={`grad-${s}-${score}`}>
                <stop offset={`${filled * 100}%`} stopColor="#00e054" />
                <stop offset={`${filled * 100}%`} stopColor="#445566" />
              </linearGradient>
            </defs>
            <polygon
              points="6,1 7.5,4.5 11,5 8.5,7.5 9,11 6,9.5 3,11 3.5,7.5 1,5 4.5,4.5"
              fill={`url(#grad-${s}-${score})`}
            />
          </svg>
        );
      })}
    </div>
  );
}

function MovieCard({ movie, index }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="movie-card"
      style={{ animationDelay: `${index * 60}ms` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Poster */}
      <div className="poster-wrap">
        {!imgLoaded && <div className="poster-skeleton" />}
        <img
          src={movie.poster}
          alt={movie.title}
          className="poster-img"
          style={{ opacity: imgLoaded ? 1 : 0 }}
          onLoad={() => setImgLoaded(true)}
          loading="lazy"
        />

        {/* Letterboxd-style overlay on hover */}
        <div className={`poster-overlay ${hovered ? "active" : ""}`}>
          <div className="overlay-content">
            <StarRating score={movie.score} />
            <p className="overlay-reason">{movie.reason}</p>
            <div className="match-badge">{movie.score}% match</div>
          </div>
        </div>

        {/* Rank badge */}
        <div className="rank-badge">#{index + 1}</div>
      </div>

      {/* Below poster */}
      <div className="card-meta">
        <h3 className="card-title">{movie.title}</h3>
        <StarRating score={movie.score} />
      </div>
    </div>
  );
}

function EngineToggle({ engine, setEngine }) {
  return (
    <div className="engine-toggle">
      <span className="engine-label">ALGORITHM</span>
      <div className="engine-buttons">
        <button
          className={`engine-btn ${engine === "content" ? "active-content" : ""}`}
          onClick={() => setEngine("content")}
        >
          <span className="engine-icon">⬡</span> TF-IDF
        </button>
        <div className="engine-divider" />
        <button
          className={`engine-btn ${engine === "graph" ? "active-graph" : ""}`}
          onClick={() => setEngine("graph")}
        >
          <span className="engine-icon">◈</span> LightGCN
        </button>
      </div>
    </div>
  );
}

function LoadingGrid() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="skeleton-card"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="skeleton-poster" />
          <div className="skeleton-line long" />
          <div className="skeleton-line short" />
        </div>
      ))}
    </>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [engine, setEngine] = useState("graph");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const search = async (q = query, eng = engine) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setSubmitted(q.trim());

    try {
      const url = `${API_BASE}/${eng}/${encodeURIComponent(q.trim())}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Film not found — try another title.");
      const data = await res.json();
      setResults(data.results || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter") search();
  };

  const hasResults = results.length > 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:         #0f0f0f;
          --bg-card:    #1a1a1a;
          --bg-input:   #1e1e1e;
          --bg-lb:      #2c3440;
          --surface:    #242424;
          --border:     rgba(255,255,255,0.08);
          --red:        #e50914;
          --red-dim:    rgba(229,9,20,0.15);
          --green:      #00e054;
          --green-dim:  rgba(0,224,84,0.12);
          --text:       #e5e5e5;
          --text-muted: #808080;
          --text-dim:   #4a4a4a;
          --font-display: 'Bebas Neue', sans-serif;
          --font-body:    'Inter', system-ui, sans-serif;
          --radius:     6px;
          --radius-lg:  12px;
        }

        html, body, #root {
          height: 100%;
          background: var(--bg);
          color: var(--text);
          font-family: var(--font-body);
          -webkit-font-smoothing: antialiased;
        }

        /* ── Layout ── */
        .shell {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        /* ── Nav ── */
        .nav {
          position: sticky;
          top: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 32px;
          height: 56px;
          background: rgba(15,15,15,0.92);
          backdrop-filter: blur(16px);
          border-bottom: 1px solid var(--border);
        }
        .nav-logo {
          font-family: var(--font-display);
          font-size: 26px;
          letter-spacing: 2px;
          color: var(--text);
          display: flex;
          align-items: baseline;
          gap: 2px;
          user-select: none;
        }
        .nav-logo .accent { color: var(--red); }
        .nav-right {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .nav-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); }

        /* ── Hero ── */
        .hero {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 80px 24px 60px;
          text-align: center;
          overflow: hidden;
        }
        .hero-glow {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(ellipse 60% 40% at 50% -10%, rgba(229,9,20,0.12) 0%, transparent 70%),
            radial-gradient(ellipse 40% 30% at 80% 100%, rgba(0,224,84,0.06) 0%, transparent 60%);
        }
        .hero-eyebrow {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: var(--text-dim);
          margin-bottom: 20px;
        }
        .hero-title {
          font-family: var(--font-display);
          font-size: clamp(72px, 12vw, 140px);
          line-height: 0.9;
          letter-spacing: 4px;
          color: var(--text);
          margin-bottom: 16px;
        }
        .hero-title .iq { color: var(--red); }
        .hero-sub {
          font-size: 14px;
          font-weight: 400;
          color: var(--text-muted);
          max-width: 380px;
          line-height: 1.6;
          margin-bottom: 48px;
        }

        /* ── Search ── */
        .search-wrap {
          width: 100%;
          max-width: 580px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .search-row {
          display: flex;
          gap: 8px;
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 6px 6px 6px 20px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .search-row:focus-within {
          border-color: rgba(255,255,255,0.2);
          box-shadow: 0 0 0 3px rgba(229,9,20,0.1);
        }
        .search-input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          color: var(--text);
          font-family: var(--font-body);
          font-size: 15px;
          font-weight: 400;
          caret-color: var(--red);
        }
        .search-input::placeholder { color: var(--text-dim); }
        .search-btn {
          background: var(--red);
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 10px 24px;
          font-family: var(--font-body);
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.05em;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
          white-space: nowrap;
        }
        .search-btn:hover { background: #c8070f; }
        .search-btn:active { transform: scale(0.97); }
        .search-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ── Engine toggle ── */
        .engine-toggle {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .engine-label {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.2em;
          color: var(--text-dim);
        }
        .engine-buttons {
          display: flex;
          align-items: center;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 6px;
          overflow: hidden;
        }
        .engine-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          font-family: var(--font-body);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.08em;
          padding: 7px 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          transition: color 0.15s, background 0.15s;
        }
        .engine-btn:hover { color: var(--text); background: rgba(255,255,255,0.04); }
        .engine-btn.active-content { color: #fff; background: rgba(229,9,20,0.25); }
        .engine-btn.active-graph   { color: var(--green); background: var(--green-dim); }
        .engine-icon { font-size: 13px; }
        .engine-divider { width: 1px; height: 18px; background: var(--border); }

        /* ── Results section ── */
        .results-section {
          padding: 0 32px 80px;
          max-width: 1440px;
          margin: 0 auto;
          width: 100%;
        }
        .results-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 24px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--border);
        }
        .results-title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .results-title strong { color: var(--text); }
        .results-algo {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          padding: 3px 10px;
          border-radius: 20px;
        }
        .algo-content { color: var(--red); background: var(--red-dim); border: 1px solid rgba(229,9,20,0.2); }
        .algo-graph   { color: var(--green); background: var(--green-dim); border: 1px solid rgba(0,224,84,0.2); }

        /* ── Grid ── */
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 20px;
        }
        @media (min-width: 640px)  { .grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); } }
        @media (min-width: 1024px) { .grid { grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); } }

        /* ── Movie card ── */
        .movie-card {
          animation: fadeUp 0.4s ease both;
          cursor: pointer;
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .poster-wrap {
          position: relative;
          aspect-ratio: 2/3;
          border-radius: var(--radius);
          overflow: hidden;
          background: var(--bg-card);
          margin-bottom: 10px;
          /* Letterboxd signature: thin colored border on hover */
          outline: 2px solid transparent;
          outline-offset: 2px;
          transition: outline-color 0.2s;
        }
        .movie-card:hover .poster-wrap { outline-color: var(--green); }
        .poster-skeleton {
          position: absolute; inset: 0;
          background: linear-gradient(110deg, #1a1a1a 30%, #232323 50%, #1a1a1a 70%);
          background-size: 200% 100%;
          animation: shimmer 1.4s infinite;
        }
        @keyframes shimmer { to { background-position: -200% 0; } }
        .poster-img {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          object-fit: cover;
          transition: transform 0.35s ease, opacity 0.3s;
        }
        .movie-card:hover .poster-img { transform: scale(1.04); }

        /* Overlay */
        .poster-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 50%, transparent 100%);
          display: flex;
          align-items: flex-end;
          padding: 14px;
          opacity: 0;
          transition: opacity 0.25s;
        }
        .poster-overlay.active { opacity: 1; }
        .overlay-content {
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 100%;
        }
        .overlay-reason {
          font-size: 11px;
          color: rgba(255,255,255,0.7);
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .match-badge {
          display: inline-flex;
          align-self: flex-start;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: var(--green);
          background: var(--green-dim);
          border: 1px solid rgba(0,224,84,0.3);
          border-radius: 4px;
          padding: 2px 7px;
        }

        /* Rank */
        .rank-badge {
          position: absolute;
          top: 8px; left: 8px;
          font-family: var(--font-display);
          font-size: 14px;
          letter-spacing: 1px;
          color: rgba(255,255,255,0.5);
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(4px);
          border-radius: 4px;
          padding: 2px 6px;
          line-height: 1.2;
        }

        .card-meta { padding: 0 2px; }
        .card-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
          line-height: 1.3;
          margin-bottom: 5px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          transition: color 0.15s;
        }
        .movie-card:hover .card-title { color: var(--green); }

        /* ── Skeleton grid ── */
        .skeleton-card { animation: fadeUp 0.3s ease both; }
        .skeleton-poster {
          aspect-ratio: 2/3;
          border-radius: var(--radius);
          background: var(--bg-card);
          background: linear-gradient(110deg, #1a1a1a 30%, #222 50%, #1a1a1a 70%);
          background-size: 200% 100%;
          animation: shimmer 1.4s infinite;
          margin-bottom: 10px;
        }
        .skeleton-line {
          height: 10px;
          border-radius: 4px;
          background: #232323;
          margin-bottom: 6px;
        }
        .skeleton-line.long  { width: 85%; }
        .skeleton-line.short { width: 50%; }

        /* ── Error / empty ── */
        .state-center {
          grid-column: 1 / -1;
          text-align: center;
          padding: 60px 24px;
        }
        .state-icon {
          font-size: 40px;
          margin-bottom: 16px;
          opacity: 0.4;
        }
        .state-msg {
          font-size: 14px;
          color: var(--text-muted);
          max-width: 340px;
          margin: 0 auto;
          line-height: 1.6;
        }
        .state-msg.error { color: #e5737a; }

        /* ── Footer ── */
        .footer {
          margin-top: auto;
          border-top: 1px solid var(--border);
          padding: 20px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          color: var(--text-dim);
        }
        .footer-tag {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .footer-tag .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--red); }

        /* ── Divider strip ── */
        .film-strip {
          width: 100%;
          height: 4px;
          background: repeating-linear-gradient(
            90deg,
            var(--red) 0px, var(--red) 20px,
            transparent 20px, transparent 28px
          );
          opacity: 0.25;
          margin-bottom: 48px;
        }
      `}</style>

      <div className="shell">
        {/* Nav */}
        <nav className="nav">
          <div className="nav-logo">
            CINE<span className="accent">IQ</span>
          </div>
          <div className="nav-right">
            <div className="nav-dot" />
            Dual-Engine Rec System
          </div>
        </nav>

        {/* Hero */}
        <section className="hero">
          <div className="hero-glow" />
          <p className="hero-eyebrow">
            AI-Powered · Graph Neural Networks · TF-IDF
          </p>
          <h1 className="hero-title">
            CINE<span className="iq">IQ</span>
          </h1>
          <p className="hero-sub">
            Type a film you love. Get six curated recommendations from our
            neural network or content engine.
          </p>

          <div className="search-wrap">
            <div className="search-row">
              <input
                ref={inputRef}
                className="search-input"
                type="text"
                placeholder="e.g. Inception, Parasite, The Godfather…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKey}
              />
              <button
                className="search-btn"
                onClick={() => search()}
                disabled={loading || !query.trim()}
              >
                {loading ? "Finding…" : "Find Films"}
              </button>
            </div>
            <EngineToggle engine={engine} setEngine={setEngine} />
          </div>
        </section>

        {/* Film-strip accent */}
        <div className="film-strip" />

        {/* Results */}
        {(loading || hasResults || error) && (
          <section className="results-section">
            <div className="results-header">
              <p className="results-title">
                {loading ? (
                  "Searching…"
                ) : error ? (
                  "No results"
                ) : (
                  <>
                    Because you liked <strong>"{submitted}"</strong>
                  </>
                )}
              </p>
              <span
                className={`results-algo ${engine === "content" ? "algo-content" : "algo-graph"}`}
              >
                {engine === "content" ? "TF-IDF Content" : "LightGCN Graph"}
              </span>
            </div>

            <div className="grid">
              {loading && <LoadingGrid />}

              {error && !loading && (
                <div className="state-center">
                  <div className="state-icon">🎬</div>
                  <p className="state-msg error">{error}</p>
                </div>
              )}

              {!loading &&
                !error &&
                hasResults &&
                results.map((movie, i) => (
                  <MovieCard key={movie.id ?? i} movie={movie} index={i} />
                ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="footer">
          <div className="footer-tag">
            <div className="dot" />
            CineIQ — Dual-Engine Movie Recommender
          </div>
          <span>LightGCN · TF-IDF · TMDB</span>
        </footer>
      </div>
    </>
  );
}
