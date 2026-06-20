import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.DEV
  ? "http://127.0.0.1:8000/api"
  : "https://cineiq-backend.onrender.com/api";

const TMDB_KEY = "3b68e72146bbd3b09e250fc63288613d";
// ─── Design tokens (inline – no build-step dependency) ────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body,#root{
  height:100%;
  background:var(--bg);
  color:var(--text);
  font-family:'Inter',system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;
  transition:background .2s,color .2s;
}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:var(--scrollbar-track)}
::-webkit-scrollbar-thumb{background:var(--scrollbar-thumb);border-radius:4px}
::selection{background:rgba(229,9,20,.3);color:#fff}

:root,[data-theme="dark"]{
  --bg:#0f0f0f;--bg-card:#1a1a1a;--bg-input:#1e1e1e;--surface:#242424;
  --nav-bg:rgba(15,15,15,.92);
  --border:rgba(255,255,255,.08);--border-hover:rgba(255,255,255,.16);
  --red:#e50914;--red-dim:rgba(229,9,20,.14);--red-border:rgba(229,9,20,.25);
  --green:#00e054;--green-dim:rgba(0,224,84,.12);--green-border:rgba(0,224,84,.25);
  --purple:#a855f7;--purple-dim:rgba(168,85,247,.12);--purple-border:rgba(168,85,247,.25);
  --text:#e5e5e5;--text-muted:#808080;--text-dim:#3a3a3a;
  --scrollbar-track:#0f0f0f;--scrollbar-thumb:#2a2a2a;
  --ac-bg:#1c1c1c;
  --shimmer-1:#1a1a1a;--shimmer-2:#222;--skel-line:#1f1f1f;
  --err:#e5737a;
  --eng-active-text:#fff;
  --font-d:'Bebas Neue',sans-serif;--r:6px;--rl:12px;
}

[data-theme="light"]{
  --bg:#fafafa;--bg-card:#ffffff;--bg-input:#f0f0f0;--surface:#eeeeee;
  --nav-bg:rgba(250,250,250,.85);
  --border:rgba(0,0,0,.10);--border-hover:rgba(0,0,0,.20);
  --red:#e50914;--red-dim:rgba(229,9,20,.10);--red-border:rgba(229,9,20,.30);
  --green:#0a8f3c;--green-dim:rgba(10,143,60,.10);--green-border:rgba(10,143,60,.30);
  --purple:#9333ea;--purple-dim:rgba(147,51,234,.10);--purple-border:rgba(147,51,234,.30);
  --text:#1a1a1a;--text-muted:#5a5a5a;--text-dim:#999999;
  --scrollbar-track:#fafafa;--scrollbar-thumb:#cccccc;
  --ac-bg:#ffffff;
  --shimmer-1:#ececec;--shimmer-2:#e0e0e0;--skel-line:#e5e5e5;
  --err:#c0293a;
  --eng-active-text:#7a0309;
}

/* ── Nav ─────────────────────────────────────────────────────── */
.nav{position:sticky;top:0;z-index:200;display:flex;align-items:center;justify-content:space-between;
  padding:0 32px;height:56px;background:var(--nav-bg);backdrop-filter:blur(20px);
  border-bottom:1px solid var(--border);gap:8px}
.nav-logo{font-family:var(--font-d);font-size:26px;letter-spacing:2px;user-select:none}
.nav-logo .r{color:var(--red)}
.nav-pill{font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;
  color:var(--text-muted);display:flex;align-items:center;gap:6px}
.nav-dot{width:6px;height:6px;border-radius:50%;background:var(--green)}

.theme-toggle{display:flex;align-items:center;background:var(--surface);
  border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin-left:12px}
.theme-btn{background:none;border:none;color:var(--text-muted);font-size:13px;
  padding:5px 9px;cursor:pointer;line-height:1;transition:color .15s,background .15s}
.theme-btn:hover{color:var(--text);background:rgba(128,128,128,.1)}
.theme-btn.on{color:var(--red);background:var(--red-dim)}

@media(max-width:480px){
  .nav{padding:0 16px}
  .nav-pill{display:none}
}

/* ── Hero ────────────────────────────────────────────────────── */
.hero{position:relative;display:flex;flex-direction:column;align-items:center;
  padding:56px 24px 48px;text-align:center;overflow:hidden}
.hero-glow{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(ellipse 60% 40% at 50% -10%,rgba(229,9,20,.11) 0%,transparent 70%),
             radial-gradient(ellipse 35% 25% at 80% 100%,rgba(0,224,84,.07) 0%,transparent 65%)}
.hero-h1{font-family:var(--font-d);font-size:clamp(60px,10vw,116px);line-height:.9;letter-spacing:4px;margin-bottom:12px}
.hero-h1 .iq{color:var(--red)}
.hero-sub{font-size:14px;color:var(--text-muted);max-width:400px;line-height:1.65;margin-bottom:36px}

/* ── Search ──────────────────────────────────────────────────── */
.search-wrap{width:100%;max-width:600px;display:flex;flex-direction:column;gap:10px;position:relative;z-index:110}
.search-row{display:flex;gap:8px;background:var(--bg-input);border:1px solid var(--border);
  border-radius:var(--rl);padding:6px 6px 6px 18px;transition:border-color .2s,box-shadow .2s}
.search-row:focus-within{border-color:var(--border-hover);box-shadow:0 0 0 3px var(--red-dim)}
.search-input{flex:1;background:none;border:none;outline:none;color:var(--text);
  font-family:'Inter',system-ui;font-size:15px;caret-color:var(--red)}
.search-input::placeholder{color:var(--text-dim)}
.search-btn{background:var(--red);color:#fff;border:none;border-radius:8px;padding:10px 22px;
  font-size:13px;font-weight:700;letter-spacing:.04em;cursor:pointer;
  transition:background .15s,transform .1s;white-space:nowrap}
.search-btn:hover{background:#c8070f}
.search-btn:active{transform:scale(.97)}
.search-btn:disabled{opacity:.45;cursor:not-allowed}

/* ── Autocomplete dropdown ───────────────────────────────────── */
.ac-list{position:absolute;top:calc(100% + 4px);left:0;right:0;
  background:var(--ac-bg);border:1px solid var(--border);border-radius:var(--r);
  max-height:300px;overflow-y:auto;z-index:300;box-shadow:0 12px 40px rgba(0,0,0,.6)}
.ac-item{padding:10px 16px;font-size:13px;color:var(--text-muted);cursor:pointer;
  border-bottom:1px solid var(--border);transition:background .1s,color .1s}
.ac-item:last-child{border-bottom:none}
.ac-item:hover,.ac-item.active{background:rgba(229,9,20,.1);color:var(--text)}

/* ── Engine toggle ───────────────────────────────────────────── */
.engine-row{display:flex;align-items:center;gap:10px}
.engine-label{font-size:9px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--text-dim)}
.engine-btns{display:flex;align-items:center;background:var(--surface);
  border:1px solid var(--border);border-radius:var(--r);overflow:hidden}
.eng{background:none;border:none;color:var(--text-muted);font-size:11px;font-weight:700;
  letter-spacing:.08em;padding:7px 14px;cursor:pointer;display:flex;align-items:center;gap:5px;
  transition:color .15s,background .15s}
.eng:hover{color:var(--text);background:rgba(255,255,255,.04)}
.eng.ac{color:var(--eng-active-text);background:rgba(229,9,20,.22)}
.eng.ag{color:var(--green);background:var(--green-dim)}
.eng.ah{color:var(--purple);background:var(--purple-dim)}
.eng-div{width:1px;height:18px;background:var(--border)}

/* ── Alpha slider (hybrid only) ─────────────────────────────── */
.alpha-row{display:flex;align-items:center;gap:10px;font-size:11px;color:var(--text-muted)}
.alpha-row input[type=range]{flex:1;accent-color:var(--purple)}
.alpha-val{font-family:monospace;font-size:11px;color:var(--purple);min-width:32px;text-align:right}

/* ── Genre filter pills ─────────────────────────────────────── */
.genre-rail{display:flex;gap:8px;overflow-x:auto;padding:4px 32px 16px;max-width:1440px;
  margin:0 auto;width:100%;scrollbar-width:none}
.genre-rail::-webkit-scrollbar{display:none}
.genre-pill{flex-shrink:0;background:var(--surface);border:1px solid var(--border);
  color:var(--text-muted);font-size:12px;font-weight:600;padding:6px 16px;
  border-radius:20px;cursor:pointer;white-space:nowrap;transition:all .15s}
.genre-pill:hover{color:var(--text);border-color:var(--border-hover)}
.genre-pill.on{background:var(--red-dim);border-color:var(--red-border);color:var(--red)}

/* ── Film strip ──────────────────────────────────────────────── */
.strip{width:100%;height:4px;background:repeating-linear-gradient(
  90deg,var(--red) 0,var(--red) 20px,transparent 20px,transparent 28px);opacity:.2;margin-bottom:32px}

/* ── Results section ─────────────────────────────────────────── */
.results{padding:0 32px 80px;max-width:1440px;margin:0 auto;width:100%}
.res-header{display:flex;align-items:baseline;justify-content:space-between;
  margin-bottom:22px;padding-bottom:12px;border-bottom:1px solid var(--border)}
.res-label{font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--text-muted)}
.res-label strong{color:var(--text)}
.res-badge{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
  padding:3px 10px;border-radius:20px}
.badge-c{color:var(--red);background:var(--red-dim);border:1px solid var(--red-border)}
.badge-g{color:var(--green);background:var(--green-dim);border:1px solid var(--green-border)}
.badge-h{color:var(--purple);background:var(--purple-dim);border:1px solid var(--purple-border)}
.badge-d{color:var(--text-muted);background:var(--surface);border:1px solid var(--border)}

/* ── Mode toggle (grid / compare) ──────────────────────────────── */
.mode-toggle{display:flex;gap:4px;margin-bottom:20px}
.mode-btn{background:none;border:1px solid var(--border);color:var(--text-muted);
  font-size:11px;font-weight:600;padding:5px 14px;border-radius:20px;cursor:pointer;
  transition:all .15s}
.mode-btn.on{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.2);color:var(--text)}

/* ── Card grid ───────────────────────────────────────────────── */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:20px}
@media(min-width:640px){.grid{grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}}
@media(min-width:1024px){.grid{grid-template-columns:repeat(auto-fill,minmax(210px,1fr))}}

/* ── Movie card ──────────────────────────────────────────────── */
.card{animation:fadeUp .38s ease both;cursor:default}
@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
.poster{position:relative;aspect-ratio:2/3;border-radius:var(--r);overflow:hidden;
  background:var(--bg-card);margin-bottom:9px;
  outline:2px solid transparent;outline-offset:2px;transition:outline-color .2s}
.card:hover .poster{outline-color:var(--green)}
.skel-bg{position:absolute;inset:0;
  background:linear-gradient(110deg,var(--shimmer-1) 30%,var(--shimmer-2) 50%,var(--shimmer-1) 70%);
  background-size:200% 100%;animation:shimmer 1.4s infinite}
@keyframes shimmer{to{background-position:-200% 0}}
.poster img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
  transition:transform .3s,opacity .3s}
.card:hover .poster img{transform:scale(1.04)}
.overlay{position:absolute;inset:0;
  background:linear-gradient(to top,rgba(0,0,0,.94) 0%,rgba(0,0,0,.55) 45%,rgba(0,0,0,.1) 80%,transparent 100%);
  display:flex;align-items:flex-end;padding:12px;opacity:0;transition:opacity .22s}
.card:hover .overlay{opacity:1}
.ov-inner{display:flex;flex-direction:column;gap:6px;width:100%}
.ov-reason{font-size:11px;color:rgba(255,255,255,.75);line-height:1.4;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ov-meta{display:flex;flex-direction:column;gap:3px;margin-bottom:2px}
.ov-director{font-size:10px;color:rgba(255,255,255,.55);text-transform:uppercase;letter-spacing:.05em}
.ov-cast{font-size:10.5px;color:rgba(255,255,255,.85);font-weight:600;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.match-pill{display:inline-flex;align-self:flex-start;font-size:10px;font-weight:700;
  color:var(--green);background:var(--green-dim);border:1px solid var(--green-border);
  border-radius:4px;padding:2px 7px}
.rank{position:absolute;top:7px;left:7px;font-family:var(--font-d);font-size:13px;
  letter-spacing:1px;color:rgba(255,255,255,.45);background:rgba(0,0,0,.7);
  backdrop-filter:blur(4px);border-radius:4px;padding:2px 6px;line-height:1.2}
.card-title{font-size:13px;font-weight:600;line-height:1.3;margin-bottom:3px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
  transition:color .15s}
.card:hover .card-title{color:var(--green)}
.card-genres{display:flex;gap:4px;flex-wrap:wrap;margin:4px 0}
.genre-tag{font-size:9px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;
  color:var(--text-muted);background:var(--surface);border:1px solid var(--border);
  border-radius:3px;padding:1px 5px}
.card-reason{font-size:10px;color:var(--text-muted);line-height:1.3;margin-top:2px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* ── Stars ───────────────────────────────────────────────────── */
.stars{display:flex;align-items:center;gap:2px}

/* ── Compare mode ────────────────────────────────────────────── */
.compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
@media(max-width:640px){.compare-grid{grid-template-columns:1fr}}
.compare-col{}
.compare-col-header{display:flex;align-items:center;gap:8px;margin-bottom:14px;
  padding-bottom:10px;border-bottom:1px solid var(--border)}
.compare-col-title{font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase}
.compare-col-title.ct{color:var(--red)}
.compare-col-title.cg{color:var(--green)}
.cmp-card{display:flex;gap:10px;padding:10px;border-radius:var(--r);
  background:var(--bg-card);border:1px solid var(--border);margin-bottom:8px;
  animation:fadeUp .35s ease both;transition:border-color .15s}
.cmp-card:hover{border-color:var(--border-hover)}
.cmp-poster{width:44px;height:66px;border-radius:4px;object-fit:cover;flex-shrink:0;background:var(--surface)}
.cmp-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;justify-content:center}
.cmp-title{font-size:12px;font-weight:600;line-height:1.3;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmp-director{font-size:9.5px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.04em}
.cmp-reason{font-size:10px;color:var(--text-muted);line-height:1.4;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cmp-score-row{display:flex;align-items:center;gap:6px}
.cmp-score{font-size:10px;font-weight:700;font-family:monospace}
.cmp-score.sc{color:var(--red)}
.cmp-score.sg{color:var(--green)}
.cmp-badge{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;
  padding:1px 5px;border-radius:3px}
.cmp-badge.bc{color:var(--red);background:var(--red-dim)}
.cmp-badge.bg{color:var(--green);background:var(--green-dim)}

/* ── Skeleton / states ───────────────────────────────────────── */
.skel-card{animation:fadeUp .3s ease both}
.skel-poster{aspect-ratio:2/3;border-radius:var(--r);
  background:linear-gradient(110deg,var(--shimmer-1) 30%,var(--shimmer-2) 50%,var(--shimmer-1) 70%);
  background-size:200% 100%;animation:shimmer 1.4s infinite;margin-bottom:9px}
.skel-line{height:10px;border-radius:4px;background:var(--skel-line);margin-bottom:5px}
.skel-line.l{width:85%}.skel-line.s{width:50%}
.empty{grid-column:1/-1;text-align:center;padding:56px 24px}
.empty-icon{font-size:38px;opacity:.3;margin-bottom:14px}
.empty-msg{font-size:14px;color:var(--text-muted);max-width:340px;margin:0 auto;line-height:1.6}
.err{color:var(--err)}

/* ── Footer ──────────────────────────────────────────────────── */
.footer{margin-top:auto;border-top:1px solid var(--border);padding:18px 32px;
  display:flex;align-items:center;justify-content:space-between;
  font-size:11px;color:var(--text-dim)}
.footer-tag{display:flex;align-items:center;gap:6px}
.footer-dot{width:5px;height:5px;border-radius:50%;background:var(--red)}
`;

// ─── Star rating ──────────────────────────────────────────────────────────────
function Stars({ score }) {
  const stars = Math.round((score / 100) * 5 * 2) / 2;
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map((s) => {
        const fill = stars >= s ? 1 : stars >= s - 0.5 ? 0.5 : 0;
        const id = `g-${s}-${score}`;
        return (
          <svg key={s} width="11" height="11" viewBox="0 0 12 12">
            <defs>
              <linearGradient id={id}>
                <stop offset={`${fill * 100}%`} stopColor="#00e054" />
                <stop offset={`${fill * 100}%`} stopColor="#2a3440" />
              </linearGradient>
            </defs>
            <polygon
              points="6,1 7.5,4.5 11,5 8.5,7.5 9,11 6,9.5 3,11 3.5,7.5 1,5 4.5,4.5"
              fill={`url(#${id})`}
            />
          </svg>
        );
      })}
    </div>
  );
}

// ─── Movie card (grid / discover mode) ───────────────────────────────────────
function MovieCard({ movie, index }) {
  const [loaded, setLoaded] = useState(false);
  const hasScore = typeof movie.score === "number";
  const genres = Array.isArray(movie.genres) ? movie.genres : [];
  const cast = Array.isArray(movie.cast) ? movie.cast : [];

  return (
    <div className="card" style={{ animationDelay: `${index * 55}ms` }}>
      <div className="poster">
        {!loaded && <div className="skel-bg" />}
        <img
          src={movie.poster}
          alt={movie.title}
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoaded(true)}
          loading="lazy"
        />
        <div className="overlay">
          <div className="ov-inner">
            {hasScore && <Stars score={movie.score} />}
            <div className="ov-meta">
              {movie.director && (
                <span className="ov-director">{movie.director}</span>
              )}
              {cast.length > 0 && (
                <span className="ov-cast">{cast.join(", ")}</span>
              )}
            </div>
            {movie.reason && <p className="ov-reason">{movie.reason}</p>}
            {hasScore && (
              <span className="match-pill">{movie.score}% match</span>
            )}
          </div>
        </div>
        <div className="rank">#{index + 1}</div>
      </div>
      <div className="card-title">{movie.title}</div>
      {genres.length > 0 && (
        <div className="card-genres">
          {genres.slice(0, 3).map((g) => (
            <span key={g} className="genre-tag">
              {g}
            </span>
          ))}
        </div>
      )}
      {hasScore && <Stars score={movie.score} />}
      {movie.reason && <p className="card-reason">{movie.reason}</p>}
    </div>
  );
}

// ─── Compare card (side-by-side mode) ────────────────────────────────────────
function CompareCard({ movie, engine, index }) {
  const [loaded, setLoaded] = useState(false);
  const isContent = engine === "content";
  return (
    <div className="cmp-card" style={{ animationDelay: `${index * 50}ms` }}>
      <img
        className="cmp-poster"
        src={movie.poster}
        alt={movie.title}
        style={{ opacity: loaded ? 1 : 0 }}
        onLoad={() => setLoaded(true)}
        loading="lazy"
      />
      <div className="cmp-body">
        <div className="cmp-title">{movie.title}</div>
        {movie.director && <div className="cmp-director">{movie.director}</div>}
        <div className="cmp-reason">{movie.reason}</div>
        <div className="cmp-score-row">
          <span className={`cmp-score ${isContent ? "sc" : "sg"}`}>
            {movie.score}%
          </span>
          <span className={`cmp-badge ${isContent ? "bc" : "bg"}`}>
            {isContent ? "TF-IDF" : "GNN"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton loaders ─────────────────────────────────────────────────────────
function SkeletonGrid({ n = 6 }) {
  return Array.from({ length: n }).map((_, i) => (
    <div
      key={i}
      className="skel-card"
      style={{ animationDelay: `${i * 70}ms` }}
    >
      <div className="skel-poster" />
      <div className="skel-line l" />
      <div className="skel-line s" />
    </div>
  ));
}

// ─── Engine toggle ────────────────────────────────────────────────────────────
function EngineToggle({ engine, setEngine, disabled }) {
  const btns = [
    { id: "content", label: "TF-IDF", cls: "ac", icon: "⬡" },
    { id: "graph", label: "LightGCN", cls: "ag", icon: "◈" },
    { id: "hybrid", label: "Hybrid", cls: "ah", icon: "⚡" },
  ];
  return (
    <div
      className="engine-row"
      style={{
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <span className="engine-label">ENGINE</span>
      <div className="engine-btns">
        {btns.map((b, i) => (
          <React.Fragment key={b.id}>
            {i > 0 && <div className="eng-div" />}
            <button
              className={`eng ${engine === b.id ? b.cls : ""}`}
              onClick={() => setEngine(b.id)}
            >
              <span>{b.icon}</span> {b.label}
            </button>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ─── Alpha slider (hybrid) ────────────────────────────────────────────────────
function AlphaSlider({ alpha, setAlpha, disabled }) {
  return (
    <div
      className="alpha-row"
      style={{
        opacity: disabled ? 0.4 : 1,
        pointerEvents: disabled ? "none" : "auto",
      }}
    >
      <span>TF-IDF</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={alpha}
        onChange={(e) => setAlpha(parseFloat(e.target.value))}
        style={{ flex: 1 }}
      />
      <span>LightGCN</span>
      <span className="alpha-val">α={alpha.toFixed(2)}</span>
    </div>
  );
}

// ─── TMDB Autocomplete (Rich Display) ─────────────────────────────────────────
function Autocomplete({ query, suggestions, onSelect }) {
  const [activeIdx, setActiveIdx] = useState(-1);

  if (!suggestions || !suggestions.length) return null;

  return (
    <div className="ac-list">
      {suggestions.map((m, i) => (
        <div
          key={m.id}
          className={`ac-item ${i === activeIdx ? "active" : ""}`}
          onMouseEnter={() => setActiveIdx(i)}
          onMouseLeave={() => setActiveIdx(-1)}
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent input blur from hiding this before click fires
            onSelect(m);
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {m.poster_path ? (
              <img
                src={`https://image.tmdb.org/t/p/w92${m.poster_path}`}
                alt={m.title}
                style={{
                  width: "30px",
                  height: "45px",
                  objectFit: "cover",
                  borderRadius: "3px",
                }}
              />
            ) : (
              <div
                style={{
                  width: "30px",
                  height: "45px",
                  background: "var(--surface)",
                  borderRadius: "3px",
                }}
              />
            )}
            <div>
              <div style={{ fontWeight: 600, color: "var(--text)" }}>
                {m.title}
              </div>
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--text-muted)",
                  marginTop: "2px",
                }}
              >
                {m.release_date
                  ? m.release_date.substring(0, 4)
                  : "Unknown Year"}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Genre filter rail ────────────────────────────────────────────────────────
function GenreRail({ genres, active, onSelect }) {
  if (!genres.length) return null;
  return (
    <div className="genre-rail">
      <button
        className={`genre-pill ${active === null ? "on" : ""}`}
        onClick={() => onSelect(null)}
      >
        All
      </button>
      {genres.map((g) => (
        <button
          key={g}
          className={`genre-pill ${active === g ? "on" : ""}`}
          onClick={() => onSelect(g)}
        >
          {g}
        </button>
      ))}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [serverAwake, setServerAwake] = useState(false);
  const [bootMessage, setBootMessage] = useState("Connecting to servers...");
  const [query, setQuery] = useState("");
  const [engine, setEngine] = useState("graph");
  const [alpha, setAlpha] = useState(0.5);

  // Local Database Intersection State
  const [localTitlesSet, setLocalTitlesSet] = useState(new Set());

  // TMDB Live Search State
  const [tmdbSuggestions, setTmdbSuggestions] = useState([]);
  const queryRef = useRef(""); // For race condition guard

  // Out of Network UI State (Scenario B)
  const [outOfNetworkMovie, setOutOfNetworkMovie] = useState(null);

  const [results, setResults] = useState([]);
  const [cResults, setCResults] = useState([]);
  const [gResults, setGResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState("");
  const [showAC, setShowAC] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [theme, setTheme] = useState(
    () => localStorage.getItem("cineiq-theme") || "system",
  );

  const [discoverResults, setDiscoverResults] = useState([]);
  const [discoverLoading, setDiscoverLoading] = useState(true);
  const [discoverError, setDiscoverError] = useState(null);
  const [genreList, setGenreList] = useState([]);
  const [activeGenre, setActiveGenre] = useState(null);

  const inputRef = useRef(null);

  // ── WAKE UP THE BACKEND & FETCH LOCAL TITLES (Intersection Check) ─────────────
  useEffect(() => {
    let isMounted = true;

    const initSequence = async () => {
      const slowTimer = setTimeout(() => {
        if (isMounted)
          setBootMessage(
            "Waking up the free-tier AI engines (this usually takes 30-50 seconds)...",
          );
      }, 3000);

      try {
        // Ping Health
        await fetch(`${API_BASE}/health`);
        clearTimeout(slowTimer);
        if (isMounted) setServerAwake(true);

        // Load Local Titles into a Set for fast case-insensitive lookups
        const titleRes = await fetch(`${API_BASE}/titles`);
        if (titleRes.ok) {
          const titleData = await titleRes.json();
          if (isMounted && titleData.titles) {
            setLocalTitlesSet(
              new Set(titleData.titles.map((t) => t.trim().toLowerCase())),
            );
          }
        }

        // Load Genres
        const genreRes = await fetch(`${API_BASE}/genres`);
        if (genreRes.ok) {
          const genreData = await genreRes.json();
          if (isMounted && genreData.genres) setGenreList(genreData.genres);
        }
      } catch (err) {
        clearTimeout(slowTimer);
        if (isMounted)
          setBootMessage(
            "Could not connect to the backend. Please refresh the page.",
          );
      }
    };

    initSequence();
    inputRef.current?.focus();
    return () => {
      isMounted = false;
    };
  }, []);

  // ── TMDB DEBOUNCED LIVE SEARCH ───────────────────────────────────────────────
  useEffect(() => {
    console.log("1. Typing detected! Raw query:", query);
    queryRef.current = query;
    const currentQuery = query.trim();

    if (currentQuery.length < 2 || !TMDB_KEY) {
      console.log(
        "2. Search aborted. Too short or missing Key. Key exists?",
        !!TMDB_KEY,
      );
      setTmdbSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        console.log("3. Firing network fetch to TMDB for:", currentQuery);
        const res = await fetch(
          `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(currentQuery)}`,
        );
        console.log("4. TMDB Responded with status:", res.status);
        if (!res.ok) return;
        const data = await res.json();
        console.log("5. Data received. Results count:", data.results?.length);

        if (queryRef.current === currentQuery) {
          setTmdbSuggestions((data.results || []).slice(0, 8));
          console.log("6. SUCCESS: Dropdown state updated!");
        } else {
          console.log("6. FAILED: Race condition guard blocked the update.");
        }
      } catch (e) {
        console.error("TMDB fetch crashed:", e);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [query]);

  // ── Fetch discover grid on load and whenever the genre filter changes ───────
  const fetchDiscover = useCallback(async (genre) => {
    setDiscoverLoading(true);
    setDiscoverError(null);
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (genre) params.set("genre", genre);
      const res = await fetch(`${API_BASE}/discover?${params.toString()}`);
      if (!res.ok) throw new Error("discover_failed");
      const data = await res.json();
      setDiscoverResults(data.results || []);
    } catch {
      setDiscoverError("Couldn't load discovery picks right now.");
    } finally {
      setDiscoverLoading(false);
    }
  }, []);

  useEffect(() => {
    if (serverAwake) fetchDiscover(activeGenre);
  }, [activeGenre, serverAwake, fetchDiscover]);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const resolved =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
      root.setAttribute("data-theme", resolved);
    };

    applyTheme();

    if (theme === "system") {
      media.addEventListener("change", applyTheme);
      return () => media.removeEventListener("change", applyTheme);
    }
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("cineiq-theme", theme);
  }, [theme]);

  // Standard search trigger (Backend call)
  const search = useCallback(
    async (q = query, eng = engine) => {
      const trimmed = q.trim();
      if (!trimmed) return;

      setOutOfNetworkMovie(null); // Clear illusion state
      setLoading(true);
      setError(null);
      setResults([]);
      setCResults([]);
      setGResults([]);
      setSubmitted(trimmed);
      setShowAC(false);

      try {
        if (eng === "compare") {
          const [cr, gr] = await Promise.all([
            fetch(
              `${API_BASE}/recommend/content/${encodeURIComponent(trimmed)}?top_k=6`,
            ),
            fetch(
              `${API_BASE}/recommend/graph/${encodeURIComponent(trimmed)}?top_k=6`,
            ),
          ]);

          const [cd, gd] = await Promise.all([
            cr.ok ? cr.json() : { results: [] },
            gr.ok ? gr.json() : { results: [] },
          ]);

          if (!cr.ok && !gr.ok) {
            const status = cr.status || gr.status;
            if (status === 404)
              throw {
                type: "not_found",
                message: `"${trimmed}" wasn't found in either engine.`,
              };
            throw { type: "backend", message: "Service error." };
          }

          setCResults(cd.results || []);
          setGResults(gd.results || []);
          setViewMode("compare");
        } else {
          const suffix =
            eng === "hybrid"
              ? `hybrid/${encodeURIComponent(trimmed)}?top_k=6&alpha=${alpha}`
              : `${eng}/${encodeURIComponent(trimmed)}?top_k=6`;

          const res = await fetch(`${API_BASE}/recommend/${suffix}`);

          if (!res.ok) {
            if (res.status === 404)
              throw {
                type: "not_found",
                message: `"${trimmed}" wasn't found in our database.`,
              };
            throw { type: "backend", message: "Service error." };
          }

          const data = await res.json();
          setResults(data.results || []);
          setViewMode("grid");
        }
      } catch (e) {
        if (e instanceof TypeError) {
          setError({ type: "network", message: "Can't reach the server." });
        } else if (e && e.type) {
          setError(e);
        } else {
          setError({ type: "backend", message: "Something went wrong." });
        }
      } finally {
        setLoading(false);
      }
    },
    [query, engine, alpha],
  );

  const handleKey = (e) => {
    if (e.key === "Enter") {
      if (showAC && tmdbSuggestions.length > 0) {
        selectTmdbMovie(tmdbSuggestions[0]);
      } else {
        search();
      }
    }
    if (e.key === "Escape") setShowAC(false);
  };

  // ── THE INTERSECTION LOGIC (Scenario A vs B) ────────────────────────────────
  const selectTmdbMovie = (tmdbObj) => {
    setQuery(tmdbObj.title);
    setShowAC(false);

    // Exact case-insensitive match check against local Database
    const isLocal = localTitlesSet.has(tmdbObj.title.trim().toLowerCase());

    if (isLocal) {
      // Scenario A: It's in our DB. Run normal ML pipeline.
      setOutOfNetworkMovie(null);
      search(tmdbObj.title, engine);
    } else {
      // Scenario B: "The Illusion". Intercept before hitting backend.
      setResults([]);
      setCResults([]);
      setGResults([]);
      setError(null);
      setSubmitted(tmdbObj.title);

      setOutOfNetworkMovie({
        title: tmdbObj.title,
        overview: tmdbObj.overview,
        release_date: tmdbObj.release_date,
        poster: tmdbObj.poster_path
          ? `https://image.tmdb.org/t/p/w500${tmdbObj.poster_path}`
          : null,
      });
    }
  };

  const backToDiscover = () => {
    setResults([]);
    setCResults([]);
    setGResults([]);
    setError(null);
    setSubmitted("");
    setQuery("");
    setOutOfNetworkMovie(null);
  };

  const hasSearchResults =
    results.length > 0 || cResults.length > 0 || gResults.length > 0;
  const showSearchSection =
    loading || hasSearchResults || error || outOfNetworkMovie;

  const badgeCls =
    { content: "badge-c", graph: "badge-g", hybrid: "badge-h" }[engine] ||
    "badge-c";
  const badgeLabel = {
    content: "TF-IDF Content",
    graph: "LightGCN Graph",
    hybrid: `Hybrid α=${alpha.toFixed(2)}`,
  }[engine];

  // ── BOOTLOADER UI ─────────────────────────────────────────────────────────────
  if (!serverAwake) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f0f0f",
          color: "#e5e5e5",
          fontFamily: "Inter, sans-serif",
        }}
      >
        <h1
          style={{
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: "48px",
            letterSpacing: "2px",
            margin: "0 0 16px 0",
          }}
        >
          CINE<span style={{ color: "#e50914" }}>IQ</span>
        </h1>
        <div
          style={{
            width: "40px",
            height: "40px",
            border: "3px solid rgba(255,255,255,0.1)",
            borderTopColor: "#e50914",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            marginBottom: "24px",
          }}
        />
        <p
          style={{
            fontSize: "14px",
            color: "#808080",
            maxWidth: "300px",
            textAlign: "center",
            lineHeight: "1.5",
            margin: 0,
          }}
        >
          {bootMessage}
        </p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <>
      <style>{CSS}</style>
      <div
        style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
      >
        {/* Nav */}
        <nav className="nav">
          <div className="nav-logo">
            CINE<span className="r">IQ</span>
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div className="nav-pill">
              <div className="nav-dot" />
              Dual-Engine Rec System
            </div>
            <div className="theme-toggle">
              <button
                className={`theme-btn ${theme === "light" ? "on" : ""}`}
                onClick={() => setTheme("light")}
                title="Light"
              >
                ☀
              </button>
              <button
                className={`theme-btn ${theme === "dark" ? "on" : ""}`}
                onClick={() => setTheme("dark")}
                title="Dark"
              >
                ☾
              </button>
              <button
                className={`theme-btn ${theme === "system" ? "on" : ""}`}
                onClick={() => setTheme("system")}
                title="System"
              >
                ⚙
              </button>
            </div>
          </div>
        </nav>

        {/* Hero */}
        <section className="hero">
          <div className="hero-glow" />
          <h1
            className="hero-h1"
            style={{ cursor: "pointer" }}
            onClick={backToDiscover}
          >
            CINE<span className="iq">IQ</span>
          </h1>
          <p className="hero-sub">
            Search millions of titles. Switch between semantic content AI, graph
            neural networks, or blended hybrid signals.
          </p>

          <div className="search-wrap">
            <div className="search-row">
              <input
                ref={inputRef}
                className="search-input"
                type="text"
                placeholder="e.g. Inception, Parasite, The Godfather…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowAC(true);
                }}
                onKeyDown={handleKey}
                onFocus={() => setShowAC(true)}
                onBlur={() => setTimeout(() => setShowAC(false), 200)} // slight delay to allow click
                autoComplete="off"
              />
              <button
                className="search-btn"
                onClick={() => search()}
                disabled={loading || !query.trim()}
              >
                {loading ? "Analyzing…" : "Analyze"}
              </button>
            </div>

            {showAC && tmdbSuggestions.length > 0 && (
              <Autocomplete
                query={query}
                suggestions={tmdbSuggestions}
                onSelect={selectTmdbMovie}
              />
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <EngineToggle
                  engine={engine}
                  setEngine={setEngine}
                  disabled={!!outOfNetworkMovie}
                />
              </div>
              {engine === "hybrid" && (
                <AlphaSlider
                  alpha={alpha}
                  setAlpha={setAlpha}
                  disabled={!!outOfNetworkMovie}
                />
              )}
            </div>
          </div>
        </section>

        <div className="strip" />

        {/* ── Discovery grid (Shown when no search is active) ──── */}
        {!showSearchSection && (
          <>
            <GenreRail
              genres={genreList}
              active={activeGenre}
              onSelect={setActiveGenre}
            />
            <section className="results">
              <div className="res-header">
                <p className="res-label">
                  {activeGenre ? (
                    <>
                      Discover · <strong>{activeGenre}</strong>
                    </>
                  ) : (
                    "Discover something new"
                  )}
                </p>
                <span className="res-badge badge-d">Curated picks</span>
              </div>
              <div className="grid">
                {discoverLoading && <SkeletonGrid n={20} />}
                {discoverError && !discoverLoading && (
                  <div className="empty">
                    <div className="empty-icon">🎬</div>
                    <p className="empty-msg err">{discoverError}</p>
                  </div>
                )}
                {!discoverLoading &&
                  !discoverError &&
                  discoverResults.length === 0 && (
                    <div className="empty">
                      <div className="empty-icon">🎬</div>
                      <p className="empty-msg">
                        No movies found for "{activeGenre}".
                      </p>
                    </div>
                  )}
                {!discoverLoading &&
                  !discoverError &&
                  discoverResults.map((m, i) => (
                    <MovieCard key={m.id ?? i} movie={m} index={i} />
                  ))}
              </div>
            </section>
          </>
        )}

        {/* ── Search results or Out-of-Network Display ─────── */}
        {showSearchSection && (
          <section className="results">
            {/* The Illusion UI (Scenario B) */}
            {outOfNetworkMovie && !loading && !error && (
              <div
                style={{
                  animation: "fadeUp 0.4s ease both",
                  maxWidth: "800px",
                  margin: "0 auto",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "12px",
                  overflow: "hidden",
                  display: "flex",
                  gap: "24px",
                  padding: "24px",
                  flexWrap: "wrap",
                }}
              >
                <img
                  src={
                    outOfNetworkMovie.poster ||
                    "https://via.placeholder.com/500x750?text=No+Poster"
                  }
                  alt={outOfNetworkMovie.title}
                  style={{
                    width: "200px",
                    borderRadius: "8px",
                    objectFit: "cover",
                    flexShrink: 0,
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    flex: 1,
                    minWidth: "280px",
                  }}
                >
                  <h2
                    style={{
                      fontSize: "28px",
                      marginBottom: "8px",
                      lineHeight: 1.2,
                    }}
                  >
                    {outOfNetworkMovie.title}{" "}
                    {outOfNetworkMovie.release_date && (
                      <span
                        style={{ color: "var(--text-muted)", fontWeight: 400 }}
                      >
                        ({outOfNetworkMovie.release_date.substring(0, 4)})
                      </span>
                    )}
                  </h2>
                  <p
                    style={{
                      fontSize: "14px",
                      color: "var(--text-muted)",
                      lineHeight: 1.6,
                      marginBottom: "24px",
                    }}
                  >
                    {outOfNetworkMovie.overview || "No overview available."}
                  </p>
                  <div
                    style={{
                      background: "var(--surface)",
                      padding: "16px",
                      borderRadius: "8px",
                      borderLeft: "3px solid var(--text-dim)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        color: "var(--text-dim)",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span style={{ fontSize: "16px" }}>ℹ️</span>
                      <strong>Not enough audience data.</strong>
                    </div>
                    <p
                      style={{
                        fontSize: "12px",
                        color: "var(--text-muted)",
                        marginTop: "6px",
                        marginLeft: "24px",
                        lineHeight: 1.5,
                      }}
                    >
                      This title was fetched from TMDB, but isn't present in
                      CineIQ's local Machine Learning graph yet. The AI engines
                      cannot generate mathematical recommendations without prior
                      viewer behavior or semantic mappings.
                    </p>
                  </div>
                  <div style={{ marginTop: "24px" }}>
                    <button className="mode-btn" onClick={backToDiscover}>
                      ← Back to Discover
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Standard Results UI (Scenario A) */}
            {!outOfNetworkMovie && (
              <>
                <div className="res-header">
                  <p className="res-label">
                    {loading ? (
                      "Analyzing…"
                    ) : error ? (
                      error.type === "not_found" ? (
                        "No results"
                      ) : (
                        "Service error"
                      )
                    ) : (
                      <>
                        Because you liked <strong>"{submitted}"</strong>
                      </>
                    )}
                  </p>
                  {!loading && !error && (
                    <span
                      className={`res-badge ${viewMode === "compare" ? "badge-c" : badgeCls}`}
                    >
                      {viewMode === "compare"
                        ? "TF-IDF vs LightGCN"
                        : badgeLabel}
                    </span>
                  )}
                </div>

                {!loading && hasSearchResults && !error && (
                  <div className="mode-toggle">
                    <button
                      className={`mode-btn ${viewMode === "grid" ? "on" : ""}`}
                      onClick={() => setViewMode("grid")}
                    >
                      ▦ Grid
                    </button>
                    <button
                      className={`mode-btn ${viewMode === "compare" ? "on" : ""}`}
                      onClick={() => search(submitted, "compare")}
                    >
                      ⇔ Compare
                    </button>
                    <button
                      className="mode-btn"
                      onClick={backToDiscover}
                      style={{ marginLeft: "auto" }}
                    >
                      ✕ Back
                    </button>
                  </div>
                )}

                {viewMode === "grid" && (
                  <div className="grid">
                    {loading && <SkeletonGrid />}
                    {error && !loading && (
                      <div className="empty">
                        <div className="empty-icon">
                          {error.type === "not_found" ? "🎬" : "⚠️"}
                        </div>
                        <p className="empty-msg err">{error.message}</p>
                        <div style={{ marginTop: 16 }}>
                          <button className="mode-btn" onClick={backToDiscover}>
                            ← Back
                          </button>
                        </div>
                      </div>
                    )}
                    {!loading &&
                      !error &&
                      results.map((m, i) => (
                        <MovieCard key={m.id ?? i} movie={m} index={i} />
                      ))}
                  </div>
                )}

                {viewMode === "compare" && !loading && (
                  <div className="compare-grid">
                    <div className="compare-col">
                      <div className="compare-col-header">
                        <span className="compare-col-title ct">
                          ⬡ TF-IDF · Content Signal
                        </span>
                      </div>
                      {cResults.length === 0 ? (
                        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          Not found
                        </p>
                      ) : (
                        cResults.map((m, i) => (
                          <CompareCard
                            key={m.id ?? i}
                            movie={m}
                            engine="content"
                            index={i}
                          />
                        ))
                      )}
                    </div>
                    <div className="compare-col">
                      <div className="compare-col-header">
                        <span className="compare-col-title cg">
                          ◈ LightGCN · Behavioral Signal
                        </span>
                      </div>
                      {gResults.length === 0 ? (
                        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          Not found
                        </p>
                      ) : (
                        gResults.map((m, i) => (
                          <CompareCard
                            key={m.id ?? i}
                            movie={m}
                            engine="graph"
                            index={i}
                          />
                        ))
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        <footer className="footer">
          <div className="footer-tag">
            <div className="footer-dot" /> CineIQ — Dual-Engine Movie
            Recommender
          </div>
          <span>LightGCN · TF-IDF · TMDB · MongoDB Atlas</span>
        </footer>
      </div>
    </>
  );
}
