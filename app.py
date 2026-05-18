import streamlit as st
import pandas as pd
import numpy as np
import pickle
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.decomposition import TruncatedSVD
from scipy.sparse import csr_matrix
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from transformers import pipeline

st.set_page_config(page_title="CineIQ", page_icon="🎬", layout="wide")

# ── Load everything once ──────────────────────────────────────────
@st.cache_resource
def load_models():
    with open('models/tfidf.pkl', 'rb') as f:
        tfidf = pickle.load(f)

    tmdb_ml = pd.read_csv('models/tmdb_ml.csv')
    indices = pd.read_csv('models/indices_ml.csv', index_col=0).squeeze()

    # Recompute cosine sim at startup (fast — only 4800 movies)
    matrix = tfidf.transform(tmdb_ml['soup'] if 'soup' in tmdb_ml.columns else tmdb_ml['overview'].fillna(''))
    cosine_sim = cosine_similarity(matrix, matrix)

    vader = SentimentIntensityAnalyzer()
    transformer = pipeline(
        "sentiment-analysis",
        model="distilbert-base-uncased-finetuned-sst-2-english"
    )

    return tfidf, tmdb_ml, indices, cosine_sim, vader, transformer

tfidf, tmdb_ml, indices, cosine_sim, vader, transformer = load_models()

# ── Sentiment ─────────────────────────────────────────────────────
def hybrid_sentiment(text):
    text = str(text)
    vader_score = vader.polarity_scores(text)['compound']
    if len(text.split()) > 80 or abs(vader_score) < 0.2:
        try:
            result = transformer(text[:512])[0]
            score = result['score']
            return score if result['label'] == 'POSITIVE' else -score
        except:
            return vader_score
    return vader_score

# ── Recommender ───────────────────────────────────────────────────
def recommend(liked_title, n=10):
    if liked_title not in indices.index:
        return None

    idx = indices[liked_title]
    sim_scores = sorted(enumerate(cosine_sim[idx]), key=lambda x: x[1], reverse=True)[1:31]
    candidates = tmdb_ml.iloc[[i[0] for i in sim_scores]]

    results = []
    for _, row in candidates.iterrows():
        sentiment = row['sentiment'] if pd.notna(row.get('sentiment')) else 0
        content_score = cosine_sim[indices[liked_title]][row.name]
        sentiment_scaled = (sentiment + 1) * 2.5
        final = round(0.6 * content_score * 5 + 0.4 * sentiment_scaled, 2)

        sent_label = 'positive' if sentiment > 0.05 else 'negative' if sentiment < -0.05 else 'mixed'
        reason = f"Content match with '{liked_title}' · {sent_label} audience reception"

        results.append({
            'title': row['title'],
            'score': final,
            'sentiment': round(sentiment, 3),
            'reason': reason,
            'overview': row.get('overview', '')
        })

    return pd.DataFrame(sorted(results, key=lambda x: x['score'], reverse=True)[:n])

# ── UI ────────────────────────────────────────────────────────────
st.title("🎬 CineIQ")
st.caption("Explainable movie recommendations powered by ML")

tab1, tab2 = st.tabs(["Recommendations", "Sentiment Analysis"])

with tab1:
    liked = st.text_input("Movie you liked", placeholder="e.g. Interstellar")
    if st.button("Recommend", type="primary"):
        if liked:
            with st.spinner("Finding your matches..."):
                results = recommend(liked)
            if results is None:
                st.error("Movie not found. Try another title.")
            else:
                for _, row in results.iterrows():
                    with st.expander(f"**{row['title']}** — {row['score']}★"):
                        st.write(row['reason'])
                        st.caption(row['overview'])
        else:
            st.warning("Please enter a movie title.")

with tab2:
    review = st.text_area("Paste a movie review", height=150)
    if st.button("Analyse Sentiment", type="primary"):
        if review:
            with st.spinner("Analysing..."):
                score = hybrid_sentiment(review)
            label = "POSITIVE 😊" if score > 0.05 else "NEGATIVE 😞" if score < -0.05 else "MIXED 😐"
            col1, col2 = st.columns(2)
            col1.metric("Sentiment", label)
            col2.metric("Score", round(score, 3))
            st.progress((score + 1) / 2)
        else:
            st.warning("Please paste a review.")