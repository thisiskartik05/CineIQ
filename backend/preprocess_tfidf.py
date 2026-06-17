"""
preprocess_tfidf.py
────────────────────────────────────────────────────────────────────────────────
Offline TF-IDF preprocessing pipeline for CineIQ.

Run this ONCE (or whenever tmdb_ml.csv changes) to produce:
  models/tfidf.pkl        – sparse TF-IDF matrix (4227 × vocab)
  models/tfidf_meta.pkl   – vectorizer object + cleaned soup corpus

Usage:
  cd backend/
  python preprocess_tfidf.py

Why this is a standalone script (not inside FastAPI startup):
  • Vectorizer fitting is O(n·v) – blocking the event loop for ~4 seconds on cold
    start hurts real-time inference latency.
  • Hyper-parameter changes only require re-running this script, not redeploying
    the API server.
  • Keeps main.py startup to pure I/O (pickle loads ≈ 150 ms).
────────────────────────────────────────────────────────────────────────────────
"""

import ast
import re
import pickle
import time
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer

# ── Paths ─────────────────────────────────────────────────────────────────────
CSV_PATH      = "models/tmdb_ml.csv"
MATRIX_OUT    = "models/tfidf.pkl"        # sparse matrix consumed by main.py
META_OUT      = "models/tfidf_meta.pkl"   # vectorizer + corpus (for debug/hybrid)


# ── 1. Token helpers ──────────────────────────────────────────────────────────

def _parse_list_field(raw: str) -> list[str]:
    """
    Safely parse a stringified Python list back into a real list.
    Handles both well-formed '["A", "B"]' and already-clean strings.
    """
    if not isinstance(raw, str):
        return []
    try:
        parsed = ast.literal_eval(raw)
        if isinstance(parsed, list):
            return [str(x) for x in parsed]
    except (ValueError, SyntaxError):
        pass
    return [raw]  # treat the whole string as one entry if parsing fails


def _token(text: str) -> str:
    """
    Convert a multi-word entity name into a single merged token so the
    vectorizer treats it as an atomic unit rather than individual common words.

    Examples
    --------
    "Science Fiction"  →  "sciencefiction"
    "Christopher Nolan"→  "christophernolan"
    "Action"           →  "action"

    Lowercasing + stripping all non-alpha characters prevents stop-word bleed
    (e.g. "At", "Of", "The" inside titles reaching the vocabulary).
    """
    return re.sub(r"[^a-z]", "", text.lower())


# ── 2. Soup builder ──────────────────────────────────────────────────────────

def build_soup(row: pd.Series) -> str:
    """
    Concatenate all semantic signals for one movie into a single string
    that the TF-IDF vectorizer will tokenise by whitespace.

    Signal          Weight strategy
    ──────────────  ───────────────────────────────────────────────────────────
    genres          ×3  – highest discriminative power for content filtering;
                         tripling repeats the token so IDF doesn't wash it out
    director        ×2  – strong auteur signal; directors rarely appear in cast
                         so doubling lifts their weight relative to the corpus
    cast (top 3)    ×2  – named actors are meaningful but cast lists vary wildly
                         in length; we cap at 3 to avoid long-tail noise
    overview        ×1  – natural language carries semantic breadth; leave at ×1
                         so TF-IDF weighting handles term frequency naturally
    sentiment       ×1  – bucketed polarity label adds a coarse tone dimension
    """
    # ── genres ────────────────────────────────────────────────────────────────
    genres = _parse_list_field(row["genres"])
    genre_tokens = " ".join(_token(g) for g in genres)
    genre_weighted = (genre_tokens + " ") * 3   # triple-weight

    # ── director ──────────────────────────────────────────────────────────────
    director_raw = str(row["director"]) if pd.notna(row["director"]) else ""
    director_token = _token(director_raw) if director_raw else ""
    director_weighted = (director_token + " ") * 2 if director_token else ""

    # ── cast (top 3 only) ─────────────────────────────────────────────────────
    cast = _parse_list_field(row["cast"])[:3]   # cap at 3
    cast_tokens = " ".join(_token(c) for c in cast)
    cast_weighted = (cast_tokens + " ") * 2

    # ── overview (raw NL text, cleaned) ───────────────────────────────────────
    overview = str(row["overview"]) if pd.notna(row["overview"]) else ""
    # Strip punctuation but keep spaces so TF-IDF tokenises individual words
    overview_clean = re.sub(r"[^a-z\s]", " ", overview.lower()).strip()

    # ── sentiment bucket ─────────────────────────────────────────────────────
    # Convert the continuous compound score into a discrete vocabulary token
    # so the vectorizer can treat tone as a feature dimension.
    sentiment_val = float(row["sentiment"]) if pd.notna(row["sentiment"]) else 0.0
    if sentiment_val >= 0.5:
        sentiment_token = "verypositivetone"
    elif sentiment_val >= 0.1:
        sentiment_token = "positivetone"
    elif sentiment_val >= -0.1:
        sentiment_token = "neutraltone"
    elif sentiment_val >= -0.5:
        sentiment_token = "negativetone"
    else:
        sentiment_token = "verynegativetone"

    soup = (
        f"{genre_weighted}"
        f"{director_weighted}"
        f"{cast_weighted}"
        f"{overview_clean} "
        f"{sentiment_token}"
    )
    # Collapse any duplicate whitespace produced by empty fields
    return re.sub(r"\s+", " ", soup).strip()


# ── 3. Vectorizer hyperparameters ─────────────────────────────────────────────
#
# Previous bug: default ngram_range=(1,1) combined with no min_df/max_df let
# extremely common structural words ("the", "of", "in") dominate the cosine
# similarity — every pair of movies looked similar because they shared the
# same stop words.
#
# Fixed settings:
#   analyzer="word"     – split on whitespace (our merged tokens are already
#                         de-spaced, so "sciencefiction" stays intact)
#   ngram_range=(1, 2)  – unigrams for atomic entity tokens (christophernolan)
#                         + bigrams to capture two-word NL phrases from overview
#   min_df=2            – discard hapax legomena (tokens appearing in only 1
#                         movie) – they add noise without discriminative value
#   max_df=0.80         – discard tokens appearing in >80 % of all documents
#                         (structural vocabulary: "film", "story", "man", …)
#   sublinear_tf=True   – apply log(1+tf) instead of raw tf to dampen the
#                         effect of highly repeated terms in the weighted soup
#   stop_words="english"– SKLearn built-in list removes ~318 English stop words
#                         from the overview NL portion
#   max_features=15000  – hard vocabulary cap; keeps the matrix dense enough
#                         for fast cosine similarity without running OOM

VECTORIZER_PARAMS = dict(
    analyzer      = "word",
    ngram_range   = (1, 2),
    min_df        = 2,
    max_df        = 0.80,
    sublinear_tf  = True,
    stop_words    = "english",
    max_features  = 15_000,
)


# ── 4. Main pipeline ──────────────────────────────────────────────────────────

def run():
    t0 = time.perf_counter()

    # ── Load ──────────────────────────────────────────────────────────────────
    print(f"📂  Loading {CSV_PATH} …")
    df = pd.read_csv(CSV_PATH)
    print(f"    {len(df):,} movies loaded.")

    # ── Build soup corpus ─────────────────────────────────────────────────────
    print("🥣  Building token soup for each movie …")
    df["soup"] = df.apply(build_soup, axis=1)

    # Sanity-check a couple of rows
    for _, row in df.head(3).iterrows():
        print(f"    [{row['title']}] → {row['soup'][:120]} …")

    # ── Fit + transform ───────────────────────────────────────────────────────
    print(f"\n🔧  Fitting TF-IDF vectorizer  (params: {VECTORIZER_PARAMS}) …")
    vectorizer = TfidfVectorizer(**VECTORIZER_PARAMS)
    tfidf_matrix = vectorizer.fit_transform(df["soup"])

    vocab_size = len(vectorizer.vocabulary_)
    print(f"    Matrix shape : {tfidf_matrix.shape}")
    print(f"    Vocabulary   : {vocab_size:,} terms")
    print(f"    Sparsity     : {1 - tfidf_matrix.nnz / (tfidf_matrix.shape[0] * tfidf_matrix.shape[1]):.4%}")

    # ── Persist ───────────────────────────────────────────────────────────────
    print(f"\n💾  Saving matrix  → {MATRIX_OUT}")
    with open(MATRIX_OUT, "wb") as f:
        pickle.dump(tfidf_matrix, f, protocol=pickle.HIGHEST_PROTOCOL)

    print(f"💾  Saving metadata → {META_OUT}")
    meta = {
        "vectorizer": vectorizer,
        "soup_corpus": df["soup"].tolist(),
        "titles": df["title"].tolist(),
    }
    with open(META_OUT, "wb") as f:
        pickle.dump(meta, f, protocol=pickle.HIGHEST_PROTOCOL)

    elapsed = time.perf_counter() - t0
    print(f"\n✅  Preprocessing complete in {elapsed:.2f}s")
    print(f"    Run the FastAPI server — it will load from {MATRIX_OUT}")


if __name__ == "__main__":
    run()
