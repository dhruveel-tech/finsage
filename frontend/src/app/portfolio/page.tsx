'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { portfolioApi, stocksApi, Portfolio, StockResult } from '@/lib/api'
import Sidebar from '@/components/Sidebar'
import { useAuth } from '@/components/AuthContext'
import { TrendingUp, TrendingDown, Plus, Trash2, RefreshCw, AlertCircle, Search, X } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const COLORS = ['#c9a84c', '#4fd1c5', '#5af0a0', '#3d7fff', '#fc6b6b', '#a78bfa', '#f59e0b']

function Stat({ label, value, sub, up }: { label: string; value: string; sub?: string; up?: boolean }) {
  return (
    <div className="bg-surface border border-border p-4">
      <div className="text-[11px] font-mono text-muted uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-xl font-display font-bold ${up === true ? 'text-green' : up === false ? 'text-red' : 'text-foreground'}`}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-dim mt-1">{sub}</div>}
    </div>
  )
}

// ── Stock search autocomplete ─────────────────────────────────────────────
function StockSearch({ onSelect }: { onSelect: (s: StockResult) => void }) {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<StockResult[]>([])
  const [loading, setLoading]   = useState(false)
  const [open, setOpen]         = useState(false)
  const [selected, setSelected] = useState<StockResult | null>(null)
  const debounceRef             = useRef<ReturnType<typeof setTimeout>>(null)
  const wrapperRef              = useRef<HTMLDivElement>(null)

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 1) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const data = await stocksApi.search(q)
      setResults(data)
      setOpen(true)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value
    setQuery(v)
    setSelected(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(v), 280)
  }

  function handleSelect(s: StockResult) {
    setSelected(s)
    setQuery(`${s.name} (${s.symbol})`)
    setOpen(false)
    onSelect(s)
  }

  function handleClear() {
    setSelected(null)
    setQuery('')
    setResults([])
    setOpen(false)
    onSelect({ symbol: '', name: '', exchange: '', type: '' })
  }

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const exchangeColor = (ex: string) => {
    if (ex === 'NSE' || ex === 'BSE') return 'text-gold'
    if (ex === 'CRYPTO') return 'text-[#4fd1c5]'
    return 'text-dim'
  }

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-[11px] font-mono text-muted uppercase tracking-wide mb-1">
        Search Stock / Crypto
      </label>
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
        <input
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search by name or symbol (e.g. Tata, AAPL)"
          className="w-full bg-surface2 border border-border pl-8 pr-8 py-2 text-[13px] text-foreground placeholder:text-dim focus:outline-none focus:border-gold/40"
          autoComplete="off"
        />
        {query && (
          <button onClick={handleClear} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-dim hover:text-foreground">
            <X size={12} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 bg-surface border border-border shadow-xl mt-0.5 max-h-52 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-[12px] text-dim">Searching…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-[12px] text-dim">No results found</div>
          )}
          {!loading && results.map((s) => (
            <button
              key={s.symbol}
              onMouseDown={() => handleSelect(s)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface2 text-left transition-colors"
            >
              <div>
                <span className="text-[13px] font-semibold text-foreground">{s.name}</span>
                <span className="ml-2 text-[11px] font-mono text-gold">{s.symbol}</span>
              </div>
              <span className={`text-[10px] font-mono uppercase ${exchangeColor(s.exchange)}`}>{s.exchange}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="mt-1 text-[11px] text-green font-mono">
          ✓ {selected.symbol} selected
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const { token, isLoading: authLoading } = useAuth()
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showAdd, setShowAdd]     = useState(false)
  const [selectedStock, setSelectedStock] = useState<StockResult | null>(null)
  const [form, setForm]           = useState({ shares: '', avg_buy_price: '' })
  const [addError, setAddError]   = useState('')
  const [error, setError]         = useState('')

  async function load(live = true) {
    if (!token) return
    try {
      setRefreshing(true)
      const data = live ? await portfolioApi.getLive() : await portfolioApi.get()
      setPortfolio(data)
    } catch {
      setError('Failed to load portfolio. Is the backend running?')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (!authLoading && !token) {
      window.location.href = '/auth/login'
    } else if (token) {
      load()
      const timer = setInterval(() => load(true), 60000)
      return () => clearInterval(timer)
    }
  }, [token, authLoading])

  async function addHolding() {
    setAddError('')
    if (!selectedStock?.symbol) { setAddError('Please select a stock from the search results.'); return }
    if (!form.shares || !form.avg_buy_price) { setAddError('Please fill in shares and average buy price.'); return }
    try {
      await portfolioApi.addHolding(
        selectedStock.symbol,
        parseFloat(form.shares),
        parseFloat(form.avg_buy_price),
        selectedStock.yf_symbol || selectedStock.symbol,
        selectedStock.name,
      )
      setSelectedStock(null)
      setForm({ shares: '', avg_buy_price: '' })
      setShowAdd(false)
      load()
    } catch {
      setAddError('Failed to add holding. Try again.')
    }
  }

  function closeModal() {
    setShowAdd(false)
    setAddError('')
    setSelectedStock(null)
    setForm({ shares: '', avg_buy_price: '' })
  }

  async function removeHolding(ticker: string) {
    await portfolioApi.removeHolding(ticker)
    load()
  }

  const allocationData = portfolio?.holdings?.map(h => ({
    name: h.company_name || h.ticker,
    value: h.market_value || (h.shares * h.avg_buy_price),
  })) || []

  return (
    <div className="flex h-screen bg-bg">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-surface/80 backdrop-blur-sm">
          <div>
            <h1 className="font-display text-lg font-bold text-gold-light">Portfolio</h1>
            <p className="text-[12px] text-muted">Live prices from Yahoo Finance</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => load()} disabled={refreshing}
              className="flex items-center gap-1.5 text-[12px] text-muted hover:text-foreground px-3 py-1.5 border border-border hover:border-gold/30 transition-all disabled:opacity-40">
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
            </button>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-[12px] text-gold-light px-3 py-1.5 bg-gold/10 border border-gold/30 hover:bg-gold/15 transition-all">
              <Plus size={12} /> Add Holding
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 max-w-5xl">
          {error && (
            <div className="flex items-center gap-2 text-red text-sm p-3 border border-red/20 bg-red/5">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {/* Stats row */}
          {portfolio && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Total Value"
                value={`₹${(portfolio.total_market_value || 0).toLocaleString()}`}
                sub="Live market value" />
              <Stat label="Cost Basis"
                value={`₹${(portfolio.total_cost_basis || 0).toLocaleString()}`}
                sub="Amount invested" />
              <Stat label="Total P&L"
                value={`${(portfolio.total_gain_loss || 0) >= 0 ? '+' : ''}₹${(portfolio.total_gain_loss || 0).toLocaleString()}`}
                up={(portfolio.total_gain_loss || 0) >= 0} />
              <Stat label="Return"
                value={`${(portfolio.total_gain_pct || 0) >= 0 ? '+' : ''}${portfolio.total_gain_pct || 0}%`}
                up={(portfolio.total_gain_pct || 0) >= 0} />
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-6">
            {/* Holdings table */}
            <div className="md:col-span-2 bg-surface border border-border">
              <div className="px-4 py-3 border-b border-border text-[11px] font-mono text-muted uppercase tracking-widest">
                Holdings
              </div>
              {loading ? (
                <div className="p-8 text-center text-muted text-sm">Loading live prices...</div>
              ) : (
                <div className="divide-y divide-border">
                  {portfolio?.holdings?.map(h => (
                    <div key={h.ticker} className="flex items-center gap-3 px-4 py-3 hover:bg-surface2 group transition-colors">
                      <div className="w-12 h-12 bg-gold/5 border border-gold/15 flex items-center justify-center shrink-0">
                        <span className="text-[11px] font-mono font-bold text-gold">{h.ticker.replace(/\.(NS|BO)$/, '').slice(0, 4)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-semibold text-foreground truncate">{h.company_name || h.ticker}</div>
                        <div className="text-[11px] text-dim font-mono">{h.shares} shares @ ₹{h.avg_buy_price}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[13px] text-foreground font-mono">
                          {h.live_price ? `₹${h.live_price}` : `₹${h.avg_buy_price}`}
                        </div>
                        {h.gain_pct !== undefined && (
                          <div className={`text-[11px] font-mono flex items-center gap-0.5 justify-end ${h.gain_pct >= 0 ? 'text-green' : 'text-red'}`}>
                            {h.gain_pct >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                            {h.gain_pct >= 0 ? '+' : ''}{h.gain_pct}%
                          </div>
                        )}
                      </div>
                      <div className="text-right w-20">
                        <div className="text-[13px] text-foreground">₹{(h.market_value || 0).toLocaleString()}</div>
                        <div className={`text-[11px] font-mono ${(h.gain_loss || 0) >= 0 ? 'text-green' : 'text-red'}`}>
                          {(h.gain_loss || 0) >= 0 ? '+' : ''}₹{(h.gain_loss || 0).toFixed(0)}
                        </div>
                      </div>
                      <button onClick={() => removeHolding(h.ticker)}
                        className="opacity-0 group-hover:opacity-100 text-dim hover:text-red transition-all ml-2">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  {portfolio?.holdings?.length === 0 && (
                    <div className="p-8 text-center text-dim text-sm">No holdings yet. Click &quot;Add Holding&quot; to get started.</div>
                  )}
                </div>
              )}
            </div>

            {/* Allocation pie */}
            <div className="bg-surface border border-border">
              <div className="px-4 py-3 border-b border-border text-[11px] font-mono text-muted uppercase tracking-widest">
                Allocation
              </div>
              <div className="p-4">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={allocationData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} strokeWidth={0}>
                      {allocationData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: '#0f1218', border: '1px solid #1c2230', borderRadius: 0, fontSize: 12 }}
                      formatter={(v: number) => [`₹${v.toLocaleString()}`, '']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {allocationData.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-muted font-mono truncate max-w-[90px]">{d.name}</span>
                      </div>
                      <span className="text-dim">₹{d.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Add holding modal */}
          {showAdd && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-surface border border-border w-full max-w-sm p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-bold text-foreground">Add Holding</h3>
                  <button onClick={closeModal} className="text-dim hover:text-foreground transition-colors">
                    <X size={16} />
                  </button>
                </div>

                {/* Stock search autocomplete */}
                <StockSearch onSelect={(s) => setSelectedStock(s.symbol ? s : null)} />

                {/* Shares */}
                <div>
                  <label className="block text-[11px] font-mono text-muted uppercase tracking-wide mb-1">Shares</label>
                  <input
                    value={form.shares}
                    onChange={e => setForm(p => ({ ...p, shares: e.target.value }))}
                    placeholder="e.g. 10"
                    type="number"
                    min="0"
                    className="w-full bg-surface2 border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-dim focus:outline-none focus:border-gold/40"
                  />
                </div>

                {/* Avg buy price */}
                <div>
                  <label className="block text-[11px] font-mono text-muted uppercase tracking-wide mb-1">Avg Buy Price (₹)</label>
                  <input
                    value={form.avg_buy_price}
                    onChange={e => setForm(p => ({ ...p, avg_buy_price: e.target.value }))}
                    placeholder="e.g. 3200.00"
                    type="number"
                    min="0"
                    className="w-full bg-surface2 border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-dim focus:outline-none focus:border-gold/40"
                  />
                </div>

                {addError && (
                  <div className="flex items-center gap-2 text-red text-[12px]">
                    <AlertCircle size={12} /> {addError}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button onClick={addHolding}
                    className="flex-1 py-2 text-[13px] font-medium bg-gold/10 border border-gold/30 text-gold-light hover:bg-gold/15 transition-all">
                    Add
                  </button>
                  <button onClick={closeModal}
                    className="flex-1 py-2 text-[13px] text-muted border border-border hover:border-gold/20 transition-all">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
