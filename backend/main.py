from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.chat import router as chat_router
from app.api.portfolio import router as portfolio_router
from app.api.routes import expenses_router
from app.api.market_extra import router as market_extra_router
from app.api.auth import router as auth_router
from app.api.stocks import router as stocks_router
from app.core.config import settings
import uvicorn

app = FastAPI(title="FinSage API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
)

app.include_router(chat_router)
app.include_router(portfolio_router)
app.include_router(expenses_router)
app.include_router(market_extra_router)
app.include_router(auth_router)
app.include_router(stocks_router)


@app.on_event("startup")
async def on_startup():
    """Seed master categories into MongoDB on every startup (idempotent)."""
    from app.db.mongo import seed_master_categories
    await seed_master_categories()


@app.get("/health")
async def health():
    return {"status": "ok", "service": "FinSage API"}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.RELOAD,
        workers=settings.WORKERS if not settings.RELOAD else 1,
        log_level=settings.LOG_LEVEL.lower(),
    )