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
  family_id: string | null
}

type Family = {
  id: string
  family_name: string
  primary_parent_name: string | null
  primary_parent_phone: string | null
}

type Fee = {
  id: string
  child_id: string
  fee_plan_id: string | null
  month_year: string
  amount: number
  status: 'Paid' | 'Pending' | 'Partial'
  last_payment_date: string | null
  due_date: string | null
  notes: string | null
  children?: { full_name: string; class_name: string; parent_name: string | null; parent_phone: string | null; family_id: string | null }
}

type Payment = {
  id: string
  fee_id: string | null
  child_id: string
  paid_on: string
  amount: number
  method: string
  receipt_no: string | null
  for_month: string | null
  note: string | null
  recorded_by: string | null
}

const CLASS_OPTIONS = [
  'Nursery A','Nursery B',
  'LKG A','LKG B',
  'UKG A','UKG B',
  'Class_1 A','Class_1 B',
  'Class_2 A','Class_2 B',
  'Class_3 A','Class_3 B',
]

const MONTHLY_AMOUNT = 3500
const ANNUAL_AMOUNT = 42000

const currentMonth = () => new Date().toISOString().slice(0, 7)
const currentYear = () => new Date().toISOString().slice(0, 4)
const todayISO = () => new Date().toISOString().slice(0, 10)

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

function planOf(period: string): PlanType {
  return /^\d{4}$/.test(period) ? 'annual' : 'monthly'
}

function isOverdue(f: Fee) {
  if (!f.due_date) return false
  if (f.status === 'Paid') return false
  return f.due_date < todayISO()
}

export default function FeesPage() {
  const supabase = createClient()
  const router = useRouter()

  const [userName, setUserName] = useState('')
  const [role, setRole] = useState('')
  const [children, setChildren] = useState<Child[]>([])
  const [families, setFamilies] = useState<Family[]>([])
  const [fees, setFees] = useState<Fee[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [banner, setBanner] = useState<Banner>(null)
  const [saving, setSaving] = useState(false)

  const [showBulk, setShowBulk] = useState(false)
  const [bulkPlan, setBulkPlan] = useState<PlanType>('monthly')
  const [bulkMonth, setBulkMonth] = useState(currentMonth())
  const [bulkYear, setBulkYear] = useState(currentYear())
  const [bulkClass, setBulkClass] = useState('')
  const [bulkAmount, setBulkAmount] = useState(String(MONTHLY_AMOUNT))
  const [bulkBusy, setBulkBusy] = useState(false)

  const [filterPeriod, setFilterPeriod] = useState('')
  const [filterPlan, setFilterPlan] = useState<'' | PlanType>('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [filterFamily, setFilterFamily] = useState('')
  const [search, setSearch] = useState('')
  const [pendingOnly, setPendingOnly] = useState(false)
  const [showClassSummary, setShowClassSummary] = useState(false)

  const [ledgerChildId, setLedgerChildId] = useState<string | null>(null)

  const [payModalFee, setPayModalFee] = useState<Fee | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('Cash')
  const [payDate, setPayDate] = useState(todayISO())
  const [payNote, setPayNote] = useState('')
  const [paySaving, setPaySaving] = useState(false)

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
        .select('id, full_name, class_name, parent_name, parent_phone, family_id')
        .eq('is_active', true)
        .order('full_name')
      setChildren((kids as Child[]) || [])

      const { data: fams } = await supabase
        .from('families')
        .select('id, family_name, primary_parent_name, primary_parent_phone')
        .order('family_name')
      setFamilies((fams as Family[]) || [])

      await loadAll()
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadAll() {
    const { data: feeData, error: feeErr } = await supabase
      .from('fees')
      .select('*, children(full_name, class_name, parent_name, parent_phone, family_id)')
      .order('month_year', { ascending: false })
    if (feeErr) { showBanner('error', feeErr.message); return }
    setFees((feeData as Fee[]) || [])

    const { data: payData, error: payErr } = await supabase
      .from('fee_payments').select('*').order('paid_on', { ascending: false })
    if (payErr) { showBanner('error', payErr.message); return }
    setPayments((payData as Payment[]) || [])
  }

  function showBanner(type: 'success' | 'error', message: string) {
    setBanner({ type, message })
    setTimeout(() => setBanner(null), 4000)
  }

  const paymentsByFee = useMemo(() => {
    const m = new Map<string, Payment[]>()
    payments.forEach(p => {
      if (!p.fee_id) return
      const arr = m.get(p.fee_id) || []
      arr.push(p)
      m.set(p.fee_id, arr)
    })
    return m
  }, [payments])

  const paidByFee = useMemo(() => {
    const m = new Map<string, number>()
    payments.forEach(p => {
      if (!p.fee_id) return
      m.set(p.fee_id, (m.get(p.fee_id) || 0) + Number(p.amount))
    })
    return m
  }, [payments])

  // Child TOTAL balance across all fee rows
  const childTotals = useMemo(() => {
    const m = new Map<string, { expected: number; paid: number; balance: number }>()
    fees.forEach(f => {
      const row = m.get(f.child_id) || { expected: 0, paid: 0, balance: 0 }
      const amt = Number(f.amount)
      const paid = paidByFee.get(f.id) || 0
      row.expected += amt
      row.paid += paid
      row.balance += Math.max(amt - paid, 0)
      m.set(f.child_id, row)
    })
    return m
  }, [fees, paidByFee])

  const familyById = useMemo(() => {
    const m = new Map<string, Family>()
    families.forEach(f => m.set(f.id, f))
    return m
  }, [families])

  const availablePeriods = useMemo(() => {
    const set = new Set<string>()
    fees.forEach(f => set.add(f.month_year))
    set.add(currentMonth()); set.add(currentYear())
    return Array.from(set).sort().reverse()
  }, [fees])

  const availableClasses = useMemo(() => {
    const set = new Set<string>()
    fees.forEach(f => f.children?.class_name && set.add(f.children.class_name))
    return Array.from(set).sort()
  }, [fees])

  const availableFamilies = useMemo(() => {
    const ids = new Set<string>()
    fees.forEach(f => f.children?.family_id && ids.add(f.children.family_id))
    return families.filter(f => ids.has(f.id)).sort((a,b) => a.family_name.localeCompare(b.family_name))
  }, [fees, families])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return fees.filter(f => {
      if (pendingOnly && f.status === 'Paid') return false
      if (filterPeriod && f.month_year !== filterPeriod) return false
      if (filterPlan && planOf(f.month_year) !== filterPlan) return false
      if (filterStatus && f.status !== filterStatus) return false
      if (filterClass && f.children?.class_name !== filterClass) return false
      if (filterFamily && f.children?.family_id !== filterFamily) return false
      if (q) {
        const hay = `${f.children?.full_name || ''} ${f.children?.parent_name || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [fees, pendingOnly, filterPeriod, filterPlan, filterStatus, filterClass, filterFamily, search])

  const summary = useMemo(() => {
    const expected = filtered.reduce((s, f) => s + Number(f.amount), 0)
    const collected = filtered.reduce((s, f) => s + (paidByFee.get(f.id) || 0), 0)
    const outstanding = Math.max(expected - collected, 0)
    const overdue = filtered.filter(isOverdue).length
    return { expected, collected, outstanding, overdue }
  }, [filtered, paidByFee])

  const classSummary = useMemo(() => {
    const map = new Map<string, { expected: number; collected: number; outstanding: number; count: number }>()
    filtered.forEach(f => {
      const cls = f.children?.class_name || '—'
      const row = map.get(cls) || { expected: 0, collected: 0, outstanding: 0, count: 0 }
      const amt = Number(f.amount)
      const paid = paidByFee.get(f.id) || 0
      row.expected += amt; row.collected += paid
      row.outstanding += Math.max(amt - paid, 0); row.count += 1
      map.set(cls, row)
    })
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered, paidByFee])

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
      child_id: f.child_id, plan,
      month_year: plan === 'monthly' ? f.month_year : currentMonth(),
      year: plan === 'annual' ? f.month_year : currentYear(),
      amount: String(f.amount), status: f.status,
      last_payment_date: f.last_payment_date || '',
      notes: f.notes || '',
    })
    setEditingId(f.id); setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function setPlan(plan: PlanType) {
    setForm({ ...form, plan, amount: String(plan === 'monthly' ? MONTHLY_AMOUNT : ANNUAL_AMOUNT) })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.child_id) { showBanner('error', 'Please select a child.'); return }
    const period = form.plan === 'monthly' ? form.month_year : form.year
    if (!period) { showBanner('error', 'Please pick a period.'); return }

    setSaving(true)
    const payload: Record<string, unknown> = {
      child_id: form.child_id, month_year: period,
      amount: Number(form.amount) || 0, notes: form.notes.trim(),
      updated_at: new Date().toISOString(),
    }
    if (form.plan === 'monthly') {
      const [y, m] = period.split('-').map(Number)
      payload.due_date = `${y}-${String(m).padStart(2,'0')}-10`
    }

    let error
    if (editingId) {
      ({ error } = await supabase.from('fees').update(payload).eq('id', editingId))
    } else {
      ({ error } = await supabase.from('fees').upsert(
        { ...payload, status: form.status, last_payment_date: form.last_payment_date || null },
        { onConflict: 'child_id,month_year' }
      ))
    }
    setSaving(false)
    if (error) { showBanner('error', error.message); return }
    showBanner('success', editingId ? 'Fee updated.' : 'Fee saved.')
    resetForm(); await loadAll()
  }

  async function deleteFee(f: Fee) {
    if (!confirm(`Delete the fee record for ${f.children?.full_name} (${f.month_year})?\n\nLinked payments will be unlinked.`)) return
    const { error } = await supabase.from('fees').delete().eq('id', f.id)
    if (error) { showBanner('error', error.message); return }
    showBanner('success', 'Fee record deleted.')
    await loadAll()
  }

  function openPayModal(f: Fee) {
    const paid = paidByFee.get(f.id) || 0
    const balance = Math.max(Number(f.amount) - paid, 0)
    setPayModalFee(f); setPayAmount(String(balance || f.amount))
    setPayMethod('Cash'); setPayDate(todayISO()); setPayNote('')
  }

  async function savePayment() {
    if (!payModalFee) return
    const amt = Number(payAmount)
    if (!amt || amt <= 0) { showBanner('error', 'Enter a valid amount.'); return }

    setPaySaving(true)
    const { data: receiptData } = await supabase.rpc('next_receipt_no')
    const receipt = (receiptData as unknown as string) || `L-${Date.now().toString().slice(-4)}`

    const { error } = await supabase.from('fee_payments').insert({
      fee_id: payModalFee.id, fee_plan_id: payModalFee.fee_plan_id,
      child_id: payModalFee.child_id, paid_on: payDate,
      amount: amt, method: payMethod, receipt_no: receipt,
      for_month: payModalFee.month_year, note: payNote.trim(),
      recorded_by: userName,
    })
    setPaySaving(false)
    if (error) { showBanner('error', error.message); return }
    showBanner('success', `Payment recorded (${receipt}).`)
    setPayModalFee(null); await loadAll()
  }

  async function deletePayment(p: Payment) {
    if (!confirm(`Delete payment ${p.receipt_no || ''} of Rs ${p.amount}?`)) return
    const { error } = await supabase.from('fee_payments').delete().eq('id', p.id)
    if (error) { showBanner('error', error.message); return }
    showBanner('success', 'Payment deleted.'); await loadAll()
  }

  async function runBulkGenerate() {
    const period = bulkPlan === 'monthly' ? bulkMonth : bulkYear
    if (!period) { showBanner('error', 'Pick a period.'); return }
    const targets = children.filter(c => !bulkClass || c.class_name === bulkClass)
    if (!targets.length) { showBanner('error', 'No active children match.'); return }

    const existing = new Set(fees.filter(f => f.month_year === period).map(f => f.child_id))
    const toCreate = targets.filter(c => !existing.has(c.id))
    if (!toCreate.length) { showBanner('success', `All already have a ${period} record.`); return }
    if (!confirm(`Create Pending records for ${toCreate.length} children for ${period} at Rs ${bulkAmount}?`)) return

    setBulkBusy(true)
    const rows = toCreate.map(c => ({
      child_id: c.id, month_year: period,
      amount: Number(bulkAmount) || (bulkPlan === 'monthly' ? MONTHLY_AMOUNT : ANNUAL_AMOUNT),
      status: 'Pending' as const, notes: '',
      due_date: bulkPlan === 'monthly'
        ? `${period.slice(0,4)}-${period.slice(5,7)}-10`
        : `${period}-04-10`,
    }))
    const { error } = await supabase.from('fees').insert(rows)
    setBulkBusy(false)
    if (error) { showBanner('error', error.message); return }
    showBanner('success', `Created ${rows.length} records.`)
    setShowBulk(false); await loadAll()
  }

  function exportCSV() {
    const header = ['Child','Class','Family','Parent','Phone','Plan','Period','Target','Paid','Balance','Status','Receipts','Child Total Balance']
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s
    }
    const lines = [header.join(',')]
    filtered.forEach(f => {
      const paid = paidByFee.get(f.id) || 0
      const bal = Math.max(Number(f.amount) - paid, 0)
      const rcs = (paymentsByFee.get(f.id) || []).map(p => p.receipt_no).filter(Boolean).join(' | ')
      const cTot = childTotals.get(f.child_id)?.balance ?? 0
      const fam = f.children?.family_id ? familyById.get(f.children.family_id)?.family_name || '' : ''
      lines.push([
        f.children?.full_name, f.children?.class_name, fam, f.children?.parent_name, f.children?.parent_phone,
        planOf(f.month_year), f.month_year, f.amount, paid, bal, f.status, rcs, cTot,
      ].map(esc).join(','))
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `fees_${todayISO()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // Ledger for a child
  const ledgerChild = useMemo(
    () => children.find(c => c.id === ledgerChildId) || null,
    [children, ledgerChildId]
  )
  const ledgerFees = useMemo(() => {
    if (!ledgerChildId) return []
    return fees
      .filter(f => f.child_id === ledgerChildId)
      .sort((a, b) => a.month_year.localeCompare(b.month_year))
  }, [fees, ledgerChildId])
  const ledgerTotals = useMemo(() => {
    const expected = ledgerFees.reduce((s, f) => s + Number(f.amount), 0)
    const paid = ledgerFees.reduce((s, f) => s + (paidByFee.get(f.id) || 0), 0)
    return { expected, paid, balance: Math.max(expected - paid, 0) }
  }, [ledgerFees, paidByFee])
  const ledgerSiblings = useMemo(() => {
    if (!ledgerChild?.family_id) return []
    return children.filter(c => c.family_id === ledgerChild.family_id && c.id !== ledgerChild.id)
  }, [children, ledgerChild])

  if (loading) {
    return <AppShell userName={userName}><div style={{ padding: 40, textAlign: 'center', color: '#718096' }}>Loading fees…</div></AppShell>
  }

  return (
    <AppShell userName={userName}>
      <div className="page-header">
        <h2>Fee Tracker</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canEdit && (
            <button className="btn btn-secondary" onClick={() => setShowBulk(!showBulk)}>
              {showBulk ? 'Cancel Bulk' : '⚡ Generate'}
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
        }}>{banner.message}</div>
      )}

      {showBulk && (
        <div className="card">
          <div className="card-title">⚡ Generate Pending Fees</div>
          <div className="form-row">
            <div className="form-group">
              <label>Plan *</label>
              <select value={bulkPlan} onChange={e => {
                const p = e.target.value as PlanType
                setBulkPlan(p); setBulkAmount(String(p === 'monthly' ? MONTHLY_AMOUNT : ANNUAL_AMOUNT))
              }}>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div className="form-group">
              <label>{bulkPlan === 'monthly' ? 'Month *' : 'Year *'}</label>
              {bulkPlan === 'monthly'
                ? <input type="month" value={bulkMonth} onChange={e => setBulkMonth(e.target.value)} />
                : <input type="number" value={bulkYear} onChange={e => setBulkYear(e.target.value)} />}
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
            {bulkBusy ? 'Generating…' : `Generate for ${bulkPlan === 'monthly' ? bulkMonth : bulkYear}`}
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
                  {children.map(c => <option key={c.id} value={c.id}>{c.full_name} ({c.class_name})</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Plan *</label>
                <select value={form.plan} onChange={e => setPlan(e.target.value as PlanType)} disabled={!!editingId}>
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>{form.plan === 'monthly' ? 'Month *' : 'Year *'}</label>
                {form.plan === 'monthly'
                  ? <input required type="month" value={form.month_year} onChange={e => setForm({ ...form, month_year: e.target.value })} disabled={!!editingId} />
                  : <input required type="number" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} disabled={!!editingId} />}
              </div>
              <div className="form-group">
                <label>Amount (Rs) *</label>
                <input required type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Status (initial)</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}>
                  <option value="Pending">Pending</option>
                  <option value="Partial">Partial</option>
                  <option value="Paid">Paid</option>
                </select>
              </div>
              <div className="form-group">
                <label>Discount / Notes</label>
                <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="e.g. 10% sibling discount" />
              </div>
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
            <div className="label">Overdue</div>
            <div className="value">{summary.overdue}</div>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <button className="btn btn-sm btn-secondary" onClick={() => setShowClassSummary(!showClassSummary)}>
            {showClassSummary ? '▼ Hide class summary' : '▶ Show class-wise summary'}
          </button>
        </div>

        {showClassSummary && (
          <div style={{ marginBottom: 16, overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Class</th><th>Records</th><th>Expected</th><th>Collected</th><th>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {classSummary.map(([cls, r]) => (
                  <tr key={cls}>
                    <td><strong>{cls}</strong></td>
                    <td>{r.count}</td>
                    <td>Rs {r.expected.toLocaleString('en-IN')}</td>
                    <td style={{ color: '#2f855a' }}>Rs {r.collected.toLocaleString('en-IN')}</td>
                    <td style={{ color: r.outstanding > 0 ? '#c53030' : '#2f855a' }}>
                      Rs {r.outstanding.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 130 }}>
            <label>Plan</label>
            <select value={filterPlan} onChange={e => setFilterPlan(e.target.value as any)}>
              <option value="">All</option>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 130 }}>
            <label>Period</label>
            <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}>
              <option value="">All</option>
              {availablePeriods.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 120 }}>
            <label>Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All</option>
              <option value="Paid">Paid</option>
              <option value="Partial">Partial</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 120 }}>
            <label>Class</label>
            <select value={filterClass} onChange={e => setFilterClass(e.target.value)}>
              <option value="">All</option>
              {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 160 }}>
            <label>Family</label>
            <select value={filterFamily} onChange={e => setFilterFamily(e.target.value)}>
              <option value="">All families</option>
              {availableFamilies.map(f => <option key={f.id} value={f.id}>{f.family_name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 160, flex: 1 }}>
            <label>Search child or parent</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name…" />
          </div>
          <button className="btn btn-secondary" onClick={exportCSV}>⬇ CSV</button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <button
            className={pendingOnly ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary'}
            onClick={() => setPendingOnly(!pendingOnly)}
          >
            ⚡ Pending only {pendingOnly ? '✓' : ''}
          </button>
          <span style={{ color: '#718096', fontSize: '0.85rem' }}>
            Showing {filtered.length} of {fees.length}
          </span>
        </div>

        {filtered.length === 0 ? (
          <p style={{ color: '#718096' }}>No records match.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Child</th>
                  <th>Class</th>
                  <th>Family</th>
                  <th>Plan</th>
                  <th>Period</th>
                  <th>Target</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Child Year Balance</th>
                  <th>Status</th>
                  <th style={{ width: 230 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(f => {
                  const plan = planOf(f.month_year)
                  const paid = paidByFee.get(f.id) || 0
                  const balance = Math.max(Number(f.amount) - paid, 0)
                  const overdue = isOverdue(f)
                  const childBal = childTotals.get(f.child_id)?.balance ?? 0
                  const fam = f.children?.family_id ? familyById.get(f.children.family_id) : null

                  return (
                    <tr key={f.id} style={{ background: overdue ? '#fff5f5' : undefined }}>
                      <td><strong>{f.children?.full_name}</strong></td>
                      <td>{f.children?.class_name}</td>
                      <td>
                        {fam ? (
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={() => setLedgerChildId(f.child_id)}
                            title="Open child ledger"
                          >
                            {fam.family_name}
                          </button>
                        ) : '—'}
                      </td>
                      <td>
                        <span className={`badge ${plan === 'annual' ? 'badge-blue' : 'badge-gray'}`}>
                          {plan === 'annual' ? 'Annual' : 'Monthly'}
                        </span>
                      </td>
                      <td>{f.month_year}</td>
                      <td>Rs {Number(f.amount).toLocaleString('en-IN')}</td>
                      <td style={{ color: paid > 0 ? '#2f855a' : undefined }}>
                        Rs {paid.toLocaleString('en-IN')}
                      </td>
                      <td style={{ color: balance > 0 ? '#c53030' : '#2f855a' }}>
                        Rs {balance.toLocaleString('en-IN')}
                      </td>
                      <td style={{ color: childBal > 0 ? '#c53030' : '#2f855a', fontWeight: 600 }}>
                        Rs {childBal.toLocaleString('en-IN')}
                      </td>
                      <td>
                        <span className={`badge ${f.status === 'Paid' ? 'badge-green' : f.status === 'Partial' ? 'badge-yellow' : 'badge-red'}`}>
                          {f.status}
                        </span>
                        {overdue && <span className="badge badge-red" style={{ marginLeft: 6 }}>⚠️</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {canEdit && (
                            <button className="btn btn-sm btn-success" onClick={() => openPayModal(f)} title="Record Payment">
                              💵 Pay
                            </button>
                          )}
                          <button className="btn btn-sm btn-secondary" onClick={() => setLedgerChildId(f.child_id)} title="Child ledger">
                            👁
                          </button>
                          {canEdit && (
                            <button className="btn btn-sm btn-secondary" onClick={() => startEdit(f)}>✏️</button>
                          )}
                          {canEdit && (
                            <button className="btn btn-sm btn-secondary"
                              style={{ color: '#c53030', borderColor: '#fc8181' }}
                              onClick={() => deleteFee(f)}>🗑</button>
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
      </div>

      {/* CHILD LEDGER DRAWER */}
      {ledgerChild && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'flex-end', zIndex: 1000,
        }} onClick={() => setLedgerChildId(null)}>
          <div
            style={{ width: '100%', maxWidth: 720, background: 'white', height: '100%', overflowY: 'auto', padding: 24 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0 }}>{ledgerChild.full_name}</h3>
                <div style={{ fontSize: '0.9rem', color: '#4a5568' }}>
                  {ledgerChild.class_name} · {ledgerChild.parent_name || '—'} · {ledgerChild.parent_phone || '—'}
                </div>
                {ledgerChild.family_id && familyById.get(ledgerChild.family_id) && (
                  <div style={{ fontSize: '0.85rem', color: '#2b6cb0', marginTop: 4 }}>
                    Family: {familyById.get(ledgerChild.family_id)?.family_name}
                  </div>
                )}
              </div>
              <button className="btn btn-secondary" onClick={() => setLedgerChildId(null)}>Close</button>
            </div>

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

            <h4 style={{ marginTop: 20 }}>Fee Schedule</h4>
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Target</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Payments</th>
                </tr>
              </thead>
              <tbody>
                {ledgerFees.map(f => {
                  const paid = paidByFee.get(f.id) || 0
                  const bal = Math.max(Number(f.amount) - paid, 0)
                  const pays = paymentsByFee.get(f.id) || []
                  return (
                    <tr key={f.id}>
                      <td><strong>{f.month_year}</strong></td>
                      <td>Rs {Number(f.amount).toLocaleString('en-IN')}</td>
                      <td style={{ color: '#2f855a' }}>Rs {paid.toLocaleString('en-IN')}</td>
                      <td style={{ color: bal > 0 ? '#c53030' : '#2f855a' }}>Rs {bal.toLocaleString('en-IN')}</td>
                      <td>
                        <span className={`badge ${f.status === 'Paid' ? 'badge-green' : f.status === 'Partial' ? 'badge-yellow' : 'badge-red'}`}>
                          {f.status}
                        </span>
                      </td>
                      <td>
                        {pays.length === 0 ? <span style={{ color: '#a0aec0' }}>—</span> : (
                          <div style={{ fontSize: '0.8rem' }}>
                            {pays.map(p => (
                              <div key={p.id}>
                                {p.paid_on} · Rs {Number(p.amount).toLocaleString('en-IN')} · {p.receipt_no || '—'}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {ledgerSiblings.length > 0 && (
              <>
                <h4 style={{ marginTop: 24 }}>Siblings in this family</h4>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Class</th>
                      <th>Year Balance</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerSiblings.map(s => {
                      const sBal = childTotals.get(s.id)?.balance ?? 0
                      return (
                        <tr key={s.id}>
                          <td><strong>{s.full_name}</strong></td>
                          <td>{s.class_name}</td>
                          <td style={{ color: sBal > 0 ? '#c53030' : '#2f855a', fontWeight: 600 }}>
                            Rs {sBal.toLocaleString('en-IN')}
                          </td>
                          <td>
                            <button className="btn btn-sm btn-secondary" onClick={() => setLedgerChildId(s.id)}>
                              👁 View
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div style={{ marginTop: 12, padding: 12, background: '#ebf8ff', borderRadius: 6, fontSize: '0.9rem' }}>
                  <strong>Family total balance:</strong>{' '}
                  Rs {(ledgerTotals.balance + ledgerSiblings.reduce((s, k) => s + (childTotals.get(k.id)?.balance ?? 0), 0)).toLocaleString('en-IN')}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* PAYMENT MODAL */}
      {payModalFee && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
        }}>
          <div className="card" style={{ maxWidth: 480, width: '100%', margin: 0 }}>
            <div className="card-title">💵 Record Payment</div>
            <div style={{ marginBottom: 12, fontSize: '0.9rem', color: '#4a5568' }}>
              <div><strong>{payModalFee.children?.full_name}</strong> · {payModalFee.children?.class_name}</div>
              <div>For: <strong>{payModalFee.month_year}</strong></div>
              <div>Target: Rs {Number(payModalFee.amount).toLocaleString('en-IN')} ·
                Paid: Rs {(paidByFee.get(payModalFee.id) || 0).toLocaleString('en-IN')} ·
                Balance: Rs {Math.max(Number(payModalFee.amount) - (paidByFee.get(payModalFee.id) || 0), 0).toLocaleString('en-IN')}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Amount (Rs) *</label>
                <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Method</label>
                <select value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Card">Card</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Payment Date</label>
              <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Note</label>
              <input value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="Optional" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setPayModalFee(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={savePayment} disabled={paySaving}>
                {paySaving ? 'Saving…' : 'Save Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
