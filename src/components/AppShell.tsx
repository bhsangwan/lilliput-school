'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/attendance', label: 'Attendance' },
  { href: '/fees', label: 'Fees' },
  { href: '/communication', label: 'Parent Log' },
  { href: '/progress', label: 'Progress' },
  { href: '/handover', label: 'Handover' },
  { href: '/children', label: 'Children' },
]

export default function AppShell({
  children,
  userName,
}: {
  children: React.ReactNode
  userName?: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div>
      <header className="app-header">
        <div>
          <h1>Lilliput Play School</h1>
          <p>Tiny Steps – Big Dreams · Internal Data System</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {userName && <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>{userName}</span>}
          <button
            onClick={handleLogout}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: 'white',
              padding: '5px 12px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <nav className="nav">
        {links.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className={pathname === l.href ? 'active' : ''}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      <main className="main">{children}</main>

      <footer>Lilliput Play School · Data under school control</footer>
    </div>
  )
}
