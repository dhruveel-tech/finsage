# FinSage — AI Financial Advisor

Full-stack AI financial advisor with Next.js frontend, FastAPI backend, and MongoDB.

## Project Structure

```
finsage/
├── backend/          ← FastAPI + MongoDB + NVIDIA AI agent
└── frontend/         ← Next.js 14 + Tailwind + Recharts
```

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- MongoDB (local or Atlas)
- NVIDIA API key → https://build.nvidia.com

---

## Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate        # Mac/Linux
# venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your keys:
#   NVIDIA_API_KEY=nvapi-xxxx
#   MONGODB_URI=mongodb://localhost:27017
#   MONGODB_DB=finsage

# Start the server
uvicorn main:app --reload --port 8000
```

Backend runs at: http://localhost:8000
API docs at:     http://localhost:8000/docs

---

## Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Frontend runs at: http://localhost:3000

---

## MongoDB Setup

### Option A — Local MongoDB
```bash
# Install MongoDB Community: https://www.mongodb.com/try/download/community
# Start MongoDB:
mongod --dbpath /data/db
```

### Option B — MongoDB Atlas (Free Cloud)
1. Go to https://cloud.mongodb.com → Create free cluster
2. Get connection string → paste into MONGODB_URI in .env
   Example: mongodb+srv://user:pass@cluster.mongodb.net/finsage

---

## MongoDB Collections (auto-created on first use)

| Collection    | What's stored                        |
|---------------|--------------------------------------|
| chat_history  | Every user query + AI response       |
| market_cache  | Yahoo Finance data (5-min TTL)       |
| portfolio     | User stock holdings                  |
| expenses      | User transactions                    |

---

## API Endpoints

### Chat
- POST /api/chat              — Send message to AI agent
- GET  /api/chat/history/{id} — Get conversation history
- GET  /api/chat/sessions     — List recent sessions

### Portfolio
- GET  /api/portfolio         — Get portfolio
- GET  /api/portfolio/live    — Portfolio with live prices
- POST /api/portfolio/holding — Add holding
- DELETE /api/portfolio/holding/{ticker} — Remove holding

### Expenses
- GET  /api/expenses          — List all expenses
- POST /api/expenses          — Add expense
- GET  /api/expenses/summary  — Budget + savings analysis

### Market
- GET  /api/market/quote/{ticker} — Live quote + RSI + chart data
- GET  /api/market/cache          — All cached market data

---

## Supported Ticker Formats

| Market        | Format Example       |
|---------------|----------------------|
| US stocks     | AAPL, MSFT, TSLA     |
| NSE (India)   | TCS.NS, RELIANCE.NS  |
| BSE (India)   | TCS.BO, WIPRO.BO     |
| Crypto        | BTC-USD, ETH-USD     |
| UK stocks     | HSBA.L, BP.L         |
| German stocks | SAP.DE, BMW.DE       |

---

## NVIDIA Model

Default model: `meta/llama-3.3-70b-instruct`

To change, edit `backend/app/agent/agent.py`:
```python
MODEL = "meta/llama-3.3-70b-instruct"  # change this
```

List available models:
```python
from openai import OpenAI
client = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key="YOUR_KEY")
for m in client.models.list().data:
    print(m.id)
```

---

## Pages

| Page       | URL        | Description                    |
|------------|------------|--------------------------------|
| AI Advisor | /          | Chat with FinSage AI agent     |
| Portfolio  | /portfolio | Holdings + live P&L + chart    |
| Expenses   | /expenses  | Spending analysis + budgets    |
| Market     | /market    | Search any stock globally      |
