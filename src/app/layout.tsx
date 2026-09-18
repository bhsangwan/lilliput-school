import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lilliput Play School – Data System',
  description: 'Internal data management for Lilliput Play School',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
