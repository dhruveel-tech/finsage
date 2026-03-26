"""
Multi-Source Stock Info Fetcher  (Indian NSE/BSE + US stocks)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Fallback chain
  NSE  →  [1] NSE India API (proper session)
           [2] Groww public API (no key, very reliable)
           [3] yfinance with browser session
           [4] Alpha Vantage (needs free key)

  BSE  →  [1] Groww public API
           [2] yfinance with browser session
           [3] Alpha Vantage

  US   →  [1] Finnhub (needs free key — best for US)
           [2] yfinance with browser session
           [3] Alpha Vantage

USAGE:
    python fetch_stock_info.py RELIANCE NSE
    python fetch_stock_info.py TCS      BSE
    python fetch_stock_info.py AAPL     US
    python fetch_stock_info.py TSLA     US

PREREQUISITES:
    pip install requests yfinance

OPTIONAL FREE API KEYS  (add to .env for better US coverage):
    FINNHUB_KEY       → https://finnhub.io/register        (60 req/min)
    ALPHA_VANTAGE_KEY → https://www.alphavantage.co        (25 req/day)
"""

import os
import sys
import time
import requests

# ── load .env if available ─────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

ALPHA_VANTAGE_KEY = os.getenv("ALPHA_VANTAGE_KEY", "")
FINNHUB_KEY       = os.getenv("FINNHUB_KEY", "")


# ══════════════════════════════════════════════════════════════
#  SHARED HELPERS
# ══════════════════════════════════════════════════════════════

def _make_session() -> requests.Session:
    """Browser-like session to avoid 429 / bot-detection."""
    s = requests.Session()
    s.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept":          "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection":      "keep-alive",
    })
    return s


def _build_doc(symbol: str, exchange: str, yf_symbol: str, info: dict) -> dict:
    """Normalise any raw info dict → standard output document."""
    name = (info.get("longName") or info.get("shortName")
            or info.get("name") or symbol)
    return {
        "symbol":             symbol,
        "yf_symbol":          yf_symbol,
        "name":               name,
        "exchange":           exchange,
        "type":               info.get("quoteType", "equity").lower(),
        "currency":           info.get("currency", "INR" if exchange in ("NSE", "BSE") else "USD"),
        "sector":             info.get("sector", ""),
        "industry":           info.get("industry", ""),
        "website":            info.get("website", ""),
        "isin":               info.get("isin", ""),
        # Market data
        "ltp":                info.get("ltp") or info.get("currentPrice") or info.get("regularMarketPrice"),
        "open":               info.get("open") or info.get("regularMarketOpen"),
        "high":               info.get("high") or info.get("dayHigh") or info.get("regularMarketDayHigh"),
        "low":                info.get("low")  or info.get("dayLow")  or info.get("regularMarketDayLow"),
        "prev_close":         info.get("prev_close") or info.get("previousClose"),
        "volume":             info.get("volume") or info.get("regularMarketVolume"),
        "market_cap":         info.get("market_cap") or info.get("marketCap"),
        "week_52_high":       info.get("week_52_high") or info.get("fiftyTwoWeekHigh"),
        "week_52_low":        info.get("week_52_low")  or info.get("fiftyTwoWeekLow"),
        # Fundamentals
        "pe_ratio":           info.get("pe_ratio") or info.get("trailingPE"),
        "pb_ratio":           info.get("pb_ratio") or info.get("priceToBook"),
        "eps":                info.get("eps")      or info.get("trailingEps"),
        "dividend_yield":     info.get("dividend_yield") or info.get("dividendYield"),
        "book_value":         info.get("book_value")     or info.get("bookValue"),
        "debt_to_equity":     info.get("debt_to_equity") or info.get("debtToEquity"),
        "roe":                info.get("roe")            or info.get("returnOnEquity"),
        "revenue":            info.get("revenue")        or info.get("totalRevenue"),
        "net_income":         info.get("net_income")     or info.get("netIncomeToCommon"),
        "free_cashflow":      info.get("free_cashflow")  or info.get("freeCashflow"),
        "beta":               info.get("beta"),
        "shares_outstanding": info.get("shares_outstanding") or info.get("sharesOutstanding"),
        "source":             info.get("_source", "UNKNOWN"),
    }


# ══════════════════════════════════════════════════════════════
#  SOURCE 1 — NSE India Official API
# ══════════════════════════════════════════════════════════════

def fetch_from_nse(symbol: str) -> dict | None:
    """
    NSE India API — free, no key needed.
    Uses a 3-step session warm-up to get valid cookies before the quote call.
    """
    print(f"  [NSE API] Trying...")
    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept":          "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer":         "https://www.nseindia.com/",
        "Connection":      "keep-alive",
    })

    try:
        # ── Step 1: Hit homepage to get base cookies ───────────
        r = session.get("https://www.nseindia.com/", timeout=15)
        if r.status_code not in (200, 302):
            print(f"  [NSE API] Homepage returned {r.status_code}")
            return None
        time.sleep(1.0)

        # ── Step 2: Warm up with a lightweight API call ─────────
        session.get("https://www.nseindia.com/api/marketStatus", timeout=10)
        time.sleep(0.5)

        # ── Step 3: Fetch the actual quote ──────────────────────
        url  = f"https://www.nseindia.com/api/quote-equity?symbol={symbol}"
        resp = session.get(url, timeout=15)

        if resp.status_code == 401:
            # Re-prime and retry once
            print("  [NSE API] Got 401, re-priming session...")
            session.get("https://www.nseindia.com/", timeout=15)
            time.sleep(2.0)
            resp = session.get(url, timeout=15)

        if resp.status_code != 200:
            print(f"  [NSE API] HTTP {resp.status_code}")
            return None

        if not resp.text.strip():
            print("  [NSE API] Empty response body.")
            return None

        data       = resp.json()
        price_info = data.get("priceInfo", {})
        meta       = data.get("metadata", {})
        sec_info   = data.get("securityInfo", {})

        ltp = price_info.get("lastPrice")
        if not ltp:
            print("  [NSE API] Response OK but LTP missing.")
            return None

        info = {
            "_source":      "NSE_INDIA_API",
            "name":         meta.get("companyName", symbol),
            "sector":       meta.get("industry", ""),
            "isin":         meta.get("isin", ""),
            "ltp":          ltp,
            "open":         price_info.get("open"),
            "high":         price_info.get("intraDayHighLow", {}).get("max"),
            "low":          price_info.get("intraDayHighLow", {}).get("min"),
            "prev_close":   price_info.get("previousClose"),
            "week_52_high": price_info.get("weekHighLow", {}).get("max"),
            "week_52_low":  price_info.get("weekHighLow", {}).get("min"),
            "pe_ratio":     sec_info.get("pe"),
            "eps":          sec_info.get("eps"),
            "market_cap":   meta.get("marketCap"),
        }

        print("  [NSE API] ✓ Success")
        return info

    except Exception as e:
        print(f"  [NSE API] ✗ {e}")
        return None


# ══════════════════════════════════════════════════════════════
#  SOURCE 2 — Groww Public API  (Indian stocks, no key needed)
# ══════════════════════════════════════════════════════════════

def fetch_from_groww(symbol: str, exchange: str = "NSE") -> dict | None:
    """
    Groww's public JSON API — very reliable for Indian stocks.
    No authentication or API key required.
    Exchange: 'NSE' or 'BSE'
    """
    print(f"  [Groww]   Trying...")
    session = _make_session()
    session.headers.update({
        "Referer": "https://groww.in/",
        "Origin":  "https://groww.in",
    })

    try:
        # Search for the stock to get Groww's internal ID
        search_url = f"https://groww.in/v1/api/search/query?query={symbol}&page=0&size=1"
        resp = session.get(search_url, timeout=10)
        resp.raise_for_status()
        results = resp.json()

        # Navigate to first equity result
        hits = (results.get("data", {})
                       .get("content", []))
        if not hits:
            print("  [Groww]   No search results.")
            return None

        # Find the matching exchange
        hit  = None
        slug = None
        for h in hits:
            ex = h.get("exchangeType", "").upper()
            if ex == exchange:
                hit = h
                break
        if not hit:
            hit = hits[0]   # fallback to first result

        slug = hit.get("slugUrl") or hit.get("searchId")
        if not slug:
            print("  [Groww]   No slug found.")
            return None

        time.sleep(0.3)

        # Fetch full quote using the slug
        quote_url = f"https://groww.in/v1/api/stocks/search/v2/entity?slugUrl={slug}"
        q = session.get(quote_url, timeout=10)
        q.raise_for_status()
        d = q.json()

        ltp = (d.get("liveData", {}).get("ltp")
               or d.get("fundData", {}).get("ltp"))

        if not ltp:
            print("  [Groww]   LTP not found in response.")
            return None

        live = d.get("liveData", {})
        fund = d.get("fundData", {})
        meta = d.get("metaData",  {})

        info = {
            "_source":      "GROWW",
            "name":         meta.get("companyName") or hit.get("legalName", symbol),
            "sector":       meta.get("sector", ""),
            "industry":     meta.get("industry", ""),
            "isin":         meta.get("isin", ""),
            "ltp":          ltp,
            "open":         live.get("open"),
            "high":         live.get("dayHigh"),
            "low":          live.get("dayLow"),
            "prev_close":   live.get("previousClose"),
            "volume":       live.get("tradedVolume"),
            "week_52_high": live.get("fiftyTwoWeekHigh"),
            "week_52_low":  live.get("fiftyTwoWeekLow"),
            "market_cap":   fund.get("marketCap"),
            "pe_ratio":     fund.get("pe"),
            "pb_ratio":     fund.get("pb"),
            "eps":          fund.get("eps"),
            "book_value":   fund.get("bookValue"),
            "roe":          fund.get("roe"),
            "dividend_yield": fund.get("dividendYield"),
        }

        print("  [Groww]   ✓ Success")
        return info

    except Exception as e:
        print(f"  [Groww]   ✗ {e}")
        return None


# ══════════════════════════════════════════════════════════════
#  SOURCE 3 — yfinance  (with browser session to reduce 429s)
# ══════════════════════════════════════════════════════════════

def fetch_from_yfinance(yf_symbol: str) -> dict | None:
    """
    yfinance with a real browser session injected.
    Still may 429 if Yahoo blocks your IP — use as fallback only.
    """
    try:
        import yfinance as yf
    except ImportError:
        print("  [yfinance] Skipped — run: pip install yfinance")
        return None

    print(f"  [yfinance] Trying for {yf_symbol}...")
    session = _make_session()
    time.sleep(2.0)   # Longer polite delay

    try:
        ticker = yf.Ticker(yf_symbol, session=session)
        info   = ticker.info

        if not info or not info.get("symbol"):
            print("  [yfinance] Empty response.")
            return None

        info["_source"] = "YFINANCE"
        print("  [yfinance] ✓ Success")
        return info

    except Exception as e:
        err = str(e)
        if "429" in err:
            print("  [yfinance] ✗ Rate-limited (429) by Yahoo Finance.")
        else:
            print(f"  [yfinance] ✗ {e}")
        return None


# ══════════════════════════════════════════════════════════════
#  SOURCE 4 — Finnhub  (US stocks, free key, 60 req/min)
# ══════════════════════════════════════════════════════════════

def fetch_from_finnhub(symbol: str) -> dict | None:
    """
    Best free option for US stocks.
    Set FINNHUB_KEY in .env — free at https://finnhub.io/register
    """
    if not FINNHUB_KEY:
        print("  [Finnhub]  Skipped — FINNHUB_KEY not set in .env")
        return None

    print(f"  [Finnhub]  Trying for {symbol}...")
    session = _make_session()

    try:
        base = "https://finnhub.io/api/v1"
        hdrs = {"X-Finnhub-Token": FINNHUB_KEY}

        q = session.get(f"{base}/quote?symbol={symbol}",          headers=hdrs, timeout=10).json()
        p = session.get(f"{base}/stock/profile2?symbol={symbol}", headers=hdrs, timeout=10).json()
        m = session.get(f"{base}/stock/metric?symbol={symbol}&metric=all", headers=hdrs, timeout=10).json().get("metric", {})

        if not q.get("c"):
            print("  [Finnhub]  No price data.")
            return None

        info = {
            "_source":            "FINNHUB",
            "name":               p.get("name", symbol),
            "sector":             p.get("finnhubIndustry", ""),
            "industry":           p.get("finnhubIndustry", ""),
            "website":            p.get("weburl", ""),
            "currency":           p.get("currency", "USD"),
            "market_cap":         (p.get("marketCapitalization") or 0) * 1_000_000,
            "isin":               p.get("isin", ""),
            "ltp":                q.get("c"),
            "open":               q.get("o"),
            "high":               q.get("h"),
            "low":                q.get("l"),
            "prev_close":         q.get("pc"),
            "week_52_high":       m.get("52WeekHigh"),
            "week_52_low":        m.get("52WeekLow"),
            "pe_ratio":           m.get("peBasicExclExtraTTM"),
            "pb_ratio":           m.get("pbQuarterly"),
            "eps":                m.get("epsBasicExclExtraItemsTTM"),
            "dividend_yield":     m.get("dividendYieldIndicatedAnnual"),
            "beta":               m.get("beta"),
            "roe":                m.get("roeTTM"),
            "shares_outstanding": (p.get("shareOutstanding") or 0) * 1_000_000,
        }

        print("  [Finnhub]  ✓ Success")
        return info

    except Exception as e:
        print(f"  [Finnhub]  ✗ {e}")
        return None


# ══════════════════════════════════════════════════════════════
#  SOURCE 5 — Alpha Vantage  (free 25 req/day)
# ══════════════════════════════════════════════════════════════

def fetch_from_alpha_vantage(symbol: str, exchange: str) -> dict | None:
    """
    Last-resort fallback. Free key at https://www.alphavantage.co
    Set ALPHA_VANTAGE_KEY in .env.
    """
    if not ALPHA_VANTAGE_KEY:
        print("  [AlphaVantage] Skipped — ALPHA_VANTAGE_KEY not set in .env")
        return None

    av_sym = f"{symbol}.NSE" if exchange == "NSE" else (
             f"{symbol}.BSE" if exchange == "BSE" else symbol)

    print(f"  [AlphaVantage] Trying for {av_sym}...")
    session = _make_session()

    try:
        base = "https://www.alphavantage.co/query"

        q = session.get(base, params={
            "function": "GLOBAL_QUOTE", "symbol": av_sym, "apikey": ALPHA_VANTAGE_KEY,
        }, timeout=15).json().get("Global Quote", {})

        if not q.get("05. price"):
            print("  [AlphaVantage] No price data.")
            return None

        ov = session.get(base, params={
            "function": "OVERVIEW", "symbol": av_sym, "apikey": ALPHA_VANTAGE_KEY,
        }, timeout=15).json()

        def _f(v):
            try: return float(v)
            except: return None

        info = {
            "_source":            "ALPHA_VANTAGE",
            "name":               ov.get("Name", symbol),
            "sector":             ov.get("Sector", ""),
            "industry":           ov.get("Industry", ""),
            "currency":           ov.get("Currency", "USD"),
            "ltp":                _f(q.get("05. price")),
            "open":               _f(q.get("02. open")),
            "high":               _f(q.get("03. high")),
            "low":                _f(q.get("04. low")),
            "prev_close":         _f(q.get("08. previous close")),
            "volume":             _f(q.get("06. volume")),
            "week_52_high":       _f(ov.get("52WeekHigh")),
            "week_52_low":        _f(ov.get("52WeekLow")),
            "market_cap":         _f(ov.get("MarketCapitalization")),
            "pe_ratio":           _f(ov.get("PERatio")),
            "pb_ratio":           _f(ov.get("PriceToBookRatio")),
            "eps":                _f(ov.get("EPS")),
            "dividend_yield":     _f(ov.get("DividendYield")),
            "beta":               _f(ov.get("Beta")),
            "roe":                _f(ov.get("ReturnOnEquityTTM")),
            "revenue":            _f(ov.get("RevenueTTM")),
            "net_income":         _f(ov.get("NetIncomeTTM")),
            "shares_outstanding": _f(ov.get("SharesOutstanding")),
        }

        print("  [AlphaVantage] ✓ Success")
        return info

    except Exception as e:
        print(f"  [AlphaVantage] ✗ {e}")
        return None


# ══════════════════════════════════════════════════════════════
#  MAIN FETCHER  — tries sources in order, stops at first success
# ══════════════════════════════════════════════════════════════

def fetch_stock_info(symbol: str, exchange: str = "NSE") -> dict | None:
    """
    Fetch stock info with automatic fallback across multiple sources.

    Args:
        symbol:   Ticker without suffix  e.g. 'RELIANCE', 'AAPL'
        exchange: 'NSE' | 'BSE' | 'US'

    Returns:
        Normalised dict or None if all sources fail.
    """
    symbol   = symbol.upper().strip()
    exchange = exchange.upper().strip()

    if exchange not in ("NSE", "BSE", "US"):
        print(f"[ERROR] Invalid exchange '{exchange}'. Use NSE, BSE, or US.")
        return None

    suffix_map = {"NSE": ".NS", "BSE": ".BO", "US": ""}
    yf_symbol  = f"{symbol}{suffix_map[exchange]}"

    print(f"\n{'═'*55}")
    print(f"  Fetching: {symbol}  ({exchange})")
    print(f"{'═'*55}")

    raw_info = None

    if exchange == "NSE":
        raw_info = (
            fetch_from_nse(symbol)               or
            fetch_from_groww(symbol, "NSE")      or
            fetch_from_yfinance(yf_symbol)       or
            fetch_from_alpha_vantage(symbol, exchange)
        )
    elif exchange == "BSE":
        raw_info = (
            fetch_from_groww(symbol, "BSE")      or
            fetch_from_yfinance(yf_symbol)       or
            fetch_from_alpha_vantage(symbol, exchange)
        )
    else:  # US
        raw_info = (
            fetch_from_finnhub(symbol)           or
            fetch_from_yfinance(yf_symbol)       or
            fetch_from_alpha_vantage(symbol, exchange)
        )

    if not raw_info:
        print("\n  ✗ All sources exhausted. No data available.")
        return None

    doc = _build_doc(symbol, exchange, yf_symbol, raw_info)
    print(f"  ✓ Fetched via: {raw_info.get('_source', 'UNKNOWN')}\n")
    return doc


# ══════════════════════════════════════════════════════════════
#  PRETTY PRINTER
# ══════════════════════════════════════════════════════════════

def print_stock_info(doc: dict) -> None:
    is_indian = doc["exchange"] in ("NSE", "BSE")

    def fmt(value, is_currency=False):
        if value is None:
            return "N/A"
        if isinstance(value, float) and value == int(value):
            value = int(value)
        if isinstance(value, (int, float)) and is_currency:
            if is_indian:
                if   abs(value) >= 1_00_00_00_000: return f"₹{value/1_00_00_00_000:.2f} T"
                elif abs(value) >= 1_00_00_000:    return f"₹{value/1_00_00_000:.2f} Cr"
                elif abs(value) >= 1_00_000:       return f"₹{value/1_00_000:.2f} L"
                else:                              return f"₹{value:,.2f}"
            else:
                if   abs(value) >= 1_000_000_000:  return f"${value/1_000_000_000:.2f}B"
                elif abs(value) >= 1_000_000:      return f"${value/1_000_000:.2f}M"
                else:                              return f"${value:,.2f}"
        return str(value)

    print("\n" + "═" * 60)
    print(f"  {doc['name']}")
    print(f"  {doc['symbol']}  |  {doc['exchange']}  |  via {doc['source']}")
    print("═" * 60)

    sections = {
        "📋 Identifiers": [
            ("Sector",         "sector",       False),
            ("Industry",       "industry",     False),
            ("Website",        "website",      False),
            ("Currency",       "currency",     False),
            ("ISIN",           "isin",         False),
        ],
        "📈 Market Data": [
            ("LTP",            "ltp",          True),
            ("Open",           "open",         True),
            ("High",           "high",         True),
            ("Low",            "low",          True),
            ("Prev Close",     "prev_close",   True),
            ("Volume",         "volume",       False),
            ("Market Cap",     "market_cap",   True),
            ("52W High",       "week_52_high", True),
            ("52W Low",        "week_52_low",  True),
        ],
        "📊 Fundamentals": [
            ("P/E Ratio",      "pe_ratio",           False),
            ("P/B Ratio",      "pb_ratio",           False),
            ("EPS",            "eps",                True),
            ("Dividend Yield", "dividend_yield",     False),
            ("Book Value",     "book_value",         True),
            ("Debt/Equity",    "debt_to_equity",     False),
            ("ROE",            "roe",                False),
            ("Revenue",        "revenue",            True),
            ("Net Income",     "net_income",         True),
            ("Free CF",        "free_cashflow",      True),
            ("Beta",           "beta",               False),
            ("Shares Out.",    "shares_outstanding", False),
        ],
    }

    for section, fields in sections.items():
        rows = [
            (label, fmt(doc.get(key), is_curr))
            for label, key, is_curr in fields
            if doc.get(key) not in (None, "", 0)
        ]
        if not rows:
            continue
        print(f"\n  {section}")
        print(f"  {'─' * 54}")
        for label, value in rows:
            print(f"    {label:<20}: {value}")

    print("\n" + "═" * 60 + "\n")


# ══════════════════════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    args = sys.argv[1:]

    if not args:
        print(__doc__)
        print("Usage: python fetch_stock_info.py <SYMBOL> [NSE|BSE|US]")
        sys.exit(0)

    symbol   = args[0]
    exchange = args[1].upper() if len(args) > 1 else "NSE"

    stock = fetch_stock_info(symbol, exchange)

    if stock:
        print_stock_info(stock)
    else:
        print(f"\n[RESULT] Could not retrieve data for {symbol} ({exchange}).")
        print("\nTips:")
        print("  • Verify the symbol is correct (e.g. RELIANCE, TCS, INFY)")
        print("  • Add FINNHUB_KEY=xxx to your .env for US stocks")
        print("  • Add ALPHA_VANTAGE_KEY=xxx to your .env as final fallback")
        sys.exit(1)