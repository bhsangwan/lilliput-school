'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'
import Link from 'next/link'


type Child = {
  id: string
  full_name: string
  class_name: string
  parent_name: string | null
  parent_phone: string | null
  is_active: boolean
  family_id: string | null
  created_at?: string
}

type Family = {
  id: string
  family_name: string
  primary_parent_name: string | null
  primary_parent_phone: string | null
  address: string | null
  notes: string | null
  created_at?: string
}

type Fee = {
  id: string
  child_id: string
  amount: number
  status: 'Paid' | 'Pending' | 'Partial'
}

type Payment = {
  id: string
  child_id: string
  amount: number
}

const CLASS_OPTIONS = [
  'Nursery A','Nursery B',
  'LKG A','LKG B',
  'UKG A','UKG B',
  'Class_1 A','Class_1 B',
  'Class_2 A','Class_2 B',
  'Class_3 A','Class_3 B',
]

const emptyForm = {
  full_name: '',
  class_name: '',
  custom_class: '',
  parent_name: '',
  parent_phone: '',
}

type Banner = { type: 'success' | 'error'; message: string } | null
type ViewMode = 'children' | 'families'

export default function ChildrenPage() {
  const supabase = createClient()
  const router = useRouter()

  const [userName, setUserName] = useState('')
  const [children, setChildren] = useState<Child[]>([])
  const [families, setFamilies] = useState<Family[]>([])
  const [fees, setFees] = useState<Fee[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  const [view, setView] = useState<ViewMode>('children')

  // Child form
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [banner, setBanner] = useState<Banner>(null)
  const [saving, setSaving] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // Ledger drawer
  const [ledgerFamilyId, setLedgerFamilyId] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('profiles').select('full_name').eq('id', user.id).single()
      setUserName(profile?.full_name || '')
      await loadAll()
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadAll() {
    const { data: cData, error: cErr } = await supabase
      .from('children').select('*').order('full_name')
    if (cErr) { showBanner('error', cErr.message); return }
    setChildren((cData as Child[]) || [])

    const { data: fData, error: fErr } = await supabase
      .from('families').select('*').order('family_name')
    if (fErr) { showBanner('error', fErr.message); return }
    setFamilies((fData as Family[]) || [])

    const { data: feeData } = await supabase.from('fees').select('id, child_id, amount, status')
    setFees((feeData as Fee[]) || [])

    const { data: payData } = await supabase.from('fee_payments').select('id, child_id, amount')
    setPayments((payData as Payment[]) || [])
  }

  function showBanner(type: 'success' | 'error', message: string) {
    setBanner({ type, message })
    setTimeout(() => setBanner(null), 3500)
  }

  // ---- Map helpers ----
  const childrenByFamily = useMemo(() => {
    const m = new Map<string, Child[]>()
    children.forEach(c => {
      if (!c.family_id) return
      const arr = m.get(c.family_id) || []
      arr.push(c)
      m.set(c.family_id, arr)
    })
    return m
  }, [children])

  // ---- Family totals: expected/paid/balance per family ----
  const familyTotals = useMemo(() => {
    const paidByChild = new Map<string, number>()
    payments.forEach(p => {
      paidByChild.set(p.child_id, (paidByChild.get(p.child_id) || 0) + Number(p.amount))
    })

    const m = new Map<string, { expected: number; paid: number; balance: number; childCount: number }>()
    families.forEach(f => {
      m.set(f.id, { expected: 0, paid: 0, balance: 0, childCount: 0 })
    })
    children.forEach(c => {
      if (!c.family_id) return
      const row = m.get(c.family_id)
      if (!row) return
      row.childCount += 1
    })
    fees.forEach(f => {
      const child = children.find(c => c.id === f.child_id)
      if (!child || !child.family_id) return
      const row = m.get(child.family_id)
      if (!row) return
      row.expected += Number(f.amount)
    })
    payments.forEach(p => {
      const child = children.find(c => c.id === p.child_id)
      if (!child || !child.family_id) return
      const row = m.get(child.family_id)
      if (!row) return
      row.paid += Number(p.amount)
    })
    m.forEach(row => { row.balance = Math.max(row.expected - row.paid, 0) })
    return m
  }, [families, children, fees, payments])

  // ---- Derived lists ----
  const availableClasses = useMemo(() => {
    const set = new Set<string>()
    children.forEach(c => set.add(c.class_name))
    return Array.from(set).sort()
  }, [children])

  const filteredChildren = useMemo(() => {
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

  const filteredFamilies = useMemo(() => {
    const q = search.trim().toLowerCase()
    return families
      .map(f => {
        const kids = childrenByFamily.get(f.id) || []
        const totals = familyTotals.get(f.id) || { expected: 0, paid: 0, balance: 0, childCount: 0 }
        return { family: f, kids, totals }
      })
      .filter(({ family, kids }) => {
        if (q) {
          const hay = `${family.family_name} ${family.primary_parent_name || ''} ${family.primary_parent_phone || ''} ${kids.map(k => k.full_name).join(' ')}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => a.family.family_name.localeCompare(b.family.family_name))
  }, [families, childrenByFamily, familyTotals, search])

  // ---- Form actions ----
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
    const finalClass = form.class_name === 'Other' ? form.custom_class.trim() : form.class_name
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

    let error
    if (editingId) {
      ({ error } = await supabase.from('children').update(payload).eq('id', editingId))
    } else {
      // Auto-assign family by phone (option C: auto + manual)
      const phone = payload.parent_phone
      if (phone) {
        const { data: existingFam } = await supabase
          .from('families').select('id').eq('primary_parent_phone', phone).maybeSingle()
        let familyId = existingFam?.id
        if (!familyId) {
          const { data: newFam } = await supabase
            .from('families').insert({
              family_name: (payload.parent_name || payload.full_name) + ' Family',
              primary_parent_name: payload.parent_name,
              primary_parent_phone: phone,
            }).select('id').single()
          familyId = newFam?.id
        }
        ({ error } = await supabase.from('children').insert({ ...payload, family_id: familyId }))
      } else {
        ({ error } = await supabase.from('children').insert(payload))
      }
    }
    setSaving(false)
    if (error) { showBanner('error', error.message); return }
    showBanner('success', editingId ? 'Child updated.' : 'Child added.')
    resetForm()
    await loadAll()
  }

  async function toggleActive(c: Child) {
    const { error } = await supabase
      .from('children').update({ is_active: !c.is_active }).eq('id', c.id)
    if (error) { showBanner('error', error.message); return }
    showBanner('success', c.is_active ? 'Child marked inactive.' : 'Child reactivated.')
    await loadAll()
  }

  async function softDelete(c: Child) {
    if (!confirm(`Deactivate ${c.full_name}? Their records will be kept.`)) return
    const { error } = await supabase
      .from('children').update({ is_active: false }).eq('id', c.id)
    if (error) { showBanner('error', error.message); return }
    showBanner('success', 'Child deactivated.')
    await loadAll()
  }

  async function hardDelete(c: Child) {
    const step1 = confirm(
      `⚠️ PERMANENTLY delete ${c.full_name}?\n\nThis will also DELETE all their attendance, fees, communication and progress notes. This cannot be undone.`
    )
    if (!step1) return
    const typed = prompt(`Type DELETE to confirm permanent deletion of ${c.full_name}:`)
    if (typed !== 'DELETE') { showBanner('error', 'Hard delete cancelled.'); return }
    const { error } = await supabase.from('children').delete().eq('id', c.id)
    if (error) { showBanner('error', error.message); return }
    showBanner('success', 'Child permanently deleted.')
    await loadAll()
  }

  // ---- Ledger drawer data ----
  const ledgerFamily = useMemo(
    () => families.find(f => f.id === ledgerFamilyId) || null,
    [families, ledgerFamilyId]
  )
  const ledgerChildren = useMemo(
    () => (ledgerFamilyId ? childrenByFamily.get(ledgerFamilyId) || [] : []),
    [ledgerFamilyId, childrenByFamily]
  )
  const ledgerTotals = useMemo(
    () => (ledgerFamilyId ? familyTotals.get(ledgerFamilyId) : null),
    [ledgerFamilyId, familyTotals]
  )

  if (loading) {
    return (
      <AppShell userName={userName}>
        <div style={{ padding: 40, textAlign: 'center', color: '#718096' }}>Loading…</div>
      </AppShell>
    )
  }

  return (
    <AppShell userName={userName}>
      <div className="page-header">
        <h2>Children</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className={view === 'children' ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setView('children')}
          >
            Children ({children.length})
          </button>
          <button
            className={view === 'families' ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => setView('families')}
          >
            Families ({families.length})
          </button>
          {view === 'children' && (
            <button className="btn btn-primary" onClick={showForm ? resetForm : startAdd}>
              {showForm ? 'Cancel' : '+ Add Child'}
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div style={{
          padding: '10px 14px', borderRadius: 6, marginBottom: 14, fontSize: '0.9rem',
          background: banner.type === 'success' ? '#c6f6d5' : '#fed7d7',
          color: banner.type === 'success' ? '#22543d' : '#822727',
          border: `1px solid ${banner.type === 'success' ? '#9ae6b4' : '#feb2b2'}`,
        }}>{banner.message}</div>
      )}

      {showForm && view === 'children' && (
        <div className="card">
          <div className="card-title">{editingId ? 'Edit Child' : 'Add Child'}</div>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Full Name *</label>
                <input required value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Class *</label>
                <select required value={form.class_name} onChange={e => setForm({ ...form, class_name: e.target.value })}>
                  <option value="">Select class</option>
                  {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="Other">Other (type below)</option>
                </select>
              </div>
            </div>
            {form.class_name === 'Other' && (
              <div className="form-group">
                <label>Custom Class Name *</label>
                <input required value={form.custom_class} onChange={e => setForm({ ...form, custom_class: e.target.value })} />
              </div>
            )}
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
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Update Child' : 'Save Child'}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 220, flex: 1 }}>
            <label>Search {view === 'children' ? 'child or parent' : 'family, parent, phone, or child'}</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Type to search…" />
          </div>
          {view === 'children' && (
            <>
              <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
                <label>Class</label>
                <select value={classFilter} onChange={e => setClassFilter(e.target.value)}>
                  <option value="">All classes</option>
                  {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem', marginTop: 18, cursor: 'pointer' }}>
                <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
                Show inactive
              </label>
            </>
          )}
        </div>

        {/* CHILDREN VIEW */}
        {view === 'children' && (
          <>
            <div className="card-title" style={{ marginTop: 0 }}>
              {filteredChildren.length} of {children.length} children
            </div>
            {filteredChildren.length === 0 ? (
              <p style={{ color: '#718096' }}>No matches.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Class</th>
                      <th>Parent</th>
                      <th>Phone</th>
                      <th>Family</th>
                      <th>Status</th>
                      <th style={{ width: 220 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredChildren.map(c => {
                      const fam = c.family_id ? families.find(f => f.id === c.family_id) : null
                      return (
                        <tr key={c.id} style={{ opacity: c.is_active ? 1 : 0.55 }}>
                          <td>
  <Link href={`/students/${c.id}`} style={{ color: '#2b6cb0', textDecoration: 'none', fontWeight: 600 }}>
    {c.full_name}
  </Link>
</td>
                          <td>{c.class_name}</td>
                          <td>{c.parent_name || '—'}</td>
                          <td>{c.parent_phone || '—'}</td>
                          <td>
                            {fam ? (
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => setLedgerFamilyId(fam.id)}
                                title="Open family ledger"
                              >
                                {fam.family_name}
                              </button>
                            ) : '—'}
                          </td>
                          <td>
                            <span className={`badge ${c.is_active ? 'badge-green' : 'badge-gray'}`}>
                              {c.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button className="btn btn-sm btn-secondary" onClick={() => startEdit(c)}>✏️ Edit</button>
                              {c.is_active ? (
                                <button className="btn btn-sm btn-secondary" onClick={() => softDelete(c)}>🗑 Deactivate</button>
                              ) : (
                                <>
                                  <button className="btn btn-sm btn-success" onClick={() => toggleActive(c)}>↺ Reactivate</button>
                                  <button
                                    className="btn btn-sm btn-secondary"
                                    style={{ color: '#c53030', borderColor: '#fc8181' }}
                                    onClick={() => hardDelete(c)}
                                  >⚠️ Delete</button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* FAMILIES VIEW */}
        {view === 'families' && (
          <>
            <div className="card-title" style={{ marginTop: 0 }}>
              {filteredFamilies.length} of {families.length} families
            </div>
            {filteredFamilies.length === 0 ? (
              <p style={{ color: '#718096' }}>No matches.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Family</th>
                      <th>Parent</th>
                      <th>Phone</th>
                      <th>Children</th>
                      <th>Total Expected</th>
                      <th>Total Paid</th>
                      <th>Balance</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFamilies.map(({ family: f, kids, totals }) => (
                      <tr key={f.id}>
                        <td><strong>{f.family_name}</strong></td>
                        <td>{f.primary_parent_name || '—'}</td>
                        <td>{f.primary_parent_phone || '—'}</td>
                        <td>
                          <div style={{ fontSize: '0.85rem' }}>
                            {kids.map(k => (
                              <div key={k.id}>
                                {k.full_name} <span style={{ color: '#718096' }}>({k.class_name})</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td>Rs {totals.expected.toLocaleString('en-IN')}</td>
                        <td style={{ color: '#2f855a' }}>Rs {totals.paid.toLocaleString('en-IN')}</td>
                        <td style={{ color: totals.balance > 0 ? '#c53030' : '#2f855a', fontWeight: 600 }}>
                          Rs {totals.balance.toLocaleString('en-IN')}
                        </td>
                        <td>
                          <button className="btn btn-sm btn-primary" onClick={() => setLedgerFamilyId(f.id)}>
                            👁 Ledger
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Ledger Drawer */}
      {ledgerFamily && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'flex-end', zIndex: 1000,
        }} onClick={() => setLedgerFamilyId(null)}>
          <div
            style={{
              width: '100%', maxWidth: 640, background: 'white',
              height: '100%', overflowY: 'auto', padding: 24,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0 }}>{ledgerFamily.family_name}</h3>
                <div style={{ fontSize: '0.9rem', color: '#4a5568' }}>
                  {ledgerFamily.primary_parent_name || '—'} · {ledgerFamily.primary_parent_phone || '—'}
                </div>
              </div>
              <button className="btn btn-secondary" onClick={() => setLedgerFamilyId(null)}>Close</button>
            </div>

            {ledgerTotals && (
              <div className="grid" style={{ marginBottom: 16 }}>
                <div className="stat info">
                  <div className="label">Expected</div>
                  <div className="value">Rs {ledgerTotals.expected.toLocaleString('en-IN')}</div>
                </div>
                <div className="stat">
                  <div className="label">Paid</div>
                  <div className="value" style={{ color: '#2f855a' }}>Rs {ledgerTotals.paid.toLocaleString('en-IN')}</div>
                </div>
                <div className="stat warning">
                  <div className="label">Balance</div>
                  <div className="value">Rs {ledgerTotals.balance.toLocaleString('en-IN')}</div>
                </div>
              </div>
            )}

            <h4 style={{ marginTop: 20 }}>Children ({ledgerChildren.length})</h4>
            {ledgerChildren.map(k => (
              <div key={k.id} className="card" style={{ marginBottom: 10, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <strong>{k.full_name}</strong>
                    <div style={{ fontSize: '0.85rem', color: '#718096' }}>{k.class_name}</div>
                  </div>
                  <span className="badge badge-green">{k.is_active ? 'Active' : 'Inactive'}</span>
                </div>
              </div>
            ))}

            <p style={{ color: '#718096', fontSize: '0.85rem', marginTop: 16 }}>
              Full payment ledger for each child is available on the Fees page. This drawer shows the family-level rollup.
            </p>
          </div>
        </div>
      )}
    </AppShell>
  )
}
