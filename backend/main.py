from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import numpy as np
import pickle
import math
import gc
from sklearn.metrics.pairwise import cosine_similarity
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from transformers import pipeline
from motor.motor_asyncio import AsyncIOMotorClient

app = FastAPI(title="CineIQ API")

# Allow frontend to communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── MongoDB Setup ────────────────────────────────────────────────────────
# Put your ACTUAL connection string here before running!
MONGO_URI = "mongodb+srv://admin:<password>@shared-canvas.vwgpbwe.mongodb.net/cineiq?retryWrites=true&w=majority"
client = AsyncIOMotorClient(MONGO_URI)
db = client.cineiq
movies_collection = db.movies

# ── Load ML Models at Startup ────────────────────────────────────────────
print("Loading ML models into memory...")
with open('models/tfidf.pkl', 'rb') as f:
    tfidf = pickle.load(f)

# Load indices to map Title -> Matrix Index
indices = pd.read_csv('models/indices_ml.csv', index_col=0).squeeze()
# Create a reverse lookup (Matrix Index -> Title) for our DB queries later
index_to_title = {v: k for k, v in indices.items()}

# ONLY load the text needed to build the matrix to save massive RAM!
try:
    tmdb_ml = pd.read_csv('models/tmdb_ml.csv', usecols=['soup'])
    text_data = tmdb_ml['soup']
except ValueError:
    tmdb_ml = pd.read_csv('models/tmdb_ml.csv', usecols=['overview'])
    text_data = tmdb_ml['overview'].fillna('')

print("Building Cosine Similarity Matrix...")
matrix = tfidf.transform(text_data)
cosine_sim = cosine_similarity(matrix, matrix)

# ── MEMORY OPTIMIZATION ──────────────────────────────────────────────────
# The matrix is built. We no longer need the Pandas DataFrame!
del tmdb_ml
del text_data
gc.collect() # Force Python to free up the RAM immediately
print("DataFrame deleted from RAM. Matrix ready.")

vader = SentimentIntensityAnalyzer()
transformer = pipeline("sentiment-analysis", model="distilbert-base-uncased-finetuned-sst-2-english")

# ── Pydantic Models ──────────────────────────────────────────────────────
class MovieRequest(BaseModel):
    title: str

class ReviewRequest(BaseModel):
    review: str

# ── Endpoints ────────────────────────────────────────────────────────────
@app.post("/recommend")
async def recommend_movies(req: MovieRequest, n: int = 10):
    if req.title not in indices.index:
        raise HTTPException(status_code=404, detail="Movie not found. Try another title.")

    # 1. Do the heavy math purely in memory
    idx = indices[req.title]
    # Handle duplicate titles if any exist by taking the first one
    if isinstance(idx, pd.Series): idx = idx.iloc[0] 
    
    sim_scores = sorted(enumerate(cosine_sim[idx]), key=lambda x: x[1], reverse=True)[1:31]
    
    # Extract the indices and scores
    candidate_indices = [i[0] for i in sim_scores]
    candidate_scores = {i[0]: i[1] for i in sim_scores} # Map index -> similarity score
    candidate_titles = [index_to_title[i] for i in candidate_indices]

    # 2. Async Query to MongoDB (Fetch rich metadata ONLY for the 30 candidates)
    cursor = movies_collection.find({"title": {"$in": candidate_titles}})
    movies_from_db = await cursor.to_list(length=30)

    # 3. Apply Sentiment Math and Format Results
    results = []
    for movie in movies_from_db:
        title = movie.get('title')
        movie_idx = indices[title]
        if isinstance(movie_idx, pd.Series): movie_idx = movie_idx.iloc[0]
        
        content_score = candidate_scores.get(movie_idx, 0)

        # Handle sentiment value safely
        sentiment = movie.get('sentiment', 0)
        if sentiment is None or math.isnan(sentiment):
            sentiment = 0

        sentiment_scaled = (sentiment + 1) * 2.5
        final = round(0.6 * content_score * 5 + 0.4 * sentiment_scaled, 2)

        sent_label = 'positive' if sentiment > 0.05 else 'negative' if sentiment < -0.05 else 'mixed'
        reason = f"Content match with '{req.title}' · {sent_label} audience reception"

        results.append({
            'title': title,
            'score': final,
            'sentiment': round(sentiment, 3),
            'reason': reason,
            'overview': movie.get('overview', '')
        })

    # Sort results by the final computed score
    final_results = sorted(results, key=lambda x: x['score'], reverse=True)[:n]
    return {"recommendations": final_results}