'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from './AuthContext'
import { MessageSquare, TrendingUp, CreditCard, BarChart2, Zap, LogOut, User } from 'lucide-react'

const NAV = [
  { href: '/',          icon: MessageSquare, label: 'AI Advisor',  sub: 'Chat' },
  { href: '/portfolio', icon: TrendingUp,    label: 'Portfolio',   sub: 'Holdings' },
  { href: '/expenses',  icon: CreditCard,    label: 'Expenses',    sub: 'Spending' },
  { href: '/market',    icon: BarChart2,     label: 'Market',      sub: 'Quotes' },
]

export default function Sidebar() {
  const path = usePathname()
  const { user, logout } = useAuth()

  return (
    <aside className="w-[220px] shrink-0 border-r border-border bg-surface flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-gold/10 border border-gold/30 flex items-center justify-center">
            <Zap size={14} className="text-gold" />
          </div>
          <span className="font-display text-lg font-bold text-gold-light">FinSage</span>
        </div>
        <p className="text-[11px] text-muted mt-1 font-mono tracking-wide">AI Financial Advisor</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, icon: Icon, label, sub }) => {
          const active = path === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-sm transition-all group
                ${active
                  ? 'bg-gold/8 border border-gold/20 text-gold-light'
                  : 'text-muted hover:text-foreground hover:bg-surface2 border border-transparent'
                }`}
            >
              <Icon size={15} className={active ? 'text-gold' : 'text-dim group-hover:text-muted'} />
              <div>
                <div className={`text-[13px] font-medium leading-none ${active ? 'text-gold-light' : ''}`}>{label}</div>
                <div className="text-[11px] text-dim mt-0.5">{sub}</div>
              </div>
              {active && <div className="ml-auto w-1 h-4 rounded-full bg-gold" />}
            </Link>
          )
        })}
      </nav>

      {/* User / Logout */}
      {user && (
        <div className="px-3 py-4 border-t border-border mt-auto">
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center shrink-0">
              <User size={14} className="text-gold" />
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-bold text-foreground truncate">{user.full_name || 'User'}</div>
              <div className="text-[10px] text-dim truncate">{user.email}</div>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2 text-muted hover:text-red hover:bg-red/5 rounded-sm transition-all mt-2 group"
          >
            <LogOut size={14} className="group-hover:text-red transition-colors" />
            <span className="text-[12px] font-medium">Log Out</span>
          </button>
        </div>
      )}

      {/* Bottom disclaimer */}
      <div className="px-4 py-4 border-t border-border">
        <p className="text-[10px] text-dim leading-relaxed">
          Educational use only. Not licensed financial advice.
        </p>
      </div>
    </aside>
  )
}
