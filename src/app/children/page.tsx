'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'

type Child = {
  id: string
  full_name: string
  class_name: string
  parent_name: string
  parent_phone: string
  is_active: boolean
}

export default function ChildrenPage() {
  const supabase = createClient()
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [children, setChildren] = useState<Child[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ full_name: '', class_name: '', parent_name: '', parent_phone: '' })

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      setUserName(profile?.full_name || '')
      await loadChildren()
    }
    init()
  }, [])

  async function loadChildren() {
    const { data } = await supabase.from('children').select('*').order('full_name')
    setChildren(data || [])
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('children').insert(form)
    if (error) { alert(error.message); return }
    setShowForm(false)
    setForm({ full_name: '', class_name: '', parent_name: '', parent_phone: '' })
    await loadChildren()
  }

  return (
    <AppShell userName={userName}>
      <div className="page-header">
        <h2>Children</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Child'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <div className="card-title">Add Child</div>
          <form onSubmit={handleAdd}>
            <div className="form-row">
              <div className="form-group">
                <label>Full Name *</label>
                <input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Class *</label>
                <input required value={form.class_name} onChange={e => setForm({ ...form, class_name: e.target.value })} placeholder="e.g. Nursery A" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Parent Name</label>
                <input value={form.parent_name} onChange={e => setForm({ ...form, parent_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Parent Phone</label>
                <input value={form.parent_phone} onChange={e => setForm({ ...form, parent_phone: e.target.value })} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary">Save</button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-title">All Children ({children.length})</div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Class</th>
              <th>Parent</th>
              <th>Phone</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {children.map(c => (
              <tr key={c.id}>
                <td><strong>{c.full_name}</strong></td>
                <td>{c.class_name}</td>
                <td>{c.parent_name || '—'}</td>
                <td>{c.parent_phone || '—'}</td>
                <td>
                  <span className={`badge ${c.is_active ? 'badge-green' : 'badge-gray'}`}>
                    {c.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  )
}
