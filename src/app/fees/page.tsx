'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'

type Child = { id: string; full_name: string; class_name: string }

export default function FeesPage() {
  const supabase = createClient()
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [role, setRole] = useState('')
  const [children, setChildren] = useState<Child[]>([])
  const [fees, setFees] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    child_id: '',
    month_year: new Date().toISOString().slice(0, 7),
    amount: '4500',
    status: 'Pending',
    last_payment_date: '',
    notes: '',
  })

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase.from('profiles').select('full_name, role').eq('id', user.id).single()
      setUserName(profile?.full_name || '')
      setRole(profile?.role || '')

      const { data: kids } = await supabase.from('children').select('id, full_name, class_name').eq('is_active', true).order('full_name')
      setChildren(kids || [])
      await loadFees()
    }
    init()
  }, [])

  async function loadFees() {
    const { data } = await supabase
      .from('fees')
      .select('*, children(full_name, class_name)')
      .order('month_year', { ascending: false })
    setFees(data || [])
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.child_id) return

    const { error } = await supabase.from('fees').upsert({
      child_id: form.child_id,
      month_year: form.month_year,
      amount: Number(form.amount),
      status: form.status,
      last_payment_date: form.last_payment_date || null,
      notes: form.notes,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'child_id,month_year' })

    if (error) { alert(error.message); return }

    setShowForm(false)
    setForm({ child_id: '', month_year: new Date().toISOString().slice(0, 7), amount: '4500', status: 'Pending', last_payment_date: '', notes: '' })
    await loadFees()
  }

  return (
    <AppShell userName={userName}>
      <div className="page-header">
        <h2>Fee Tracker</h2>
        {(role === 'director' || role === 'coordinator' || role === 'office') && (
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ Add / Update Fee'}
          </button>
        )}
      </div>

      <div className="alert">
        Fee status is visible so reminders are not sent after payment has been received.
      </div>

      {showForm && (
        <div className="card">
          <div className="card-title">Add / Update Fee Record</div>
          <form onSubmit={handleAdd}>
            <div className="form-row">
              <div className="form-group">
                <label>Child *</label>
                <select required value={form.child_id} onChange={e => setForm({ ...form, child_id: e.target.value })}>
                  <option value="">Select child</option>
                  {children.map(c => (
                    <option key={c.id} value={c.id}>{c.full_name} ({c.class_name})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Month (YYYY-MM) *</label>
                <input required type="month" value={form.month_year} onChange={e => setForm({ ...form, month_year: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Amount (Rs) *</label>
                <input required type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Status *</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="Pending">Pending</option>
                  <option value="Partial">Partial</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Last Payment Date</label>
                <input type="date" value={form.last_payment_date} onChange={e => setForm({ ...form, last_payment_date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Paid 2000, balance remaining" />
              </div>
            </div>
            <button type="submit" className="btn btn-primary">Save</button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-title">Fee Records</div>
        {fees.length === 0 ? (
          <p style={{ color: '#718096' }}>No fee records yet.</p>
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
                  <td>Rs {f.amount}</td>
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
