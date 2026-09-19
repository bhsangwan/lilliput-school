'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'
import Link from 'next/link'


type Child = { id: string; full_name: string; class_name: string }

export default function ProgressPage() {
  const supabase = createClient()
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [children, setChildren] = useState<Child[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    child_id: '',
    category: 'Learning',
    note: '',
    needs_support: false,
    recorded_by: '',
  })

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      setUserName(profile?.full_name || '')
      const { data: kids } = await supabase.from('children').select('id, full_name, class_name').eq('is_active', true).order('full_name')
      setChildren(kids || [])
      await loadNotes()
    }
    init()
  }, [])

  async function loadNotes() {
    const { data } = await supabase
      .from('progress_notes')
      .select('*, children(full_name, class_name)')
      .order('note_date', { ascending: false })
    setNotes(data || [])
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.child_id || !form.note) return

    const { error } = await supabase.from('progress_notes').insert({
      child_id: form.child_id,
      note_date: new Date().toISOString().slice(0, 10),
      category: form.category,
      note: form.note,
      needs_support: form.needs_support,
      recorded_by: form.recorded_by || userName,
    })

    if (error) { alert(error.message); return }
    setShowForm(false)
    setForm({ child_id: '', category: 'Learning', note: '', needs_support: false, recorded_by: '' })
    await loadNotes()
  }

  return (
    <AppShell userName={userName}>
      <div className="page-header">
        <h2>Child Progress & Support Notes</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Note'}
        </button>
      </div>

      <div className="alert">
        Record observations, behaviour, health and support needs here so information is not lost in memory or separate folders.
      </div>

      {showForm && (
        <div className="card">
          <div className="card-title">Add Progress Note</div>
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
                <label>Category *</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  <option value="Learning">Learning</option>
                  <option value="Behaviour">Behaviour</option>
                  <option value="Health">Health</option>
                  <option value="Social">Social</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Note *</label>
              <textarea required rows={3} value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Write observation or support need..." />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>
                  <input type="checkbox" checked={form.needs_support} onChange={e => setForm({ ...form, needs_support: e.target.checked })} /> Needs extra support
                </label>
              </div>
              <div className="form-group">
                <label>Recorded By</label>
                <input value={form.recorded_by} onChange={e => setForm({ ...form, recorded_by: e.target.value })} placeholder={userName} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary">Save Note</button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-title">Recent Notes</div>
        {notes.length === 0 ? (
          <p style={{ color: '#718096' }}>No notes yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Child</th>
                <th>Class</th>
                <th>Category</th>
                <th>Note</th>
                <th>Support</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {notes.map(n => (
                <tr key={n.id}>
                  <td>{n.note_date}</td>
                  <td>
  <Link href={`/students/${n.child_id}`} style={{ color: '#2b6cb0', textDecoration: 'none', fontWeight: 600 }}>
    {n.children?.full_name}
  </Link>
</td>
                  <td>{n.children?.class_name}</td>
                  <td><span className="badge badge-blue">{n.category}</span></td>
                  <td>{n.note}</td>
                  <td>{n.needs_support ? <span className="badge badge-yellow">Yes</span> : '—'}</td>
                  <td>{n.recorded_by || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  )
}
