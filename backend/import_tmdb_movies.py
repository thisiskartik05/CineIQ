"""
import_tmdb_movies.py
────────────────────────────────────────────────────────────────────────────────
Local batch-update script: fetches movies from TMDB, enriches them with
director/cast (via the credits endpoint) and a locally-computed VADER
sentiment score, then:
    1. Upserts each movie into MongoDB Atlas `cineiq.movies` (no duplicates).
    2. Appends new rows to backend/models/tmdb_ml.csv, matching the exact
       column schema the TF-IDF engine expects, with safe auto-incremented
       movieId values that cannot collide with existing rows.

This is a LOCAL BATCH workflow by design — intended to run on your Mac,
update the CSV + MongoDB, and have you manually `git push` the result.
It is NOT a cloud cron job and does not attempt to run on Render or touch
any cloud storage budget beyond the MongoDB writes you already pay for.

After running this script, you MUST re-run (in this order):
    1. python preprocess_tfidf.py     ← rebuilds the TF-IDF matrix to include
                                          the new movies' tokens
    2. python train_lightgcn.py       ← only gives new movies graph coverage
                                          once some user's watchlist includes
                                          them; running it immediately after
                                          this script will NOT add coverage
                                          for brand-new titles until
                                          generate_users.py (or real usage)
                                          creates watchlist entries referencing
                                          them.

Environment variables required (set in your shell or a .env you source):
    TMDB_API_KEY   – your TMDB API key
    MONGO_URI      – your MongoDB Atlas connection string

Usage:
    cd backend/
    export TMDB_API_KEY=your_key_here
    export MONGO_URI=your_mongo_uri_here
    python import_tmdb_movies.py
────────────────────────────────────────────────────────────────────────────────
"""

import os
import sys
import time
import csv

import requests
import pandas as pd
from pymongo import MongoClient, UpdateOne
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer


# ── Config ────────────────────────────────────────────────────────────────────

TMDB_API_KEY = "3b68e72146bbd3b09e250fc63288613d"
MONGO_URI    = "mongodb+srv://admin:12345@shared-canvas.vwgpbwe.mongodb.net/cineiq?retryWrites=true&w=majority"

TMDB_BASE_URL       = "https://api.themoviedb.org/3"
TMDB_GENRE_LIST_URL = f"{TMDB_BASE_URL}/genre/movie/list"
TMDB_DISCOVER_URL   = f"{TMDB_BASE_URL}/movie/popular"
TMDB_CREDITS_URL    = f"{TMDB_BASE_URL}/movie/{{movie_id}}/credits"

# HARDCODED LOW VALUE FOR THIS FIRST TEST RUN.
# Each page returns ~20 movies, so PAGES_TO_FETCH=2 pulls ~40 candidate movies
# before any deduplication against your existing catalog. Raise this only
# after you've confirmed the CSV append + Mongo upsert behave correctly.
PAGES_TO_FETCH = 2

CSV_PATH    = "models/tmdb_ml.csv"
CSV_COLUMNS = ["id", "title", "genres", "overview", "sentiment", "director", "cast", "movieId"]

REQUEST_TIMEOUT  = 10   # seconds, per HTTP call
REQUEST_DELAY    = 0.25 # seconds between TMDB calls — stays well under rate limits
MAX_CAST_MEMBERS = 5    # how many top-billed cast members to store per movie


# ── Environment validation ───────────────────────────────────────────────────

def validate_environment():
    missing = []
    if not TMDB_API_KEY:
        missing.append("TMDB_API_KEY")
    if not MONGO_URI:
        missing.append("MONGO_URI")

    if missing:
        print("❌  Missing required environment variable(s): " + ", ".join(missing))
        print("    Set them before running, e.g.:")
        print("      export TMDB_API_KEY=your_key_here")
        print("      export MONGO_URI=your_mongo_uri_here")
        sys.exit(1)


# ── TMDB fetch helpers ────────────────────────────────────────────────────────

def fetch_genre_map() -> dict[int, str]:
    """
    Fetches TMDB's full genre id -> name mapping once at startup.

    This is REQUIRED before writing any genres to the CSV: the popular/
    top-rated list endpoints only return genre_ids (integers), not names,
    but tmdb_ml.csv stores genre NAMES (e.g. "['Action', 'Science Fiction']")
    because preprocess_tfidf.py's tokenizer merges genre names into tokens
    like 'sciencefiction'. Writing raw integer IDs into that column would
    silently corrupt the TF-IDF vocabulary for every imported movie.
    """
    print("🎭  Fetching TMDB genre id → name map …")
    resp = requests.get(
        TMDB_GENRE_LIST_URL,
        params={"api_key": TMDB_API_KEY, "language": "en-US"},
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    genres = resp.json().get("genres", [])
    genre_map = {g["id"]: g["name"] for g in genres}
    print(f"    Loaded {len(genre_map)} genres.")
    return genre_map


def fetch_popular_movies(pages: int) -> list[dict]:
    """
    Fetches `pages` pages (≈20 movies each) from TMDB's Popular endpoint.
    Returns the raw TMDB movie dicts, unmodified.
    """
    all_movies = []
    print(f"\n🎬  Fetching {pages} page(s) of Popular movies from TMDB …")

    for page in range(1, pages + 1):
        resp = requests.get(
            TMDB_DISCOVER_URL,
            params={"api_key": TMDB_API_KEY, "language": "en-US", "page": page},
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        all_movies.extend(results)
        print(f"    Page {page}: {len(results)} movies fetched.")
        time.sleep(REQUEST_DELAY)

    print(f"    Total fetched (pre-dedup): {len(all_movies)}")
    return all_movies


def fetch_credits(movie_id: int) -> tuple[str, list[str]]:
    """
    Fetches director (from the 'crew' list, job == 'Director') and the top
    MAX_CAST_MEMBERS billed cast members for a single movie.

    Returns
    -------
    director : str   ("" if no director found — e.g. documentaries)
    cast     : list[str]
    """
    try:
        resp = requests.get(
            TMDB_CREDITS_URL.format(movie_id=movie_id),
            params={"api_key": TMDB_API_KEY},
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()

        director = ""
        for crew_member in data.get("crew", []):
            if crew_member.get("job") == "Director":
                director = crew_member.get("name", "")
                break

        cast_list = [
            member.get("name", "")
            for member in data.get("cast", [])[:MAX_CAST_MEMBERS]
            if member.get("name")
        ]

        return director, cast_list

    except requests.RequestException as exc:
        print(f"    ⚠️  Credits fetch failed for movie_id={movie_id}: {exc}")
        return "", []


# ── Sentiment ─────────────────────────────────────────────────────────────────

def compute_sentiment(overview: str, analyzer: SentimentIntensityAnalyzer) -> float:
    """
    Computes the VADER compound sentiment score for a movie's overview text,
    matching exactly how sentiment is derived elsewhere in this pipeline
    (preprocess_tfidf.py buckets this same compound score into tone tokens).
    Returns 0.0 for empty/missing overviews rather than calling VADER on
    an empty string, which would otherwise return a meaningless neutral score
    that looks identical to a genuinely neutral movie.
    """
    if not overview or not overview.strip():
        return 0.0
    scores = analyzer.polarity_scores(overview)
    return float(scores["compound"])


# ── Data cleaning / mapping ──────────────────────────────────────────────────

def clean_movie_record(
    raw_movie: dict,
    genre_map: dict[int, str],
    director: str,
    cast: list[str],
    sentiment: float,
    movie_id: int,
) -> dict:
    """
    Maps a raw TMDB movie dict + enrichment data into the exact column
    structure tmdb_ml.csv expects. genres and cast are stored as Python-list
    literal strings (e.g. "['Action', 'Drama']") to match the existing CSV's
    format exactly, since downstream code (preprocess_tfidf.py, main.py)
    parses these columns with ast.literal_eval.
    """
    genre_names = [
        genre_map[gid] for gid in raw_movie.get("genre_ids", []) if gid in genre_map
    ]

    return {
        "id":        raw_movie.get("id"),
        "title":     raw_movie.get("title", "").strip(),
        "genres":    str(genre_names),
        "overview":  raw_movie.get("overview", "").strip(),
        "sentiment": sentiment,
        "director":  director,
        "cast":      str(cast),
        "movieId":   movie_id,
    }


# ── CSV handling ──────────────────────────────────────────────────────────────

def load_existing_csv() -> pd.DataFrame:
    """
    Loads the existing tmdb_ml.csv. Fails loudly if the file is missing or
    its columns don't match the expected schema — proceeding silently with
    a mismatched schema would corrupt every downstream script that reads
    this file.
    """
    if not os.path.exists(CSV_PATH):
        print(f"❌  {CSV_PATH} not found. This script only APPENDS to an")
        print("    existing catalog — it does not create one from scratch.")
        sys.exit(1)

    df = pd.read_csv(CSV_PATH)

    missing_cols = [c for c in CSV_COLUMNS if c not in df.columns]
    if missing_cols:
        print(f"❌  {CSV_PATH} is missing expected column(s): {missing_cols}")
        print(f"    Expected columns: {CSV_COLUMNS}")
        sys.exit(1)

    return df


def get_next_movie_id(df_existing: pd.DataFrame) -> int:
    """
    Returns the next safe movieId value: max existing movieId + 1.
    This guarantees no collision with any pre-existing row, regardless of
    whether movieId values are contiguous, since we never reuse or guess —
    we always start strictly above the current maximum.
    """
    if df_existing.empty or "movieId" not in df_existing.columns:
        return 0
    current_max = pd.to_numeric(df_existing["movieId"], errors="coerce").max()
    if pd.isna(current_max):
        return 0
    return int(current_max) + 1


def append_to_csv(new_rows: list[dict]) -> None:
    """
    Appends new_rows to tmdb_ml.csv using pandas, preserving the exact
    column order defined in CSV_COLUMNS. Writes back the FULL combined
    file rather than using raw file-append mode, so column order and
    quoting stay consistent even if the existing file had irregular
    formatting.
    """
    df_existing = load_existing_csv()
    df_new = pd.DataFrame(new_rows, columns=CSV_COLUMNS)

    df_combined = pd.concat([df_existing, df_new], ignore_index=True)
    df_combined = df_combined[CSV_COLUMNS]  # enforce column order defensively

    df_combined.to_csv(CSV_PATH, index=False, quoting=csv.QUOTE_MINIMAL)
    print(f"    Wrote {len(df_combined)} total rows to {CSV_PATH} "
          f"({len(new_rows)} new).")


# ── MongoDB ───────────────────────────────────────────────────────────────────

def upsert_to_mongo(movies: list[dict]) -> tuple[int, int]:
    """
    Bulk-upserts movies into cineiq.movies, matching on title (case-sensitive,
    matching the exact title string stored elsewhere in this codebase — both
    main.py's _poster_url lookup and the LightGCN watchlist titles are
    case-sensitive exact-string matches today, so upserting on a normalised
    lowercase key here would create a second, inconsistent identity scheme).

    Returns (matched_count, upserted_count).
    """
    print(f"\n🔌  Connecting to MongoDB Atlas …")
    client = MongoClient(MONGO_URI)
    db = client["cineiq"]
    collection = db["movies"]

    ops = [
        UpdateOne(
            {"title": movie["title"]},
            {"$set": movie},
            upsert=True,
        )
        for movie in movies
    ]

    if not ops:
        print("    No movies to upsert.")
        return 0, 0

    result = collection.bulk_write(ops, ordered=False)
    print(f"    Matched existing: {result.matched_count}")
    print(f"    Newly upserted  : {result.upserted_count}")
    return result.matched_count, result.upserted_count


# ── Main pipeline ──────────────────────────────────────────────────────────────

def run():
    validate_environment()

    print("=" * 70)
    print(f"  TMDB IMPORT — fetching {PAGES_TO_FETCH} page(s), local batch mode")
    print("=" * 70)

    # ── Load existing catalog for dedup + movieId safety ───────────────────────
    df_existing = load_existing_csv()
    existing_titles_lower = set(df_existing["title"].astype(str).str.lower().str.strip())
    next_movie_id = get_next_movie_id(df_existing)

    print(f"\n📂  Existing catalog: {len(df_existing)} movies "
          f"(next available movieId: {next_movie_id})")

    # ── Fetch ────────────────────────────────────────────────────────────────
    genre_map = fetch_genre_map()
    raw_movies = fetch_popular_movies(PAGES_TO_FETCH)

    analyzer = SentimentIntensityAnalyzer()

    new_rows: list[dict] = []
    mongo_records: list[dict] = []
    skipped_duplicates = 0
    skipped_no_title = 0

    print(f"\n🔧  Processing {len(raw_movies)} fetched movies …")

    for i, raw_movie in enumerate(raw_movies, start=1):
        title = (raw_movie.get("title") or "").strip()

        if not title:
            skipped_no_title += 1
            continue

        if title.lower() in existing_titles_lower:
            skipped_duplicates += 1
            continue

        tmdb_id = raw_movie.get("id")
        director, cast = fetch_credits(tmdb_id)
        time.sleep(REQUEST_DELAY)

        sentiment = compute_sentiment(raw_movie.get("overview", ""), analyzer)

        movie_id = next_movie_id
        next_movie_id += 1

        row = clean_movie_record(raw_movie, genre_map, director, cast, sentiment, movie_id)
        new_rows.append(row)

        # Mongo gets a slightly richer record than the CSV — includes
        # poster_path, vote_average, release_date directly from TMDB,
        # since main.py reads poster_path from Mongo, not from the CSV.
        mongo_records.append({
            "id":            tmdb_id,
            "title":         title,
            "genres":        row["genres"],
            "overview":      row["overview"],
            "sentiment":     sentiment,
            "director":      director,
            "cast":          row["cast"],
            "movieId":       movie_id,
            "vote_average":  raw_movie.get("vote_average"),
            "release_date":  raw_movie.get("release_date"),
            "poster_path":   raw_movie.get("poster_path", ""),
        })

        # Prevent a re-fetched duplicate within the SAME run if TMDB's
        # pagination ever returns the same movie twice across pages.
        existing_titles_lower.add(title.lower())

        if i % 10 == 0 or i == len(raw_movies):
            print(f"    … processed {i}/{len(raw_movies)}")

    # ── Report pre-write summary ────────────────────────────────────────────
    print(f"\n📊  Summary before writing:")
    print(f"    New movies to import : {len(new_rows)}")
    print(f"    Skipped (duplicate)  : {skipped_duplicates}")
    print(f"    Skipped (no title)   : {skipped_no_title}")

    if not new_rows:
        print("\n✅  Nothing new to import. Catalog already up to date.")
        return

    # ── Write CSV ────────────────────────────────────────────────────────────
    print(f"\n💾  Appending to {CSV_PATH} …")
    append_to_csv(new_rows)

    # ── Upsert MongoDB ───────────────────────────────────────────────────────
    matched, upserted = upsert_to_mongo(mongo_records)

    # ── Final report + re-trigger warnings ──────────────────────────────────
    print("\n" + "=" * 70)
    print(f"  ✅ IMPORT COMPLETE")
    print(f"     {len(new_rows)} new movies added to {CSV_PATH}")
    print(f"     {upserted} new documents upserted into MongoDB (cineiq.movies)")
    print(f"     {matched} existing documents matched (no change in this run)")
    print("=" * 70)

    print("\n⚠️   REQUIRED NEXT STEPS — the new movies have NO embeddings yet:")
    print("     1. python preprocess_tfidf.py")
    print("        → rebuilds the TF-IDF matrix so these movies are searchable")
    print("          via Engine A (content similarity).")
    print("     2. python train_lightgcn.py")
    print("        → will NOT give these movies graph coverage by itself,")
    print("          since LightGCN only learns embeddings for titles that")
    print("          appear in at least one user's watchlist. These new")
    print("          titles won't have graph coverage until generate_users.py")
    print("          (or real usage data) creates watchlist entries that")
    print("          reference them.")
    print("     3. git add backend/models/tmdb_ml.csv")
    print("        git commit -m 'Import N new movies from TMDB'")
    print("        git push")
    print("        → remember: MongoDB Atlas already has the new data live,")
    print("          but Engine A's matrix and the CSV itself only take effect")
    print("          once preprocess_tfidf.py is re-run AND the result is")
    print("          pushed/deployed to Render.")


if __name__ == "__main__":
    run()
