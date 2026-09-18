'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'

type Child = { id: string; full_name: string; class_name: string; parent_name: string | null; parent_phone: string | null }

type Fee = {
  id: string
  child_id: string
  month_year: string
  amount: number
  status: 'Paid' | 'Pending' | 'Partial'
  last_payment_date: string | null
  notes: string | null
  children?: { full_name: string; class_name: string; parent_name: string | null; parent_phone: string | null }
}

const CLASS_OPTIONS = [
  'Nursery A', 'Nursery B',
  'LKG A', 'LKG B',
  'UKG A', 'UKG B',
  'Class_1 A', 'Class_1 B',
  'Class_2 A', 'Class_2 B',
  'Class_3 A', 'Class_3 B',
]

const MONTHLY_AMOUNT = 3500
const ANNUAL_AMOUNT = 42000

const currentMonth = () => new Date().toISOString().slice(0, 7)   // "2026-09"
const currentYear = () => new Date().toISOString().slice(0, 4)    // "2026"

type PlanType = 'monthly' | 'annual'

const emptyForm = {
  child_id: '',
  plan: 'monthly' as PlanType,
  month_year: currentMonth(),
  year: currentYear(),
  amount: String(MONTHLY_AMOUNT),
  status: 'Pending' as 'Paid' | 'Pending' | 'Partial',
  last_payment_date: '',
  notes: '',
}

type Banner = { type: 'success' | 'error'; message: string } | null

// Whether a stored period string looks like "YYYY" (annual) or "YYYY-MM" (monthly)
function planOf(period: string): PlanType {
  return /^\d{4}$/.test(period) ? 'annual' : 'monthly'
}

export default function FeesPage() {
  const supabase = createClient()
  const router = useRouter()

  const [userName, setUserName] = useState('')
  const [role, setRole] = useState('')
  const [children, setChildren] = useState<Child[]>([])
  const [fees, setFees] = useState<Fee[]>([])
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [banner, setBanner] = useState<Banner>(null)
  const [saving, setSaving] = useState(false)

  // Bulk generate
  const [showBulk, setShowBulk] = useState(false)
  const [bulkPlan, setBulkPlan] = useState<PlanType>('monthly')
  const [bulkMonth, setBulkMonth] = useState(currentMonth())
  const [bulkYear, setBulkYear] = useState(currentYear())
  const [bulkClass, setBulkClass] = useState('')
  const [bulkAmount, setBulkAmount] = useState(String(MONTHLY_AMOUNT))
  const [bulkBusy, setBulkBusy] = useState(false)

  // Filters
  const [filterPeriod, setFilterPeriod] = useState('')
  const [filterPlan, setFilterPlan] = useState<'' | PlanType>('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [search, setSearch] = useState('')

  const canEdit = role === 'director' || role === 'coordinator' || role === 'office'

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles').select('full_name, role').eq('id', user.id).single()
      setUserName(profile?.full_name || '')
      setRole(profile?.role || '')

      const { data: kids } = await supabase
        .from('children')
        .select('id, full_name, class_name, parent_name, parent_phone')
        .eq('is_active', true)
        .order('full_name')
      setChildren((kids as Child[]) || [])

      await loadFees()
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadFees() {
    const { data, error } = await supabase
      .from('fees')
      .select('*, children(full_name, class_name, parent_name, parent_phone)')
      .order('month_year', { ascending: false })
    if (error) { showBanner('error', error.message); return }
    setFees((data as Fee[]) || [])
  }

  function showBanner(type: 'success' | 'error', message: string) {
    setBanner({ type, message })
    setTimeout(() => setBanner(null), 4000)
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

  function startEdit(f: Fee) {
    const plan = planOf(f.month_year)
    setForm({
      child_id: f.child_id,
      plan,
      month_year: plan === 'monthly' ? f.month_year : currentMonth(),
      year: plan === 'annual' ? f.month_year : currentYear(),
      amount: String(f.amount),
      status: f.status,
      last_payment_date: f.last_payment_date || '',
      notes: f.notes || '',
    })
    setEditingId(f.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // When plan changes in the form, snap amount to the default
  function setPlan(plan: PlanType) {
    setForm({
      ...form,
      plan,
      amount: String(plan === 'monthly' ? MONTHLY_AMOUNT : ANNUAL_AMOUNT),
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.child_id) { showBanner('error', 'Please select a child.'); return }

    const period = form.plan === 'monthly' ? form.month_year : form.year
    if (!period) { showBanner('error', 'Please pick a period.'); return }

    setSaving(true)

    const payload = {
      child_id: form.child_id,
      month_year: period,
      amount: Number(form.amount) || 0,
      status: form.status,
      last_payment_date: form.last_payment_date || null,
      notes: form.notes.trim(),
      updated_at: new Date().toISOString(),
    }

    let error
    if (editingId) {
      ({ error } = await supabase.from('fees').update(payload).eq('id', editingId))
    } else {
      ({ error } = await supabase.from('fees').upsert(payload, { onConflict: 'child_id,month_year' }))
    }

    setSaving(false)
    if (error) { showBanner('error', error.message); return }

    showBanner('success', editingId ? 'Fee updated.' : 'Fee saved.')
    resetForm()
    await loadFees()
  }

  async function quickSetStatus(f: Fee, status: 'Paid' | 'Pending') {
    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    }
    if (status === 'Paid') patch.last_payment_date = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('fees').update(patch).eq('id', f.id)
    if (error) { showBanner('error', error.message); return }
    showBanner('success', `Marked ${status}.`)
    await loadFees()
  }

  async function deleteFee(f: Fee) {
    if (!confirm(`Delete the fee record for ${f.children?.full_name} (${f.month_year})?`)) return
    const { error } = await supabase.from('fees').delete().eq('id', f.id)
    if (error) { showBanner('error', error.message); return }
    showBanner('success', 'Fee record deleted.')
    await loadFees()
  }

  async function runBulkGenerate() {
    const period = bulkPlan === 'monthly' ? bulkMonth : bulkYear
    if (!period) { showBanner('error', 'Pick a period.'); return }

    const targets = children.filter(c => !bulkClass || c.class_name === bulkClass)
    if (targets.length === 0) { showBanner('error', 'No active children match.'); return }

    const existing = new Set(
      fees.filter(f => f.month_year === period).map(f => f.child_id)
    )
    const toCreate = targets.filter(c => !existing.has(c.id))

    if (toCreate.length === 0) {
      showBanner('success', `All matching children already have a ${period} record. Nothing to create.`)
      return
    }

    if (!confirm(
      `Create Pending ${bulkPlan} fee records for ${toCreate.length} children for ${period} at Rs ${bulkAmount} each?\n\n(${targets.length - toCreate.length} already exist and will be skipped.)`
    )) return

    setBulkBusy(true)

    const rows = toCreate.map(c => ({
      child_id: c.id,
      month_year: period,
      amount: Number(bulkAmount) || (bulkPlan === 'monthly' ? MONTHLY_AMOUNT : ANNUAL_AMOUNT),
      status: 'Pending' as const,
      notes: '',
    }))

    const { error } = await supabase.from('fees').insert(rows)
    setBulkBusy(false)
    if (error) { showBanner('error', error.message); return }

    showBanner('success', `Created ${rows.length} ${bulkPlan} records for ${period}.`)
    setShowBulk(false)
    await loadFees()
  }

  function exportCSV() {
    const header = [
      'Child Name', 'Class', 'Parent Name', 'Parent Phone',
      'Plan', 'Period', 'Amount', 'Status', 'Last Payment', 'Notes',
    ]
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [header.join(',')]
    filtered.forEach(f => {
      lines.push([
        f.children?.full_name || '',
        f.children?.class_name || '',
        f.children?.parent_name || '',
        f.children?.parent_phone || '',
        planOf(f.month_year),
        f.month_year,
        f.amount,
        f.status,
        f.last_payment_date || '',
        f.notes || '',
      ].map(escape).join(','))
    })

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fees_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Derived lists
  const availablePeriods = useMemo(() => {
    const set = new Set<string>()
    fees.forEach(f => set.add(f.month_year))
    set.add(currentMonth())
    set.add(currentYear())
    return Array.from(set).sort().reverse()
  }, [fees])

  const availableClasses = useMemo(() => {
    const set = new Set<string>()
    fees.forEach(f => f.children?.class_name && set.add(f.children.class_name))
    return Array.from(set).sort()
  }, [fees])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return fees.filter(f => {
      if (filterPeriod && f.month_year !== filterPeriod) return false
      if (filterPlan && planOf(f.month_year) !== filterPlan) return false
      if (filterStatus && f.status !== filterStatus) return false
      if (filterClass && f.children?.class_name !== filterClass) return false
      if (q && !(f.children?.full_name || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [fees, filterPeriod, filterPlan, filterStatus, filterClass, search])

  const summary = useMemo(() => {
    const expected = filtered.reduce((s, f) => s + Number(f.amount), 0)
    const collected = filtered.filter(f => f.status === 'Paid').reduce((s, f) => s + Number(f.amount), 0)
    const outstanding = expected - collected
    const counts = {
      Paid: filtered.filter(f => f.status === 'Paid').length,
      Partial: filtered.filter(f => f.status === 'Partial').length,
      Pending: filtered.filter(f => f.status === 'Pending').length,
    }
    return { expected, collected, outstanding, counts }
  }, [filtered])

  if (loading) {
    return (
      <AppShell userName={userName}>
        <div style={{ padding: 40, textAlign: 'center', color: '#718096' }}>Loading fees…</div>
      </AppShell>
    )
  }

  return (
    <AppShell userName={userName}>
      <div className="page-header">
        <h2>Fee Tracker</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canEdit && (
            <button className="btn btn-secondary" onClick={() => setShowBulk(!showBulk)}>
              {showBulk ? 'Cancel Bulk' : '⚡ Generate Period'}
            </button>
          )}
          {canEdit && (
            <button className="btn btn-primary" onClick={showForm ? resetForm : startAdd}>
              {showForm ? 'Cancel' : '+ Add / Update Fee'}
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
        }}>
          {banner.message}
        </div>
      )}

      {showBulk && (
        <div className="card">
          <div className="card-title">⚡ Generate Pending Fees</div>
          <p style={{ color: '#4a5568', fontSize: '0.9rem', marginTop: 0 }}>
            Creates one Pending fee record per active child for the chosen period.
            Children who already have a record for that period are skipped automatically.
          </p>

          <div className="form-row">
            <div className="form-group">
              <label>Plan *</label>
              <select value={bulkPlan} onChange={e => {
                const p = e.target.value as PlanType
                setBulkPlan(p)
                setBulkAmount(String(p === 'monthly' ? MONTHLY_AMOUNT : ANNUAL_AMOUNT))
              }}>
                <option value="monthly">Monthly (Rs {MONTHLY_AMOUNT})</option>
                <option value="annual">Annual (Rs {ANNUAL_AMOUNT})</option>
              </select>
            </div>
            <div className="form-group">
              <label>{bulkPlan === 'monthly' ? 'Month *' : 'Year *'}</label>
              {bulkPlan === 'monthly' ? (
                <input type="month" value={bulkMonth} onChange={e => setBulkMonth(e.target.value)} />
              ) : (
                <input type="number" min="2020" max="2100" value={bulkYear} onChange={e => setBulkYear(e.target.value)} />
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Class</label>
              <select value={bulkClass} onChange={e => setBulkClass(e.target.value)}>
                <option value="">All classes</option>
                {CLASS_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Amount (Rs) *</label>
              <input type="number" value={bulkAmount} onChange={e => setBulkAmount(e.target.value)} />
            </div>
          </div>

          <button className="btn btn-primary" onClick={runBulkGenerate} disabled={bulkBusy}>
            {bulkBusy ? 'Generating…' : `Generate ${bulkPlan} for ${bulkPlan === 'monthly' ? bulkMonth : bulkYear}`}
          </button>
        </div>
      )}

      {showForm && canEdit && (
        <div className="card">
          <div className="card-title">{editingId ? 'Edit Fee Record' : 'Add / Update Fee Record'}</div>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Child *</label>
                <select required value={form.child_id} onChange={e => setForm({ ...form, child_id: e.target.value })} disabled={!!editingId}>
                  <option value="">Select child</option>
                  {children.map(c => (
                    <option key={c.id} value={c.id}>{c.full_name} ({c.class_name})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Plan *</label>
                <select value={form.plan} onChange={e => setPlan(e.target.value as PlanType)} disabled={!!editingId}>
                  <option value="monthly">Monthly — Rs {MONTHLY_AMOUNT}/month</option>
                  <option value="annual">Annual — Rs {ANNUAL_AMOUNT}/year</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>{form.plan === 'monthly' ? 'Month *' : 'Year *'}</label>
                {form.plan === 'monthly' ? (
                  <input required type="month" value={form.month_year} onChange={e => setForm({ ...form, month_year: e.target.value })} disabled={!!editingId} />
                ) : (
                  <input required type="number" min="2020" max="2100" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} disabled={!!editingId} />
                )}
              </div>
              <div className="form-group">
                <label>Amount (Rs) *</label>
                <input required type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Status *</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as 'Paid' | 'Pending' | 'Partial' })}>
                  <option value="Pending">Pending</option>
                  <option value="Partial">Partial</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>
              <div className="form-group">
                <label>Last Payment Date</label>
                <input type="date" value={form.last_payment_date} onChange={e => setForm({ ...form, last_payment_date: e.target.value })} />
              </div>
            </div>

            <div className="form-group">
              <label>Discount / Notes</label>
              <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="e.g. 10% sibling discount – Rs 350 off" />
            </div>

            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Update Fee' : 'Save Fee'}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="grid" style={{ marginBottom: 16 }}>
          <div className="stat info">
            <div className="label">Expected</div>
            <div className="value">Rs {summary.expected.toLocaleString('en-IN')}</div>
          </div>
          <div className="stat">
            <div className="label">Collected</div>
            <div className="value" style={{ color: '#2f855a' }}>Rs {summary.collected.toLocaleString('en-IN')}</div>
          </div>
          <div className="stat warning">
            <div className="label">Outstanding</div>
            <div className="value">Rs {summary.outstanding.toLocaleString('en-IN')}</div>
          </div>
          <div className="stat danger">
            <div className="label">Pending records</div>
            <div className="value">{summary.counts.Pending}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
            <label>Plan</label>
            <select value={filterPlan} onChange={e => setFilterPlan(e.target.value as '' | PlanType)}>
              <option value="">All plans</option>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 140 }}>
            <label>Period</label>
            <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}>
              <option value="">All periods</option>
              {availablePeriods.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 130 }}>
            <label>Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All</option>
              <option value="Paid">Paid</option>
              <option value="Partial">Partial</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 130 }}>
            <label>Class</label>
            <select value={filterClass} onChange={e => setFilterClass(e.target.value)}>
              <option value="">All classes</option>
              {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 160, flex: 1 }}>
            <label>Search child</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name…" />
          </div>
          <button className="btn btn-secondary" onClick={exportCSV}>⬇ Export CSV</button>
        </div>

        <div className="card-title" style={{ marginTop: 0 }}>
          {filtered.length} of {fees.length} records
        </div>

        {filtered.length === 0 ? (
          <p style={{ color: '#718096' }}>
            {fees.length === 0
              ? 'No fee records yet. Use “⚡ Generate Period” or “+ Add / Update Fee”.'
              : 'No records match these filters.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Child</th>
                  <th>Class</th>
                  <th>Plan</th>
                  <th>Period</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Last Payment</th>
                  <th>Discount / Notes</th>
                  <th style={{ width: 220 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => {
                  const plan = planOf(f.month_year)
                  return (
                    <tr key={f.id}>
                      <td><strong>{f.children?.full_name}</strong></td>
                      <td>{f.children?.class_name}</td>
                      <td>
                        <span className={`badge ${plan === 'annual' ? 'badge-blue' : 'badge-gray'}`}>
                          {plan === 'annual' ? 'Annual' : 'Monthly'}
                        </span>
                      </td>
                      <td>{f.month_year}</td>
                      <td>Rs {Number(f.amount).toLocaleString('en-IN')}</td>
                      <td>
                        <span className={`badge ${f.status === 'Paid' ? 'badge-green' : f.status === 'Partial' ? 'badge-yellow' : 'badge-red'}`}>
                          {f.status}
                        </span>
                      </td>
                      <td>{f.last_payment_date || '—'}</td>
                      <td>{f.notes || '—'}</td>
                      <td>
                        {canEdit && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {f.status !== 'Paid' && (
                              <button className="btn btn-sm btn-success" onClick={() => quickSetStatus(f, 'Paid')}>✓ Paid</button>
                            )}
                            {f.status !== 'Pending' && (
                              <button className="btn btn-sm btn-secondary" onClick={() => quickSetStatus(f, 'Pending')}>↺ Pending</button>
                            )}
                            <button className="btn btn-sm btn-secondary" onClick={() => startEdit(f)}>✏️ Edit</button>
                            <button className="btn btn-sm btn-secondary" style={{ color: '#c53030', borderColor: '#fc8181' }} onClick={() => deleteFee(f)}>🗑</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  )
}
