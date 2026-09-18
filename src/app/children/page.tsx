'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'

type Child = {
  id: string
  full_name: string
  class_name: string
  parent_name: string | null
  parent_phone: string | null
  is_active: boolean
  created_at?: string
}

const CLASS_OPTIONS = [
  'Nursery A', 'Nursery B',
  'LKG A', 'LKG B',
  'UKG A', 'UKG B',
  'Class_1 A', 'Class_1 B',
  'Class_2 A', 'Class_2 B',
  'Class_3 A', 'Class_3 B',
]

const emptyForm = {
  full_name: '',
  class_name: '',
  custom_class: '',
  parent_name: '',
  parent_phone: '',
}

type Banner = { type: 'success' | 'error'; message: string } | null

export default function ChildrenPage() {
  const supabase = createClient()
  const router = useRouter()

  const [userName, setUserName] = useState('')
  const [children, setChildren] = useState<Child[]>([])
  const [loading, setLoading] = useState(true)

  // UI state
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [banner, setBanner] = useState<Banner>(null)
  const [saving, setSaving] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()
      setUserName(profile?.full_name || '')

      await loadChildren()
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadChildren() {
    const { data, error } = await supabase
      .from('children')
      .select('*')
      .order('full_name')
    if (error) {
      setBanner({ type: 'error', message: error.message })
      return
    }
    setChildren((data as Child[]) || [])
  }

  function showBanner(type: 'success' | 'error', message: string) {
    setBanner({ type, message })
    setTimeout(() => setBanner(null), 3500)
  }

  function resetForm() {
    setForm({ ...emptyForm })
    setEditingId(null)
    setShowForm(false)
  }

  function startAdd() {
    setForm({ ...emptyForm })
    setEditingId(null)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function startEdit(c: Child) {
    const isCustom = !CLASS_OPTIONS.includes(c.class_name)
    setForm({
      full_name: c.full_name,
      class_name: isCustom ? 'Other' : c.class_name,
      custom_class: isCustom ? c.class_name : '',
      parent_name: c.parent_name || '',
      parent_phone: c.parent_phone || '',
    })
    setEditingId(c.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const finalClass =
      form.class_name === 'Other' ? form.custom_class.trim() : form.class_name

    if (!form.full_name.trim() || !finalClass) {
      showBanner('error', 'Name and class are required.')
      return
    }

    setSaving(true)

    const payload = {
      full_name: form.full_name.trim(),
      class_name: finalClass,
      parent_name: form.parent_name.trim() || null,
      parent_phone: form.parent_phone.trim() || null,
    }

    if (editingId) {
      const { error } = await supabase
        .from('children')
        .update(payload)
        .eq('id', editingId)
      setSaving(false)
      if (error) { showBanner('error', error.message); return }
      showBanner('success', 'Child updated.')
    } else {
      const { error } = await supabase.from('children').insert(payload)
      setSaving(false)
      if (error) { showBanner('error', error.message); return }
      showBanner('success', 'Child added.')
    }

    resetForm()
    await loadChildren()
  }

  async function toggleActive(c: Child) {
    const { error } = await supabase
      .from('children')
      .update({ is_active: !c.is_active })
      .eq('id', c.id)
    if (error) { showBanner('error', error.message); return }
    showBanner('success', c.is_active ? 'Child marked inactive.' : 'Child reactivated.')
    await loadChildren()
  }

  async function softDelete(c: Child) {
    if (!confirm(`Deactivate ${c.full_name}? Their records will be kept.`)) return
    const { error } = await supabase
      .from('children')
      .update({ is_active: false })
      .eq('id', c.id)
    if (error) { showBanner('error', error.message); return }
    showBanner('success', 'Child deactivated.')
    await loadChildren()
  }

  async function hardDelete(c: Child) {
    const step1 = confirm(
      `⚠️ PERMANENTLY delete ${c.full_name}?\n\nThis will also DELETE all their attendance, fees, communication and progress notes. This cannot be undone.`
    )
    if (!step1) return

    const typed = prompt(`Type DELETE to confirm permanent deletion of ${c.full_name}:`)
    if (typed !== 'DELETE') {
      showBanner('error', 'Hard delete cancelled.')
      return
    }

    const { error } = await supabase.from('children').delete().eq('id', c.id)
    if (error) { showBanner('error', error.message); return }
    showBanner('success', 'Child permanently deleted.')
    await loadChildren()
  }

  // Derived lists
  const availableClasses = useMemo(() => {
    const set = new Set<string>()
    children.forEach(c => set.add(c.class_name))
    return Array.from(set).sort()
  }, [children])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return children.filter(c => {
      if (!showInactive && !c.is_active) return false
      if (classFilter && c.class_name !== classFilter) return false
      if (q) {
        const hay = `${c.full_name} ${c.parent_name || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [children, search, classFilter, showInactive])

  const activeCount = children.filter(c => c.is_active).length

  if (loading) {
    return (
      <AppShell userName={userName}>
        <div style={{ padding: 40, textAlign: 'center', color: '#718096' }}>
          Loading children…
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell userName={userName}>
      <div className="page-header">
        <h2>Children</h2>
        <button className="btn btn-primary" onClick={showForm ? resetForm : startAdd}>
          {showForm ? 'Cancel' : '+ Add Child'}
        </button>
      </div>

      {banner && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 6,
            marginBottom: 14,
            fontSize: '0.9rem',
            background: banner.type === 'success' ? '#c6f6d5' : '#fed7d7',
            color: banner.type === 'success' ? '#22543d' : '#822727',
            border: `1px solid ${banner.type === 'success' ? '#9ae6b4' : '#feb2b2'}`,
          }}
        >
          {banner.message}
        </div>
      )}

      {showForm && (
        <div className="card">
          <div className="card-title">
            {editingId ? 'Edit Child' : 'Add Child'}
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  required
                  value={form.full_name}
                  onChange={e => setForm({ ...form, full_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Class *</label>
                <select
                  required
                  value={form.class_name}
                  onChange={e => setForm({ ...form, class_name: e.target.value })}
                >
                  <option value="">Select class</option>
                  {CLASS_OPTIONS.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value="Other">Other (type below)</option>
                </select>
              </div>
            </div>

            {form.class_name === 'Other' && (
              <div className="form-group">
                <label>Custom Class Name *</label>
                <input
                  required
                  value={form.custom_class}
                  onChange={e => setForm({ ...form, custom_class: e.target.value })}
                  placeholder="e.g. Class_4 A"
                />
              </div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label>Parent Name</label>
                <input
                  value={form.parent_name}
                  onChange={e => setForm({ ...form, parent_name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Parent Phone</label>
                <input
                  value={form.parent_phone}
                  onChange={e => setForm({ ...form, parent_phone: e.target.value })}
                  placeholder="98XXXXXXXX"
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Update Child' : 'Save Child'}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: 14,
          }}
        >
          <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
            <label>Search</label>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Name or parent…"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
            <label>Class</label>
            <select value={classFilter} onChange={e => setClassFilter(e.target.value)}>
              <option value="">All classes</option>
              {availableClasses.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.9rem',
              marginTop: 18,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
            />
            Show inactive
          </label>
        </div>

        <div className="card-title" style={{ marginTop: 0 }}>
          {filtered.length} of {children.length} children
          {!showInactive && ` · ${activeCount} active`}
        </div>

        {filtered.length === 0 ? (
          <p style={{ color: '#718096' }}>
            {children.length === 0
              ? 'No children yet. Click “+ Add Child”.'
              : 'No matches for these filters.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Class</th>
                  <th>Parent</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th style={{ width: 220 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} style={{ opacity: c.is_active ? 1 : 0.55 }}>
                    <td><strong>{c.full_name}</strong></td>
                    <td>{c.class_name}</td>
                    <td>{c.parent_name || '—'}</td>
                    <td>{c.parent_phone || '—'}</td>
                    <td>
                      <span className={`badge ${c.is_active ? 'badge-green' : 'badge-gray'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => startEdit(c)}
                          title="Edit"
                        >
                          ✏️ Edit
                        </button>
                        {c.is_active ? (
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => softDelete(c)}
                            title="Deactivate"
                          >
                            🗑 Deactivate
                          </button>
                        ) : (
                          <>
                            <button
                              className="btn btn-sm btn-success"
                              onClick={() => toggleActive(c)}
                              title="Reactivate"
                            >
                              ↺ Reactivate
                            </button>
                            <button
                              className="btn btn-sm btn-secondary"
                              onClick={() => hardDelete(c)}
                              title="Permanently delete"
                              style={{ color: '#c53030', borderColor: '#fc8181' }}
                            >
                              ⚠️ Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  )
}
