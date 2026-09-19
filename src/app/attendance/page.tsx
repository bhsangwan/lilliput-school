'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Child = { id: string; full_name: string; class_name: string }
type Attendance = {
  id: string
  child_id: string
  attendance_date: string
  status: string
  follow_up_status: string
  follow_up_note: string
  parent_response: string
  action_by: string
  children?: { full_name: string; class_name: string }
}

export default function AttendancePage() {
  const supabase = createClient()
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [children, setChildren] = useState<Child[]>([])
  const [records, setRecords] = useState<Attendance[]>([])
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    child_id: '',
    status: 'Absent',
    follow_up_status: 'Pending',
    follow_up_note: '',
    parent_response: '',
    action_by: '',
  })

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      setUserName(profile?.full_name || '')

      const { data: kids } = await supabase.from('children').select('id, full_name, class_name').eq('is_active', true).order('full_name')
      setChildren(kids || [])

      await loadRecords(date)
      setLoading(false)
    }
    init()
  }, [])

  async function loadRecords(d: string) {
    const { data } = await supabase
      .from('attendance')
      .select('*, children(full_name, class_name)')
      .eq('attendance_date', d)
      .order('created_at', { ascending: false })
    setRecords(data || [])
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.child_id) return

    const { error } = await supabase.from('attendance').upsert({
      child_id: form.child_id,
      attendance_date: date,
      status: form.status,
      follow_up_status: form.status === 'Present' ? 'None' : form.follow_up_status,
      follow_up_note: form.follow_up_note,
      parent_response: form.parent_response,
      action_by: form.action_by || userName,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'child_id,attendance_date' })

    if (error) {
      alert(error.message)
      return
    }

    setShowForm(false)
    setForm({ child_id: '', status: 'Absent', follow_up_status: 'Pending', follow_up_note: '', parent_response: '', action_by: '' })
    await loadRecords(date)
  }

  async function updateFollowUp(id: string, status: string) {
    await supabase.from('attendance').update({
      follow_up_status: status,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    await loadRecords(date)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>

  return (
    <AppShell userName={userName}>
      <div className="page-header">
        <h2>Attendance & Follow-up</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Record'}
        </button>
      </div>

      <div className="alert">
        Attendance + parent contact + next action stay together — solving the fragmentation found in the research.
      </div>

      <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Date</label>
          <input
            type="date"
            value={date}
            onChange={async e => {
              setDate(e.target.value)
              await loadRecords(e.target.value)
            }}
            style={{ width: 'auto' }}
          />
        </div>
        <div>
          <span className="badge badge-red">{records.filter(r => r.status === 'Absent').length} Absent</span>{' '}
          <span className="badge badge-yellow">{records.filter(r => r.status === 'Late').length} Late</span>{' '}
          <span className="badge badge-green">{records.filter(r => r.status === 'Present').length} Present</span>
        </div>
      </div>

      {showForm && (
        <div className="card">
          <div className="card-title">Add / Update Attendance</div>
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
                <label>Status *</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="Present">Present</option>
                  <option value="Absent">Absent</option>
                  <option value="Late">Late</option>
                </select>
              </div>
            </div>
            {form.status !== 'Present' && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label>Follow-up Status</label>
                    <select value={form.follow_up_status} onChange={e => setForm({ ...form, follow_up_status: e.target.value })}>
                      <option value="Pending">Pending</option>
                      <option value="Contacted">Contacted</option>
                      <option value="Resolved">Resolved</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Action By</label>
                    <input type="text" value={form.action_by} onChange={e => setForm({ ...form, action_by: e.target.value })} placeholder={userName} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Follow-up Note</label>
                  <textarea rows={2} value={form.follow_up_note} onChange={e => setForm({ ...form, follow_up_note: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Parent Response</label>
                  <input type="text" value={form.parent_response} onChange={e => setForm({ ...form, parent_response: e.target.value })} />
                </div>
              </>
            )}
            <button type="submit" className="btn btn-primary">Save</button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-title">Records for {date}</div>
        {records.length === 0 ? (
          <p style={{ color: '#718096' }}>No records for this date. Click “Add Record”.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Child</th>
                <th>Class</th>
                <th>Status</th>
                <th>Follow-up</th>
                <th>Note / Response</th>
                <th>Action By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td>
  <Link href={`/students/${r.child_id}`} style={{ color: '#2b6cb0', textDecoration: 'none', fontWeight: 600 }}>
    {r.children?.full_name}
  </Link>
</td>
                  <td>{r.children?.class_name}</td>
                  <td>
                    <span className={`badge ${r.status === 'Present' ? 'badge-green' : r.status === 'Late' ? 'badge-yellow' : 'badge-red'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${
                      r.follow_up_status === 'Resolved' ? 'badge-green' :
                      r.follow_up_status === 'Contacted' ? 'badge-blue' :
                      r.follow_up_status === 'Pending' ? 'badge-yellow' : 'badge-gray'
                    }`}>{r.follow_up_status}</span>
                  </td>
                  <td>
                    {r.follow_up_note}
                    {r.parent_response && <div style={{ color: '#2b6cb0', fontSize: '0.82rem' }}>Parent: {r.parent_response}</div>}
                  </td>
                  <td>{r.action_by || '—'}</td>
                  <td>
                    {r.status !== 'Present' && r.follow_up_status !== 'Resolved' && (
                      <>
                        <button className="btn btn-sm btn-secondary" onClick={() => updateFollowUp(r.id, 'Contacted')}>Contacted</button>{' '}
                        <button className="btn btn-sm btn-success" onClick={() => updateFollowUp(r.id, 'Resolved')}>Resolve</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  )
}
