const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('finsage_token') : null
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { headers, ...options })
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('finsage_token')
      localStorage.removeItem('finsage_user')
      window.location.href = '/auth/login'
    }
    throw new Error(`API error ${res.status}: ${await res.text()}`)
  }
  return res.json()
}

// ── Chat ──────────────────────────────────────────────────────────────────
export interface ChatResponse {
  response: string
  session_id: string
  tools_called: string[]
}

export interface ChatMessage {
  session_id: string
  user_message: string
  agent_response: string
  tools_called: string[]
  created_at: string
}

export interface Session {
  _id: string
  last_message: string
  last_at: string
  count: number
}

export const chatApi = {
  send: (message: string, session_id?: string) =>
    api<ChatResponse>('/api/chat', { method: 'POST', body: JSON.stringify({ message, session_id }) }),
  history: (session_id: string) =>
    api<ChatMessage[]>(`/api/chat/history/${session_id}`),
  sessions: () =>
    api<Session[]>('/api/chat/sessions'),
}

// ── Auth ──────────────────────────────────────────────────────────────────
export interface AuthResponse {
  access_token: string
  token_type: string
  user: { email: string; full_name?: string }
}

export interface UserProfile {
  email: string
  full_name: string | null
  monthly_income: number
}

export const authApi = {
  signup: (data: any) => api<AuthResponse>('/api/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  signin: (data: any) => api<AuthResponse>('/api/auth/signin', { method: 'POST', body: JSON.stringify(data) }),
  getProfile: () => api<UserProfile>('/api/auth/profile'),
  updateProfile: (data: Partial<UserProfile>) =>
    api('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(data) }),
}

// ── Portfolio ─────────────────────────────────────────────────────────────
export interface Holding {
  ticker: string
  shares: number
  avg_buy_price: number
  live_price?: number
  market_value?: number
  cost_basis?: number
  gain_loss?: number
  gain_pct?: number
  currency?: string
  company_name?: string
}

export interface Portfolio {
  holdings: Holding[]
  cash_balance: number
  risk_profile: string
  primary_goal: string
  total_market_value?: number
  total_cost_basis?: number
  total_gain_loss?: number
  total_gain_pct?: number
}

export const portfolioApi = {
  get: () => api<Portfolio>('/api/portfolio'),
  getLive: () => api<Portfolio>('/api/portfolio/live'),
  addHolding: (ticker: string, shares: number, avg_buy_price: number, yahoo_symbol?: string, company_name?: string) =>
    api('/api/portfolio/holding', { method: 'POST', body: JSON.stringify({ ticker, shares, avg_buy_price, yahoo_symbol, company_name }) }),
  removeHolding: (ticker: string) =>
    api(`/api/portfolio/holding/${ticker}`, { method: 'DELETE' }),
  update: (data: Partial<Portfolio>) =>
    api('/api/portfolio', { method: 'PATCH', body: JSON.stringify(data) }),
}

// ── Expenses ──────────────────────────────────────────────────────────────
export interface Expense {
  amount: number
  description: string
  category: string
  date: string
}

export interface ExpenseSummary {
  total_spent: number
  monthly_income: number
  savings: number
  savings_rate_pct: number
  investable_surplus: number
  budget_status: {
    category: string
    spent: number
    budget: number
    percent_used: number
    status: string
  }[]
  top_category: string
  transaction_count: number
  by_category: Record<string, number>
}

export interface ExpenseTrend {
  name: string
  spent: number
}

export interface Category {
  slug: string
  label: string
  icon: string
  is_master: boolean
}

export const expenseApi = {
  list: () => api<Expense[]>('/api/expenses'),
  summary: () => api<ExpenseSummary>('/api/expenses/summary'),
  trends: () => api<ExpenseTrend[]>('/api/expenses/trends'),
  add: (e: Expense) => api('/api/expenses', { method: 'POST', body: JSON.stringify(e) }),
  delete: (id: string) => api(`/api/expenses/${id}`, { method: 'DELETE' }),

  // Budgets
  getBudgets: () => api<Record<string, number>>('/api/expenses/budgets'),
  setBudgets: (budgets: Record<string, number>) =>
    api('/api/expenses/budgets', { method: 'PATCH', body: JSON.stringify({ budgets }) }),

  // Categories
  getCategories: () => api<Category[]>('/api/expenses/categories'),
  addCategory: (slug: string, label: string, icon: string) =>
    api<Category>('/api/expenses/categories', { method: 'POST', body: JSON.stringify({ slug, label, icon }) }),
  deleteCategory: (slug: string) =>
    api(`/api/expenses/categories/${slug}`, { method: 'DELETE' }),
}

// ── Market ────────────────────────────────────────────────────────────────
export interface MarketData {
  ticker: string
  company_name: string
  price: number
  change_percent_today: number
  rsi_14: number
  rsi_signal: string
  sma_50: number
  sma_200: number
  trend: string
  sector: string
  currency: string
  exchange: string
  previous_close: number
  '52_week_high': number | null
  '52_week_low': number | null
  price_history: { date: string; close: number }[]
}

export interface TrendingStock {
  ticker: string
  company_name: string
  price: number
  change_percent_today: number
  currency: string
  exchange: string
  rsi_14?: number
  trend?: string
  sector?: string
}

export interface PortfolioQuote {
  ticker: string
  company_name: string
  shares: number
  avg_buy_price: number
  price?: number
  change_percent_today?: number
  currency?: string
  cost_basis?: number
  market_value?: number
  gain_loss?: number
  gain_pct?: number
  rsi_14?: number
  trend?: string
  error?: boolean
}

export interface WatchlistItem {
  ticker: string
  yf_symbol: string
  name: string
  exchange: string
  price?: number
  change_percent_today?: number
  currency?: string
  rsi_14?: number
  trend?: string
  error?: boolean
}

export const marketApi = {
  quote: (ticker: string) => api<MarketData>(`/api/market/quote/${ticker}`),
  trending: () => api<TrendingStock[]>('/api/market/trending'),
  portfolioQuotes: () => api<PortfolioQuote[]>('/api/market/portfolio-quotes'),

  // Watchlist
  getWatchlist: () => api<WatchlistItem[]>('/api/market/watchlist'),
  addWatchlist: (ticker: string, yf_symbol: string, name: string, exchange: string) =>
    api('/api/market/watchlist', { method: 'POST', body: JSON.stringify({ ticker, yf_symbol, name, exchange }) }),
  removeWatchlist: (ticker: string) =>
    api(`/api/market/watchlist/${ticker}`, { method: 'DELETE' }),
}

// ── Stocks Catalog ────────────────────────────────────────────────────────
export interface StockResult {
  symbol: string
  yf_symbol?: string
  name: string
  exchange: string
  type: string
}

export const stocksApi = {
  search: (q: string) => api<StockResult[]>(`/api/stocks/search?q=${encodeURIComponent(q)}`),
}