from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import numpy as np
import pickle
from sklearn.metrics.pairwise import cosine_similarity
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from transformers import pipeline

app = FastAPI(title="CineIQ API")

# Allow frontend to communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Load everything once at startup ──────────────────────────────────────────
with open('models/tfidf.pkl', 'rb') as f:
    tfidf = pickle.load(f)
tmdb_ml = pd.read_csv('models/tmdb_ml.csv')
indices = pd.read_csv('models/indices_ml.csv', index_col=0).squeeze()

matrix = tfidf.transform(tmdb_ml['soup'] if 'soup' in tmdb_ml.columns else tmdb_ml['overview'].fillna(''))
cosine_sim = cosine_similarity(matrix, matrix)

vader = SentimentIntensityAnalyzer()
transformer = pipeline("sentiment-analysis", model="distilbert-base-uncased-finetuned-sst-2-english")

# ── Pydantic Models for Data Validation ──────────────────────────────────
class MovieRequest(BaseModel):
    title: str

class ReviewRequest(BaseModel):
    review: str

# ── Endpoints ────────────────────────────────────────────────────────────
@app.post("/recommend")
def recommend_movies(req: MovieRequest, n: int = 10):
    if req.title not in indices.index:
        raise HTTPException(status_code=404, detail="Movie not found. Try another title.")

    idx = indices[req.title]
    sim_scores = sorted(enumerate(cosine_sim[idx]), key=lambda x: x[1], reverse=True)[1:31]
    candidates = tmdb_ml.iloc[[i[0] for i in sim_scores]]

    results = []
    for _, row in candidates.iterrows():
        sentiment = row['sentiment'] if pd.notna(row.get('sentiment')) else 0
        content_score = cosine_sim[indices[req.title]][row.name]
        sentiment_scaled = (sentiment + 1) * 2.5
        final = round(0.6 * content_score * 5 + 0.4 * sentiment_scaled, 2)

        sent_label = 'positive' if sentiment > 0.05 else 'negative' if sentiment < -0.05 else 'mixed'
        reason = f"Content match with '{req.title}' · {sent_label} audience reception"

        results.append({
            'title': row['title'],
            'score': final,
            'sentiment': round(sentiment, 3),
            'reason': reason,
            'overview': row.get('overview', '')
        })

    final_results = sorted(results, key=lambda x: x['score'], reverse=True)[:n]
    return {"recommendations": final_results}