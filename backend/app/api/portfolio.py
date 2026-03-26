from typing import Annotated
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from app.db.mongo import get_portfolio, save_portfolio, upsert_holding
from app.core.auth import get_current_user, User
from app.tools.market import get_market_analysis, get_current_stock_price

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


class HoldingRequest(BaseModel):
    ticker: str
    shares: float
    avg_buy_price: float
    yahoo_symbol: str | None = None   # e.g. TCS.NS — used for live price lookups
    company_name: str | None = None   # display name from the stock catalog


class PortfolioUpdateRequest(BaseModel):
    cash_balance: float | None = None
    risk_profile: str | None = None
    primary_goal: str | None = None


@router.get("")
async def get(current_user: Annotated[User, Depends(get_current_user)]):
    return await get_portfolio(current_user.id)


@router.post("/holding")
async def add_holding(req: HoldingRequest, current_user: Annotated[User, Depends(get_current_user)]):
    return await upsert_holding(
        current_user.id,
        req.ticker.upper(),
        req.shares,
        req.avg_buy_price,
        yahoo_symbol=req.yahoo_symbol or req.ticker.upper(),
        company_name=req.company_name,
    )


@router.delete("/holding/{ticker}")
async def remove_holding(ticker: str, current_user: Annotated[User, Depends(get_current_user)]):
    portfolio = await get_portfolio(current_user.id)
    portfolio["holdings"] = [h for h in portfolio["holdings"] if h["ticker"] != ticker.upper()]
    await save_portfolio(current_user.id, portfolio)
    return {"status": "removed", "ticker": ticker.upper()}


@router.patch("")
async def update_portfolio(req: PortfolioUpdateRequest, current_user: Annotated[User, Depends(get_current_user)]):
    portfolio = await get_portfolio(current_user.id)
    if req.cash_balance is not None:
        portfolio["cash_balance"] = req.cash_balance
    if req.risk_profile is not None:
        portfolio["risk_profile"] = req.risk_profile
    if req.primary_goal is not None:
        portfolio["primary_goal"] = req.primary_goal
    await save_portfolio(current_user.id, portfolio)
    return portfolio


@router.get("/live")
async def live_portfolio(current_user: Annotated[User, Depends(get_current_user)]):
    """Returns portfolio enriched with live prices from Yahoo Finance."""
    print(f"--- Fetching Live Portfolio for User: {current_user.email} ---")
    portfolio = await get_portfolio(current_user.id)
    holdings  = portfolio.get("holdings", [])
    enriched  = []
    total_value = 0
    total_cost  = 0

    for h in holdings:
        cost_basis = round(h["avg_buy_price"] * h["shares"], 2)
        total_cost += cost_basis
        
        # Use the stored yahoo_symbol for live price (falls back to ticker)
        lookup_sym = h.get("yahoo_symbol") or h["ticker"]
        print(f"  📊 Looking up Live Price: {lookup_sym}")
        market = await get_current_stock_price(lookup_sym)
        print(f"  📊 Live Price: {lookup_sym} = {market}")
        
        if "error" not in market:
            live_price = market["price"]
            print(f"  ✅ Live Price: {lookup_sym} = {live_price} {market.get('currency', 'INR')}")
            market_value = round(live_price * h["shares"], 2)
            gain_loss    = round(market_value - cost_basis, 2)
            gain_pct     = round((gain_loss / cost_basis) * 100, 2) if cost_basis else 0
            total_value += market_value
            enriched.append({
                **h,
                "live_price":   live_price,
                "market_value": market_value,
                "cost_basis":   cost_basis,
                "gain_loss":    gain_loss,
                "gain_pct":     gain_pct,
                "currency":     market.get("currency", "INR"),
                "company_name": h.get("company_name") or market.get("company_name", h["ticker"]),
            })
        else:
            print(f"  ❌ Live Price Error ({lookup_sym}): {market.get('error')}")
            # Fallback to cost basis if live price fails
            total_value += cost_basis
            enriched.append({
                **h,
                "live_price":   None,
                "market_value": cost_basis,
                "cost_basis":   cost_basis,
                "gain_loss":    0,
                "gain_pct":     0,
                "error":        market.get("error"),
            })


    return {
        **portfolio,
        "holdings":          enriched,
        "total_market_value": round(total_value, 2),
        "total_cost_basis":   round(total_cost, 2),
        "total_gain_loss":    round(total_value - total_cost, 2),
        "total_gain_pct":     round(((total_value - total_cost) / total_cost * 100), 2) if total_cost else 0,
    }
