'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'

export default function CommunicationPage() {
  const supabase = createClient()
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [logs, setLogs] = useState<any[]>([])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      setUserName(profile?.full_name || '')

      const { data } = await supabase
        .from('communications')
        .select('*, children(full_name)')
        .order('log_date', { ascending: false })
      setLogs(data || [])
    }
    init()
  }, [])

  return (
    <AppShell userName={userName}>
      <div className="page-header"><h2>Parent Communication Log</h2></div>
      <div className="alert">Important messages summarised here instead of living only in WhatsApp.</div>
      <div className="card">
        <div className="card-title">Communication Entries</div>
        {logs.length === 0 ? (
          <p style={{ color: '#718096' }}>No entries yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Child</th>
                <th>Summary</th>
                <th>Channel</th>
                <th>Action Required</th>
                <th>Status</th>
                <th>Handled By</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(c => (
                <tr key={c.id}>
                  <td>{c.log_date}</td>
                  <td><strong>{c.children?.full_name}</strong></td>
                  <td>{c.message_summary}</td>
                  <td>{c.channel}</td>
                  <td>{c.action_required}</td>
                  <td>
                    <span className={`badge ${c.status === 'Open' ? 'badge-yellow' : 'badge-green'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td>{c.handled_by || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  )
}
