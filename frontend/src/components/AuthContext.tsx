'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  email: string
  full_name?: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (token: string, user: User) => void
  signup: (token: string, user: User) => void
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const AUTO_LOGOUT_MS = 10 * 60 * 1000 // 10 minutes

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('finsage_token')
    localStorage.removeItem('finsage_user')
    router.push('/auth/login')
  }, [router])

  // Hydrate session on initial load
  useEffect(() => {
    const savedToken = localStorage.getItem('finsage_token')
    const savedUser = localStorage.getItem('finsage_user')
    
    if (savedToken && savedUser && savedUser !== 'undefined') {
      try {
        const parsedUser = JSON.parse(savedUser)
        setToken(savedToken)
        setUser(parsedUser)
      } catch (err) {
        localStorage.removeItem('finsage_token')
        localStorage.removeItem('finsage_user')
      }
    } else if (!savedUser && savedToken) {
      localStorage.removeItem('finsage_token')
    }
    
    setIsLoading(false)
  }, [])

  // Auto-logout user after 10 minutes of inactivity
  useEffect(() => {
    if (!token) return

    let timeoutId: NodeJS.Timeout

    const handleActivity = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        console.log("Session expired due to 10 minutes of inactivity.")
        logout()
      }, AUTO_LOGOUT_MS)
    }

    handleActivity()

    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll']
    events.forEach(event => window.addEventListener(event, handleActivity))

    return () => {
      clearTimeout(timeoutId)
      events.forEach(event => window.removeEventListener(event, handleActivity))
    }
  }, [token, logout])

  const login = (newToken: string, newUser: User) => {
    setToken(newToken)
    setUser(newUser)
    localStorage.setItem('finsage_token', newToken)
    localStorage.setItem('finsage_user', JSON.stringify(newUser))
    router.push('/')
  }

  const signup = (newToken: string, newUser: User) => {
    login(newToken, newUser)
  }

  return (
    <AuthContext.Provider value={{ user, token, login, signup, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
