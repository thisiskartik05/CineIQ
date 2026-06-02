from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import torch
import pickle
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
from pymongo import MongoClient

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 1. DATABASE SETUP ---
# REPLACE [PASSWORD] WITH YOUR ACTUAL ATLAS PASSWORD
MONGO_URI = "mongodb+srv://admin:12345@shared-canvas.vwgpbwe.mongodb.net/cineiq?retryWrites=true&w=majority"
client = MongoClient(MONGO_URI)
db = client.cineiq

# --- 2. LOAD ENGINE A: TF-IDF (Content-Based) ---
print("Loading Engine A: TF-IDF Content Matcher...")
try:
    with open('models/tfidf.pkl', 'rb') as f:
        tfidf_matrix = pickle.load(f)
    tmdb_df = pd.read_csv('models/tmdb_ml.csv')
    indices_df = pd.read_csv('models/indices_ml.csv')
    
    # Create mapping for content engine
    content_indices = pd.Series(indices_df.index, index=indices_df['title'].str.lower()).drop_duplicates()
    print("✅ Engine A Loaded!")
except Exception as e:
    print(f"❌ Failed to load TF-IDF: {e}")

# --- 3. LOAD ENGINE B: LightGCN (Collaborative Graph) ---
print("Loading Engine B: LightGCN Graph Neural Network...")
try:
    with open("models/lightgcn_embeddings.pkl", "rb") as f:
        graph_data = pickle.load(f)
        
    movie_embeddings = torch.tensor(graph_data['movie_embeddings'])
    title_to_idx = graph_data['title_to_idx']
    idx_to_title = graph_data['idx_to_title']
    
    # Create mapping for graph engine
    graph_lower_to_idx = {title.lower(): idx for title, idx in title_to_idx.items()}
    print("✅ Engine B Loaded!")
except Exception as e:
    print(f"❌ Failed to load LightGCN: {e}")


# --- ENDPOINT A: CONTENT MATCH (Old Logic) ---
@app.get("/api/recommend/content/{search_query}")
async def get_content_recommendations(search_query: str, top_k: int = 5):
    query_lower = search_query.lower().strip()
    
    if query_lower not in content_indices:
        raise HTTPException(status_code=404, detail="Movie not found in content database.")
        
    idx = content_indices[query_lower]
    
    # If a movie has multiple entries, grab the first one
    if isinstance(idx, pd.Series):
        idx = idx.iloc[0]
        
    # Cosine Similarity Math
    sim_scores = list(enumerate(cosine_similarity(tfidf_matrix[idx], tfidf_matrix)[0]))
    sim_scores = sorted(sim_scores, key=lambda x: x[1], reverse=True)
    sim_scores = sim_scores[1:top_k+1] # Skip the movie itself
    
    movie_indices = [i[0] for i in sim_scores]
    raw_scores = [i[1] for i in sim_scores]
    
    recommendations = []
    for i, m_idx in enumerate(movie_indices):
        title = tmdb_df.iloc[m_idx]['title']
        score = int(raw_scores[i] * 100)
        
        db_movie = db.movies.find_one({"title": title})
        poster = db_movie.get("poster_path", "https://via.placeholder.com/500x750") if db_movie else "https://via.placeholder.com/500x750"
        if poster.startswith("/"): poster = f"https://image.tmdb.org/t/p/w500{poster}"
            
        recommendations.append({
            "id": int(m_idx), "title": title, "score": score, 
            "reason": "Plot/Genre Match", "poster": poster
        })
        
    return {"results": recommendations}


# --- ENDPOINT B: GRAPH MATCH (New Logic) ---
@app.get("/api/recommend/graph/{search_query}")
async def get_graph_recommendations(search_query: str, top_k: int = 5):
    query_lower = search_query.lower().strip()
    
    if query_lower not in graph_lower_to_idx:
        raise HTTPException(status_code=404, detail="Movie not found in graph database.")
        
    target_idx = graph_lower_to_idx[query_lower]
    target_vector = movie_embeddings[target_idx]
    
    # Dot Product Math
    scores = torch.matmul(movie_embeddings, target_vector)
    top_scores, top_indices = torch.topk(scores, top_k + 1)
    
    recommendations = []
    for i in range(len(top_indices)):
        m_idx = top_indices[i].item()
        if m_idx == target_idx: continue
            
        title = idx_to_title[m_idx]
        raw_score = top_scores[i].item()
        match_percentage = min(99, max(75, int(raw_score * 10) + 70)) 
        
        db_movie = db.movies.find_one({"title": title})
        poster = db_movie.get("poster_path", "https://via.placeholder.com/500x750") if db_movie else "https://via.placeholder.com/500x750"
        if poster.startswith("/"): poster = f"https://image.tmdb.org/t/p/w500{poster}"
            
        recommendations.append({
            "id": m_idx, "title": title, "score": match_percentage, 
            "reason": "Audience Behavior Match", "poster": poster
        })
        if len(recommendations) == top_k: break
            
    return {"results": recommendations}