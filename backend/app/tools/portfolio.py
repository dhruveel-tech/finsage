"""Portfolio tool — reads and writes from MongoDB."""

async def get_portfolio_summary(user_id: str, include_metrics: bool = True) -> dict:
    """Returns the user's current stock holdings, allocation percentages, and cost basis."""
    from app.db.mongo import get_portfolio

    portfolio = await get_portfolio(user_id)
    holdings  = portfolio.get("holdings", [])

    summary = {
        "holdings":       holdings,
        "total_positions": len(holdings),
        "cash_balance":   portfolio.get("cash_balance", 0),
        "risk_profile":   portfolio.get("risk_profile", "moderate"),
        "primary_goal":   portfolio.get("primary_goal", "long-term wealth building"),
        "note":           "Call get_market_analysis per ticker for live P&L",
    }

    if include_metrics and holdings:
        total_cost = sum(h["shares"] * h["avg_buy_price"] for h in holdings)
        summary["total_cost_basis"] = round(total_cost, 2)
        summary["allocation"] = [
            {
                "ticker":     h["ticker"],
                "weight_pct": round((h["shares"] * h["avg_buy_price"]) / total_cost * 100, 1),
            }
            for h in holdings
        ]

    return summary


async def add_holding(user_id: str, ticker: str, shares: float, avg_buy_price: float) -> dict:
    """Adds or updates a stock holding in MongoDB portfolio."""
    from app.db.mongo import upsert_holding
    ticker = ticker.upper()
    return await upsert_holding(user_id, ticker, shares, avg_buy_price)
