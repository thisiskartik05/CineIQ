import { useState, useEffect, useRef, useCallback } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────
// Automatically use localhost during 'npm run dev', but use Render when deployed live
const API_BASE = import.meta.env.DEV
  ? "http://127.0.0.1:8000/api"
  : "https://cineiq-backend.onrender.com/api";

// ─── Design tokens (inline – no build-step dependency) ────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@300;400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body,#root{height:100%;background:#0f0f0f;color:#e5e5e5;font-family:'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
::-webkit-scrollbar{width:4px;height:4px}::-webkit-scrollbar-track{background:#0f0f0f}::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:4px}
::selection{background:rgba(229,9,20,.3);color:#fff}
:root{
  --bg:#0f0f0f;--bg-card:#1a1a1a;--bg-input:#1e1e1e;--surface:#242424;
  --border:rgba(255,255,255,.08);--border-hover:rgba(255,255,255,.16);
  --red:#e50914;--red-dim:rgba(229,9,20,.14);--red-border:rgba(229,9,20,.25);
  --green:#00e054;--green-dim:rgba(0,224,84,.12);--green-border:rgba(0,224,84,.25);
  --purple:#a855f7;--purple-dim:rgba(168,85,247,.12);--purple-border:rgba(168,85,247,.25);
  --text:#e5e5e5;--text-muted:#808080;--text-dim:#3a3a3a;
  --font-d:'Bebas Neue',sans-serif;--r:6px;--rl:12px
}

/* ── Nav ─────────────────────────────────────────────────────── */
.nav{position:sticky;top:0;z-index:200;display:flex;align-items:center;justify-content:space-between;
  padding:0 32px;height:56px;background:rgba(15,15,15,.92);backdrop-filter:blur(20px);
  border-bottom:1px solid var(--border)}
.nav-logo{font-family:var(--font-d);font-size:26px;letter-spacing:2px;user-select:none}
.nav-logo .r{color:var(--red)}
.nav-pill{font-size:10px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;
  color:var(--text-muted);display:flex;align-items:center;gap:6px}
.nav-dot{width:6px;height:6px;border-radius:50%;background:var(--green)}

/* ── Hero ────────────────────────────────────────────────────── */
.hero{position:relative;display:flex;flex-direction:column;align-items:center;
  padding:72px 24px 56px;text-align:center;overflow:hidden}
.hero-glow{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(ellipse 60% 40% at 50% -10%,rgba(229,9,20,.11) 0%,transparent 70%),
             radial-gradient(ellipse 35% 25% at 80% 100%,rgba(0,224,84,.07) 0%,transparent 65%)}
.eyebrow{font-size:10px;font-weight:700;letter-spacing:.25em;text-transform:uppercase;color:#333;margin-bottom:18px}
.hero-h1{font-family:var(--font-d);font-size:clamp(68px,11vw,132px);line-height:.9;letter-spacing:4px;margin-bottom:14px}
.hero-h1 .iq{color:var(--red)}
.hero-sub{font-size:14px;color:var(--text-muted);max-width:400px;line-height:1.65;margin-bottom:44px}

/* ── Search ──────────────────────────────────────────────────── */
.search-wrap{width:100%;max-width:600px;display:flex;flex-direction:column;gap:10px;position:relative;z-index:110}
.search-row{display:flex;gap:8px;background:var(--bg-input);border:1px solid var(--border);
  border-radius:var(--rl);padding:6px 6px 6px 18px;transition:border-color .2s,box-shadow .2s}
.search-row:focus-within{border-color:rgba(255,255,255,.18);box-shadow:0 0 0 3px rgba(229,9,20,.1)}
.search-input{flex:1;background:none;border:none;outline:none;color:var(--text);
  font-family:'Inter',system-ui;font-size:15px;caret-color:var(--red)}
.search-input::placeholder{color:#333}
.search-btn{background:var(--red);color:#fff;border:none;border-radius:8px;padding:10px 22px;
  font-size:13px;font-weight:700;letter-spacing:.04em;cursor:pointer;
  transition:background .15s,transform .1s;white-space:nowrap}
.search-btn:hover{background:#c8070f}
.search-btn:active{transform:scale(.97)}
.search-btn:disabled{opacity:.45;cursor:not-allowed}

/* ── Autocomplete dropdown ───────────────────────────────────── */
.ac-list{position:absolute;top:calc(100% + 4px);left:0;right:0;
  background:#1c1c1c;border:1px solid var(--border);border-radius:var(--r);
  max-height:220px;overflow-y:auto;z-index:300;box-shadow:0 12px 40px rgba(0,0,0,.6)}
.ac-item{padding:10px 16px;font-size:13px;color:var(--text-muted);cursor:pointer;
  border-bottom:1px solid var(--border);transition:background .1s,color .1s}
.ac-item:last-child{border-bottom:none}
.ac-item:hover,.ac-item.active{background:rgba(229,9,20,.1);color:var(--text)}
.ac-item mark{background:none;color:var(--red);font-weight:700}

/* ── Engine toggle ───────────────────────────────────────────── */
.engine-row{display:flex;align-items:center;gap:10px}
.engine-label{font-size:9px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#333}
.engine-btns{display:flex;align-items:center;background:var(--surface);
  border:1px solid var(--border);border-radius:var(--r);overflow:hidden}
.eng{background:none;border:none;color:var(--text-muted);font-size:11px;font-weight:700;
  letter-spacing:.08em;padding:7px 14px;cursor:pointer;display:flex;align-items:center;gap:5px;
  transition:color .15s,background .15s}
.eng:hover{color:var(--text);background:rgba(255,255,255,.04)}
.eng.ac{color:#fff;background:rgba(229,9,20,.22)}
.eng.ag{color:var(--green);background:var(--green-dim)}
.eng.ah{color:var(--purple);background:var(--purple-dim)}
.eng-div{width:1px;height:18px;background:var(--border)}

/* ── Alpha slider (hybrid only) ─────────────────────────────── */
.alpha-row{display:flex;align-items:center;gap:10px;font-size:11px;color:var(--text-muted)}
.alpha-row input[type=range]{flex:1;accent-color:var(--purple)}
.alpha-val{font-family:monospace;font-size:11px;color:var(--purple);min-width:32px;text-align:right}

/* ── Film strip ──────────────────────────────────────────────── */
.strip{width:100%;height:4px;background:repeating-linear-gradient(
  90deg,var(--red) 0,var(--red) 20px,transparent 20px,transparent 28px);opacity:.2;margin-bottom:44px}

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

/* ── Mode toggle (grid / compare) ──────────────────────────────── */
.mode-toggle{display:flex;gap:4px;margin-bottom:20px}
.mode-btn{background:none;border:1px solid var(--border);color:var(--text-muted);
  font-size:11px;font-weight:600;padding:5px 14px;border-radius:20px;cursor:pointer;
  transition:all .15s}
.mode-btn.on{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.2);color:var(--text)}

/* ── Card grid ───────────────────────────────────────────────── */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:18px}
@media(min-width:640px){.grid{grid-template-columns:repeat(auto-fill,minmax(178px,1fr))}}
@media(min-width:1024px){.grid{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}}

/* ── Movie card ──────────────────────────────────────────────── */
.card{animation:fadeUp .38s ease both;cursor:default}
@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
.poster{position:relative;aspect-ratio:2/3;border-radius:var(--r);overflow:hidden;
  background:var(--bg-card);margin-bottom:9px;
  outline:2px solid transparent;outline-offset:2px;transition:outline-color .2s}
.card:hover .poster{outline-color:var(--green)}
.skel-bg{position:absolute;inset:0;
  background:linear-gradient(110deg,#1a1a1a 30%,#222 50%,#1a1a1a 70%);
  background-size:200% 100%;animation:shimmer 1.4s infinite}
@keyframes shimmer{to{background-position:-200% 0}}
.poster img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
  transition:transform .3s,opacity .3s}
.card:hover .poster img{transform:scale(1.04)}
.overlay{position:absolute;inset:0;
  background:linear-gradient(to top,rgba(0,0,0,.92) 0%,rgba(0,0,0,.35) 55%,transparent 100%);
  display:flex;align-items:flex-end;padding:12px;opacity:0;transition:opacity .22s}
.card:hover .overlay{opacity:1}
.ov-inner{display:flex;flex-direction:column;gap:5px;width:100%}
.ov-reason{font-size:11px;color:rgba(255,255,255,.7);line-height:1.4;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.match-pill{display:inline-flex;align-self:flex-start;font-size:10px;font-weight:700;
  color:var(--green);background:var(--green-dim);border:1px solid var(--green-border);
  border-radius:4px;padding:2px 7px}
.rank{position:absolute;top:7px;left:7px;font-family:var(--font-d);font-size:13px;
  letter-spacing:1px;color:rgba(255,255,255,.45);background:rgba(0,0,0,.7);
  backdrop-filter:blur(4px);border-radius:4px;padding:2px 6px;line-height:1.2}
.card-title{font-size:13px;font-weight:600;line-height:1.3;margin-bottom:4px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;
  transition:color .15s}
.card:hover .card-title{color:var(--green)}

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
.cmp-card:hover{border-color:rgba(255,255,255,.15)}
.cmp-poster{width:44px;height:66px;border-radius:4px;object-fit:cover;flex-shrink:0;
  background:var(--surface)}
.cmp-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;justify-content:center}
.cmp-title{font-size:12px;font-weight:600;line-height:1.3;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
  background:linear-gradient(110deg,#1a1a1a 30%,#222 50%,#1a1a1a 70%);
  background-size:200% 100%;animation:shimmer 1.4s infinite;margin-bottom:9px}
.skel-line{height:10px;border-radius:4px;background:#1f1f1f;margin-bottom:5px}
.skel-line.l{width:85%}.skel-line.s{width:50%}
.empty{grid-column:1/-1;text-align:center;padding:56px 24px}
.empty-icon{font-size:38px;opacity:.3;margin-bottom:14px}
.empty-msg{font-size:14px;color:var(--text-muted);max-width:340px;margin:0 auto;line-height:1.6}
.err{color:#e5737a}

/* ── Footer ──────────────────────────────────────────────────── */
.footer{margin-top:auto;border-top:1px solid var(--border);padding:18px 32px;
  display:flex;align-items:center;justify-content:space-between;
  font-size:11px;color:#333}
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

// ─── Movie card (grid mode) ───────────────────────────────────────────────────
function MovieCard({ movie, index }) {
  const [loaded, setLoaded] = useState(false);
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
            <Stars score={movie.score} />
            <p className="ov-reason">{movie.reason}</p>
            <span className="match-pill">{movie.score}% match</span>
          </div>
        </div>
        <div className="rank">#{index + 1}</div>
      </div>
      <div className="card-title">{movie.title}</div>
      <Stars score={movie.score} />
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
function EngineToggle({ engine, setEngine }) {
  const btns = [
    { id: "content", label: "TF-IDF", cls: "ac", icon: "⬡" },
    { id: "graph", label: "LightGCN", cls: "ag", icon: "◈" },
    { id: "hybrid", label: "Hybrid", cls: "ah", icon: "⚡" },
  ];
  return (
    <div className="engine-row">
      <span className="engine-label">ENGINE</span>
      <div className="engine-btns">
        {btns.map((b, i) => (
          <>
            {i > 0 && <div key={`d${i}`} className="eng-div" />}
            <button
              key={b.id}
              className={`eng ${engine === b.id ? b.cls : ""}`}
              onClick={() => setEngine(b.id)}
            >
              <span>{b.icon}</span> {b.label}
            </button>
          </>
        ))}
      </div>
    </div>
  );
}

// ─── Alpha slider (hybrid) ────────────────────────────────────────────────────
function AlphaSlider({ alpha, setAlpha }) {
  return (
    <div className="alpha-row">
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

// ─── Autocomplete ─────────────────────────────────────────────────────────────
function Autocomplete({ query, titles, onSelect }) {
  const [activeIdx, setActiveIdx] = useState(-1);

  const filtered =
    query.trim().length < 2
      ? []
      : titles
          .filter((t) => t.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 8);

  if (!filtered.length) return null;

  const highlight = (title) => {
    const idx = title.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return title;
    return (
      <>
        {title.slice(0, idx)}
        <mark>{title.slice(idx, idx + query.length)}</mark>
        {title.slice(idx + query.length)}
      </>
    );
  };

  return (
    <div className="ac-list">
      {filtered.map((t, i) => (
        <div
          key={t}
          className={`ac-item ${i === activeIdx ? "active" : ""}`}
          onMouseEnter={() => setActiveIdx(i)}
          onMouseLeave={() => setActiveIdx(-1)}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(t);
          }}
        >
          {highlight(t)}
        </div>
      ))}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [query, setQuery] = useState("");
  const [engine, setEngine] = useState("graph");
  const [alpha, setAlpha] = useState(0.5);
  const [results, setResults] = useState([]);
  const [cResults, setCResults] = useState([]); // content side for compare
  const [gResults, setGResults] = useState([]); // graph side for compare
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState("");
  const [titles, setTitles] = useState([]);
  const [showAC, setShowAC] = useState(false);
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "compare"

  const inputRef = useRef(null);

  // Load autocomplete titles once
  useEffect(() => {
    fetch(`${API_BASE}/titles`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setTitles(d.titles || []))
      .catch(() => {});
    inputRef.current?.focus();
  }, []);

  const search = useCallback(
    async (q = query, eng = engine) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setLoading(true);
      setError(null);
      setResults([]);
      setCResults([]);
      setGResults([]);
      setSubmitted(trimmed);
      setShowAC(false);

      try {
        if (eng === "compare") {
          // Fetch both engines in parallel for side-by-side
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
          if (!cr.ok && !gr.ok)
            throw new Error("Movie not found in either engine.");
          setCResults(cd.results || []);
          setGResults(gd.results || []);
          setViewMode("compare");
        } else {
          const suffix =
            eng === "hybrid"
              ? `hybrid/${encodeURIComponent(trimmed)}?top_k=6&alpha=${alpha}`
              : `${eng}/${encodeURIComponent(trimmed)}?top_k=6`;
          const res = await fetch(`${API_BASE}/recommend/${suffix}`);
          if (!res.ok)
            throw new Error(
              "Film not found — check spelling or try another title.",
            );
          const data = await res.json();
          setResults(data.results || []);
          setViewMode("grid");
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [query, engine, alpha],
  );

  const handleKey = (e) => {
    if (e.key === "Enter") search();
    if (e.key === "Escape") setShowAC(false);
  };

  const selectTitle = (t) => {
    setQuery(t);
    setShowAC(false);
    search(t, engine);
  };

  const hasResults =
    results.length > 0 || cResults.length > 0 || gResults.length > 0;

  const badgeCls =
    { content: "badge-c", graph: "badge-g", hybrid: "badge-h" }[engine] ||
    "badge-c";
  const badgeLabel = {
    content: "TF-IDF Content",
    graph: "LightGCN Graph",
    hybrid: `Hybrid α=${alpha.toFixed(2)}`,
  }[engine];

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
          <div className="nav-pill">
            <div className="nav-dot" /> Dual-Engine Rec System
          </div>
        </nav>

        {/* Hero */}
        <section className="hero">
          <div className="hero-glow" />
          <p className="eyebrow">
            PyTorch · LightGCN · TF-IDF · FastAPI · MongoDB Atlas
          </p>
          <h1 className="hero-h1">
            CINE<span className="iq">IQ</span>
          </h1>
          <p className="hero-sub">
            Type a film you love. Switch between content semantics, graph neural
            network, or a blended hybrid.
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
                onBlur={() => setTimeout(() => setShowAC(false), 150)}
                autoComplete="off"
              />
              <button
                className="search-btn"
                onClick={() => search()}
                disabled={loading || !query.trim()}
              >
                {loading ? "Finding…" : "Find Films"}
              </button>
            </div>

            {/* Autocomplete */}
            {showAC && titles.length > 0 && (
              <Autocomplete
                query={query}
                titles={titles}
                onSelect={selectTitle}
              />
            )}

            {/* Engine toggle */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <EngineToggle engine={engine} setEngine={setEngine} />
                {/* Compare shortcut */}
                <button
                  className={`mode-btn ${viewMode === "grid" ? "on" : ""}`}
                  onClick={() => setViewMode("grid")}
                >
                  ▦ Grid
                </button>
              </div>
              {engine === "hybrid" && (
                <AlphaSlider alpha={alpha} setAlpha={setAlpha} />
              )}
            </div>
          </div>
        </section>

        <div className="strip" />

        {/* Results */}
        {(loading || hasResults || error) && (
          <section className="results">
            <div className="res-header">
              <p className="res-label">
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
              {!loading && !error && (
                <span
                  className={`res-badge ${viewMode === "compare" ? "badge-c" : badgeCls}`}
                >
                  {viewMode === "compare" ? "TF-IDF vs LightGCN" : badgeLabel}
                </span>
              )}
            </div>

            {/* View mode tabs */}
            {!loading && hasResults && !error && (
              <div className="mode-toggle">
                <button
                  className={`mode-btn ${viewMode === "grid" ? "on" : ""}`}
                  onClick={() => setViewMode("grid")}
                >
                  ▦ Grid
                </button>
                <button
                  className={`mode-btn ${viewMode === "compare" ? "on" : ""}`}
                  onClick={() => search(query, "compare")}
                  title="Side-by-side TF-IDF vs LightGCN"
                  style={{ marginLeft: "auto" }}
                >
                  ⇔ Compare
                </button>
              </div>
            )}

            {/* Grid view */}
            {viewMode === "grid" && (
              <div className="grid">
                {loading && <SkeletonGrid />}
                {error && !loading && (
                  <div className="empty">
                    <div className="empty-icon">🎬</div>
                    <p className="empty-msg err">{error}</p>
                  </div>
                )}
                {!loading &&
                  !error &&
                  results.map((m, i) => (
                    <MovieCard key={m.id ?? i} movie={m} index={i} />
                  ))}
              </div>
            )}

            {/* Compare view */}
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
                      Not found in content index
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
                      Not found in graph index
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
