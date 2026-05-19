# 🎬 CineIQ

## A Hybrid Explainable Movie Recommendation and Review Analysis System

CineIQ is a hybrid recommendation engine that combines:

- Content-Based Filtering
- Collaborative Filtering
- Contextual Sentiment Analysis
- Explainable Recommendations
- Adaptive User Weighting

into a unified cinematic intelligence system.

Unlike traditional movie recommenders that rely solely on similarity or ratings, CineIQ attempts to understand:
- semantic structure of films,
- behavioral viewing patterns,
- emotional tone,
- and user-specific recommendation dynamics.

---

# 🚀 Features

## 🎞 Hybrid Recommendation Engine

CineIQ combines:
- TF-IDF semantic similarity
- SVD-based collaborative filtering
- sentiment-aware ranking

to generate recommendations.

---

## 🧠 Explainable Recommendations

Recommendations are not black boxes.

Each recommendation includes interpretable reasoning such as:

> “Strong thematic similarity · predicted 4.5★ · dark emotional tone”

---

## ✍️ Hybrid Sentiment Analysis

CineIQ uses:
- **VADER** for lightweight/simple reviews
- **DistilBERT Transformers** for nuanced literary reviews

This allows the system to better interpret emotionally layered film criticism.

---

## 👤 Adaptive User Weighting

The recommendation ensemble dynamically adjusts based on:
- user activity,
- recommendation confidence,
- cold-start conditions.

---

## 🌐 Deployed Application

Hosted using:
- **HuggingFace Spaces**
- **Streamlit**
- **GitHub**

---

# 🧮 Mathematical Foundations

## TF-IDF Vectorization

Movies are transformed into vector-space representations using:

\[
TFIDF(t,d,D)=TF(t,d)\times IDF(t,D)
\]

---

## Cosine Similarity

Semantic similarity is computed through:

\[
\cos(\theta)=
\frac{A\cdot B}{||A||||B||}
\]

---

## Matrix Factorization

Collaborative filtering uses Singular Value Decomposition:

\[
R \approx U\Sigma V^T
\]

where:
- \(U\) = user latent vectors
- \(V\) = movie latent vectors

---

## Adaptive Ensemble Ranking

Final recommendations are computed as:

\[
\text{Final Score}
=
w_cC + w_sS + w_tT
\]

where:
- \(C\) = collaborative score
- \(S\) = semantic similarity
- \(T\) = sentiment score

---

# 🛠 Tech Stack

| Technology | Purpose |
|---|---|
| Pandas | Data manipulation |
| NumPy | Numerical computation |
| SciPy | Sparse matrix factorization |
| Scikit-learn | TF-IDF and similarity |
| Transformers | Contextual NLP |
| VADER | Lightweight sentiment analysis |
| Streamlit | Frontend UI |
| HuggingFace Spaces | Deployment |
| GitHub | Version control |

---

# 📂 Dataset Sources

## TMDB 5000 Dataset
Used for:
- movie metadata
- genres
- keywords
- cast
- crew
- overviews

## MovieLens 20M Dataset
Used for:
- user ratings
- collaborative filtering
- interaction matrices

---

# ⚠️ Engineering Challenges Faced

## 1. NumPy 2.x Compatibility Issues

Initial collaborative filtering implementation using `scikit-surprise` failed due to binary incompatibility with NumPy 2.x.

### Solution
Migrated to:
- `scipy.sparse`
- `scipy.sparse.linalg.svds`

---

## 2. Sentiment Misclassification

VADER failed on nuanced literary reviews.

### Example
Emotionally reflective reviews involving:
- grief
- silence
- tragedy
- introspection

were incorrectly classified as negative.

### Solution
Integrated transformer-based contextual sentiment analysis.

---

## 3. Deployment Constraints

Large precomputed matrices exceeded GitHub upload limits.

### Solution
- simplified deployment architecture
- dynamic recomputation
- HuggingFace Spaces hosting

---

# 🌍 Why HuggingFace Instead of GitHub Pages?

GitHub Pages only supports static websites.

CineIQ requires:
- Python execution
- Streamlit runtime
- transformer inference
- model loading
- NumPy computation

HuggingFace Spaces provides:
- native ML hosting
- Streamlit compatibility
- free cloud deployment

---

# 📸 Future Improvements

Planned upgrades include:
- transformer embeddings for recommendation
- ANN search
- real-time collaborative updates
- emotion classification
- cinematic theme extraction
- reinforcement recommendation systems

---

# 💡 Philosophy Behind CineIQ

CineIQ was designed not merely as a recommendation engine, but as an attempt to computationally model:

- cinematic taste,
- emotional interpretation,
- semantic storytelling,
- and audience behavior.

The project evolved through multiple architectural redesigns, failures, fallbacks and optimizations — eventually becoming a hybrid cinematic intelligence framework.

---

# 👨‍💻 Author

**Kartik Khare**  
Engineering Physics  
Indian Institute of Technology Guwahati

---

# ❤️

Built with equal parts:
- linear algebra,
- cinema,
- debugging,
- and emotional damage.
