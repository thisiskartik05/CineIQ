"""
migrate.py
──────────────────────────────────────────────────────────────────────────────
Uploads tmdb_ml.csv to MongoDB Atlas (cineiq.movies collection) and enriches
every document with a `poster_path` field fetched from the TMDB API.

Without poster_path, main.py's _poster_url() always falls back to the
placeholder image — this script is what makes real posters show in the UI.

Run order (once, from the backend/ directory):
  1. python migrate.py              ← this file
  2. python generate_users.py
  3. python preprocess_tfidf.py
  4. python train_lightgcn.py
  5. uvicorn main:app --reload

Prerequisites:
  • pip install -r requirements.txt
  • Set TMDB_API_KEY below (free key from https://www.themoviedb.org/settings/api)
    OR export it as an environment variable: TMDB_API_KEY=your_key_here
──────────────────────────────────────────────────────────────────────────────
"""

import os
import time
import pandas as pd
import requests
from pymongo import MongoClient, UpdateOne

# ── Config ────────────────────────────────────────────────────────────────────
MONGO_URI   = "mongodb+srv://admin:12345@shared-canvas.vwgpbwe.mongodb.net/cineiq?retryWrites=true&w=majority"
TMDB_API_KEY = os.environ.get("TMDB_API_KEY", "3b68e72146bbd3b09e250fc63288613d")  
TMDB_SEARCH  = "https://api.themoviedb.org/3/search/movie"
BATCH_SIZE   = 100     # MongoDB bulk-write batch size
TMDB_DELAY   = 0.05    # seconds between TMDB requests (rate-limit safe at 20 rps)


# ── TMDB poster fetcher ───────────────────────────────────────────────────────

def fetch_poster_path(title: str, year: str | None = None) -> str | None:
    """
    Query TMDB search API for a movie by title and return the poster_path string.
    Returns None if not found or if no API key is configured.
    """
    if not TMDB_API_KEY:
        return None

    params: dict = {
        "api_key":       TMDB_API_KEY,
        "query":         title,
        "include_adult": "false",
        "language":      "en-US",
        "page":          1,
    }
    if year:
        params["year"] = year

    try:
        resp = requests.get(TMDB_SEARCH, params=params, timeout=8)
        resp.raise_for_status()
        results = resp.json().get("results", [])
        if results:
            return results[0].get("poster_path")   # e.g. "/xyz123.jpg"
    except requests.RequestException:
        pass

    return None


# ── Main migration ────────────────────────────────────────────────────────────

def migrate_data():
    # ── Connect ───────────────────────────────────────────────────────────────
    print("🔌  Connecting to MongoDB Atlas …")
    client = MongoClient(MONGO_URI)
    db     = client["cineiq"]
    movies = db["movies"]

    # ── Load CSV ──────────────────────────────────────────────────────────────
    print("📂  Reading models/tmdb_ml.csv …")
    df = pd.read_csv("models/tmdb_ml.csv")
    df = df.where(pd.notnull(df), None)        # replace NaN with None (BSON-safe)
    print(f"    {len(df):,} movies loaded.")

    # ── Clear + insert base records ───────────────────────────────────────────
    print("🗑️   Clearing existing collection …")
    movies.delete_many({})

    records = df.to_dict(orient="records")
    print(f"⬆️   Inserting {len(records):,} base records …")
    movies.insert_many(records)
    print("    Base insert complete.")

    # ── Enrich with TMDB poster paths ─────────────────────────────────────────
    if not TMDB_API_KEY:
        print("\n⚠️   TMDB_API_KEY not set — skipping poster enrichment.")
        print("    Set the env var or edit TMDB_API_KEY in this file, then re-run.")
        print("    Without posters, the frontend falls back to placeholder images.")
    else:
        print(f"\n🎬  Fetching poster_path from TMDB for {len(df):,} titles …")
        print("    (This takes ~3–4 min for 4,000+ movies; TMDB free tier: 40 req/s)\n")

        bulk_ops: list[UpdateOne] = []
        found = 0
        missing = 0

        for i, row in df.iterrows():
            title = row["title"]
            # tmdb_ml.csv doesn't have a release_year column, so we skip year hint
            poster = fetch_poster_path(title)
            time.sleep(TMDB_DELAY)

            if poster:
                found += 1
            else:
                missing += 1

            bulk_ops.append(
                UpdateOne(
                    {"title": title},
                    {"$set": {"poster_path": poster or ""}},
                )
            )

            # Flush every BATCH_SIZE ops
            if len(bulk_ops) >= BATCH_SIZE:
                movies.bulk_write(bulk_ops, ordered=False)
                bulk_ops.clear()
                print(f"    … {i+1:>4}/{len(df)}  posters found: {found}  missing: {missing}")

        # Final flush
        if bulk_ops:
            movies.bulk_write(bulk_ops, ordered=False)

        print(f"\n    ✅ Poster enrichment done.")
        print(f"    Posters found : {found:,}")
        print(f"    No poster     : {missing:,}")

    # ── Create indexes for fast lookup ────────────────────────────────────────
    print("\n🗂️   Creating MongoDB indexes …")
    movies.create_index("title",    unique=False)
    movies.create_index("movieId",  unique=False)
    print("    Indexes created on `title` and `movieId`.")

    print("\n✅  Migration complete. Next step: python generate_users.py")


if __name__ == "__main__":
    migrate_data()
