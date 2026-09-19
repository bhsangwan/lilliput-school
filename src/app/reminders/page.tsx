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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${months[m-1]} ${y}`
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

  // Filters
  const [search, setSearch] = useState('')
  const [showOverdueOnly, setShowOverdueOnly] = useState(false)

  // Payment modal
  const [payModalAccount, setPayModalAccount] = useState<Account | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('Cash')
  const [payDate, setPayDate] = useState(todayISO())
  const [payNote, setPayNote] = useState('')
  const [paySaving, setPaySaving] = useState(false)

  // History modal
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

    const { data: pays } = await supabase.from('family_fee_payments').select('*')
    setPayments((pays as Payment[]) || [])
  }

  function showBanner(type: 'success' | 'error', message: string) {
    setBanner({ type, message })
    setTimeout(() => setBanner(null), 4000)
  }

  // ---------- DERIVED ----------
  // Build list: families with installments due/overdue this month
  const dueRows = useMemo(() => {
    const today = todayISO()
    const currentMonth = today.slice(0, 7)

    const accountsById = new Map(accounts.map(a => [a.id, a]))
    const familiesById = new Map(families.map(f => [f.id, f]))

    // Find each family's oldest unpaid installment (Pending/Partial/Overdue)
    const oldestByAccount = new Map<string, Installment>()
    installments.forEach(i => {
      if (i.status === 'Paid') return
      const existing = oldestByAccount.get(i.family_fee_account_id)
      if (!existing || i.due_date < existing.due_date) {
        oldestByAccount.set(i.family_fee_account_id, i)
      }
    })

    const rows: {
      family: Family
      account: Account
      installment: Installment
      children: Child[]
      isOverdue: boolean
      isThisMonth: boolean
    }[] = []

    oldestByAccount.forEach((inst, accountId) => {
      const account = accountsById.get(accountId)
      if (!account) return
      const family = familiesById.get(account.family_id)
      if (!family) return
      const kids = children.filter(c => c.family_id === family.id)
      const instMonth = inst.due_date.slice(0, 7)
      const isOverdue = inst.due_date < today
      const isThisMonth = instMonth === currentMonth
      rows.push({ family, account, installment: inst, children: kids, isOverdue, isThisMonth })
    })

    return rows.sort((a, b) => a.installment.due_date.localeCompare(b.installment.due_date))
  }, [accounts, families, installments, children])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return dueRows.filter(r => {
      if (showOverdueOnly && !r.isOverdue) return false
      if (q) {
        const hay = `${r.family.family_name} ${r.family.primary_parent_name || ''} ${r.family.primary_parent_phone || ''} ${r.children.map(k => k.full_name).join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [dueRows, search, showOverdueOnly])

  const stats = useMemo(() => {
    const overdue = dueRows.filter(r => r.isOverdue).length
    const thisMonth = dueRows.filter(r => r.isThisMonth).length
    const totalDue = dueRows.reduce((s, r) => s + Number(r.installment.amount_due), 0)
    return { overdue, thisMonth, totalDue }
  }, [dueRows])

  // ---------- WhatsApp ----------
  function buildWhatsAppMessage(r: { family: Family; children: Child[]; installment: Installment }) {
    const parent = r.family.primary_parent_name || 'Parent'
    const amount = Number(r.installment.amount_due).toLocaleString('en-IN')
    const date = formatDate(r.installment.due_date)
    const kidNames = r.children.map(k => k.full_name).join(' & ')
    return `Dear ${parent},

This is a gentle reminder from Lilliput Play School that Rs ${amount} is due by ${date} for ${kidNames}'s fees.

Thank you,
Lilliput Play School`
  }

  async function copyReminder(r: { family: Family; children: Child[]; installment: Installment }) {
    const msg = buildWhatsAppMessage(r)
    try {
      await navigator.clipboard.writeText(msg)
      showBanner('success', `Message copied. Paste into WhatsApp for ${r.family.primary_parent_name || 'parent'}.`)
    } catch {
      showBanner('error', 'Could not copy. Please copy manually.')
    }
  }

  // ---------- PAYMENT ----------
  function openPayModal(account: Account) {
    setPayModalAccount(account)
    setPayAmount(String(account.monthly_installment || account.balance))
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

  // ---------- HISTORY ----------
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
        <h2>Monthly Reminders</h2>
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
            <div className="label">Overdue</div>
            <div className="value">{stats.overdue}</div>
          </div>
          <div className="stat warning">
            <div className="label">This month</div>
            <div className="value">{stats.thisMonth}</div>
          </div>
          <div className="stat info">
            <div className="label">Total due</div>
            <div className="value">{formatRs(stats.totalDue)}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 240, flex: 1 }}>
            <label>Search</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Family, parent, phone, child…" />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem', marginTop: 18, cursor: 'pointer' }}>
            <input type="checkbox" checked={showOverdueOnly} onChange={e => setShowOverdueOnly(e.target.checked)} />
            Overdue only
          </label>
        </div>

        <div className="card-title" style={{ marginTop: 0 }}>
          {filteredRows.length} {filteredRows.length === 1 ? 'family' : 'families'} with pending installment
        </div>

        {filteredRows.length === 0 ? (
          <p style={{ color: '#718096' }}>No reminders right now. 🎉</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Family</th>
                  <th>Children</th>
                  <th>Installment</th>
                  <th>Due Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th style={{ width: 300 }}>Actions</th>
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
                    <td>{monthLabel(r.installment.month_year)}</td>
                    <td>{formatDate(r.installment.due_date)}</td>
                    <td style={{ fontWeight: 600 }}>{formatRs(r.installment.amount_due)}</td>
                    <td>
                      {r.isOverdue
                        ? <span className="badge badge-red">⚠️ Overdue</span>
                        : <span className="badge badge-yellow">Pending</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => copyReminder(r)}>
                          📋 Copy reminder
                        </button>
                        {canEdit && (
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

      {/* ---------- RECORD PAYMENT MODAL ---------- */}
      {payModalAccount && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
        }}>
          <div className="card" style={{ maxWidth: 520, width: '100%', margin: 0 }}>
            <div className="card-title">💵 Record Payment</div>
            <div style={{ marginBottom: 12, fontSize: '0.9rem', color: '#4a5568' }}>
              <div><strong>{families.find(f => f.id === payModalAccount.family_id)?.family_name}</strong></div>
              <div>Balance: <strong>{formatRs(payModalAccount.balance)}</strong></div>
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

      {/* ---------- HISTORY MODAL ---------- */}
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
