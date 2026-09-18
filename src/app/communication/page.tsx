'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'

type Child = { id: string; full_name: string; class_name: string }

export default function CommunicationPage() {
  const supabase = createClient()
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [children, setChildren] = useState<Child[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    child_id: '',
    message_summary: '',
    channel: 'WhatsApp',
    action_required: '',
    status: 'Open',
    handled_by: '',
  })

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      setUserName(profile?.full_name || '')
      const { data: kids } = await supabase.from('children').select('id, full_name, class_name').eq('is_active', true).order('full_name')
      setChildren(kids || [])
      await loadLogs()
    }
    init()
  }, [])

  async function loadLogs() {
    const { data } = await supabase
      .from('communications')
      .select('*, children(full_name)')
      .order('log_date', { ascending: false })
    setLogs(data || [])
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.child_id || !form.message_summary) return

    const { error } = await supabase.from('communications').insert({
      child_id: form.child_id,
      log_date: new Date().toISOString().slice(0, 10),
      message_summary: form.message_summary,
      channel: form.channel,
      action_required: form.action_required,
      status: form.status,
      handled_by: form.handled_by || userName,
    })

    if (error) { alert(error.message); return }
    setShowForm(false)
    setForm({ child_id: '', message_summary: '', channel: 'WhatsApp', action_required: '', status: 'Open', handled_by: '' })
    await loadLogs()
  }

  async function markClosed(id: string) {
    await supabase.from('communications').update({ status: 'Closed' }).eq('id', id)
    await loadLogs()
  }

  return (
    <AppShell userName={userName}>
      <div className="page-header">
        <h2>Parent Communication Log</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Message'}
        </button>
      </div>

      <div className="alert">
        Important parent messages are summarised here instead of living only in WhatsApp chats.
      </div>

      {showForm && (
        <div className="card">
          <div className="card-title">Log Parent Communication</div>
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
                <label>Channel</label>
                <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Call">Call</option>
                  <option value="In-person">In-person</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Message Summary *</label>
              <textarea required rows={2} value={form.message_summary} onChange={e => setForm({ ...form, message_summary: e.target.value })} placeholder="What did the parent say or ask?" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Action Required</label>
                <input value={form.action_required} onChange={e => setForm({ ...form, action_required: e.target.value })} placeholder="e.g. Teacher to reply with worksheet" />
              </div>
              <div className="form-group">
                <label>Handled By</label>
                <input value={form.handled_by} onChange={e => setForm({ ...form, handled_by: e.target.value })} placeholder={userName} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary">Save</button>
          </form>
        </div>
      )}

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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {logs.map(c => (
                <tr key={c.id}>
                  <td>{c.log_date}</td>
                  <td><strong>{c.children?.full_name}</strong></td>
                  <td>{c.message_summary}</td>
                  <td>{c.channel}</td>
                  <td>{c.action_required || '—'}</td>
                  <td>
                    <span className={`badge ${c.status === 'Open' ? 'badge-yellow' : 'badge-green'}`}>{c.status}</span>
                  </td>
                  <td>{c.handled_by || '—'}</td>
                  <td>
                    {c.status === 'Open' && (
                      <button className="btn btn-sm btn-success" onClick={() => markClosed(c.id)}>Close</button>
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
