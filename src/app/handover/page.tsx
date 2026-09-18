'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'

export default function HandoverPage() {
  const supabase = createClient()
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [notes, setNotes] = useState<any[]>([])
  const [note, setNote] = useState('')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      setUserName(profile?.full_name || '')
      await loadNotes()
    }
    init()
  }, [])

  async function loadNotes() {
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('handover_notes')
      .select('*')
      .eq('note_date', today)
      .order('created_at', { ascending: false })
    setNotes(data || [])
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim()) return

    const { error } = await supabase.from('handover_notes').insert({
      note_date: new Date().toISOString().slice(0, 10),
      note: note.trim(),
      created_by_name: userName,
    })

    if (error) { alert(error.message); return }
    setNote('')
    setShowForm(false)
    await loadNotes()
  }

  async function markSeen(id: string) {
    await supabase.from('handover_notes').update({ is_seen: true }).eq('id', id)
    await loadNotes()
  }

  return (
    <AppShell userName={userName}>
      <div className="page-header">
        <h2>Daily Staff Handover</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Note'}
        </button>
      </div>

      <div className="alert">
        Quick shared notes so the next teacher or coordinator can see urgent information without relying only on verbal updates.
      </div>

      {showForm && (
        <div className="card">
          <div className="card-title">Add Handover Note</div>
          <form onSubmit={handleAdd}>
            <div className="form-group">
              <label>Note *</label>
              <textarea required rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Parent of Aarav will pick up early at 12:30. Siya was upset at lunch." />
            </div>
            <button type="submit" className="btn btn-primary">Save Note</button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-title">Today's Handover Notes</div>
        {notes.length === 0 ? (
          <p style={{ color: '#718096' }}>No handover notes for today.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Note</th>
                <th>By</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {notes.map(n => (
                <tr key={n.id}>
                  <td>{new Date(n.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{n.note}</td>
                  <td>{n.created_by_name || '—'}</td>
                  <td>
                    <span className={`badge ${n.is_seen ? 'badge-green' : 'badge-yellow'}`}>
                      {n.is_seen ? 'Seen' : 'New'}
                    </span>
                  </td>
                  <td>
                    {!n.is_seen && (
                      <button className="btn btn-sm btn-secondary" onClick={() => markSeen(n.id)}>Mark Seen</button>
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
