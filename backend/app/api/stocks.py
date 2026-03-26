"""
Stocks search API — queries the stocks_catalog MongoDB collection.
Endpoint: GET /api/stocks/search?q=<query>
Returns up to 10 matching stocks (by name or symbol).
"""

from fastapi import APIRouter, Query
from app.db.mongo import search_stocks

router = APIRouter(prefix="/api/stocks", tags=["stocks"])


@router.get("/search")
async def search(q: str = Query("", min_length=1)):
    """Search stock catalog by name or symbol prefix."""
    results = await search_stocks(q)
    return results
