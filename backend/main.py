"""
main.py  –  CineIQ FastAPI backend
────────────────────────────────────────────────────────────────────────────────
Three recommendation endpoints:

  GET /api/recommend/content/{title}   – TF-IDF content similarity
  GET /api/recommend/graph/{title}     – LightGCN collaborative graph
  GET /api/recommend/hybrid/{title}    – Weighted blend  (α·content + (1-α)·graph)

Startup:  loads pre-computed artefacts produced by preprocess_tfidf.py and
          train_lightgcn.py.  No heavy computation happens at request time.

Query param `top_k`  (default 6) controls result count on every endpoint.
Query param `alpha`  (default 0.5, range 0–1) controls blend weight on /hybrid.
────────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import pickle
import ast
import re
import requests 
import os       

import torch
import pandas as pd
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient

TMDB_API_KEY = "3b68e72146bbd3b09e250fc63288613d"

# ── App & CORS ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="CineIQ Recommendation API",
    description="Dual-engine movie recommender: TF-IDF content + LightGCN graph.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Database ──────────────────────────────────────────────────────────────────

MONGO_URI = "mongodb+srv://admin:12345@shared-canvas.vwgpbwe.mongodb.net/cineiq?retryWrites=true&w=majority"
client = MongoClient(MONGO_URI)
db = client.cineiq


# ── Helpers ───────────────────────────────────────────────────────────────────

def _poster_url(title: str) -> str:
    """
    Fetch the poster URL from MongoDB Atlas.
    If missing, fetch it live from TMDB on-the-fly and save it for next time.
    """
    doc = db.movies.find_one({"title": title}, {"poster_path": 1, "_id": 1})
    
    # 1. CACHE HIT: We already have the poster in MongoDB
    if doc and doc.get("poster_path"):
        path = doc["poster_path"]
        if path.startswith("/"):
            return f"https://image.tmdb.org/t/p/w500{path}"

    # 2. CACHE MISS: Fetch it live from TMDB!
    fallback = "https://placehold.co/500x750/1a1a1a/444444.png?text=No+Poster"
    
    if not TMDB_API_KEY or TMDB_API_KEY == "PASTE_YOUR_TMDB_API_KEY_HERE":
        return fallback

    try:
        # Ask TMDB's Search API for this specific movie
        url = f"https://api.themoviedb.org/3/search/movie?api_key={TMDB_API_KEY}&query={title}"
        res = requests.get(url, timeout=3)
        data = res.json()

        # If TMDB found the movie and it has a poster...
        if data.get("results") and len(data["results"]) > 0:
            new_path = data["results"][0].get("poster_path")
            if new_path:
                # 3. Save it to MongoDB so we never fetch it again
                db.movies.update_one(
                    {"title": title},
                    {"$set": {"poster_path": new_path}},
                    upsert=True
                )
                return f"https://image.tmdb.org/t/p/w500{new_path}"
                
    except Exception as e:
        print(f"⚠️ TMDB Fetch Error for {title}: {e}")

    return fallback


def _parse_list_field(raw: str) -> list[str]:
    """Parse a stringified Python list field from the CSV."""
    if not isinstance(raw, str):
        return []
    try:
        parsed = ast.literal_eval(raw)
        if isinstance(parsed, list):
            return [str(x) for x in parsed]
    except (ValueError, SyntaxError):
        pass
    return [raw]


def _content_reason(query_row: pd.Series, result_row: pd.Series) -> str:
    """
    Build a human-readable explanation for a TF-IDF match by surfacing the
    concrete metadata overlap between the queried movie and the recommendation.
    """
    q_genres   = set(_parse_list_field(query_row["genres"]))
    r_genres   = set(_parse_list_field(result_row["genres"]))
    shared_g   = q_genres & r_genres

    q_cast     = set(_parse_list_field(query_row["cast"]))
    r_cast     = set(_parse_list_field(result_row["cast"]))
    shared_c   = q_cast & r_cast

    q_director = str(query_row.get("director", ""))
    r_director = str(result_row.get("director", ""))
    same_dir   = (
        q_director == r_director
        and pd.notna(query_row.get("director"))
        and q_director.strip() != ""
    )

    parts: list[str] = []
    if same_dir:
        parts.append(f"Directed by {q_director}")
    if shared_c:
        names = ", ".join(sorted(shared_c)[:2])
        parts.append(f"Stars {names}")
    if shared_g:
        genres = ", ".join(sorted(shared_g)[:3])
        parts.append(f"{genres} genre match")

    if parts:
        return " · ".join(parts)

    # Fallback: generic description using the result's own genres
    genre_label = ", ".join(sorted(r_genres)[:2]) if r_genres else "Similar"
    return f"{genre_label} content match via plot & tone"


# ── Engine A: TF-IDF ─────────────────────────────────────────────────────────

print("⬡  Loading Engine A: TF-IDF Content Matcher …")
try:
    with open("models/tfidf.pkl", "rb") as f:
        tfidf_matrix = pickle.load(f)                  # sparse (N × vocab)

    tmdb_df = pd.read_csv("models/tmdb_ml.csv")
    indices_df = pd.read_csv("models/indices_ml.csv")

    # Title → row index in tmdb_df (lower-cased for case-insensitive lookup)
    content_indices: pd.Series = pd.Series(
        indices_df.index,
        index=indices_df["title"].str.lower().str.strip()
    ).drop_duplicates()

    # Also build a lower-cased title list from tmdb_df for reason generation
    tmdb_lower_map: dict[str, int] = {
        t.lower().strip(): i for i, t in enumerate(tmdb_df["title"])
    }

    _ENGINE_A_OK = True
    print(f"   ✅ Engine A ready  ({tfidf_matrix.shape[0]:,} movies, "
          f"{tfidf_matrix.shape[1]:,} features)")
except Exception as exc:
    _ENGINE_A_OK = False
    print(f"   ❌ Engine A failed: {exc}")


# ── Engine B: LightGCN ───────────────────────────────────────────────────────

print("◈  Loading Engine B: LightGCN Graph Neural Network …")
try:
    with open("models/lightgcn_embeddings.pkl", "rb") as f:
        graph_data = pickle.load(f)

    movie_embeddings: torch.Tensor = torch.tensor(
        graph_data["movie_embeddings"], dtype=torch.float32
    )
    # L2-normalise so dot product == cosine similarity (stable score range)
    movie_embeddings = torch.nn.functional.normalize(movie_embeddings, dim=1)

    title_to_idx: dict[str, int]  = graph_data["title_to_idx"]
    idx_to_title: dict[int, str]  = graph_data["idx_to_title"]

    graph_lower_to_idx: dict[str, int] = {
        t.lower().strip(): idx for t, idx in title_to_idx.items()
    }

    _ENGINE_B_OK = True
    print(f"   ✅ Engine B ready  ({movie_embeddings.shape[0]:,} movies, "
          f"dim={movie_embeddings.shape[1]})")
except Exception as exc:
    _ENGINE_B_OK = False
    print(f"   ❌ Engine B failed: {exc}")


# ── Score calibration ─────────────────────────────────────────────────────────

def _calibrate_content_score(cosine_sim: float) -> int:
    """
    Map cosine similarity [0, 1] to a user-facing match percentage [50, 99].
    Cosine similarity for TF-IDF on movie metadata rarely exceeds 0.5 even for
    near-identical films, so we apply a square-root stretch to use the full
    visible range without false precision at the top end.
    """
    stretched = cosine_sim ** 0.5           # √0.30 ≈ 0.55 → reads as 77 %
    return min(99, max(50, int(stretched * 100)))


def _calibrate_graph_score(dot: float) -> int:
    """
    Map L2-normalised dot product (cosine similarity) [0, 1] to [60, 99].
    LightGCN embeddings are denser than TF-IDF, so scores cluster higher;
    we clamp the floor at 60 to reflect genuine collaborative signal.
    """
    return min(99, max(60, int(dot * 100)))


# ── Endpoint A: Content (TF-IDF) ─────────────────────────────────────────────

@app.get("/api/recommend/content/{search_query}")
async def get_content_recommendations(
    search_query: str,
    top_k: int = Query(default=6, ge=1, le=20),
):
    if not _ENGINE_A_OK:
        raise HTTPException(status_code=503, detail="Content engine not available.")

    query_lower = search_query.lower().strip()

    if query_lower not in content_indices:
        raise HTTPException(
            status_code=404,
            detail=f"'{search_query}' not found in content database. "
                   "Check spelling or try a different title."
        )

    idx = content_indices[query_lower]
    if isinstance(idx, pd.Series):
        idx = int(idx.iloc[0])
    idx = int(idx)

    # Cosine similarity against every row in the TF-IDF matrix
    sim_scores = list(enumerate(
        cosine_similarity(tfidf_matrix[idx], tfidf_matrix)[0]
    ))
    sim_scores.sort(key=lambda x: x[1], reverse=True)
    sim_scores = [s for s in sim_scores if s[0] != idx][:top_k]

    # Pull query row for reason generation
    query_row = tmdb_df.iloc[idx]

    results = []
    for m_idx, raw_score in sim_scores:
        row   = tmdb_df.iloc[m_idx]
        title = row["title"]
        results.append({
            "id":     int(m_idx),
            "title":  title,
            "score":  _calibrate_content_score(raw_score),
            "reason": _content_reason(query_row, row),
            "poster": _poster_url(title),
            "engine": "content",
        })

    return {"query": search_query, "engine": "content", "results": results}


# ── Endpoint B: Graph (LightGCN) ─────────────────────────────────────────────

@app.get("/api/recommend/graph/{search_query}")
async def get_graph_recommendations(
    search_query: str,
    top_k: int = Query(default=6, ge=1, le=20),
):
    if not _ENGINE_B_OK:
        raise HTTPException(status_code=503, detail="Graph engine not available.")

    query_lower = search_query.lower().strip()

    if query_lower not in graph_lower_to_idx:
        raise HTTPException(
            status_code=404,
            detail=f"'{search_query}' not found in graph database. "
                   "Check spelling or try a different title."
        )

    target_idx    = graph_lower_to_idx[query_lower]
    target_vector = movie_embeddings[target_idx]  # (dim,)

    # Dot product on L2-normalised embeddings == cosine similarity
    scores = torch.matmul(movie_embeddings, target_vector)  # (N,)
    top_scores, top_indices = torch.topk(scores, top_k + 1)

    results = []
    for score_t, idx_t in zip(top_scores, top_indices):
        m_idx = int(idx_t.item())
        if m_idx == target_idx:
            continue
        title = idx_to_title[m_idx]
        results.append({
            "id":     m_idx,
            "title":  title,
            "score":  _calibrate_graph_score(float(score_t.item())),
            "reason": "Audience behavior match — viewers who watched this also loved these films",
            "poster": _poster_url(title),
            "engine": "graph",
        })
        if len(results) == top_k:
            break

    return {"query": search_query, "engine": "graph", "results": results}


# ── Endpoint C: Hybrid blend ──────────────────────────────────────────────────

@app.get("/api/recommend/hybrid/{search_query}")
async def get_hybrid_recommendations(
    search_query: str,
    top_k: int   = Query(default=6, ge=1, le=20),
    alpha: float = Query(
        default=0.5,
        ge=0.0, le=1.0,
        description="Blend weight: 1.0 = pure TF-IDF, 0.0 = pure LightGCN"
    ),
):
    """
    Weighted ensemble:  Score = α · score_tfidf  +  (1-α) · score_lightgcn

    Both engines must index the queried title for the hybrid to work.
    Falls back to whichever engine succeeds if one doesn't recognise the title.
    """
    if not _ENGINE_A_OK and not _ENGINE_B_OK:
        raise HTTPException(status_code=503, detail="Both engines unavailable.")

    query_lower = search_query.lower().strip()

    # ── Content scores ───────────────────────────────────────────────────────
    content_score_map: dict[str, float] = {}
    content_reason_map: dict[str, str]  = {}
    query_row_for_reason: pd.Series | None = None

    if _ENGINE_A_OK and query_lower in content_indices:
        c_idx = content_indices[query_lower]
        if isinstance(c_idx, pd.Series):
            c_idx = int(c_idx.iloc[0])
        c_idx = int(c_idx)
        query_row_for_reason = tmdb_df.iloc[c_idx]

        sims = cosine_similarity(tfidf_matrix[c_idx], tfidf_matrix)[0]
        for i, sim in enumerate(sims):
            if i == c_idx:
                continue
            title = tmdb_df.iloc[i]["title"]
            content_score_map[title]  = float(sim)
            content_reason_map[title] = _content_reason(query_row_for_reason, tmdb_df.iloc[i])

    # ── Graph scores ─────────────────────────────────────────────────────────
    graph_score_map: dict[str, float] = {}

    if _ENGINE_B_OK and query_lower in graph_lower_to_idx:
        g_idx   = graph_lower_to_idx[query_lower]
        g_vec   = movie_embeddings[g_idx]
        g_scores = torch.matmul(movie_embeddings, g_vec).numpy()
        for i, s in enumerate(g_scores):
            if i == g_idx:
                continue
            title = idx_to_title.get(i)
            if title:
                graph_score_map[title] = float(s)

    # ── Check at least one engine found the title ─────────────────────────────
    if not content_score_map and not graph_score_map:
        raise HTTPException(
            status_code=404,
            detail=f"'{search_query}' not found in either engine's index."
        )

    # ── Normalise each engine's scores to [0, 1] ─────────────────────────────
    def _normalise(score_map: dict[str, float]) -> dict[str, float]:
        if not score_map:
            return {}
        vals = np.array(list(score_map.values()), dtype=float)
        vmin, vmax = vals.min(), vals.max()
        if vmax == vmin:
            return {k: 0.5 for k in score_map}
        return {k: float((v - vmin) / (vmax - vmin)) for k, v in score_map.items()}

    c_norm = _normalise(content_score_map)
    g_norm = _normalise(graph_score_map)

    # ── Compute effective alpha based on availability ─────────────────────────
    # If one engine is missing, push all weight to the available one.
    eff_alpha = alpha
    if not c_norm:
        eff_alpha = 0.0   # pure graph
    elif not g_norm:
        eff_alpha = 1.0   # pure content

    # ── Blend ────────────────────────────────────────────────────────────────
    # Coverage-aware weighting: a title only appears in c_norm/g_norm if it was
    # in that engine's *candidate set* (i.e. its similarity score was computed).
    # Naively defaulting an absent side to 0.0 would punish a movie that one
    # engine considers a perfect match (1.0) just because the other engine's
    # candidate scan didn't surface it — that's a coverage gap, not evidence of
    # dissimilarity, so we re-normalise the weight across whichever side(s)
    # actually scored this specific title.
    all_titles = set(c_norm) | set(g_norm)
    blended: list[tuple[str, float]] = []

    for title in all_titles:
        has_c = title in c_norm
        has_g = title in g_norm

        if has_c and has_g:
            hybrid_score = eff_alpha * c_norm[title] + (1.0 - eff_alpha) * g_norm[title]
        elif has_c:
            hybrid_score = c_norm[title]      # only content scored it — use as-is
        else:
            hybrid_score = g_norm[title]      # only graph scored it — use as-is

        blended.append((title, hybrid_score))

    blended.sort(key=lambda x: x[1], reverse=True)
    blended = blended[:top_k]

    # ── Build reason strings that surface both engines' contributions ─────────
    def _hybrid_reason(title: str, c_raw: float | None, g_raw: float | None) -> str:
        parts: list[str] = []
        if c_raw is not None and eff_alpha > 0:
            base = content_reason_map.get(title, "Content match")
            parts.append(f"Content ({base})")
        if g_raw is not None and eff_alpha < 1:
            parts.append("Audience behavior signal")
        return " + ".join(parts) if parts else "Hybrid match"

    results = []
    for title, blend_val in blended:
        c_raw = content_score_map.get(title)
        g_raw = graph_score_map.get(title)
        display_score = min(99, max(50, int(blend_val * 100)))
        results.append({
            "id":             hash(title) & 0x7FFFFFFF,
            "title":          title,
            "score":          display_score,
            "reason":         _hybrid_reason(title, c_raw, g_raw),
            "poster":         _poster_url(title),
            "engine":         "hybrid",
            "content_score":  round(c_raw, 4) if c_raw is not None else None,
            "graph_score":    round(g_raw, 4) if g_raw is not None else None,
            "alpha":          round(eff_alpha, 2),
        })

    return {
        "query":   search_query,
        "engine":  "hybrid",
        "alpha":   round(eff_alpha, 2),
        "results": results,
    }


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {
        "status":         "ok",
        "engine_content": _ENGINE_A_OK,
        "engine_graph":   _ENGINE_B_OK,
        "movies_content": int(tfidf_matrix.shape[0]) if _ENGINE_A_OK else 0,
        "movies_graph":   int(movie_embeddings.shape[0]) if _ENGINE_B_OK else 0,
    }


# ── Autocomplete titles ───────────────────────────────────────────────────────

@app.get("/api/titles")
async def get_titles():
    """
    Returns the full list of indexable movie titles from indices_ml.csv.
    Used by the React frontend to power the client-side autocomplete dropdown.
    """
    if not _ENGINE_A_OK:
        raise HTTPException(status_code=503, detail="Content engine not available.")
    titles = indices_df["title"].dropna().tolist()
    return {"titles": titles, "count": len(titles)}
