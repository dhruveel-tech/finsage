import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/components/AuthContext'

export const metadata: Metadata = {
  title: 'FinSage — AI Financial Advisor',
  description: 'Your AI-powered personal financial advisor',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
