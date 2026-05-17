import streamlit as st
import pandas as pd
import numpy as np
import pickle

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from transformers import pipeline

# =========================================================
# PAGE CONFIG
# =========================================================

st.set_page_config(
    page_title="CineIQ",
    page_icon="🎬",
    layout="wide"
)

# =========================================================
# LOAD MODELS + DATA
# =========================================================

@st.cache_resource
def load_data():

    tmdb = pd.read_csv('models/tmdb_ml.csv')

    indices = pd.read_csv(
        'models/indices_ml.csv',
        index_col=0
    ).squeeze()

    cosine_sim = np.load(
        'models/cosine_sim_ml.npy'
    )

    with open(
        'models/predicted_df.pkl',
        'rb'
    ) as f:

        predicted_df = pickle.load(f)

    return (
        tmdb,
        indices,
        cosine_sim,
        predicted_df
    )

tmdb, indices, cosine_sim, predicted_df = load_data()

# =========================================================
# LOAD SENTIMENT MODELS
# =========================================================

@st.cache_resource
def load_sentiment_models():

    vader = SentimentIntensityAnalyzer()

    transformer = pipeline(
        "sentiment-analysis",
        model="distilbert-base-uncased-finetuned-sst-2-english"
    )

    return vader, transformer

vader, transformer = load_sentiment_models()

# =========================================================
# SVD PREDICTION
# =========================================================

def svd_predict(user_id, movie_id):

    if user_id not in predicted_df.index:
        return 3.0

    if movie_id not in predicted_df.columns:
        return 3.0

    score = predicted_df.loc[user_id, movie_id]

    return float(np.clip(score, 1.0, 5.0))

# =========================================================
# HYBRID SENTIMENT
# =========================================================

def hybrid_sentiment(text):

    text = str(text)

    vader_score = vader.polarity_scores(
        text
    )['compound']

    needs_transformer = (

        len(text.split()) > 80 or

        abs(vader_score) < 0.2

    )

    if needs_transformer:

        try:

            result = transformer(
                text[:512]
            )[0]

            score = result['score']

            if result['label'] == 'POSITIVE':
                return score

            return -score

        except:
            return vader_score

    return vader_score

# =========================================================
# USER-ADAPTIVE WEIGHTS
# =========================================================

def get_user_weights(user_id):

    # placeholder logic
    # can improve later

    if user_id < 10:

        return 0.75, 0.15, 0.10

    elif user_id < 50:

        return 0.60, 0.25, 0.15

    else:

        return 0.40, 0.40, 0.20

# =========================================================
# RECOMMENDATION ENGINE
# =========================================================

def recommend_movies(
    user_id,
    liked_title,
    n=10
):

    if liked_title not in indices:
        return None

    idx = indices[liked_title]

    sim_scores = list(
        enumerate(cosine_sim[idx])
    )

    sim_scores = sorted(
        sim_scores,
        key=lambda x: x[1],
        reverse=True
    )[1:31]

    movie_indices = [
        i[0]
        for i in sim_scores
    ]

    candidates = tmdb.iloc[movie_indices]

    collab_w, content_w, sentiment_w = (
        get_user_weights(user_id)
    )

    results = []

    for _, row in candidates.iterrows():

        try:

            movie_id = row['movieId']

            # collaborative
            collab_score = svd_predict(
                user_id,
                movie_id
            )

            # content
            content_score = cosine_sim[
                idx
            ][row.name]

            content_scaled = (
                content_score * 5
            )

            # sentiment
            sent = row['sentiment']

            if pd.isna(sent):
                sent = 0

            sent_scaled = (
                sent + 1
            ) * 2.5

            # ensemble
            final_score = (

                collab_w * collab_score +

                content_w * content_scaled +

                sentiment_w * sent_scaled

            )

            # emotional tone
            if sent > 0.2:
                tone = "Positive"

            elif sent < -0.2:
                tone = "Dark / Intense"

            else:
                tone = "Mixed"

            reason = (

                f"Strong thematic similarity "
                f"· predicted {collab_score:.1f}★ "
                f"· {tone} emotional tone"

            )

            results.append({

                'title': row['title'],

                'director': row['director'],

                'overview': row['overview'],

                'score': round(
                    final_score,
                    2
                ),

                'reason': reason
            })

        except:
            continue

    results = sorted(
        results,
        key=lambda x: x['score'],
        reverse=True
    )

    return results[:n]

# =========================================================
# UI
# =========================================================

st.title("🎬 CineIQ")

st.caption(
    "Hybrid movie recommendation and review analysis engine"
)

tab1, tab2 = st.tabs([
    "Recommendations",
    "Review Analysis"
])

# =========================================================
# TAB 1 — RECOMMENDATIONS
# =========================================================

with tab1:

    st.subheader(
        "Find Movies You'll Love"
    )

    movie_input = st.text_input(
        "Movie you liked",
        "Fight Club"
    )

    user_id = st.number_input(
        "User ID",
        min_value=1,
        value=1
    )

    num_recs = st.slider(
        "Number of recommendations",
        5,
        15,
        10
    )

    if st.button("Recommend"):

        results = recommend_movies(
            user_id,
            movie_input,
            num_recs
        )

        if results is None:

            st.error(
                "Movie not found"
            )

        else:

            for movie in results:

                with st.expander(
                    f"{movie['title']}  ·  {movie['score']}★"
                ):

                    st.write(
                        f"Director: {movie['director']}"
                    )

                    st.write(
                        movie['overview']
                    )

                    st.info(
                        movie['reason']
                    )

# =========================================================
# TAB 2 — REVIEW ANALYSIS
# =========================================================

with tab2:

    st.subheader(
        "Analyse Your Review"
    )

    review = st.text_area(
        "Paste your review here"
    )

    if st.button("Analyse Review"):

        if review.strip() == "":

            st.warning(
                "Please enter a review."
            )

        else:

            score = hybrid_sentiment(review)

            if score > 0.2:
                label = "Positive"

            elif score < -0.2:
                label = "Negative"

            else:
                label = "Mixed / Reflective"

            st.metric(
                "Sentiment Score",
                round(score, 3)
            )

            st.success(
                f"Detected tone: {label}"
            )

            st.progress(
                min(
                    max(
                        (score + 1) / 2,
                        0
                    ),
                    1
                )
            )

            st.write("### Interpretation")

            if label == "Positive":

                st.write(
                    "The review expresses admiration, appreciation or emotional resonance."
                )

            elif label == "Negative":

                st.write(
                    "The review conveys criticism, disappointment or emotional negativity."
                )

            else:

                st.write(
                    "The review is nuanced, reflective or emotionally layered."
                )