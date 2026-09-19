'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Family = {
  id: string
  family_name: string
  primary_parent_name: string | null
  primary_parent_phone: string | null
}

type Child = {
  id: string
  family_id: string | null
  full_name: string
  class_name: string
  is_active: boolean
}

type Account = {
  id: string
  family_id: string
  academic_year: number
  admission_date: string
  total_fee: number
  paid_amount: number
  balance: number
  monthly_installment: number
  plan_type: 'monthly' | 'annual'
  expected_till_date: number
  overdue_amount: number
  notes: string | null
}

type Payment = {
  id: string
  family_fee_account_id: string
  family_id: string
  paid_on: string
  amount: number
  method: string
  receipt_no: string | null
  note: string | null
  recorded_by: string | null
}

type Installment = {
  id: string
  family_fee_account_id: string
  month_year: string
  amount_due: number
  due_date: string
  status: 'Pending' | 'Paid' | 'Partial' | 'Overdue'
}

type FamilyRow = {
  family: Family
  account: Account
  children: Child[]
  classes: string
  nextDue: Installment | null
  displayStatus: 'Paid' | 'Pending' | 'Overdue' | 'Pending (Annual)'
}

type Banner = { type: 'success' | 'error'; message: string } | null

const todayISO = () => new Date().toISOString().slice(0, 10)

function formatRs(n: number) {
  return 'Rs ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function formatRsPrecise(n: number) {
  return 'Rs ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function monthLabel(ym: string) {
  if (!ym) return ''
  const [y, m] = ym.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[m-1]} ${y}`
}

export default function FeesPage() {
  const supabase = createClient()
  const router = useRouter()

  const [userName, setUserName] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<Banner>(null)

  const [families, setFamilies] = useState<Family[]>([])
  const [children, setChildren] = useState<Child[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [installments, setInstallments] = useState<Installment[]>([])

  const [search, setSearch] = useState('')
  const [filterClass, setFilterClass] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPlan, setFilterPlan] = useState('')
  const [showPaid, setShowPaid] = useState(false)

  const [payModalAccount, setPayModalAccount] = useState<Account | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('Cash')
  const [payDate, setPayDate] = useState(todayISO())
  const [payNote, setPayNote] = useState('')
  const [paySaving, setPaySaving] = useState(false)

  const [ledgerFamilyId, setLedgerFamilyId] = useState<string | null>(null)
  const [ledgerShowPayments, setLedgerShowPayments] = useState(false)

  const [editAccount, setEditAccount] = useState<Account | null>(null)
  const [editTotal, setEditTotal] = useState('')
  const [editReason, setEditReason] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const canEdit = role === 'director' || role === 'coordinator' || role === 'office'

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('profiles').select('full_name, role').eq('id', user.id).single()
      setUserName(profile?.full_name || '')
      setRole(profile?.role || '')
      await loadAll()
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadAll() {
    const { data: fams, error: e1 } = await supabase.from('families').select('*').order('family_name')
    if (e1) { showBanner('error', e1.message); return }
    setFamilies((fams as Family[]) || [])

    const { data: kids, error: e2 } = await supabase
      .from('children').select('id, family_id, full_name, class_name, is_active')
    if (e2) { showBanner('error', e2.message); return }
    setChildren((kids as Child[]) || [])

    const { data: accs, error: e3 } = await supabase.from('family_fee_accounts').select('*')
    if (e3) { showBanner('error', e3.message); return }
    setAccounts((accs as Account[]) || [])

    const { data: pays, error: e4 } = await supabase
      .from('family_fee_payments').select('*').order('paid_on', { ascending: false })
    if (e4) { showBanner('error', e4.message); return }
    setPayments((pays as Payment[]) || [])

    const { data: insts, error: e5 } = await supabase
      .from('family_fee_installments').select('*').order('due_date')
    if (e5) { showBanner('error', e5.message); return }
    setInstallments((insts as Installment[]) || [])
  }

  function showBanner(type: 'success' | 'error', message: string) {
    setBanner({ type, message })
    setTimeout(() => setBanner(null), 4000)
  }

  const rows: FamilyRow[] = useMemo(() => {
    const childrenByFamily = new Map<string, Child[]>()
    children.forEach(c => {
      if (!c.family_id || !c.is_active) return
      const arr = childrenByFamily.get(c.family_id) || []
      arr.push(c)
      childrenByFamily.set(c.family_id, arr)
    })

    const installmentsByAccount = new Map<string, Installment[]>()
    installments.forEach(i => {
      const arr = installmentsByAccount.get(i.family_fee_account_id) || []
      arr.push(i)
      installmentsByAccount.set(i.family_fee_account_id, arr)
    })

    const out: FamilyRow[] = []
    accounts.forEach(acc => {
      const fam = families.find(f => f.id === acc.family_id)
      if (!fam) return
      const kids = childrenByFamily.get(fam.id) || []
      const classes = Array.from(new Set(kids.map(k => k.class_name))).sort().join(', ')

      const accInsts = (installmentsByAccount.get(acc.id) || [])
        .filter(i => i.status !== 'Paid' && Number(i.amount_due) > 0)
        .sort((a, b) => a.due_date.localeCompare(b.due_date))

      const nextDue = acc.plan_type === 'monthly' ? (accInsts[0] || null) : null

      let displayStatus: 'Paid' | 'Pending' | 'Overdue' | 'Pending (Annual)' = 'Pending'
      if (Number(acc.balance) <= 0) displayStatus = 'Paid'
      else if (acc.plan_type === 'annual') displayStatus = 'Pending (Annual)'
      else if (Number(acc.overdue_amount) > 0) displayStatus = 'Overdue'
      else displayStatus = 'Pending'

      out.push({
        family: fam,
        account: acc,
        children: kids,
        classes,
        nextDue,
        displayStatus,
      })
    })
    return out
  }, [families, children, accounts, installments])

  const availableClasses = useMemo(() => {
    const s = new Set<string>()
    children.forEach(c => c.is_active && s.add(c.class_name))
    return Array.from(s).sort()
  }, [children])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = rows.filter(r => {
      if (!showPaid && r.displayStatus === 'Paid') return false
      if (filterStatus && r.displayStatus !== filterStatus) return false
      if (filterPlan && r.account.plan_type !== filterPlan) return false
      if (filterClass && !r.children.some(k => k.class_name === filterClass)) return false
      if (q) {
        const hay = `${r.family.family_name} ${r.family.primary_parent_name || ''} ${r.family.primary_parent_phone || ''} ${r.children.map(k => k.full_name).join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })

    list.sort((a, b) => {
      const aOD = Number(a.account.overdue_amount) > 0 ? 0 : 1
      const bOD = Number(b.account.overdue_amount) > 0 ? 0 : 1
      if (aOD !== bOD) return aOD - bOD
      if (a.account.overdue_amount !== b.account.overdue_amount)
        return b.account.overdue_amount - a.account.overdue_amount
      return a.family.family_name.localeCompare(b.family.family_name)
    })
    return list
  }, [rows, search, filterClass, filterStatus, filterPlan, showPaid])

  const summary = useMemo(() => {
    const expected = filtered.reduce((s, r) => s + Number(r.account.total_fee), 0)
    const collected = filtered.reduce((s, r) => s + Number(r.account.paid_amount), 0)
    const outstanding = filtered.reduce((s, r) => s + Number(r.account.balance), 0)
    const overdueAmount = filtered.reduce((s, r) => s + Number(r.account.overdue_amount), 0)
    const overdueCount = filtered.filter(r => Number(r.account.overdue_amount) > 0).length
    return { expected, collected, outstanding, overdueAmount, overdueCount }
  }, [filtered])

  function computePaySuggestion(account: Account) {
    if (Number(account.balance) <= 0) return ''

    if (account.plan_type === 'annual') return String(account.balance)

    // Monthly: if overdue, use overdue; else current month's installment
    if (Number(account.overdue_amount) > 0) return String(account.overdue_amount)

    // Find earliest unpaid installment
    const accInsts = installments
      .filter(i => i.family_fee_account_id === account.id && i.status !== 'Paid' && Number(i.amount_due) > 0)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
    const next = accInsts[0]
    if (next) return String(next.amount_due)

    // No unpaid installment → blank
    return ''
  }

  function openPayModal(account: Account) {
    setPayModalAccount(account)
    setPayAmount(computePaySuggestion(account))
    setPayMethod('Cash')
    setPayDate(todayISO())
    setPayNote('')
  }

  async function savePayment() {
    if (!payModalAccount) return
    const amt = Number(payAmount)
    if (!amt || amt <= 0) { showBanner('error', 'Enter a valid amount.'); return }

    setPaySaving(true)
    const { data: receiptData } = await supabase.rpc('next_receipt_no_family')
    const receipt = (receiptData as unknown as string) || `L-${Date.now().toString().slice(-4)}`

    const { error } = await supabase.from('family_fee_payments').insert({
      family_fee_account_id: payModalAccount.id,
      family_id: payModalAccount.family_id,
      paid_on: payDate,
      amount: amt,
      method: payMethod,
      receipt_no: receipt,
      note: payNote.trim(),
      recorded_by: userName,
    })
    setPaySaving(false)
    if (error) { showBanner('error', error.message); return }
    showBanner('success', `Payment recorded (${receipt}).`)
    setPayModalAccount(null)
    await loadAll()
  }

  function openEdit(account: Account) {
    setEditAccount(account)
    setEditTotal(String(account.total_fee))
    setEditReason('')
  }

  async function saveEditTotal() {
    if (!editAccount) return
    const t = Number(editTotal)
    if (!t || t < 0) { showBanner('error', 'Enter a valid total.'); return }
    setEditSaving(true)
    const { error } = await supabase
      .from('family_fee_accounts')
      .update({ total_fee: t, notes: editReason.trim() || editAccount.notes || '' })
      .eq('id', editAccount.id)
    setEditSaving(false)
    if (error) { showBanner('error', error.message); return }
    await supabase.rpc('recompute_family_account', { p_account_id: editAccount.id })
    showBanner('success', 'Total fee updated.')
    setEditAccount(null)
    await loadAll()
  }

  function exportCSV() {
    const header = ['Family','Parent','Phone','Plan','Children','Total Fee','Paid','Balance','Overdue','Monthly','Next Due','Status']
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s
    }
    const lines = [header.join(',')]
    filtered.forEach(r => {
      lines.push([
        r.family.family_name,
        r.family.primary_parent_name || '',
        r.family.primary_parent_phone || '',
        r.account.plan_type,
        r.children.map(k => k.full_name).join(' | '),
        r.account.total_fee,
        r.account.paid_amount,
        r.account.balance,
        r.account.overdue_amount,
        r.account.plan_type === 'monthly' ? r.account.monthly_installment : '',
        r.nextDue?.due_date || '',
        r.displayStatus,
      ].map(esc).join(','))
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `families_fees_${todayISO()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const ledgerFamily = useMemo(
    () => families.find(f => f.id === ledgerFamilyId) || null,
    [families, ledgerFamilyId]
  )
  const ledgerAccount = useMemo(
    () => accounts.find(a => a.family_id === ledgerFamilyId) || null,
    [accounts, ledgerFamilyId]
  )
  const ledgerChildren = useMemo(
    () => children.filter(c => c.family_id === ledgerFamilyId && c.is_active),
    [children, ledgerFamilyId]
  )
  const ledgerPayments = useMemo(
    () => payments.filter(p => p.family_id === ledgerFamilyId).sort((a, b) => b.paid_on.localeCompare(a.paid_on)),
    [payments, ledgerFamilyId]
  )
  const ledgerInstallments = useMemo(
    () => installments
      .filter(i => i.family_fee_account_id === ledgerAccount?.id)
      .sort((a, b) => a.due_date.localeCompare(b.due_date)),
    [installments, ledgerAccount]
  )

  if (loading) {
    return <AppShell userName={userName}><div style={{ padding: 40, textAlign: 'center', color: '#718096' }}>Loading fees…</div></AppShell>
  }

  return (
    <AppShell userName={userName}>
      <div className="page-header">
        <h2>Fee Tracker</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canEdit && (
            <Link href="/admissions" className="btn btn-primary">+ New Admission</Link>
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

      <div className="card">
        <div className="grid" style={{ marginBottom: 16 }}>
          <div className="stat info">
            <div className="label">Expected</div>
            <div className="value">{formatRs(summary.expected)}</div>
          </div>
          <div className="stat">
            <div className="label">Collected</div>
            <div className="value" style={{ color: '#2f855a' }}>{formatRs(summary.collected)}</div>
          </div>
          <div className="stat warning">
            <div className="label">Outstanding</div>
            <div className="value">{formatRs(summary.outstanding)}</div>
          </div>
          <div className="stat danger">
            <div className="label">Overdue</div>
            <div className="value">{formatRs(summary.overdueAmount)}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 220, flex: 1 }}>
            <label>Search</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Family, parent, phone, child…" />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 120 }}>
            <label>Plan</label>
            <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)}>
              <option value="">All</option>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 130 }}>
            <label>Class</label>
            <select value={filterClass} onChange={e => setFilterClass(e.target.value)}>
              <option value="">All</option>
              {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 150 }}>
            <label>Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All</option>
              <option value="Overdue">Overdue</option>
              <option value="Pending">Pending (Monthly)</option>
              <option value="Pending (Annual)">Pending (Annual)</option>
              <option value="Paid">Paid</option>
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem', marginTop: 18, cursor: 'pointer' }}>
            <input type="checkbox" checked={showPaid} onChange={e => setShowPaid(e.target.checked)} />
            Show paid
          </label>
          <button className="btn btn-secondary" onClick={exportCSV}>⬇ CSV</button>
        </div>

        <div className="card-title" style={{ marginTop: 0 }}>
          Showing {filtered.length} families · {formatRs(summary.outstanding)} outstanding · {formatRs(summary.overdueAmount)} overdue
        </div>

        {filtered.length === 0 ? (
          <p style={{ color: '#718096' }}>
            {rows.length === 0
              ? 'No fee accounts yet. Use “+ New Admission” to create one.'
              : 'No families match these filters.'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Family</th>
                  <th>Children</th>
                  <th>Plan</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Overdue</th>
                  <th>Monthly</th>
                  <th>Status</th>
                  <th style={{ width: 220 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.family.id} style={{ background: Number(r.account.overdue_amount) > 0 ? '#fff5f5' : undefined }}>
                    <td>
                      <div><strong>{r.family.family_name}</strong></div>
                      <div style={{ fontSize: '0.8rem', color: '#718096' }}>
                        {r.family.primary_parent_name || '—'} · {r.family.primary_parent_phone || '—'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem' }}>
                        {r.children.map(k => (
                          <div key={k.id}>{k.full_name} <span style={{ color: '#718096' }}>({k.class_name})</span></div>
                        ))}
                      </div>
                    </td>
                    <td>
                      {r.account.plan_type === 'annual'
                        ? <span className="badge badge-blue">Annual</span>
                        : <span className="badge badge-gray">Monthly</span>}
                    </td>
                    <td>{formatRs(r.account.total_fee)}</td>
                    <td style={{ color: '#2f855a' }}>{formatRs(r.account.paid_amount)}</td>
                    <td style={{ color: Number(r.account.balance) > 0 ? '#c53030' : '#2f855a', fontWeight: 600 }}>
                      {formatRs(r.account.balance)}
                    </td>
                    <td style={{ color: Number(r.account.overdue_amount) > 0 ? '#c53030' : '#a0aec0', fontWeight: 600 }}>
                      {Number(r.account.overdue_amount) > 0 ? formatRs(r.account.overdue_amount) : '—'}
                    </td>
                    <td>
                      {r.account.plan_type === 'monthly' && Number(r.account.balance) > 0
                        ? formatRsPrecise(r.account.monthly_installment)
                        : '—'}
                    </td>
                    <td>
                      {r.displayStatus === 'Paid' && <span className="badge badge-green">✓ Paid</span>}
                      {r.displayStatus === 'Pending' && <span className="badge badge-yellow">Pending</span>}
                      {r.displayStatus === 'Overdue' && <span className="badge badge-red">⚠️ Overdue</span>}
                      {r.displayStatus === 'Pending (Annual)' && <span className="badge badge-blue">Pending (Annual)</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {canEdit && Number(r.account.balance) > 0 && (
                          <button className="btn btn-sm btn-success" onClick={() => openPayModal(r.account)}>
                            💵 Pay
                          </button>
                        )}
                        <button className="btn btn-sm btn-secondary" onClick={() => setLedgerFamilyId(r.family.id)}>
                          👁 Ledger
                        </button>
                        {canEdit && (
                          <button className="btn btn-sm btn-secondary" onClick={() => openEdit(r.account)}>✏️</button>
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

      {/* RECORD PAYMENT MODAL */}
      {payModalAccount && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
        }}>
          <div className="card" style={{ maxWidth: 520, width: '100%', margin: 0 }}>
            <div className="card-title">💵 Record Payment</div>
            <div style={{ marginBottom: 12, fontSize: '0.9rem', color: '#4a5568' }}>
              <div><strong>{families.find(f => f.id === payModalAccount.family_id)?.family_name}</strong> ·
                {' '}<span style={{ textTransform: 'capitalize' }}>{payModalAccount.plan_type}</span> plan
              </div>
              <div>Balance: <strong>{formatRs(payModalAccount.balance)}</strong>
                {Number(payModalAccount.overdue_amount) > 0 && (
                  <> · Overdue: <strong style={{ color: '#c53030' }}>{formatRs(payModalAccount.overdue_amount)}</strong></>
                )}
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
              <button className="btn btn-secondary" onClick={() => setPayModalAccount(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={savePayment} disabled={paySaving}>
                {paySaving ? 'Saving…' : 'Save Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT TOTAL MODAL */}
      {editAccount && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
        }}>
          <div className="card" style={{ maxWidth: 460, width: '100%', margin: 0 }}>
            <div className="card-title">✏️ Edit Total Fee</div>
            <p style={{ fontSize: '0.85rem', color: '#4a5568', marginTop: 0 }}>
              Use for special adjustments or corrections. Balance and schedule recalculate automatically.
            </p>
            <div className="form-group">
              <label>Total Fee (Rs) *</label>
              <input type="number" value={editTotal} onChange={e => setEditTotal(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Reason / Note</label>
              <input value={editReason} onChange={e => setEditReason(e.target.value)} placeholder="e.g. Year-end discount" />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setEditAccount(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEditTotal} disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LEDGER DRAWER */}
      {ledgerFamily && ledgerAccount && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', justifyContent: 'flex-end', zIndex: 1000,
        }} onClick={() => { setLedgerFamilyId(null); setLedgerShowPayments(false) }}>
          <div
            style={{ width: '100%', maxWidth: 720, background: 'white', height: '100%', overflowY: 'auto', padding: 24 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0 }}>{ledgerFamily.family_name}</h3>
                <div style={{ fontSize: '0.9rem', color: '#4a5568' }}>
                  {ledgerFamily.primary_parent_name || '—'} · {ledgerFamily.primary_parent_phone || '—'}
                </div>
                <div style={{ marginTop: 6 }}>
                  {ledgerAccount.plan_type === 'annual'
                    ? <span className="badge badge-blue">Annual plan</span>
                    : <span className="badge badge-gray">Monthly plan</span>}
                </div>
              </div>
              <button className="btn btn-secondary" onClick={() => setLedgerFamilyId(null)}>Close</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Children</div>
              {ledgerChildren.map(k => (
                <div key={k.id} style={{ padding: '6px 10px', background: '#f7fafc', borderRadius: 6, marginBottom: 4 }}>
                  <strong>{k.full_name}</strong> <span style={{ color: '#718096' }}>· {k.class_name}</span>
                </div>
              ))}
            </div>

            <div className="grid" style={{ marginBottom: 16 }}>
              <div className="stat info">
                <div className="label">Total Fee</div>
                <div className="value">{formatRs(ledgerAccount.total_fee)}</div>
              </div>
              <div className="stat">
                <div className="label">Paid</div>
                <div className="value" style={{ color: '#2f855a' }}>{formatRs(ledgerAccount.paid_amount)}</div>
              </div>
              <div className="stat warning">
                <div className="label">Balance</div>
                <div className="value">{formatRs(ledgerAccount.balance)}</div>
              </div>
            </div>

            {Number(ledgerAccount.overdue_amount) > 0 && (
              <div style={{ padding: 12, background: '#fff5f5', border: '1px solid #fc8181', borderRadius: 6, marginBottom: 16 }}>
                <div style={{ fontSize: '0.9rem' }}>
                  <strong style={{ color: '#c53030' }}>⚠️ Overdue till date:</strong>{' '}
                  <span style={{ color: '#c53030', fontWeight: 600 }}>{formatRs(ledgerAccount.overdue_amount)}</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#4a5568', marginTop: 4 }}>
                  Expected till date: {formatRs(ledgerAccount.expected_till_date)}
                </div>
              </div>
            )}

            {Number(ledgerAccount.balance) > 0 && ledgerAccount.plan_type === 'monthly' && (
              <div style={{ padding: 12, background: '#ebf8ff', borderRadius: 6, fontSize: '0.9rem', marginBottom: 16 }}>
                <strong>Monthly installment:</strong> {formatRsPrecise(ledgerAccount.monthly_installment)}
                {ledgerInstallments.find(i => i.status !== 'Paid' && i.due_date > todayISO()) && (
                  <>
                    {' · '}
                    <strong>Next due:</strong> {formatDate(ledgerInstallments.find(i => i.status !== 'Paid' && i.due_date > todayISO())!.due_date)}
                  </>
                )}
              </div>
            )}

            {ledgerAccount.plan_type === 'annual' && Number(ledgerAccount.balance) > 0 && (
              <div style={{ padding: 12, background: '#ebf8ff', borderRadius: 6, fontSize: '0.9rem', marginBottom: 16 }}>
                <strong>Annual plan</strong> — record payments as they come.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              {canEdit && Number(ledgerAccount.balance) > 0 && (
                <button className="btn btn-primary" onClick={() => { openPayModal(ledgerAccount); setLedgerFamilyId(null) }}>
                  💵 Record Payment
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setLedgerShowPayments(!ledgerShowPayments)}>
                {ledgerShowPayments ? '▼ Hide payment history' : '👁 View payment history'}
              </button>
            </div>

            {ledgerShowPayments && (
              <div>
                <h4 style={{ marginTop: 0 }}>Payment History</h4>
                {ledgerPayments.length === 0 ? (
                  <p style={{ color: '#718096' }}>No payments recorded yet.</p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Receipt</th>
                          <th>Mode</th>
                          <th>Amount</th>
                          <th>Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledgerPayments.map(p => (
                          <tr key={p.id}>
                            <td>{formatDate(p.paid_on)}</td>
                            <td><strong>{p.receipt_no || '—'}</strong></td>
                            <td>{p.method}</td>
                            <td>Rs {Number(p.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                            <td>{p.note || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  )
}
