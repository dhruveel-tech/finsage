'use client'

import { useEffect, useState, useRef } from 'react'
import { marketApi, MarketData, TrendingStock, PortfolioQuote, WatchlistItem } from '@/lib/api'
import { stocksApi, StockResult } from '@/lib/api'
import Sidebar from '@/components/Sidebar'
import {
  Search, TrendingUp, TrendingDown, RefreshCw,
  Zap, Activity, Star, StarOff, Plus, X, Trash2,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

// ── helpers ───────────────────────────────────────────────────────────────
const currSym = (c?: string) => c === 'INR' ? '₹' : c === 'USD' ? '$' : ''
const fmt = (n: number) => n >= 1e7 ? `${(n / 1e7).toFixed(2)}Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : n.toLocaleString()

function Pill({ v }: { v: number }) {
  const up = v >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-sm
      ${up ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
      {up ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {up ? '+' : ''}{v}%
    </span>
  )
}

// ── Ticker tape ───────────────────────────────────────────────────────────
function TickerTape({ items }: { items: TrendingStock[] }) {
  if (!items.length) return null
  const doubled = [...items, ...items]
  return (
    <div className="overflow-hidden border-b border-white/5 bg-[#0a0e17]">
      <div className="flex animate-marquee whitespace-nowrap py-1.5" style={{ animationDuration: `${items.length * 3}s` }}>
        {doubled.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-2 px-5 text-[11px] font-mono shrink-0">
            <span className="text-slate-400 font-semibold">{s.ticker}</span>
            <span className="text-white/80">{currSym(s.currency)}{s.price.toLocaleString()}</span>
            <Pill v={s.change_percent_today} />
            <span className="text-white/10 ml-2">|</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Portfolio holding row ─────────────────────────────────────────────────
function HoldingRow({ q, active, onClick }: { q: PortfolioQuote; active: boolean; onClick: () => void }) {
  const up = (q.gain_pct ?? 0) >= 0
  const todUp = (q.change_percent_today ?? 0) >= 0
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-4 px-5 py-3.5 text-left transition-all duration-150 border-b border-white/5 last:border-b-0
        ${active ? 'bg-amber-500/8 border-l-2 border-l-amber-400/60' : 'hover:bg-white/3 border-l-2 border-l-transparent'}`}>
      <div className="w-9 h-9 rounded bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
        <span className="text-[9px] font-mono font-black text-amber-400/80 leading-none text-center">
          {q.ticker.replace(/\.(NS|BO)$/, '').slice(0, 4)}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-white/90 truncate">{q.company_name}</div>
        <div className="text-[10px] text-white/35 font-mono mt-0.5">{q.shares} sh · avg {currSym(q.currency)}{q.avg_buy_price}</div>
      </div>
      {q.error ? (
        <span className="text-[10px] text-white/25 font-mono">–</span>
      ) : (
        <>
          <div className="text-right shrink-0">
            <div className="text-[12px] font-mono font-bold text-white/85">{currSym(q.currency)}{fmt(q.market_value ?? 0)}</div>
            <div className={`text-[10px] font-mono font-semibold mt-0.5 ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
              {up ? '+' : ''}{currSym(q.currency)}{fmt(Math.abs(q.gain_loss ?? 0))} ({up ? '+' : ''}{q.gain_pct}%)
            </div>
          </div>
          <div className={`text-[11px] font-mono font-bold shrink-0 w-14 text-right ${todUp ? 'text-emerald-400' : 'text-rose-400'}`}>
            {todUp ? '+' : ''}{q.change_percent_today}%
          </div>
        </>
      )}
    </button>
  )
}

// ── Watchlist row ─────────────────────────────────────────────────────────
function WatchlistRow({ item, active, onClick, onRemove }: {
  item: WatchlistItem; active: boolean; onClick: () => void; onRemove: () => void
}) {
  const up = (item.change_percent_today ?? 0) >= 0
  return (
    <div className={`flex items-center gap-3 px-5 py-3 border-b border-white/5 last:border-b-0 group transition-all
      ${active ? 'bg-amber-500/8 border-l-2 border-l-amber-400/60' : 'hover:bg-white/3 border-l-2 border-l-transparent'}`}>
      <button onClick={onClick} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <div className="w-9 h-9 rounded bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
          <span className="text-[9px] font-mono font-black text-amber-400/80 leading-none text-center">
            {item.ticker.replace(/\.(NS|BO)$/, '').slice(0, 4)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-white/90 truncate">{item.name}</div>
          <div className="text-[10px] text-white/30 font-mono">{item.ticker} · {item.exchange}</div>
        </div>
        {item.error || !item.price ? (
          <span className="text-[10px] text-white/20 font-mono shrink-0">–</span>
        ) : (
          <div className="text-right shrink-0 space-y-0.5">
            <div className="text-[13px] font-mono font-bold text-white/85">
              {currSym(item.currency)}{item.price.toLocaleString()}
            </div>
            <Pill v={item.change_percent_today!} />
          </div>
        )}
      </button>
      <button
        onClick={e => { e.stopPropagation(); onRemove() }}
        className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-rose-400 transition-all shrink-0 ml-1">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

// ── Trending mini card ────────────────────────────────────────────────────
function TrendCard({ s, active, onClick }: { s: TrendingStock; active: boolean; onClick: () => void }) {
  const up = s.change_percent_today >= 0
  return (
    <button onClick={onClick}
      className={`relative overflow-hidden rounded-lg p-4 text-left transition-all duration-200 border group
        ${active
          ? 'bg-amber-500/10 border-amber-400/40 shadow-lg shadow-amber-500/10'
          : 'bg-[#0f1520] border-white/8 hover:border-white/20 hover:bg-white/5'}`}>
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300
        ${up ? 'bg-gradient-to-br from-emerald-500/5 to-transparent' : 'bg-gradient-to-br from-rose-500/5 to-transparent'}`} />
      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-mono font-black text-amber-400/90 tracking-wider">{s.ticker}</div>
            <div className="text-[10px] text-white/40 truncate mt-0.5 leading-tight">{s.company_name}</div>
          </div>
          <Pill v={s.change_percent_today} />
        </div>
        <div className="text-[18px] font-mono font-black text-white/90 leading-none mb-2">
          {currSym(s.currency)}{s.price.toLocaleString()}
        </div>
        <div className="flex items-end gap-[2px] h-5 mt-2">
          {Array.from({ length: 12 }).map((_, i) => {
            const h = 20 + Math.sin(i * 0.9 + (s.price % 10)) * 15 + (up ? i * 2 : -i * 1.5)
            return (
              <div key={i} className={`flex-1 rounded-sm ${up ? 'bg-emerald-500/40' : 'bg-rose-500/40'}`}
                style={{ height: `${Math.max(10, Math.min(100, h))}%` }} />
            )
          })}
        </div>
        {s.sector && <div className="text-[9px] font-mono text-white/25 mt-2 uppercase tracking-widest truncate">{s.sector}</div>}
      </div>
    </button>
  )
}

// ── RSI gauge ─────────────────────────────────────────────────────────────
function RsiGauge({ rsi }: { rsi: number }) {
  const color = rsi < 30 ? '#34d399' : rsi > 70 ? '#f87171' : '#fbbf24'
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest">RSI 14</div>
      <div className="text-[22px] font-mono font-black" style={{ color }}>{rsi}</div>
      <div className="w-full h-1.5 bg-white/8 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${rsi}%`, background: color }} />
      </div>
      <div className="text-[9px] font-mono" style={{ color }}>
        {rsi < 30 ? 'OVERSOLD' : rsi > 70 ? 'OVERBOUGHT' : 'NEUTRAL'}
      </div>
    </div>
  )
}

// ── Add to Watchlist modal ────────────────────────────────────────────────
function AddWatchlistModal({ onAdd, onClose }: {
  onAdd: (r: StockResult) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<StockResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function doSearch(val: string) {
    setQ(val)
    if (val.trim().length < 1) { setResults([]); return }
    setLoading(true)
    try {
      const r = await stocksApi.search(val.trim())
      setResults(r.slice(0, 8))
    } catch { setResults([]) }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#0f1828] border border-white/12 rounded-2xl w-full max-w-md shadow-2xl shadow-black/60 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div className="flex items-center gap-2.5">
            <Star size={14} className="text-amber-400" />
            <span className="text-[13px] font-bold text-white">Add to Watchlist</span>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Search input */}
        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
            <input
              ref={inputRef}
              value={q}
              onChange={e => doSearch(e.target.value)}
              placeholder="Search by name or ticker…"
              className="w-full bg-white/5 border border-white/10 pl-9 pr-3 py-2.5 text-[13px] text-white
                placeholder:text-white/25 focus:outline-none focus:border-amber-400/40 rounded-lg"
            />
            {loading && <RefreshCw size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-400/60 animate-spin" />}
          </div>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto px-2 pb-3">
          {results.length === 0 && q.length > 0 && !loading && (
            <div className="text-center text-white/25 text-[12px] font-mono py-8">No results for "{q}"</div>
          )}
          {results.length === 0 && q.length === 0 && (
            <div className="text-center text-white/20 text-[11px] font-mono py-8">
              Type a company name or ticker symbol
            </div>
          )}
          {results.map(r => (
            <div key={r.symbol}
              onClick={() => onAdd(r)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/6 transition-colors cursor-pointer group">
              <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <span className="text-[9px] font-mono font-black text-amber-400/70">
                  {r.symbol.replace(/\.(NS|BO)$/, '').slice(0, 4)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-white/85 truncate">{r.name}</div>
                <div className="text-[10px] text-white/35 font-mono mt-0.5">{r.symbol} · {r.exchange} · {r.type}</div>
              </div>
              <div className="w-6 h-6 rounded-full bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0
                group-hover:bg-amber-400/25 group-hover:border-amber-400/50 transition-all">
                <Plus size={11} className="text-amber-400/60 group-hover:text-amber-400 transition-colors" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


// ═════════════════════════════════════════════════════════════════════════
export default function MarketPage() {
  const [ticker, setTicker] = useState('')
  const [data, setData] = useState<MarketData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [trending, setTrending] = useState<TrendingStock[]>([])
  const [trendingLoad, setTrendingLoad] = useState(true)
  const [portfolioQ, setPortfolioQ] = useState<PortfolioQuote[]>([])
  const [portfolioLoad, setPortfolioLoad] = useState(true)
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [watchlistLoad, setWatchlistLoad] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [activeTicker, setActiveTicker] = useState<string | null>(null)
  const [pendingTicker, setPendingTicker] = useState<string | null>(null)

  const detailRef = useRef<HTMLDivElement>(null)
  const scrollContainer = useRef<HTMLDivElement>(null)

  useEffect(() => {
    marketApi.trending().then(setTrending).catch(() => { }).finally(() => setTrendingLoad(false))
    marketApi.portfolioQuotes().then(setPortfolioQ).catch(() => { }).finally(() => setPortfolioLoad(false))
    loadWatchlist()
  }, [])

  async function loadWatchlist() {
    setWatchlistLoad(true)
    try { setWatchlist(await marketApi.getWatchlist()) }
    catch { setWatchlist([]) }
    finally { setWatchlistLoad(false) }
  }

  async function handleAddWatchlist(r: StockResult) {
    try {
      // Build best possible yf_symbol:
      // 1. Use yf_symbol from catalog if present
      // 2. If exchange is NSE/BSE, append suffix to symbol
      // 3. Fall back to symbol as-is
      let yf = r.yf_symbol || ''
      if (!yf) {
        const ex = (r.exchange || '').toUpperCase()
        if (ex === 'NSE' || ex.includes('NSE')) yf = r.symbol + '.NS'
        else if (ex === 'BSE' || ex.includes('BSE')) yf = r.symbol + '.BO'
        else yf = r.symbol
      }
      await marketApi.addWatchlist(r.symbol, yf, r.name, r.exchange)
      setShowAddModal(false)
      loadWatchlist()
    } catch (err: any) {
      if (err.message?.includes('409')) alert('Already in watchlist')
      else alert('Failed to add: ' + (err.message || 'Unknown error'))
    }
  }

  async function handleRemoveWatchlist(ticker: string) {
    await marketApi.removeWatchlist(ticker)
    setWatchlist(prev => prev.filter(w => w.ticker !== ticker))
  }

  async function search(t?: string) {
    const sym = (t || ticker).trim().toUpperCase()
    if (!sym) return
    setTicker(sym)
    setActiveTicker(sym)
    setPendingTicker(sym)
    setData(null)
    setError('')
    setLoading(true)
    // Scroll container smoothly to top so detail panel is fully visible
    scrollContainer.current?.scrollTo({ top: 0, behavior: 'smooth' })
    try {
      const d = await marketApi.quote(sym)
      if ('error' in d) { setError((d as any).error); setData(null) }
      else setData(d)
    } catch {
      setError('Failed to fetch. Check the ticker symbol.')
    } finally {
      setLoading(false)
    }
  }

  const up = (data?.change_percent_today ?? 0) >= 0
  const valid = portfolioQ.filter(q => !q.error)
  const totalMV = valid.reduce((s, q) => s + (q.market_value ?? 0), 0)
  const totalCost = valid.reduce((s, q) => s + (q.cost_basis ?? 0), 0)
  const totalGL = totalMV - totalCost
  const totalGLPct = totalCost > 0 ? +(totalGL / totalCost * 100).toFixed(2) : 0

  return (
    <div className="flex h-screen bg-[#080c14]">
      <style>{`
        @keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .animate-marquee { animation: marquee linear infinite; }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .panel-enter { animation: fadeSlideIn 0.25s ease-out forwards; }
      `}</style>

      <Sidebar />
      <div ref={scrollContainer} className="flex-1 overflow-y-auto flex flex-col">

        {/* Ticker tape */}
        {!trendingLoad && <TickerTape items={trending} />}

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-white/6 bg-[#080c14]/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
                <Activity size={14} className="text-amber-400" />
              </div>
              <div>
                <h1 className="text-[15px] font-bold text-white tracking-tight">Markets</h1>
                <p className="text-[10px] text-white/35 font-mono">Live data · Yahoo Finance</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-mono text-emerald-400/70">LIVE</span>
            </div>
          </div>
          <div className="flex gap-2 max-w-2xl">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
              <input
                value={ticker}
                onChange={e => setTicker(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && search()}
                placeholder="Search any ticker: AAPL, TCS.NS, BTC-USD..."
                className="w-full bg-white/5 border border-white/10 pl-9 pr-3 py-2.5 text-[13px] text-white
                  placeholder:text-white/25 focus:outline-none focus:border-amber-400/40 focus:bg-amber-400/5 rounded-lg transition-all"
              />
            </div>
            <button onClick={() => search()} disabled={loading}
              className="px-5 py-2.5 bg-amber-400/15 border border-amber-400/30 text-amber-400 hover:bg-amber-400/25
                disabled:opacity-30 transition-all rounded-lg font-mono text-[12px] font-bold flex items-center gap-2">
              {loading ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
              {loading ? 'Loading' : 'Fetch'}
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 pt-7 max-w-[1400px] w-full mx-auto">

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 text-rose-400 text-[12px] p-3.5 rounded-lg border border-rose-500/20 bg-rose-500/8 font-mono mb-6">
              ⚠ {error}
            </div>
          )}

          {/* ── Detail Panel ────────────────────────────────────────────── */}
          {(data || loading || pendingTicker) && (
            <div ref={detailRef} className="mb-8 transition-all duration-300 ease-out">

              {/* Skeleton */}
              {loading && !data && (
                <div className="rounded-xl border border-white/8 bg-[#0c1220] overflow-hidden animate-pulse panel-enter">
                  <div className="h-1 w-full bg-white/10" />
                  <div className="p-5">
                    <div className="flex flex-col lg:flex-row gap-6">
                      <div className="flex-1 space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="space-y-2">
                            <div className="h-3 w-32 bg-white/8 rounded" />
                            <div className="h-5 w-52 bg-white/10 rounded" />
                            <div className="h-3 w-20 bg-amber-400/15 rounded" />
                          </div>
                          <div className="text-right space-y-2">
                            <div className="h-9 w-36 bg-white/10 rounded ml-auto" />
                            <div className="h-5 w-20 bg-white/8 rounded ml-auto" />
                          </div>
                        </div>
                        <div>
                          <div className="h-2.5 w-20 bg-white/6 rounded mb-3" />
                          <div className="h-[160px] w-full bg-white/4 rounded-lg flex items-end gap-1 px-3 pb-3 overflow-hidden">
                            {Array.from({ length: 30 }).map((_, i) => (
                              <div key={i} className="flex-1 bg-white/8 rounded-sm"
                                style={{ height: `${25 + Math.sin(i * 0.6) * 20 + Math.random() * 15}%` }} />
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="lg:w-56 shrink-0 space-y-3">
                        <div className="bg-white/4 rounded-lg p-4 space-y-3">
                          <div className="h-2.5 w-12 bg-white/8 rounded mx-auto" />
                          <div className="h-8 w-16 bg-white/10 rounded mx-auto" />
                          <div className="h-1.5 w-full bg-white/8 rounded-full" />
                          <div className="h-2 w-14 bg-white/6 rounded mx-auto" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="bg-white/3 rounded-lg p-2.5 space-y-1.5">
                              <div className="h-2 w-12 bg-white/6 rounded" />
                              <div className="h-3.5 w-16 bg-white/10 rounded" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-white/20 text-[11px] font-mono">
                      <RefreshCw size={11} className="animate-spin text-amber-400/50" />
                      Loading <span className="text-amber-400/70 font-bold">{pendingTicker}</span>...
                    </div>
                  </div>
                </div>
              )}

              {data && (
                <div className="rounded-xl border border-white/8 bg-[#0c1220] overflow-hidden panel-enter">
                  <div className={`h-1 w-full ${up ? 'bg-gradient-to-r from-emerald-500/80 to-emerald-400/20' : 'bg-gradient-to-r from-rose-500/80 to-rose-400/20'}`} />
                  <div className="p-5">
                    <div className="flex flex-col lg:flex-row gap-6">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <div className="text-[10px] font-mono text-white/30 uppercase tracking-widest mb-1">
                              {data.exchange} · {data.currency} · {data.sector || 'N/A'}
                            </div>
                            <div className="text-[18px] font-bold text-white leading-tight">{data.company_name}</div>
                            <div className="text-[11px] font-mono text-amber-400/70 mt-0.5">{data.ticker}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[32px] font-mono font-black text-white leading-none">
                              {currSym(data.currency)}{data.price.toLocaleString()}
                            </div>
                            <div className="flex items-center justify-end gap-1.5 mt-1.5">
                              <Pill v={data.change_percent_today} />
                              <span className="text-[10px] font-mono text-white/30">today</span>
                            </div>
                          </div>
                        </div>
                        {data.price_history?.length > 0 && (
                          <div>
                            <div className="text-[10px] font-mono text-white/25 uppercase tracking-widest mb-2">30-Day Chart</div>
                            <ResponsiveContainer width="100%" height={160}>
                              <AreaChart data={data.price_history} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
                                <defs>
                                  <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={up ? '#34d399' : '#f87171'} stopOpacity={0.25} />
                                    <stop offset="100%" stopColor={up ? '#34d399' : '#f87171'} stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#ffffff30' }}
                                  tickFormatter={d => d.slice(5)} interval="preserveStartEnd"
                                  axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 9, fill: '#ffffff30' }} domain={['auto', 'auto']}
                                  axisLine={false} tickLine={false} />
                                <Tooltip
                                  contentStyle={{ background: '#0f1828', border: '1px solid #ffffff15', borderRadius: 8, fontSize: 11 }}
                                  labelStyle={{ color: '#fbbf24', fontSize: 10 }}
                                  itemStyle={{ color: '#ffffff90' }}
                                  formatter={(v: number) => [`${currSym(data.currency)}${v}`, 'Price']}
                                />
                                {data.sma_50 && <ReferenceLine y={data.sma_50} stroke="#fbbf2440" strokeDasharray="3 3" />}
                                <Area type="monotone" dataKey="close"
                                  stroke={up ? '#34d399' : '#f87171'} strokeWidth={2}
                                  fill="url(#cg)" dot={false} />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                      <div className="lg:w-56 shrink-0 space-y-4">
                        {data.rsi_14 && (
                          <div className="bg-white/4 rounded-lg p-4 border border-white/6">
                            <RsiGauge rsi={data.rsi_14} />
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { l: 'Prev Close', v: `${currSym(data.currency)}${data.previous_close}` },
                            { l: 'SMA 50', v: data.sma_50 ? `${currSym(data.currency)}${data.sma_50}` : '–' },
                            { l: '52W High', v: data['52_week_high'] ? `${currSym(data.currency)}${data['52_week_high']}` : '–' },
                            { l: '52W Low', v: data['52_week_low'] ? `${currSym(data.currency)}${data['52_week_low']}` : '–' },
                          ].map(s => (
                            <div key={s.l} className="bg-white/3 rounded-lg p-2.5 border border-white/5">
                              <div className="text-[9px] font-mono text-white/25 uppercase tracking-widest mb-1">{s.l}</div>
                              <div className="text-[12px] font-mono font-bold text-white/80">{s.v}</div>
                            </div>
                          ))}
                        </div>
                        <div className={`rounded-lg p-3 border text-center
                          ${data.trend.includes('BULLISH') ? 'bg-emerald-500/10 border-emerald-500/20' :
                            data.trend.includes('BEARISH') ? 'bg-rose-500/10 border-rose-500/20' :
                              'bg-white/4 border-white/8'}`}>
                          <div className="text-[9px] font-mono text-white/30 uppercase tracking-widest mb-1">Trend Signal</div>
                          <div className={`text-[11px] font-mono font-bold
                            ${data.trend.includes('BULLISH') ? 'text-emerald-400' :
                              data.trend.includes('BEARISH') ? 'text-rose-400' : 'text-white/50'}`}>
                            {data.trend.split('—')[0].trim() || 'N/A'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Two-column: Portfolio + Watchlist ───────────────────────── */}
          <div className="grid lg:grid-cols-2 gap-6 mb-8">

            {/* My Portfolio */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-1 h-4 rounded-full bg-amber-400/60" />
                  <span className="text-[12px] font-bold text-white/70 uppercase tracking-widest">My Portfolio</span>
                </div>
                {!portfolioLoad && valid.length > 0 && (
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-[9px] font-mono text-white/25 uppercase tracking-widest">Value</div>
                      <div className="text-[12px] font-mono font-black text-white/80">₹{fmt(totalMV)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] font-mono text-white/25 uppercase tracking-widest">P&L</div>
                      <div className={`text-[12px] font-mono font-black ${totalGL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {totalGL >= 0 ? '+' : ''}₹{fmt(Math.abs(totalGL))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-white/8 bg-[#0c1220] overflow-hidden">
                {portfolioLoad ? (
                  <div className="p-8 flex items-center justify-center gap-2 text-white/30 text-[12px] font-mono">
                    <RefreshCw size={12} className="animate-spin text-amber-400/60" /> Loading...
                  </div>
                ) : portfolioQ.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-white/25 text-[11px] font-mono">No holdings. Add stocks in Portfolio page.</p>
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-[1fr_auto_auto] items-center px-5 py-2 border-b border-white/6
                      text-[9px] font-mono text-white/25 uppercase tracking-widest">
                      <span>Stock</span>
                      <span className="text-right mr-14">P&L</span>
                      <span className="text-right w-14">Today</span>
                    </div>
                    {portfolioQ.map(q => (
                      <HoldingRow key={q.ticker} q={q} active={activeTicker === q.ticker} onClick={() => search(q.ticker)} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Watchlist */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-1 h-4 rounded-full bg-amber-400/60" />
                  <span className="text-[12px] font-bold text-white/70 uppercase tracking-widest">Watchlist</span>
                  {watchlist.length > 0 && (
                    <span className="text-[10px] font-mono text-white/25 bg-white/5 px-2 py-0.5 rounded-full">
                      {watchlist.length}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 text-[11px] font-mono text-amber-400 px-3 py-1.5
                    bg-amber-400/10 border border-amber-400/25 rounded-lg hover:bg-amber-400/20 transition-all">
                  <Plus size={11} /> Add Stock
                </button>
              </div>
              <div className="rounded-xl border border-white/8 bg-[#0c1220] overflow-hidden">
                {watchlistLoad ? (
                  <div className="p-8 flex items-center justify-center gap-2 text-white/30 text-[12px] font-mono">
                    <RefreshCw size={12} className="animate-spin text-amber-400/60" /> Loading...
                  </div>
                ) : watchlist.length === 0 ? (
                  <div className="p-10 text-center space-y-3">
                    <Star size={24} className="text-white/15 mx-auto" />
                    <p className="text-white/25 text-[11px] font-mono">No stocks in watchlist yet.</p>
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="text-[11px] font-mono text-amber-400/70 hover:text-amber-400 transition-colors underline underline-offset-2">
                      + Add your first stock
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="grid grid-cols-[1fr_auto_auto] items-center px-5 py-2 border-b border-white/6
                      text-[9px] font-mono text-white/25 uppercase tracking-widest">
                      <span>Stock</span>
                      <span className="text-right mr-8">Price</span>
                      <span className="text-right w-14">Today</span>
                    </div>
                    {watchlist.map(item => (
                      <WatchlistRow
                        key={item.ticker}
                        item={item}
                        active={activeTicker === item.ticker}
                        onClick={() => search(item.yf_symbol || item.ticker)}
                        onRemove={() => handleRemoveWatchlist(item.ticker)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Top 10 Trending (compact) ────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-1 h-4 rounded-full bg-amber-400/60" />
                <span className="text-[12px] font-bold text-white/70 uppercase tracking-widest">Top 10 Trending</span>
              </div>
              <span className="text-[10px] font-mono text-white/20">Click to view full analysis</span>
            </div>
            {trendingLoad ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="bg-white/3 rounded-lg h-[110px] animate-pulse border border-white/5" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {trending.map(s => (
                  <TrendCard key={s.ticker} s={s} active={activeTicker === s.ticker} onClick={() => search(s.ticker)} />
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Add to watchlist modal */}
      {showAddModal && (
        <AddWatchlistModal
          onAdd={handleAddWatchlist}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
