'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'

type Family = {
  id: string
  family_name: string
  primary_parent_name: string | null
  primary_parent_phone: string | null
}

type Account = {
  id: string
  family_id: string
  total_fee: number
  paid_amount: number
  balance: number
  monthly_installment: number
  plan_type: 'monthly' | 'annual'
  expected_till_date: number
  overdue_amount: number
}

type Installment = {
  id: string
  family_fee_account_id: string
  month_year: string
  amount_due: number
  due_date: string
  status: 'Pending' | 'Paid' | 'Partial' | 'Overdue'
}

type Child = {
  id: string
  family_id: string | null
  full_name: string
  class_name: string
}

type Payment = {
  id: string
  family_id: string
  family_fee_account_id: string
  paid_on: string
  amount: number
  method: string
  receipt_no: string | null
  note: string | null
}

type Banner = { type: 'success' | 'error'; message: string } | null

const todayISO = () => new Date().toISOString().slice(0, 10)

function formatRs(n: number) {
  return 'Rs ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function formatRsPrecise(n: number) {
  return 'Rs ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[m-1]} ${y}`
}

function daysSince(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

export default function RemindersPage() {
  const supabase = createClient()
  const router = useRouter()

  const [userName, setUserName] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<Banner>(null)

  const [families, setFamilies] = useState<Family[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [installments, setInstallments] = useState<Installment[]>([])
  const [children, setChildren] = useState<Child[]>([])
  const [payments, setPayments] = useState<Payment[]>([])

  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'' | 'monthly' | 'annual' | 'overdue'>('')

  const [payModalAccount, setPayModalAccount] = useState<Account | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('Cash')
  const [payDate, setPayDate] = useState(todayISO())
  const [payNote, setPayNote] = useState('')
  const [paySaving, setPaySaving] = useState(false)

  const [historyFamilyId, setHistoryFamilyId] = useState<string | null>(null)

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

    const { data: accs, error: e2 } = await supabase.from('family_fee_accounts').select('*')
    if (e2) { showBanner('error', e2.message); return }
    setAccounts((accs as Account[]) || [])

    const { data: insts, error: e3 } = await supabase
      .from('family_fee_installments').select('*').order('due_date')
    if (e3) { showBanner('error', e3.message); return }
    setInstallments((insts as Installment[]) || [])

    const { data: kids, error: e4 } = await supabase
      .from('children').select('id, family_id, full_name, class_name')
    if (e4) { showBanner('error', e4.message); return }
    setChildren((kids as Child[]) || [])

    const { data: pays } = await supabase.from('family_fee_payments').select('*').order('paid_on', { ascending: false })
    setPayments((pays as Payment[]) || [])
  }

  function showBanner(type: 'success' | 'error', message: string) {
    setBanner({ type, message })
    setTimeout(() => setBanner(null), 4000)
  }

  type Row = {
    kind: 'monthly' | 'annual'
    family: Family
    account: Account
    nextInstallment: Installment | null   // monthly only
    children: Child[]
    isOverdue: boolean
    lastPaymentDate: string | null
  }

  const rows: Row[] = useMemo(() => {
    const familiesById = new Map(families.map(f => [f.id, f]))

    const lastPayByFamily = new Map<string, string>()
    payments.forEach(p => {
      const cur = lastPayByFamily.get(p.family_id)
      if (!cur || p.paid_on > cur) lastPayByFamily.set(p.family_id, p.paid_on)
    })

    const installsByAccount = new Map<string, Installment[]>()
    installments.forEach(i => {
      const arr = installsByAccount.get(i.family_fee_account_id) || []
      arr.push(i)
      installsByAccount.set(i.family_fee_account_id, arr)
    })

    const out: Row[] = []
    accounts.forEach(account => {
      if (Number(account.balance) <= 0) return  // settled → skip

      const family = familiesById.get(account.family_id)
      if (!family) return
      const kids = children.filter(c => c.family_id === family.id)
      const lastPay = lastPayByFamily.get(family.id) || null

      if (account.plan_type === 'monthly') {
        const unpaid = (installsByAccount.get(account.id) || [])
          .filter(i => i.status !== 'Paid' && Number(i.amount_due) > 0)
          .sort((a, b) => a.due_date.localeCompare(b.due_date))
        out.push({
          kind: 'monthly',
          family, account,
          nextInstallment: unpaid[0] || null,
          children: kids,
          isOverdue: Number(account.overdue_amount) > 0,
          lastPaymentDate: lastPay,
        })
      } else {
        out.push({
          kind: 'annual',
          family, account,
          nextInstallment: null,
          children: kids,
          isOverdue: false,
          lastPaymentDate: lastPay,
        })
      }
    })

    out.sort((a, b) => {
      const aR = a.isOverdue ? 0 : a.kind === 'monthly' ? 1 : 2
      const bR = b.isOverdue ? 0 : b.kind === 'monthly' ? 1 : 2
      if (aR !== bR) return aR - bR
      return b.account.balance - a.account.balance
    })
    return out
  }, [accounts, families, installments, children, payments])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filterType === 'overdue' && !r.isOverdue) return false
      if (filterType === 'monthly' && r.kind !== 'monthly') return false
      if (filterType === 'annual' && r.kind !== 'annual') return false
      if (q) {
        const hay = `${r.family.family_name} ${r.family.primary_parent_name || ''} ${r.family.primary_parent_phone || ''} ${r.children.map(k => k.full_name).join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, search, filterType])

  const stats = useMemo(() => {
    const overdueCount = rows.filter(r => r.isOverdue).length
    const overdueAmount = rows.reduce((s, r) => s + Number(r.account.overdue_amount), 0)
    const monthlyCount = rows.filter(r => r.kind === 'monthly').length
    const annualCount = rows.filter(r => r.kind === 'annual').length
    const totalOutstanding = rows.reduce((s, r) => s + Number(r.account.balance), 0)
    return { overdueCount, overdueAmount, monthlyCount, annualCount, totalOutstanding }
  }, [rows])

  function buildWhatsAppMessage(r: Row) {
    const parent = r.family.primary_parent_name || 'Parent'
    const kidNames = r.children.map(k => k.full_name).join(' & ')

    if (r.kind === 'annual') {
      const balance = Number(r.account.balance).toLocaleString('en-IN')
      return `Dear ${parent},

This is a gentle reminder from Lilliput Play School that Rs ${balance} is pending for ${kidNames}'s annual fees.

Kindly let us know a convenient time to clear the balance.

Thank you,
Lilliput Play School`
    }

    if (Number(r.account.overdue_amount) > 0) {
      const amt = Number(r.account.overdue_amount).toLocaleString('en-IN')
      return `Dear ${parent},

This is a gentle reminder from Lilliput Play School that Rs ${amt} is overdue for ${kidNames}'s fees as of today.

Kindly clear the pending amount at your earliest convenience.

Thank you,
Lilliput Play School`
    }

    if (r.nextInstallment) {
      const amt = Number(r.nextInstallment.amount_due).toLocaleString('en-IN')
      const date = formatDate(r.nextInstallment.due_date)
      return `Dear ${parent},

This is a gentle reminder from Lilliput Play School that Rs ${amt} is due by ${date} for ${kidNames}'s fees.

Thank you,
Lilliput Play School`
    }

    const balance = Number(r.account.balance).toLocaleString('en-IN')
    return `Dear ${parent},

This is a gentle reminder from Lilliput Play School that Rs ${balance} is pending for ${kidNames}'s fees.

Thank you,
Lilliput Play School`
  }

  async function copyReminder(r: Row) {
    const msg = buildWhatsAppMessage(r)
    try {
      await navigator.clipboard.writeText(msg)
      showBanner('success', `Message copied. Paste into WhatsApp for ${r.family.primary_parent_name || 'parent'}.`)
    } catch {
      showBanner('error', 'Could not copy. Please copy manually.')
    }
  }

  function computePaySuggestion(account: Account) {
    if (Number(account.balance) <= 0) return ''
    if (account.plan_type === 'annual') return String(account.balance)
    if (Number(account.overdue_amount) > 0) return String(account.overdue_amount)
    const next = installments
      .filter(i => i.family_fee_account_id === account.id && i.status !== 'Paid' && Number(i.amount_due) > 0)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]
    return next ? String(next.amount_due) : ''
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

  const historyPayments = useMemo(() => {
    if (!historyFamilyId) return []
    return payments
      .filter(p => p.family_id === historyFamilyId)
      .sort((a, b) => b.paid_on.localeCompare(a.paid_on))
  }, [payments, historyFamilyId])

  const historyFamily = useMemo(
    () => families.find(f => f.id === historyFamilyId) || null,
    [families, historyFamilyId]
  )

  if (loading) {
    return <AppShell userName={userName}><div style={{ padding: 40, textAlign: 'center', color: '#718096' }}>Loading reminders…</div></AppShell>
  }

  return (
    <AppShell userName={userName}>
      <div className="page-header">
        <h2>Fee Reminders</h2>
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
          <div className="stat danger">
            <div className="label">Overdue families</div>
            <div className="value">{stats.overdueCount}</div>
          </div>
          <div className="stat warning">
            <div className="label">Overdue amount</div>
            <div className="value">{formatRs(stats.overdueAmount)}</div>
          </div>
          <div className="stat info">
            <div className="label">Monthly pending</div>
            <div className="value">{stats.monthlyCount}</div>
          </div>
          <div className="stat">
            <div className="label">Total outstanding</div>
            <div className="value">{formatRs(stats.totalOutstanding)}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 220, flex: 1 }}>
            <label>Search</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Family, parent, phone, child…" />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
            <label>Type</label>
            <select value={filterType} onChange={e => setFilterType(e.target.value as any)}>
              <option value="">All pending</option>
              <option value="overdue">Overdue only</option>
              <option value="monthly">Monthly pending</option>
              <option value="annual">Annual pending</option>
            </select>
          </div>
        </div>

        <div className="card-title" style={{ marginTop: 0 }}>
          {filteredRows.length} {filteredRows.length === 1 ? 'family' : 'families'} with pending dues
        </div>

        {filteredRows.length === 0 ? (
          <p style={{ color: '#718096' }}>Nothing pending right now. 🎉</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Family</th>
                  <th>Children</th>
                  <th>Plan</th>
                  <th>Overdue</th>
                  <th>Balance</th>
                  <th>Next Due</th>
                  <th>Last Payment</th>
                  <th>Status</th>
                  <th style={{ width: 320 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(r => (
                  <tr key={r.family.id} style={{ background: r.isOverdue ? '#fff5f5' : undefined }}>
                    <td>
                      <div><strong>{r.family.family_name}</strong></div>
                      <div style={{ fontSize: '0.8rem', color: '#718096' }}>
                        {r.family.primary_parent_name} · {r.family.primary_parent_phone}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {r.children.map(k => <div key={k.id}>{k.full_name}</div>)}
                    </td>
                    <td>
                      {r.kind === 'annual'
                        ? <span className="badge badge-blue">Annual</span>
                        : <span className="badge badge-gray">Monthly</span>}
                    </td>
                    <td style={{ color: Number(r.account.overdue_amount) > 0 ? '#c53030' : '#a0aec0', fontWeight: 600 }}>
                      {Number(r.account.overdue_amount) > 0 ? formatRs(r.account.overdue_amount) : '—'}
                    </td>
                    <td style={{ fontWeight: 600 }}>{formatRs(r.account.balance)}</td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {r.nextInstallment ? (
                        <>
                          {formatDate(r.nextInstallment.due_date)}
                          <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                            {monthLabel(r.nextInstallment.month_year)}
                          </div>
                        </>
                      ) : '—'}
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {r.lastPaymentDate
                        ? <>
                            {formatDate(r.lastPaymentDate)}
                            <div style={{ fontSize: '0.75rem', color: '#718096' }}>
                              {daysSince(r.lastPaymentDate)} days ago
                            </div>
                          </>
                        : '—'}
                    </td>
                    <td>
                      {r.isOverdue
                        ? <span className="badge badge-red">⚠️ Overdue</span>
                        : r.kind === 'annual'
                          ? <span className="badge badge-blue">Annual pending</span>
                          : <span className="badge badge-yellow">Upcoming</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => copyReminder(r)}>
                          📋 Copy reminder
                        </button>
                        {canEdit && Number(r.account.balance) > 0 && (
                          <button className="btn btn-sm btn-success" onClick={() => openPayModal(r.account)}>
                            💵 Pay
                          </button>
                        )}
                        <button className="btn btn-sm btn-secondary" onClick={() => setHistoryFamilyId(r.family.id)}>
                          👁 History
                        </button>
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

      {/* HISTORY MODAL */}
      {historyFamilyId && historyFamily && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
        }} onClick={() => setHistoryFamilyId(null)}>
          <div
            className="card"
            style={{ maxWidth: 640, width: '100%', margin: 0, maxHeight: '80vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="card-title" style={{ margin: 0 }}>{historyFamily.family_name} — Payment History</div>
              <button className="btn btn-sm btn-secondary" onClick={() => setHistoryFamilyId(null)}>Close</button>
            </div>
            {historyPayments.length === 0 ? (
              <p style={{ color: '#718096' }}>No payments yet.</p>
            ) : (
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
                  {historyPayments.map(p => (
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
            )}
          </div>
        </div>
      )}
    </AppShell>
  )
}
