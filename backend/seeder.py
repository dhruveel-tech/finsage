"""
Stock Catalog Seeder (Yahoo Finance Version)
Fetches real stock metadata from Yahoo Finance for NSE + BSE
and populates the MongoDB catalog.

PREREQUISITES:
    pip install yfinance motor python-dotenv pandas requests
"""

import asyncio
import os
import sys
import time
import requests
import pandas as pd
import yfinance as yf
from io import StringIO
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
MONGODB_DB  = os.getenv("MONGODB_DB",  "finsage")

# ─────────────────────────────────────────────────────────────
#  SYMBOLS CONFIG
#  - Leave SYMBOLS = [] to auto-fetch ALL NSE + BSE companies
#  - Or fill in specific symbols to seed only those
#  - Do NOT add .NS or .BO — that is handled automatically
# ─────────────────────────────────────────────────────────────
SYMBOLS = []


# ─────────────────────────────────────────────────────────────
#  STEP 1 — GET ALL NSE SYMBOLS (if SYMBOLS list is empty)
# ─────────────────────────────────────────────────────────────
def fetch_all_nse_symbols() -> list:
    """
    Downloads full NSE equity list from official NSE archives.
    Returns tuples of (symbol, exchange) e.g. [('RELIANCE', 'NSE'), ...]
    """
    print("[SEEDER] Fetching full NSE symbol list from NSE archives...")
    url = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        df = pd.read_csv(StringIO(response.text))
        df.columns = df.columns.str.strip()
        symbols = [(s.strip(), "NSE") for s in df["SYMBOL"].tolist()]
        print(f"[SEEDER] Found {len(symbols)} NSE symbols")
        return symbols
    except Exception as e:
        print(f"[ERROR] Could not fetch NSE symbol list: {e}")
        return []


# ─────────────────────────────────────────────────────────────
#  STEP 1B — GET ALL BSE SYMBOLS (if SYMBOLS list is empty)
# ─────────────────────────────────────────────────────────────
def fetch_all_bse_symbols() -> list:
    """
    BSE symbols on Yahoo Finance use the format: <SYMBOL>.BO
    We derive them from the NSE equity CSV (same companies trade on both).
    As a fallback, we also try the BSE CSV directly.
    Returns tuples of (symbol, 'BSE')
    """
    print("[SEEDER] Fetching BSE symbol list...")

    # --- Method 1: BSE official CSV (no auth required) ---
    try:
        url = "https://www.bseindia.com/corporates/List_Scrips.aspx"
        bse_csv_url = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"

        # BSE provides a direct equity list CSV
        url = "https://www.bseindia.com/corporates/Download_Scripmaster.aspx"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://www.bseindia.com",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code == 200 and "SYMBOL" in response.text:
            df = pd.read_csv(StringIO(response.text))
            df.columns = df.columns.str.strip()
            col = next((c for c in df.columns if "SYMBOL" in c.upper()), None)
            if col:
                symbols = [(s.strip(), "BSE") for s in df[col].dropna().tolist()]
                print(f"[SEEDER] Found {len(symbols)} BSE symbols (BSE CSV)")
                return symbols
    except Exception:
        pass

    # --- Method 2: Derive BSE symbols from NSE list (same tickers work on .BO) ---
    try:
        print("[SEEDER] Falling back to NSE symbol list for BSE (.BO) symbols...")
        url = "https://archives.nseindia.com/content/equities/EQUITY_L.csv"
        headers = {"User-Agent": "Mozilla/5.0"}
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        df = pd.read_csv(StringIO(response.text))
        df.columns = df.columns.str.strip()
        symbols = [(s.strip(), "BSE") for s in df["SYMBOL"].dropna().tolist()]
        print(f"[SEEDER] Derived {len(symbols)} BSE symbols from NSE list")
        return symbols
    except Exception as e:
        print(f"[ERROR] Could not fetch BSE symbol list: {e}")
        return []


# ─────────────────────────────────────────────────────────────
#  STEP 2 — FETCH STOCK INFO FROM YAHOO FINANCE
# ─────────────────────────────────────────────────────────────
def fetch_yahoo_stock_info(symbol_exchange_list: list) -> list:
    """
    Accepts a list of (symbol, exchange) tuples.
    NSE symbols get .NS suffix, BSE scrip codes get .BO suffix.
    Returns a list of stock detail dicts ready for MongoDB insertion.
    """
    results = []
    total = len(symbol_exchange_list)
    print(f"[SEEDER] Fetching Yahoo Finance data for {total} symbols...\n")

    for i, (symbol, exchange) in enumerate(symbol_exchange_list, 1):
        suffix   = ".NS" if exchange == "NSE" else ".BO"
        yf_symbol = f"{symbol}{suffix}"
        try:
            info = yf.Ticker(yf_symbol).info

            # Skip if Yahoo returned no useful data
            if not info or not info.get("symbol"):
                continue

            name = info.get("longName") or info.get("shortName") or symbol

            doc = {
                # Identifiers
                "symbol":             symbol,
                "yf_symbol":          yf_symbol,
                "base_symbol":        symbol.replace("-EQ", "").replace("- BE", "").strip(),
                "name":               name,
                "name_lower":         name.lower(),
                "symbol_lower":       symbol.lower(),
                "exchange":           exchange,           # "NSE" or "BSE"
                "type":               "equity",
                "currency":           info.get("currency", "INR"),
                "sector":             info.get("sector", ""),
                "industry":           info.get("industry", ""),
                "website":            info.get("website", ""),
                "isin":               info.get("isin", ""),

                # Live market data
                "ltp":                info.get("currentPrice") or info.get("regularMarketPrice"),
                "open":               info.get("open") or info.get("regularMarketOpen"),
                "high":               info.get("dayHigh") or info.get("regularMarketDayHigh"),
                "low":                info.get("dayLow") or info.get("regularMarketDayLow"),
                "prev_close":         info.get("previousClose"),
                "volume":             info.get("volume") or info.get("regularMarketVolume"),
                "market_cap":         info.get("marketCap"),
                "week_52_high":       info.get("fiftyTwoWeekHigh"),
                "week_52_low":        info.get("fiftyTwoWeekLow"),

                # Fundamentals
                "pe_ratio":           info.get("trailingPE"),
                "pb_ratio":           info.get("priceToBook"),
                "eps":                info.get("trailingEps"),
                "dividend_yield":     info.get("dividendYield"),
                "book_value":         info.get("bookValue"),
                "debt_to_equity":     info.get("debtToEquity"),
                "roe":                info.get("returnOnEquity"),
                "revenue":            info.get("totalRevenue"),
                "net_income":         info.get("netIncomeToCommon"),
                "free_cashflow":      info.get("freeCashflow"),
                "beta":               info.get("beta"),
                "shares_outstanding": info.get("sharesOutstanding"),

                "source": "YAHOO_FINANCE",
            }
            results.append(doc)

            # Progress log every 25 stocks
            if i % 25 == 0 or i == total:
                print(f"  [+] [{i}/{total}] processed | {len(results)} valid records so far")
                time.sleep(0.5)   # polite delay to avoid rate limiting

        except Exception as e:
            print(f"  [!] [{i}/{total}] Skipped {symbol} ({exchange}): {e}")
            continue

    print(f"\n[SEEDER] Fetch complete: {len(results)} valid records out of {total} symbols")
    return results


# ─────────────────────────────────────────────────────────────
#  STEP 3 — SEED INTO MONGODB
# ─────────────────────────────────────────────────────────────
async def seed():
    # --- Determine symbols to use ---
    if SYMBOLS:
        print(f"[SEEDER] Using {len(SYMBOLS)} predefined symbols — seeding both NSE + BSE")
        # Each symbol is attempted on both NSE and BSE
        target_symbols = [(s.upper(), "NSE") for s in SYMBOLS] + \
                         [(s.upper(), "BSE") for s in SYMBOLS]
    else:
        print("[SEEDER] SYMBOLS list is empty — fetching ALL NSE + BSE listed companies")
        nse_symbols = fetch_all_nse_symbols()
        bse_symbols = fetch_all_bse_symbols()
        target_symbols = nse_symbols + bse_symbols

    if not target_symbols:
        print("[ERROR] No symbols to process. Exiting.")
        sys.exit(1)

    print(f"[SEEDER] Total symbols to process: {len(target_symbols)} (NSE + BSE combined)\n")

    # --- Fetch from Yahoo Finance ---
    docs = await asyncio.to_thread(fetch_yahoo_stock_info, target_symbols)

    if not docs:
        print("[SEEDER] No data fetched from Yahoo Finance. Database not updated.")
        return

    # --- Connect to MongoDB ---
    print(f"\n[SEEDER] Connecting to MongoDB at {MONGODB_URI}...")
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[MONGODB_DB]
    col = db["stocks_catalog"]

    # --- Drop old data and insert fresh ---
    await col.drop()
    print("[SEEDER] Dropped existing stocks_catalog")

    await col.insert_many(docs)
    nse_count = sum(1 for d in docs if d["exchange"] == "NSE")
    bse_count = sum(1 for d in docs if d["exchange"] == "BSE")
    print(f"[SEEDER] Seeded {len(docs)} stocks into 'stocks_catalog'")
    print(f"         NSE: {nse_count} | BSE: {bse_count}")

    # --- Create search indexes (same as original seeder) ---
    await col.create_index([("name", "text"), ("symbol", "text")])
    await col.create_index("name_lower")
    await col.create_index("symbol_lower")
    await col.create_index("sector")
    await col.create_index("exchange")
    print("[SEEDER] Created search indexes")

    client.close()
    print("\n[SEEDER] Done!\n")


# ─────────────────────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    asyncio.run(seed())