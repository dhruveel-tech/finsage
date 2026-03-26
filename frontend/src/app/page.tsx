'use client'

import { useState, useRef, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { Send, Wrench, Sparkles, RefreshCw } from 'lucide-react'
import { chatApi, ChatMessage } from '@/lib/api'
import Sidebar from '@/components/Sidebar'
import { useAuth } from '@/components/AuthContext'

interface Message {
  role: 'user' | 'assistant'
  content: string
  tools?: string[]
  ts?: string
}

const SUGGESTIONS = [
  'How is my portfolio doing?',
  'Analyze TSLA for me',
  'Am I spending too much this month?',
  'I have ₹50,000 to invest — what should I do?',
  'What is the RSI on RELIANCE.NS?',
  'Show me my expense breakdown',
]

function formatResponse(text: string) {
  // Render emoji sections and bold text nicely
  return text
    .split('\n')
    .map((line, i) => {
      if (!line.trim()) return <div key={i} className="h-2" />
      const bold = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      return (
        <p
          key={i}
          className="text-[14px] leading-relaxed text-[#b0b8cc]"
          dangerouslySetInnerHTML={{ __html: bold }}
        />
      )
    })
}

export default function ChatPage() {
  const { token, isLoading: authLoading } = useAuth()
  const [messages, setMessages]     = useState<Message[]>([])
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [sessionId, setSessionId]   = useState<string>('')
  const bottomRef                   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!authLoading && !token) {
      window.location.href = '/auth/login'
    } else if (token) {
      setSessionId(uuidv4())
    }
  }, [token, authLoading])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text?: string) {
    const msg = (text || input).trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)
    try {
      const res = await chatApi.send(msg, sessionId || undefined)
      if (!sessionId) setSessionId(res.session_id)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.response,
        tools: res.tools_called,
      }])
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Error connecting to FinSage. Make sure the backend is running on port 8000.',
      }])
    } finally {
      setLoading(false)
    }
  }

  function newChat() {
    setMessages([])
    setSessionId(uuidv4())
  }

  return (
    <div className="flex h-screen bg-bg">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface/50 backdrop-blur-sm sticky top-0 z-10">
          <div>
            <h1 className="font-display text-lg font-bold text-gold-light">AI Advisor</h1>
            <p className="text-[12px] text-muted font-mono">
              Session: <span className="text-dim">{sessionId.slice(0, 8) || '...'}</span>
            </p>
          </div>
          <button
            onClick={newChat}
            className="flex items-center gap-1.5 text-[12px] text-muted hover:text-foreground px-3 py-1.5 border border-border hover:border-gold/30 transition-all"
          >
            <RefreshCw size={12} /> New Chat
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          {messages.length === 0 && (
            <div className="max-w-2xl mx-auto mt-16 fade-in-up">
              <div className="text-center mb-10">
                <div className="w-14 h-14 rounded bg-gold/8 border border-gold/20 flex items-center justify-center mx-auto mb-4">
                  <Sparkles size={24} className="text-gold" />
                </div>
                <h2 className="font-display text-2xl font-bold text-foreground mb-2">Welcome to FinSage</h2>
                <p className="text-muted text-sm">Ask me anything about your portfolio, expenses, or the markets.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-[13px] text-muted p-3 border border-border bg-surface hover:border-gold/30 hover:text-foreground hover:bg-surface2 transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} fade-in-up`}>
              {m.role === 'user' ? (
                <div className="max-w-[70%] bg-gold/8 border border-gold/20 px-4 py-3 text-[14px] text-foreground">
                  {m.content}
                </div>
              ) : (
                <div className="max-w-[80%] bg-surface border border-border px-5 py-4 space-y-1">
                  {/* Tool badges */}
                  {m.tools && m.tools.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {m.tools.map(t => (
                        <span key={t} className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 bg-accent/10 border border-accent/20 text-accent">
                          <Wrench size={9} /> {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="space-y-1">{formatResponse(m.content)}</div>
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex justify-start fade-in-up">
              <div className="bg-surface border border-border px-5 py-4 flex items-center gap-3">
                <span className="text-[12px] text-muted font-mono">FinSage is thinking</span>
                <div className="flex gap-1">
                  {[0,1,2].map(i => (
                    <div key={i} className={`typing-dot w-1.5 h-1.5 rounded-full bg-gold`} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-border bg-surface/50 backdrop-blur-sm">
          <div className="flex gap-2 max-w-4xl mx-auto">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Ask about your portfolio, spending, or any stock..."
              disabled={loading}
              className="flex-1 bg-surface2 border border-border px-4 py-3 text-[14px] text-foreground placeholder:text-dim focus:outline-none focus:border-gold/40 disabled:opacity-50 transition-colors"
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="px-4 py-3 bg-gold/10 border border-gold/30 text-gold hover:bg-gold/15 disabled:opacity-40 transition-all"
            >
              <Send size={16} />
            </button>
          </div>
          <p className="text-center text-[10px] text-dim mt-2">
            ⚠️ Educational info only — not licensed investment advice
          </p>
        </div>
      </div>
    </div>
  )
}
