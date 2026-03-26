"""
MongoDB connection and collection helpers.
Collections:
  - chat_history      : every user query + agent response
  - market_cache      : Yahoo Finance data cached to avoid repeated fetches
  - portfolio         : user holdings
  - expenses          : user transactions
  - users             : user accounts + income
  - category_master   : default categories visible to ALL users (seeded once on startup)
  - user_categories   : custom categories created by individual users
  - user_budgets      : per-user budget amount for each category slug
"""

import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from datetime import datetime, timezone

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DB  = os.getenv("MONGODB_DB", "finsage")

_client: AsyncIOMotorClient = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(MONGODB_URI)
    return _client


def get_db():
    return get_client()[MONGODB_DB]


# ── Collection helpers ────────────────────────────────────────────────────

def chat_col():
    return get_db()["chat_history"]

def market_col():
    return get_db()["market_cache"]

def portfolio_col():
    return get_db()["portfolio"]

def expenses_col():
    return get_db()["expenses"]

def users_col():
    return get_db()["users"]

def stocks_col():
    return get_db()["stocks_catalog"]

def category_master_col():
    """Master categories — common for all users, seeded once on startup."""
    return get_db()["category_master"]

def user_categories_col():
    """Custom categories created by individual users."""
    return get_db()["user_categories"]

def user_budgets_col():
    """Per-user budget amounts. One doc per user containing budgets map."""
    return get_db()["user_budgets"]

def user_watchlist_col():
    """Per-user watchlist. Each doc: { user_id, ticker, yf_symbol, name, exchange, added_at }"""
    return get_db()["user_watchlist"]


# ── Master category seed ──────────────────────────────────────────────────

MASTER_CATEGORIES = [
    {"slug": "food_dining",   "label": "Food & Dining",  "icon": "🍽️",  "is_master": True},
    {"slug": "transport",     "label": "Transport",      "icon": "🚗",   "is_master": True},
    {"slug": "shopping",      "label": "Shopping",       "icon": "🛍️",  "is_master": True},
    {"slug": "subscriptions", "label": "Subscriptions",  "icon": "📱",   "is_master": True},
    {"slug": "rent_housing",  "label": "Rent & Housing", "icon": "🏠",   "is_master": True},
    {"slug": "utilities",     "label": "Utilities",      "icon": "💡",   "is_master": True},
    {"slug": "entertainment", "label": "Entertainment",  "icon": "🎬",   "is_master": True},
    {"slug": "healthcare",    "label": "Healthcare",     "icon": "🏥",   "is_master": True},
    {"slug": "education",     "label": "Education",      "icon": "📚",   "is_master": True},
    {"slug": "other",         "label": "Other",          "icon": "📦",   "is_master": True},
]


async def seed_master_categories():
    """
    Called once on app startup.
    Inserts master categories if they don't already exist (upsert by slug).
    Safe to call multiple times — never overwrites existing docs.
    """
    col = category_master_col()
    for cat in MASTER_CATEGORIES:
        await col.update_one(
            {"slug": cat["slug"]},
            {"$setOnInsert": cat},
            upsert=True,
        )


# ── Category helpers ──────────────────────────────────────────────────────

async def get_all_categories_for_user(user_id: str) -> list:
    """
    Returns master categories + user's own custom categories.
    Each item: { slug, label, icon, is_master }
    """
    master = await category_master_col().find({}, {"_id": 0}).to_list(length=100)
    custom = await user_categories_col().find(
        {"user_id": user_id}, {"_id": 0, "user_id": 0, "created_at": 0}
    ).to_list(length=200)
    return master + custom


async def add_user_category(user_id: str, slug: str, label: str, icon: str = "📂") -> dict:
    """
    Add a custom category for a user.
    Returns status: 'created' | 'exists'
    """
    slug = slug.strip().lower().replace(" ", "_")

    existing_master = await category_master_col().find_one({"slug": slug})
    if existing_master:
        return {"status": "exists", "source": "master"}

    existing_user = await user_categories_col().find_one({"user_id": user_id, "slug": slug})
    if existing_user:
        return {"status": "exists", "source": "user"}

    doc = {
        "user_id":    user_id,
        "slug":       slug,
        "label":      label.strip(),
        "icon":       icon,
        "is_master":  False,
        "created_at": datetime.now(timezone.utc),
    }
    await user_categories_col().insert_one(doc)
    return {"status": "created", "slug": slug, "label": label.strip(), "icon": icon, "is_master": False}


async def delete_user_category(user_id: str, slug: str) -> bool:
    """Delete a custom category (cannot delete master categories)."""
    result = await user_categories_col().delete_one({"user_id": user_id, "slug": slug})
    return result.deleted_count > 0


# ── Budget helpers ────────────────────────────────────────────────────────

async def get_user_budgets(user_id: str) -> dict:
    """
    Returns { slug: amount } for this user.
    No defaults — if user hasn't set a budget for a category, it won't appear.
    Frontend shows 0 / empty for unset categories.
    """
    doc = await user_budgets_col().find_one({"user_id": user_id})
    if doc:
        return doc.get("budgets", {})
    return {}


async def update_user_budgets(user_id: str, budgets: dict):
    """
    Upsert the full budgets map for a user.
    budgets = { "food_dining": 8000, "transport": 3000, ... }
    Remove a category budget by omitting it from the dict.
    """
    await user_budgets_col().update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id":    user_id,
            "budgets":    budgets,
            "updated_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )


# ── Search stocks ─────────────────────────────────────────────────────────

async def search_stocks(query: str, limit: int = 10) -> list:
    q = query.strip().lower()
    col = stocks_col()
    try:
        cursor = col.find(
            {"$text": {"$search": q}},
            {"_id": 0, "symbol": 1, "yf_symbol": 1, "name": 1, "exchange": 1, "type": 1},
        ).limit(limit)
        results = await cursor.to_list(length=limit)
    except Exception:
        results = []

    if len(results) < limit:
        existing_syms = {r["symbol"] for r in results}
        prefix_cursor = col.find(
            {
                "symbol": {"$nin": list(existing_syms)},
                "$or": [
                    {"name_lower":   {"$regex": q, "$options": "i"}},
                    {"symbol_lower": {"$regex": f"^{q}", "$options": "i"}},
                ],
            },
            {"_id": 0, "symbol": 1, "yf_symbol": 1, "name": 1, "exchange": 1, "type": 1},
        ).limit(limit - len(results))
        prefix_results = await prefix_cursor.to_list(length=limit - len(results))
        results.extend(prefix_results)

    return results


# ── Chat history helpers ──────────────────────────────────────────────────

async def save_chat(session_id: str, user_message: str, agent_response: str, tools_called: list):
    await chat_col().insert_one({
        "session_id":     session_id,
        "user_message":   user_message,
        "agent_response": agent_response,
        "tools_called":   tools_called,
        "created_at":     datetime.now(timezone.utc),
    })


async def get_chat_history(session_id: str, limit: int = 50) -> list:
    cursor = chat_col().find(
        {"session_id": session_id}, {"_id": 0}
    ).sort("created_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    return list(reversed(docs))


async def get_all_sessions() -> list:
    pipeline = [
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$session_id",
            "last_message": {"$first": "$user_message"},
            "last_at":      {"$first": "$created_at"},
            "count":        {"$sum": 1},
        }},
        {"$sort": {"last_at": -1}},
        {"$limit": 20},
    ]
    return await chat_col().aggregate(pipeline).to_list(length=20)


# ── Market cache helpers ──────────────────────────────────────────────────

async def save_market_data(ticker: str, data: dict):
    await market_col().update_one(
        {"ticker": ticker},
        {"$set": {"ticker": ticker, "data": data, "fetched_at": datetime.now(timezone.utc)}},
        upsert=True,
    )


async def get_cached_market_data(ticker: str, max_age_seconds: int = 300) -> dict | None:
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=max_age_seconds)
    doc = await market_col().find_one(
        {"ticker": ticker, "fetched_at": {"$gte": cutoff}},
        {"_id": 0, "data": 1}
    )
    return doc["data"] if doc else None


async def get_all_market_cache() -> list:
    return await market_col().find({}, {"_id": 0}).sort("fetched_at", -1).to_list(length=100)


# ── Portfolio helpers ─────────────────────────────────────────────────────

async def get_portfolio(user_id: str) -> dict:
    doc = await portfolio_col().find_one({"user_id": user_id}, {"_id": 0})
    if doc:
        return doc
    return {
        "user_id": user_id, "holdings": [],
        "cash_balance": 0.0, "risk_profile": "moderate", "primary_goal": "wealth building",
    }


async def save_portfolio(user_id: str, portfolio: dict):
    await portfolio_col().update_one(
        {"user_id": user_id},
        {"$set": {**portfolio, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )


async def upsert_holding(user_id: str, ticker: str, shares: float, avg_buy_price: float,
                         yahoo_symbol: str | None = None, company_name: str | None = None) -> dict:
    portfolio = await get_portfolio(user_id)
    holdings  = portfolio.get("holdings", [])
    existing  = next((h for h in holdings if h["ticker"] == ticker), None)

    if existing:
        total_shares = existing["shares"] + shares
        total_cost   = (existing["shares"] * existing["avg_buy_price"]) + (shares * avg_buy_price)
        existing["shares"]        = total_shares
        existing["avg_buy_price"] = round(total_cost / total_shares, 2)
        if yahoo_symbol: existing["yahoo_symbol"] = yahoo_symbol
        if company_name: existing["company_name"] = company_name
        status = "updated"
    else:
        holdings.append({
            "ticker": ticker, "shares": shares, "avg_buy_price": avg_buy_price,
            "yahoo_symbol": yahoo_symbol or ticker, "company_name": company_name or ticker,
        })
        status = "added"

    portfolio["holdings"] = holdings
    await save_portfolio(user_id, portfolio)
    return {"status": status, "holdings": holdings}


# ── Expense helpers ───────────────────────────────────────────────────────

async def get_expenses(user_id: str) -> list:
    return await expenses_col().find({"user_id": user_id}, {"_id": 0}).sort("date", -1).to_list(length=500)


async def add_expense(user_id: str, amount: float, description: str, category: str, date: str) -> dict:
    doc = {
        "user_id": user_id, "amount": amount, "description": description,
        "category": category, "date": date, "created_at": datetime.now(timezone.utc),
    }
    result = await expenses_col().insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def delete_expense(user_id: str, expense_id: str):
    from bson import ObjectId
    try:
        await expenses_col().delete_one({"_id": ObjectId(expense_id), "user_id": user_id})
    except Exception:
        await expenses_col().delete_one({"description": expense_id, "user_id": user_id})
    return True


# ── User Profile helpers ──────────────────────────────────────────────────

async def get_user_income(user_id: str) -> float:
    from bson import ObjectId
    user = await users_col().find_one({"_id": ObjectId(user_id)})
    return float(user.get("monthly_income", 0.0)) if user else 0.0


async def update_user_income(user_id: str, income: float):
    from bson import ObjectId
    await users_col().update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {"monthly_income": income}}
    )

# ── Watchlist helpers ─────────────────────────────────────────────────────

async def get_user_watchlist(user_id: str) -> list:
    """Return all watchlist items for a user, newest first."""
    return await user_watchlist_col().find(
        {"user_id": user_id}, {"_id": 0, "user_id": 0}
    ).sort("added_at", -1).to_list(length=200)


async def add_to_watchlist(user_id: str, ticker: str, yf_symbol: str, name: str, exchange: str) -> dict:
    """Add a stock to user watchlist. No-op if already present (by ticker)."""
    existing = await user_watchlist_col().find_one({"user_id": user_id, "ticker": ticker.upper()})
    if existing:
        return {"status": "exists", "ticker": ticker.upper()}
    doc = {
        "user_id":   user_id,
        "ticker":    ticker.upper(),
        "yf_symbol": yf_symbol or ticker.upper(),
        "name":      name,
        "exchange":  exchange,
        "added_at":  datetime.now(timezone.utc),
    }
    await user_watchlist_col().insert_one(doc)
    return {"status": "added", "ticker": ticker.upper(), "name": name}


async def remove_from_watchlist(user_id: str, ticker: str) -> bool:
    """Remove a stock from user watchlist."""
    result = await user_watchlist_col().delete_one({"user_id": user_id, "ticker": ticker.upper()})
    return result.deleted_count > 0