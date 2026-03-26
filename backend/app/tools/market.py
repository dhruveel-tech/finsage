"""
Market analysis tool — fetches data from Yahoo Finance.
Results are cached in MongoDB (5-minute TTL) to avoid repeated API calls.
"""

import yfinance as yf
import asyncio


async def get_market_analysis(ticker: str) -> dict:
    """Fetches live stock price, RSI, and momentum signal for any global ticker."""
    from app.db.mongo import get_cached_market_data, save_market_data

    ticker = ticker.upper()

    # ── Try MongoDB cache first ──
    cached = await get_cached_market_data(ticker, max_age_seconds=300)
    if cached:
        print(f"  📦 MongoDB cache hit for {ticker}")
        cached["from_cache"] = True
        return cached

    # ── Fetch fresh data from Yahoo Finance ──
    try:
        stock = await asyncio.to_thread(_fetch_yfinance, ticker)
        # Always cache the result (even if it's an error like 'Ticker not found')
        # to prevent spamming Yahoo Finance every time the user refreshes.
        await save_market_data(ticker, stock)
        return stock
    except Exception as e:
        return {"error": f"Failed to fetch data for '{ticker}': {str(e)}"}


def _fetch_yfinance(ticker: str) -> dict:
    """Synchronous Yahoo Finance fetch (runs in thread pool)."""
    
    def try_fetch(t: str):
        stock = yf.Ticker(t)
        info = stock.info
        price = info.get("currentPrice") or info.get("regularMarketPrice")
        if not price:
            raise ValueError(f"No price data found for {t}")
        return stock, info, price

    try:
        stock, info, price = try_fetch(ticker)
    except Exception:
        if not ticker.endswith((".NS", ".BO")):
            try:
                stock, info, price = try_fetch(ticker + ".NS")
                ticker = ticker + ".NS"
            except Exception:
                try:
                    stock, info, price = try_fetch(ticker + ".BO")
                    ticker = ticker + ".BO"
                except Exception:
                    return {"error": f"No data found for '{ticker}'. Check the symbol."}
        else:
            return {"error": f"No data found for '{ticker}'. Check the symbol."}

    try:
        hist = stock.history(period="3mo")
        if hist.empty:
            return {"error": f"No historical data for '{ticker}'"}

        close = hist["Close"]

        # RSI (14-day)
        delta = close.diff()
        gain  = delta.clip(lower=0).rolling(14).mean()
        loss  = (-delta.clip(upper=0)).rolling(14).mean()
        rs    = gain / loss
        rsi   = round(100 - (100 / (1 + rs.iloc[-1])), 2)

        # Moving averages
        sma_50  = round(close.rolling(50).mean().iloc[-1],  2) if len(close) >= 50  else None
        sma_200 = round(close.rolling(200).mean().iloc[-1], 2) if len(close) >= 200 else None

        # RSI signal
        if rsi < 30:
            rsi_signal = f"OVERSOLD ({rsi}) — potential buy opportunity"
        elif rsi > 70:
            rsi_signal = f"OVERBOUGHT ({rsi}) — consider taking profits"
        else:
            rsi_signal = f"NEUTRAL ({rsi}) — no strong momentum signal"

        # Trend
        trend = "N/A"
        if sma_50 and sma_200:
            trend = "BULLISH — Golden Cross (50 SMA > 200 SMA)" if sma_50 > sma_200 \
                else "BEARISH — Death Cross (50 SMA < 200 SMA)"

        prev_close = info.get("previousClose", price)
        change_pct = round(((price - prev_close) / prev_close) * 100, 2)

        # Historical price points for chart (last 30 days)
        last_30 = hist.tail(30)
        price_history = [
            {"date": str(d.date()), "close": round(float(v), 2)}
            for d, v in zip(last_30.index, last_30["Close"])
        ]

        return {
            "ticker":               ticker,
            "company_name":         info.get("longName", ticker),
            "exchange":             info.get("exchange", "N/A"),
            "currency":             info.get("currency", "USD"),
            "price":                round(price, 2),
            "change_percent_today": change_pct,
            "previous_close":       round(prev_close, 2),
            "52_week_high":         info.get("fiftyTwoWeekHigh"),
            "52_week_low":          info.get("fiftyTwoWeekLow"),
            "market_cap":           info.get("marketCap"),
            "volume":               info.get("volume"),
            "rsi_14":               rsi,
            "rsi_signal":           rsi_signal,
            "sma_50":               sma_50,
            "sma_200":              sma_200,
            "trend":                trend,
            "pe_ratio":             info.get("trailingPE"),
            "sector":               info.get("sector"),
            "industry":             info.get("industry"),
            "price_history":        price_history,
            "data_source":          "Yahoo Finance (yfinance)",
            "from_cache":           False,
        }
    except Exception as e:
        return {"error": f"yfinance error for '{ticker}': {str(e)}"}


async def get_current_stock_price(ticker: str) -> dict:
    """Fetches live stock price, bypassing cache and avoiding heavy .info calls."""
    ticker = ticker.upper()
    try:
        data = await asyncio.to_thread(_fetch_live_price, ticker)
        return data
    except Exception as e:
        return {"error": f"Failed to fetch live price for '{ticker}': {str(e)}"}


def _try_fast_fetch(t: str) -> tuple[float, str]:
    stock = yf.Ticker(t)
    fast = stock.fast_info
    try:
        price = fast["lastPrice"]
        currency = fast["currency"]
    except (KeyError, TypeError):
        price = fast.last_price
        currency = fast.currency
    return float(price), currency


def _fetch_live_price(ticker: str) -> dict:
    """Synchronous Yahoo Finance fast fetch for live prices."""
    import os, sys, contextlib
    
    # yfinance aggressively prints "possibly delisted" or JSON parse errors to stdout/stderr.
    # We suppress these so the backend console doesn't spam endlessly for unknown tickers.
    with open(os.devnull, 'w') as devnull:
        with contextlib.redirect_stdout(devnull), contextlib.redirect_stderr(devnull):
            try:
                price, currency = _try_fast_fetch(ticker)
                return {"price": round(price, 2), "currency": currency}
            except Exception:
                # Try Indian suffixes if the raw ticker failed
                if not ticker.endswith((".NS", ".BO")):
                    try:
                        price, currency = _try_fast_fetch(ticker + ".NS")
                        return {"price": round(price, 2), "currency": currency}
                    except Exception:
                        try:
                            price, currency = _try_fast_fetch(ticker + ".BO")
                            return {"price": round(price, 2), "currency": currency}
                        except Exception:
                            pass

            # Fallback to history to avoid .info blocked endpoints
            try:
                stock = yf.Ticker(ticker)
                hist = stock.history(period="1d")
                
                if hist.empty and not ticker.endswith((".NS", ".BO")):
                    stock = yf.Ticker(ticker + ".NS")
                    hist = stock.history(period="1d")
                    if hist.empty:
                        stock = yf.Ticker(ticker + ".BO")
                        hist = stock.history(period="1d")
                        
                if not hist.empty:
                    return {
                        "price": round(float(hist["Close"].iloc[-1]), 2),
                        "currency": "USD" # history doesn't easily return currency
                    }
                return {"error": f"No price data found for '{ticker}'"}
            except Exception as fallback_err:
                return {"error": f"yfinance fetch error for '{ticker}'"}
