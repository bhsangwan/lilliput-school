'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'

export default function FeesPage() {
  const supabase = createClient()
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [fees, setFees] = useState<any[]>([])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      setUserName(profile?.full_name || '')

      const { data } = await supabase
        .from('fees')
        .select('*, children(full_name, class_name)')
        .order('month_year', { ascending: false })
      setFees(data || [])
    }
    init()
  }, [])

  return (
    <AppShell userName={userName}>
      <div className="page-header"><h2>Fee Tracker</h2></div>
      <div className="alert">Status is visible so reminders are not sent after payment.</div>
      <div className="card">
        <div className="card-title">Fee Records</div>
        {fees.length === 0 ? (
          <p style={{ color: '#718096' }}>No fee records yet. You can add them via Supabase Table Editor or we can add a form next.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Child</th>
                <th>Class</th>
                <th>Month</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Last Payment</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {fees.map(f => (
                <tr key={f.id}>
                  <td><strong>{f.children?.full_name}</strong></td>
                  <td>{f.children?.class_name}</td>
                  <td>{f.month_year}</td>
                  <td>₹{f.amount}</td>
                  <td>
                    <span className={`badge ${f.status === 'Paid' ? 'badge-green' : f.status === 'Partial' ? 'badge-yellow' : 'badge-red'}`}>
                      {f.status}
                    </span>
                  </td>
                  <td>{f.last_payment_date || '—'}</td>
                  <td>{f.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  )
}
