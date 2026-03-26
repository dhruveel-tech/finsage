"""
Extra market endpoints:
  GET  /api/market/trending           — top 10 trending stocks (cached)
  GET  /api/market/portfolio-quotes   — live quotes for user portfolio tickers
  GET  /api/market/watchlist          — user's watchlist with live quotes
  POST /api/market/watchlist          — add ticker to watchlist
  DELETE /api/market/watchlist/{ticker} — remove from watchlist
"""

from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.auth import get_current_user, User

router = APIRouter(prefix="/api/market", tags=["market"])

# ── Quote + Cache (moved here so all /api/market routes live in one router) ──

@router.get("/quote/{ticker}")
async def quote(ticker: str):
    from app.tools.market import get_market_analysis
    return await get_market_analysis(ticker.upper())


@router.get("/cache")
async def market_cache():
    from app.db.mongo import get_all_market_cache
    return await get_all_market_cache()


# Reduced to 10 for cleaner UI
TRENDING_TICKERS = [
    "AAPL", "NVDA", "MSFT", "TSLA", "GOOGL",
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "BTC-USD",
]


@router.get("/trending")
async def get_trending():
    """Returns live price + change% for trending tickers."""
    import asyncio
    from app.tools.market import get_market_analysis

    async def fetch_one(ticker: str) -> dict | None:
        try:
            data = await get_market_analysis(ticker)
            if "error" in data:
                return None
            return {
                "ticker":               data["ticker"],
                "company_name":         data.get("company_name", ticker),
                "price":                data.get("price", 0),
                "change_percent_today": data.get("change_percent_today", 0),
                "currency":             data.get("currency", "USD"),
                "exchange":             data.get("exchange", ""),
                "rsi_14":               data.get("rsi_14"),
                "trend":                data.get("trend", ""),
                "sector":               data.get("sector", ""),
            }
        except Exception:
            return None

    results = await asyncio.gather(*[fetch_one(t) for t in TRENDING_TICKERS])
    return [r for r in results if r is not None]


@router.get("/portfolio-quotes")
async def get_portfolio_quotes(current_user: Annotated[User, Depends(get_current_user)]):
    """Returns live quotes for all tickers in the user's portfolio."""
    import asyncio
    from app.db.mongo import get_portfolio
    from app.tools.market import get_market_analysis

    portfolio = await get_portfolio(current_user.id)
    holdings  = portfolio.get("holdings", [])
    if not holdings:
        return []

    async def fetch_one(holding: dict) -> dict | None:
        ticker = holding.get("yahoo_symbol") or holding.get("ticker")
        try:
            data = await get_market_analysis(ticker)
            if "error" in data:
                return {
                    "ticker":        holding["ticker"],
                    "company_name":  holding.get("company_name", holding["ticker"]),
                    "shares":        holding["shares"],
                    "avg_buy_price": holding["avg_buy_price"],
                    "error":         True,
                }
            cost_basis   = holding["shares"] * holding["avg_buy_price"]
            market_value = holding["shares"] * data["price"]
            gain_loss    = market_value - cost_basis
            gain_pct     = round((gain_loss / cost_basis) * 100, 2) if cost_basis else 0
            return {
                "ticker":               holding["ticker"],
                "company_name":         data.get("company_name", holding.get("company_name", ticker)),
                "shares":               holding["shares"],
                "avg_buy_price":        holding["avg_buy_price"],
                "price":                data["price"],
                "change_percent_today": data.get("change_percent_today", 0),
                "currency":             data.get("currency", "USD"),
                "cost_basis":           round(cost_basis, 2),
                "market_value":         round(market_value, 2),
                "gain_loss":            round(gain_loss, 2),
                "gain_pct":             gain_pct,
                "rsi_14":               data.get("rsi_14"),
                "trend":                data.get("trend", ""),
            }
        except Exception:
            return None

    results = await asyncio.gather(*[fetch_one(h) for h in holdings])
    return [r for r in results if r is not None]


# ── Watchlist ─────────────────────────────────────────────────────────────

@router.get("/watchlist")
async def get_watchlist(current_user: Annotated[User, Depends(get_current_user)]):
    """Return user watchlist with live quotes fetched in parallel."""
    import asyncio
    from app.db.mongo import get_user_watchlist
    from app.tools.market import get_market_analysis

    items = await get_user_watchlist(current_user.id)
    if not items:
        return []

    async def enrich(item: dict) -> dict:
        try:
            data = await get_market_analysis(item["yf_symbol"])
            if "error" in data:
                return {**item, "price": None, "change_percent_today": None,
                        "currency": None, "rsi_14": None, "error": True}
            return {
                **item,
                "price":                data["price"],
                "change_percent_today": data.get("change_percent_today", 0),
                "currency":             data.get("currency", "USD"),
                "rsi_14":               data.get("rsi_14"),
                "trend":                data.get("trend", ""),
                "error":                False,
            }
        except Exception:
            return {**item, "price": None, "change_percent_today": None, "error": True}

    results = await asyncio.gather(*[enrich(i) for i in items])
    return results


class WatchlistAdd(BaseModel):
    ticker:    str
    yf_symbol: str
    name:      str
    exchange:  str = ""


@router.post("/watchlist")
async def add_watchlist(req: WatchlistAdd, current_user: Annotated[User, Depends(get_current_user)]):
    """Add a stock to the user's watchlist."""
    from app.db.mongo import add_to_watchlist
    result = await add_to_watchlist(
        current_user.id, req.ticker, req.yf_symbol, req.name, req.exchange
    )
    if result["status"] == "exists":
        raise HTTPException(status_code=409, detail="Already in watchlist")
    return result


@router.delete("/watchlist/{ticker}")
async def remove_watchlist(ticker: str, current_user: Annotated[User, Depends(get_current_user)]):
    """Remove a stock from the user's watchlist."""
    from app.db.mongo import remove_from_watchlist
    removed = await remove_from_watchlist(current_user.id, ticker)
    if not removed:
        raise HTTPException(status_code=404, detail="Not in watchlist")
    return {"status": "removed", "ticker": ticker.upper()}