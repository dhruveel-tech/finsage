'use client'

import { useEffect, useState } from 'react'
import { expenseApi, authApi, ExpenseSummary, Expense, ExpenseTrend, Category } from '@/lib/api'
import Sidebar from '@/components/Sidebar'
import { useAuth } from '@/components/AuthContext'
import {
  Plus, AlertTriangle, CheckCircle, AlertCircle,
  Trash2, TrendingDown, TrendingUp, Calendar, Pencil, X,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'

const COLORS = ['#c9a84c', '#4fd1c5', '#5af0a0', '#3d7fff', '#fc6b6b', '#a78bfa', '#f59e0b', '#ec4899']

export default function ExpensesPage() {
  const { token, isLoading: authLoading } = useAuth()

  // ── data state ──────────────────────────────────────────────────────────
  const [summary, setSummary] = useState<ExpenseSummary | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [trends, setTrends] = useState<ExpenseTrend[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [budgets, setBudgets] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── modal visibility ────────────────────────────────────────────────────
  const [openCats, setOpenCats] = useState<Set<string>>(new Set())
  const [showAdd, setShowAdd] = useState(false)
  const [showIncomeEdit, setShowIncomeEdit] = useState(false)
  const [showBudgetEdit, setShowBudgetEdit] = useState(false)
  const [showNewCat, setShowNewCat] = useState(false)

  // ── form state ──────────────────────────────────────────────────────────
  const [incomeInput, setIncomeInput] = useState('')
  const [budgetForm, setBudgetForm] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    amount: '', description: '', category: '', date: new Date().toISOString().slice(0, 10),
  })
  const [newCat, setNewCat] = useState({ label: '', icon: '📂' })

  // ── load ────────────────────────────────────────────────────────────────
  async function load() {
    if (!token) return
    try {
      setError(null)
      const [s, list, tr, cats, bdg] = await Promise.all([
        expenseApi.summary(),
        expenseApi.list(),
        expenseApi.trends(),
        expenseApi.getCategories(),
        expenseApi.getBudgets(),
      ])
      setSummary(s)
      setExpenses(list)
      setTrends(tr)
      setCategories(cats)
      setBudgets(bdg)
      if (s) setIncomeInput(s.monthly_income.toString())
      // Pre-fill budget form with existing values (0 for unset)
      const bForm: Record<string, string> = {}
      cats.forEach(c => { bForm[c.slug] = String(bdg[c.slug] ?? '') })
      setBudgetForm(bForm)
      // Default category for add form
      if (cats.length > 0 && !form.category) {
        setForm(p => ({ ...p, category: cats[0].slug }))
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authLoading && !token) window.location.href = '/auth/login'
    else if (token) load()
  }, [token, authLoading])

  // ── actions ─────────────────────────────────────────────────────────────
  async function addExpense() {
    if (!form.amount || !form.description || !form.category) return
    await expenseApi.add({ ...form, amount: parseFloat(form.amount) })
    setForm({ amount: '', description: '', category: categories[0]?.slug ?? '', date: new Date().toISOString().slice(0, 10) })
    setShowAdd(false)
    load()
  }

  async function updateIncome() {
    const val = parseFloat(incomeInput)
    if (isNaN(val)) return
    await authApi.updateProfile({ monthly_income: val })
    setShowIncomeEdit(false)
    load()
  }

  async function saveBudgets() {
    const parsed: Record<string, number> = {}
    for (const [k, v] of Object.entries(budgetForm)) {
      const n = parseFloat(v)
      if (!isNaN(n) && n > 0) parsed[k] = n
    }
    await expenseApi.setBudgets(parsed)
    setShowBudgetEdit(false)
    load()
  }

  async function createCategory() {
    if (!newCat.label.trim()) return
    const slug = newCat.label.trim().toLowerCase().replace(/\s+/g, '_')
    try {
      await expenseApi.addCategory(slug, newCat.label.trim(), newCat.icon)
      setNewCat({ label: '', icon: '📂' })
      setShowNewCat(false)
      load()
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function removeCustomCategory(slug: string) {
    if (!confirm(`Delete category "${slug}"? Existing expenses with this category won't be deleted.`)) return
    await expenseApi.deleteCategory(slug)
    load()
  }

  async function removeExpense(id: string) {
    if (!confirm('Delete this expense?')) return
    await expenseApi.delete(id)
    load()
  }

  // ── chart data ──────────────────────────────────────────────────────────
  const barData = summary
    ? Object.entries(summary.by_category ?? {}).map(([k, v]) => ({
      name: categories.find(c => c.slug === k)?.label ?? k.replace(/_/g, ' '),
      spent: v,
      budget: budgets[k] ?? 0,
    }))
    : []

  const pieData = summary
    ? Object.entries(summary.by_category ?? {}).map(([k, v]) => ({
      name: categories.find(c => c.slug === k)?.label ?? k.replace(/_/g, ' '),
      value: v,
    }))
    : []

  let comparison = { diff: 0, pct: 0, improved: true }
  if (trends.length >= 2) {
    const curr = trends[trends.length - 1].spent
    const prev = trends[trends.length - 2].spent
    comparison.diff = curr - prev
    comparison.pct = prev > 0 ? Math.abs(Math.round((comparison.diff / prev) * 100)) : 0
    comparison.improved = curr <= prev
  }

  const catLabel = (slug: string) =>
    categories.find(c => c.slug === slug)?.label ?? slug.replace(/_/g, ' ')

  return (
    <div className="flex h-screen bg-bg">
      <Sidebar />
      <div className="flex-1 overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-surface/80 backdrop-blur-sm">
          <div>
            <h1 className="font-display text-lg font-bold text-gold-light">Expenses</h1>
            <p className="text-[12px] text-muted">Budget tracking & spending analysis</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowBudgetEdit(true)}
              className="text-[12px] text-muted px-3 py-1.5 border border-border hover:border-gold/20 hover:text-foreground transition-all">
              Edit Budgets
            </button>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 text-[12px] text-gold-light px-3 py-1.5 bg-gold/10 border border-gold/30 hover:bg-gold/15 transition-all">
              <Plus size={12} /> Add Expense
            </button>
          </div>
        </div>

        <div className="p-6 max-w-[1400px] mx-auto">
          {error && (
            <div className="bg-red/10 border border-red/30 p-4 mb-6 flex items-center gap-3 text-red text-sm">
              <AlertCircle size={16} />
              <span>{error}</span>
              <button onClick={load} className="ml-auto underline hover:no-underline">Retry</button>
            </div>
          )}

          {loading ? (
            <div className="text-center text-muted py-16">Loading expense data...</div>
          ) : (summary && summary.transaction_count > 0) ? (
            <div className="flex flex-col lg:flex-row gap-6 items-start">

              {/* Left column */}
              <div className="flex-1 space-y-6 w-full">

                {/* Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-surface border border-border p-4">
                    <div className="text-[11px] font-mono text-muted uppercase tracking-widest mb-1">Total Spent</div>
                    <div className="text-xl font-display font-bold text-foreground">₹{summary.total_spent.toLocaleString()}</div>
                  </div>
                  <div className="bg-surface border border-border p-4 relative group">
                    <div className="text-[11px] font-mono text-muted uppercase tracking-widest mb-1 flex justify-between">
                      <span>Monthly Income</span>
                      <button onClick={() => setShowIncomeEdit(true)}
                        className="text-[10px] text-gold-light opacity-0 group-hover:opacity-100 transition-opacity">Edit</button>
                    </div>
                    <div className="text-xl font-display font-bold text-foreground">₹{summary.monthly_income.toLocaleString()}</div>
                  </div>
                  <div className="bg-surface border border-border p-4 col-span-2">
                    <div className="text-[11px] font-mono text-muted uppercase tracking-widest mb-1">Month-over-Month</div>
                    <div className="flex items-center gap-3 mt-1">
                      <div className={`w-8 h-8 flex items-center justify-center rounded-full ${comparison.improved ? 'bg-green/10 text-green' : 'bg-red/10 text-red'}`}>
                        {comparison.improved ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                      </div>
                      <div>
                        <div className="text-[13px] font-bold text-foreground">
                          {comparison.diff === 0 ? 'No change in spending'
                            : `${comparison.pct}% ${comparison.improved ? 'less' : 'more'} than last month`}
                        </div>
                        <div className="text-[11px] text-muted">
                          {comparison.improved ? 'Great job saving!' : 'Try to cut back next month.'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Charts row */}
                <div className="grid md:grid-cols-2 gap-6">

                  {/* Spent vs Budget bar chart */}
                  <div className="bg-surface border border-border">
                    <div className="px-4 py-3 border-b border-border text-[11px] font-mono text-muted uppercase tracking-widest flex items-center justify-between">
                      <span>Spent vs Budget</span>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#2d3f55' }} />
                          <span className="text-[10px] text-dim">Budget</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#2563eb' }} />
                          <span className="text-[10px] text-dim">Spent</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-4">
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barCategoryGap="30%">
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7694' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: '#6b7694' }} axisLine={false} tickLine={false} />
                          <Tooltip
                            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                            contentStyle={{ background: '#0d1117', border: '1px solid #1c2230', borderRadius: 4, fontSize: 12, padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}
                            labelStyle={{ color: '#c9a84c', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}
                            itemStyle={{ color: '#a0aec0', padding: '2px 0' }}
                            formatter={(v: number, name: string) => [`₹${v.toLocaleString()}`, name === 'budget' ? 'Budget' : 'Spent']}
                          />
                          <Bar dataKey="budget" fill="#2d3f55" name="budget" radius={[2, 2, 0, 0]} />
                          <Bar dataKey="spent" fill="#2563eb" name="spent" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Pie breakdown */}
                  <div className="bg-surface border border-border">
                    <div className="px-4 py-3 border-b border-border text-[11px] font-mono text-muted uppercase tracking-widest">
                      Spending Breakdown
                    </div>
                    <div className="p-4 flex gap-4">
                      <ResponsiveContainer width="50%" height={160}>
                        <PieChart>
                          <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={65} strokeWidth={0}>
                            {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex-1 space-y-1.5 text-[11px]">
                        {pieData.map((d, i) => (
                          <div key={d.name} className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                              <span className="text-muted capitalize">{d.name}</span>
                            </div>
                            <span className="text-dim font-mono">₹{d.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Trends */}
                <div className="bg-surface border border-border">
                  <div className="px-4 py-3 border-b border-border text-[11px] font-mono text-muted uppercase tracking-widest flex items-center gap-2">
                    <Calendar size={12} className="text-gold-light" /> Monthly Spending Trends
                  </div>
                  <div className="p-4">
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorSpent" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#1e3a8a" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7694' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#6b7694' }} axisLine={false} tickLine={false} />
                        <Tooltip
                          cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
                          contentStyle={{ background: '#0d1117', border: '1px solid #1c2230', borderRadius: 4, fontSize: 12, padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}
                          labelStyle={{ color: '#c9a84c', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}
                          itemStyle={{ color: '#a0aec0' }}
                          formatter={(v: number) => [`₹${v.toLocaleString()}`, 'Spent']}
                        />
                        <Area type="monotone" dataKey="spent" stroke="#1e3a8a" strokeWidth={2} fillOpacity={1} fill="url(#colorSpent)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Budget status */}
                <div className="bg-surface border border-border">
                  <div className="px-4 py-3 border-b border-border text-[11px] font-mono text-muted uppercase tracking-widest">
                    Budget Status
                  </div>
                  <div className="divide-y divide-border">
                    {(summary.budget_status ?? []).map(b => (
                      <div key={b.category} className="flex items-center gap-4 px-4 py-3">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[13px] capitalize text-foreground">{catLabel(b.category)}</span>
                            <div className="flex items-center gap-2">
                              {b.status === 'OVER BUDGET' && <AlertTriangle size={12} className="text-red" />}
                              {b.status === 'WARNING' && <AlertCircle size={12} className="text-gold" />}
                              {b.status === 'OK' && <CheckCircle size={12} className="text-green" />}
                              {b.status === 'NO BUDGET' && <span className="text-[10px] text-dim font-mono">no budget set</span>}
                              <span className={`text-[11px] font-mono ${b.status === 'OVER BUDGET' ? 'text-red' : b.status === 'WARNING' ? 'text-gold-light' : 'text-green'}`}>
                                ₹{b.spent.toLocaleString()}
                                {b.budget > 0 && ` / ₹${b.budget.toLocaleString()}`}
                              </span>
                            </div>
                          </div>
                          {b.budget > 0 && (
                            <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.min(b.percent_used, 100)}%`,
                                  background: b.percent_used > 100 ? '#fc6b6b' : b.percent_used > 80 ? '#1e3a8a' : '#5af0a0',
                                }}
                              />
                            </div>
                          )}
                        </div>
                        {b.budget > 0 && (
                          <span className={`text-[12px] font-mono w-10 text-right ${b.percent_used > 100 ? 'text-red' : 'text-muted'}`}>
                            {b.percent_used}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right column — accordion transactions by category */}
              <div className="lg:w-96 w-full lg:sticky lg:top-24 flex flex-col max-h-[calc(100vh-120px)]">
                <div className="bg-surface border border-border flex flex-col h-full overflow-hidden">

                  {/* Panel header */}
                  <div className="px-4 py-3 border-b border-border shrink-0 flex items-center justify-between">
                    <div>
                      <div className="text-[13px] font-semibold text-foreground">Transactions</div>
                      <div className="text-[10px] text-muted font-mono mt-0.5">{expenses.length} expenses · {new Set(expenses.map((e: any) => e.category || 'other')).size} categories</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-muted font-mono uppercase tracking-widest">Total</div>
                      <div className="text-[15px] font-mono font-bold text-foreground">
                        ₹{expenses.reduce((s: number, e: any) => s + e.amount, 0).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-y-auto flex-1 py-2 px-2 space-y-1.5">
                    {(() => {
                      const grouped: Record<string, typeof expenses> = {}
                      expenses.forEach((e: any) => {
                        const slug = e.category || 'other'
                        if (!grouped[slug]) grouped[slug] = []
                        grouped[slug].push(e)
                      })
                      const slugs = Object.keys(grouped).sort()

                      if (slugs.length === 0) {
                        return (
                          <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
                            <span className="text-3xl">📭</span>
                            <p className="text-muted text-[12px]">No transactions yet</p>
                          </div>
                        )
                      }

                      return slugs.map(slug => {
                        const cat = categories.find(c => c.slug === slug)
                        const icon = cat?.icon ?? '💸'
                        const label = cat?.label ?? slug.replace(/_/g, ' ')
                        const items = grouped[slug]
                        const total = items.reduce((s: number, e: any) => s + e.amount, 0)
                        const isOpen = openCats.has(slug)
                        const budget = budgets[slug] ?? 0
                        const pct = budget > 0 ? Math.min(Math.round((total / budget) * 100), 100) : 0

                        const toggle = () => setOpenCats(prev => {
                          const next = new Set(prev)
                          isOpen ? next.delete(slug) : next.add(slug)
                          return next
                        })

                        return (
                          <div key={slug} className={`rounded border transition-all duration-200 overflow-hidden ${isOpen ? 'border-gold/20 bg-surface2/40' : 'border-border bg-surface hover:border-border/80'}`}>

                            {/* Category header button */}
                            <button onClick={toggle} className="w-full flex items-center gap-3 px-3 py-3 text-left">
                              {/* Icon bubble */}
                              <div className="w-9 h-9 rounded-lg bg-surface2 border border-border flex items-center justify-center text-[18px] shrink-0">
                                {icon}
                              </div>

                              {/* Label + progress */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[13px] font-semibold text-foreground capitalize">{label}</span>
                                  <span className="text-[13px] font-mono font-bold text-foreground">₹{total.toLocaleString()}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {budget > 0 ? (
                                    <>
                                      <div className="flex-1 h-1 bg-surface rounded-full overflow-hidden">
                                        <div
                                          className="h-full rounded-full transition-all duration-500"
                                          style={{
                                            width: `${pct}%`,
                                            background: pct >= 100 ? '#fc6b6b' : pct >= 80 ? '#f59e0b' : '#5af0a0'
                                          }}
                                        />
                                      </div>
                                      <span className="text-[10px] font-mono text-muted shrink-0">
                                        {pct}% of ₹{budget.toLocaleString()}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-[10px] font-mono text-dim">
                                      {items.length} {items.length === 1 ? 'expense' : 'expenses'} · no budget set
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Chevron */}
                              <span className={`text-muted text-[11px] shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''} inline-block`}>›</span>
                            </button>

                            {/* Expanded expense list */}
                            {isOpen && (
                              <div className="border-t border-border/50 mx-2 mb-2">
                                {items.map((e: any, idx: number) => (
                                  <div
                                    key={e._id}
                                    className={`flex items-center gap-2 py-2.5 px-1 group/row hover:bg-surface2/60 rounded transition-colors ${idx < items.length - 1 ? 'border-b border-border/30' : ''}`}>
                                    {/* date pill */}
                                    <div className="text-[9px] font-mono text-dim bg-surface border border-border px-1.5 py-0.5 rounded shrink-0 w-16 text-center leading-tight">
                                      {e.date.slice(5)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-[12px] font-medium text-foreground truncate">{e.description}</div>
                                    </div>
                                    <div className="text-[12px] text-foreground font-mono font-semibold shrink-0">
                                      ₹{e.amount.toLocaleString()}
                                    </div>
                                    <button
                                      onClick={() => removeExpense(e._id || e.description)}
                                      className="opacity-0 group-hover/row:opacity-100 text-dim hover:text-red transition-all shrink-0">
                                      <Trash2 size={11} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })
                    })()}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="w-16 h-16 bg-surface border border-border flex items-center justify-center text-3xl">✨</div>
              <div>
                <h2 className="font-display text-xl font-bold text-foreground">Welcome to FinSage</h2>
                <p className="text-muted text-sm max-w-xs mt-2">
                  Track your spending and optimize your savings. Start by adding your first expense or setting your monthly income.
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setShowAdd(true)}
                  className="px-6 py-2 bg-gold/10 border border-gold/30 text-gold-light hover:bg-gold/15 transition-all text-sm font-medium">
                  Add First Expense
                </button>
                <button onClick={() => setShowIncomeEdit(true)}
                  className="px-6 py-2 border border-border text-dim hover:text-foreground transition-all text-sm font-medium">
                  Set Income
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Income modal ──────────────────────────────────────────────────── */}
        {showIncomeEdit && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-border w-full max-w-sm p-6 space-y-4">
              <h3 className="font-display text-lg font-bold text-foreground">Set Monthly Income</h3>
              <div>
                <label className="block text-[11px] font-mono text-muted uppercase tracking-wide mb-1">Income (₹)</label>
                <input type="number" value={incomeInput} onChange={e => setIncomeInput(e.target.value)}
                  className="w-full bg-surface2 border border-border px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-gold/40"
                  placeholder="e.g. 80000" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={updateIncome}
                  className="flex-1 py-2 text-[13px] font-medium bg-gold/10 border border-gold/30 text-gold-light hover:bg-gold/15 transition-all">
                  Save
                </button>
                <button onClick={() => setShowIncomeEdit(false)}
                  className="flex-1 py-2 text-[13px] text-muted border border-border hover:border-gold/20 transition-all">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Budget edit modal ─────────────────────────────────────────────── */}
        {showBudgetEdit && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-border w-full max-w-sm p-6 flex flex-col max-h-[90vh]">
              {/* header */}
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground">Edit Monthly Budgets</h3>
                  <p className="text-[11px] text-muted mt-0.5">Leave blank to remove a budget limit</p>
                </div>
                <button onClick={() => setShowBudgetEdit(false)} className="text-dim hover:text-foreground mt-0.5">
                  <X size={16} />
                </button>
              </div>

              {/* category list */}
              <div className="overflow-y-auto flex-1 space-y-3 mt-4 pr-1">
                {categories.map(cat => (
                  <div key={cat.slug}>
                    <label className="flex items-center gap-1.5 text-[11px] font-mono text-muted uppercase tracking-wide mb-1">
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                      {!cat.is_master && (
                        <button
                          onClick={() => removeCustomCategory(cat.slug)}
                          className="ml-auto text-dim hover:text-red transition-colors normal-case"
                          title="Delete custom category">
                          <Trash2 size={11} />
                        </button>
                      )}
                    </label>
                    <input
                      type="number"
                      value={budgetForm[cat.slug] ?? ''}
                      onChange={e => setBudgetForm(p => ({ ...p, [cat.slug]: e.target.value }))}
                      placeholder="No limit"
                      className="w-full bg-surface2 border border-border px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-gold/40 placeholder:text-dim"
                    />
                  </div>
                ))}
              </div>

              {/* Add new category inline */}
              {showNewCat ? (
                <div className="mt-4 space-y-2 border-t border-border pt-4">
                  <p className="text-[11px] font-mono text-muted uppercase tracking-wide">New Category</p>
                  <div className="flex gap-2">
                    <input
                      type="text" maxLength={2} value={newCat.icon}
                      onChange={e => setNewCat(p => ({ ...p, icon: e.target.value }))}
                      className="w-12 bg-surface2 border border-border px-2 py-2 text-center text-[16px] focus:outline-none focus:border-gold/40"
                      placeholder="📂"
                    />
                    <input
                      type="text" value={newCat.label}
                      onChange={e => setNewCat(p => ({ ...p, label: e.target.value }))}
                      placeholder="Category name"
                      className="flex-1 bg-surface2 border border-border px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-gold/40"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={createCategory}
                      className="flex-1 py-1.5 text-[12px] bg-gold/10 border border-gold/30 text-gold-light hover:bg-gold/15 transition-all">
                      Add Category
                    </button>
                    <button onClick={() => setShowNewCat(false)}
                      className="flex-1 py-1.5 text-[12px] text-muted border border-border transition-all">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowNewCat(true)}
                  className="mt-4 w-full py-2 text-[12px] text-dim border border-dashed border-border hover:border-gold/30 hover:text-foreground transition-all flex items-center justify-center gap-1.5">
                  <Plus size={11} /> Add Custom Category
                </button>
              )}

              {/* actions */}
              <div className="flex gap-2 mt-4">
                <button onClick={saveBudgets}
                  className="flex-1 py-2 text-[13px] font-medium bg-gold/10 border border-gold/30 text-gold-light hover:bg-gold/15 transition-all">
                  Save Budgets
                </button>
                <button onClick={() => setShowBudgetEdit(false)}
                  className="flex-1 py-2 text-[13px] text-muted border border-border hover:border-gold/20 transition-all">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Add expense modal ─────────────────────────────────────────────── */}
        {showAdd && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-border w-full max-w-sm p-6 space-y-4">
              <h3 className="font-display text-lg font-bold text-foreground">Add Expense</h3>
              {[
                { key: 'amount', label: 'Amount (₹)', placeholder: '500', type: 'text' },
                { key: 'description', label: 'Description', placeholder: 'Swiggy dinner', type: 'text' },
                { key: 'date', label: 'Date', placeholder: '', type: 'date' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-[11px] font-mono text-muted uppercase tracking-wide mb-1">{f.label}</label>
                  <input
                    type={f.type}
                    value={(form as any)[f.key]}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full bg-surface2 border border-border px-3 py-2 text-[13px] text-foreground placeholder:text-dim focus:outline-none focus:border-gold/40"
                  />
                </div>
              ))}
              <div>
                <label className="block text-[11px] font-mono text-muted uppercase tracking-wide mb-1">Category</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  className="w-full bg-surface2 border border-border px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-gold/40">
                  {categories.map(c => (
                    <option key={c.slug} value={c.slug}>{c.icon} {c.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={addExpense}
                  className="flex-1 py-2 text-[13px] font-medium bg-gold/10 border border-gold/30 text-gold-light hover:bg-gold/15 transition-all">
                  Add
                </button>
                <button onClick={() => setShowAdd(false)}
                  className="flex-1 py-2 text-[13px] text-muted border border-border hover:border-gold/20 transition-all">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
