'use client'

import { useState } from 'react'
import { authApi } from '@/lib/api'
import { useAuth } from '@/components/AuthContext'
import Link from 'next/link'
import { ArrowRight, Mail, Lock, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuth()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await authApi.signin(form)
      login(res.access_token, res.user)
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-gold/5 via-bg to-bg">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="font-display text-4xl font-bold text-foreground tracking-tight">Welcome Back to <span className="text-gold-light">FinSage</span></h1>
          <p className="mt-2 text-muted text-sm">Sign in to access your financial intelligence</p>
        </div>

        <div className="bg-surface border border-border p-8 shadow-2xl backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-3 bg-red/10 border border-red/20 text-red text-xs text-center animate-shake">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-mono text-muted uppercase tracking-widest mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" size={16} />
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    className="w-full bg-surface2 border border-border pl-10 pr-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-gold/40 transition-all placeholder:text-dim"
                    placeholder="alex@example.com"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-[11px] font-mono text-muted uppercase tracking-widest">Password</label>
                  <a href="#" className="text-[10px] text-gold/60 hover:text-gold-light tracking-wide uppercase font-mono">Forgot?</a>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" size={16} />
                  <input
                    required
                    type="password"
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    className="w-full bg-surface2 border border-border pl-10 pr-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-gold/40 transition-all placeholder:text-dim"
                    placeholder="••••••••"
                  />
                </div>
              </div>
            </div>

            <button
              disabled={loading}
              type="submit"
              className="w-full bg-gold/10 border border-gold/30 text-gold-light py-3 text-sm font-semibold hover:bg-gold/20 transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : (
                <>
                  Sign In
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-[12px] text-muted">
            Don't have an account?{' '}
            <Link href="/auth/signup" className="text-gold-light hover:underline font-medium">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
