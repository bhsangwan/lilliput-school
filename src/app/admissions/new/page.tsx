'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const CLASS_OPTIONS = [
  'Nursery A','Nursery B',
  'LKG A','LKG B',
  'UKG A','UKG B',
  'Class_1 A','Class_1 B',
  'Class_2 A','Class_2 B',
  'Class_3 A','Class_3 B',
]

const DEFAULT_MONTHLY = 3500

type Banner = { type: 'success' | 'error'; message: string } | null

type ChildEntry = {
  key: string
  full_name: string
  class_name: string
  monthly_fee: string
  discount_percent: string
  final_fee_override: string
}

function generateKey() {
  return Math.random().toString(36).slice(2)
}

function currentYearMonth() {
  return new Date().toISOString().slice(0, 7)
}

// Compute months remaining: admission month → March next year (or same year if Jan-Mar)
function monthsRemainingFrom(admissionMonth: string): number {
  if (!/^\d{4}-\d{2}$/.test(admissionMonth)) return 12
  const [y, m] = admissionMonth.split('-').map(Number)
  // Academic year end: March of (adm year) if m <= 3, else March of (adm year + 1)
  const endYear = m <= 3 ? y : y + 1
  const mr = (endYear - y) * 12 + (3 - m) + 1
  return mr > 0 ? mr : 1
}

export default function NewAdmissionPage() {
  const supabase = createClient()
  const router = useRouter()

  const [userName, setUserName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState<Banner>(null)

  // Family
  const [familyName, setFamilyName] = useState('')
  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [existingFamilyId, setExistingFamilyId] = useState<string | null>(null)
  const [familyLookupDone, setFamilyLookupDone] = useState(false)

  // Admission
  const [admissionMonth, setAdmissionMonth] = useState(currentYearMonth())

  // Children
  const [children, setChildren] = useState<ChildEntry[]>([
    { key: generateKey(), full_name: '', class_name: '', monthly_fee: String(DEFAULT_MONTHLY), discount_percent: '0', final_fee_override: '' }
  ])

  // Admission payment
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('Cash')
  const [paymentNote, setPaymentNote] = useState('')

  const monthsRemaining = useMemo(() => monthsRemainingFrom(admissionMonth), [admissionMonth])

  const canEdit = true // any logged-in user can create admissions; adjust per role later

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('profiles').select('full_name, role').eq('id', user.id).single()
      setUserName(profile?.full_name || '')
      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Lookup family when phone changes
  useEffect(() => {
    if (!parentPhone || parentPhone.length < 6) {
      setExistingFamilyId(null)
      setFamilyLookupDone(false)
      return
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('families').select('id, family_name, primary_parent_name')
        .eq('primary_parent_phone', parentPhone.trim())
        .maybeSingle()
      if (data) {
        setExistingFamilyId(data.id)
        if (!familyName) setFamilyName(data.family_name)
        if (!parentName) setParentName(data.primary_parent_name || '')
      } else {
        setExistingFamilyId(null)
      }
      setFamilyLookupDone(true)
    }, 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentPhone])

  function showBanner(type: 'success' | 'error', message: string) {
    setBanner({ type, message })
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setTimeout(() => setBanner(null), 5000)
  }

  // ---- child helpers ----
  function updateChild(key: string, patch: Partial<ChildEntry>) {
    setChildren(prev => prev.map(c => (c.key === key ? { ...c, ...patch } : c)))
  }

  function addChild() {
    setChildren(prev => [
      ...prev,
      {
        key: generateKey(),
        full_name: '',
        class_name: '',
        monthly_fee: String(DEFAULT_MONTHLY),
        discount_percent: prev.length >= 1 ? '25' : '0', // default 25% for 2nd+ children
        final_fee_override: '',
      }
    ])
  }

  function removeChild(key: string) {
    setChildren(prev => (prev.length > 1 ? prev.filter(c => c.key !== key) : prev))
  }

  // ---- per-child computed ----
  function childSuggested(c: ChildEntry) {
    const monthly = Number(c.monthly_fee) || 0
    return Math.round(monthly * monthsRemaining * 100) / 100
  }

  function childFinal(c: ChildEntry) {
    if (c.final_fee_override.trim() !== '') return Number(c.final_fee_override) || 0
    const suggested = childSuggested(c)
    const disc = Number(c.discount_percent) || 0
    return Math.round(suggested * (1 - disc / 100) * 100) / 100
  }

  const familyTotal = useMemo(
    () => children.reduce((s, c) => s + childFinal(c), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [children, monthsRemaining]
  )

  // ---- submit ----
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Validation
    if (!parentName.trim()) { showBanner('error', 'Parent name is required.'); return }
    if (!parentPhone.trim()) { showBanner('error', 'Parent phone is required.'); return }
    if (!/^\d{4}-\d{2}$/.test(admissionMonth)) { showBanner('error', 'Pick a valid admission month.'); return }

    for (const c of children) {
      if (!c.full_name.trim()) { showBanner('error', 'Every child needs a name.'); return }
      if (!c.class_name) { showBanner('error', 'Every child needs a class.'); return }
      if (childFinal(c) <= 0) { showBanner('error', 'Every child needs a positive final fee.'); return }
    }

    const payAmt = Number(paymentAmount) || 0
    if (payAmt > familyTotal) {
      showBanner('error', `Admission payment (Rs ${payAmt}) cannot exceed family total (Rs ${familyTotal}).`)
      return
    }

    setSaving(true)

    try {
      // 1. Family: use existing or create new
      let familyId = existingFamilyId
      if (!familyId) {
        const { data: fam, error: famErr } = await supabase
          .from('families')
          .insert({
            family_name: familyName.trim() || parentName.trim() + ' Family',
            primary_parent_name: parentName.trim(),
            primary_parent_phone: parentPhone.trim(),
          })
          .select('id')
          .single()
        if (famErr) throw famErr
        familyId = fam.id
      }

      // 2. Admission date (5th of admission month, or today)
      const [y, m] = admissionMonth.split('-').map(Number)
      const admissionDate = `${y}-${String(m).padStart(2, '0')}-05`

      // 3. Create family_fee_accounts placeholder
      const { data: account, error: accErr } = await supabase
        .from('family_fee_accounts')
        .insert({
          family_id: familyId,
          academic_year: y,
          admission_date: admissionDate,
          total_fee: familyTotal,
          paid_amount: 0,
          balance: familyTotal,
          monthly_installment: 0,
          notes: '',
        })
        .select('id')
        .single()
      if (accErr) throw accErr

      // 4. Create each child + fee_plan
      for (let i = 0; i < children.length; i++) {
        const c = children[i]
        const suggested = childSuggested(c)
        const disc = Number(c.discount_percent) || 0
        const finalFee = childFinal(c)

        const { data: kid, error: kidErr } = await supabase
          .from('children')
          .insert({
            full_name: c.full_name.trim(),
            class_name: c.class_name,
            parent_name: parentName.trim(),
            parent_phone: parentPhone.trim(),
            is_active: true,
            admission_year: y,
            family_id: familyId,
          })
          .select('id')
          .single()
        if (kidErr) throw kidErr

        const { error: planErr } = await supabase
          .from('fee_plans')
          .insert({
            child_id: kid.id,
            academic_year: y,
            plan_type: 'monthly',
            base_fee: 42000,
            discount_amount: suggested - finalFee,
            final_fee: finalFee,
            discount_reason: disc > 0 ? `${disc}% sibling discount` : '',
            installments: monthsRemaining,
            amount_per_installment: Math.round((finalFee / monthsRemaining) * 100) / 100,
            due_day: 10,
            notes: '',
            family_fee_account_id: account.id,
            admission_month: admissionMonth,
            months_remaining: monthsRemaining,
            suggested_fee: suggested,
            discount_percent: disc,
          })
        if (planErr) throw planErr
      }

      // 5. Admission payment (if any)
      if (payAmt > 0) {
        const { data: receiptData } = await supabase.rpc('next_receipt_no_family')
        const receipt = (receiptData as unknown as string) || `L-${Date.now().toString().slice(-4)}`

        const { error: payErr } = await supabase
          .from('family_fee_payments')
          .insert({
            family_fee_account_id: account.id,
            family_id: familyId,
            paid_on: admissionDate,
            amount: payAmt,
            method: paymentMethod,
            receipt_no: receipt,
            note: paymentNote.trim() || 'Admission payment',
            recorded_by: userName,
          })
        if (payErr) throw payErr
      }

      // Trigger will recompute account; but call it explicitly to be safe
      await supabase.rpc('recompute_family_account', { p_account_id: account.id })

      showBanner('success', 'Admission created successfully! Redirecting…')
      setTimeout(() => router.push('/fees'), 1200)
    } catch (err: any) {
      showBanner('error', err?.message || 'Something went wrong. Please try again.')
      setSaving(false)
    }
  }

  if (loading) {
    return <AppShell userName={userName}><div style={{ padding: 40, textAlign: 'center', color: '#718096' }}>Loading…</div></AppShell>
  }

  return (
    <AppShell userName={userName}>
      <div className="page-header">
        <h2>New Admission</h2>
        <Link href="/fees" className="btn btn-secondary">← Back to Fees</Link>
      </div>

      {banner && (
        <div style={{
          padding: '10px 14px', borderRadius: 6, marginBottom: 14, fontSize: '0.9rem',
          background: banner.type === 'success' ? '#c6f6d5' : '#fed7d7',
          color: banner.type === 'success' ? '#22543d' : '#822727',
          border: `1px solid ${banner.type === 'success' ? '#9ae6b4' : '#feb2b2'}`,
        }}>{banner.message}</div>
      )}

      <form onSubmit={handleSubmit}>
        {/* ---- FAMILY ---- */}
        <div className="card">
          <div className="card-title">Family Details</div>
          <div className="form-row">
            <div className="form-group">
              <label>Parent Name *</label>
              <input
                required
                value={parentName}
                onChange={e => setParentName(e.target.value)}
                placeholder="e.g. Mr. Bhavesh Sangwan"
              />
            </div>
            <div className="form-group">
              <label>Parent Phone *</label>
              <input
                required
                value={parentPhone}
                onChange={e => setParentPhone(e.target.value)}
                placeholder="e.g. 9812345601"
              />
              {familyLookupDone && existingFamilyId && (
                <div style={{ fontSize: '0.8rem', color: '#2b6cb0', marginTop: 4 }}>
                  ✓ Existing family found — children will be added to it.
                </div>
              )}
              {familyLookupDone && !existingFamilyId && parentPhone.length >= 6 && (
                <div style={{ fontSize: '0.8rem', color: '#2f855a', marginTop: 4 }}>
                  ✓ New family will be created.
                </div>
              )}
            </div>
          </div>
          {!existingFamilyId && (
            <div className="form-group">
              <label>Family Name</label>
              <input
                value={familyName}
                onChange={e => setFamilyName(e.target.value)}
                placeholder="e.g. Sangwan Family (auto-generated if blank)"
              />
            </div>
          )}
        </div>

        {/* ---- ADMISSION ---- */}
        <div className="card">
          <div className="card-title">Admission</div>
          <div className="form-row">
            <div className="form-group">
              <label>Admission Month *</label>
              <input
                required
                type="month"
                value={admissionMonth}
                onChange={e => setAdmissionMonth(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Months Remaining (auto)</label>
              <input
                value={`${monthsRemaining} months (${admissionMonth} → March)`}
                readOnly
                style={{ background: '#f7fafc' }}
              />
            </div>
          </div>
        </div>

        {/* ---- CHILDREN ---- */}
        <div className="card">
          <div className="card-title">Children & Fees</div>

          {children.map((c, idx) => {
            const suggested = childSuggested(c)
            const finalFee = childFinal(c)
            const isOverride = c.final_fee_override.trim() !== ''

            return (
              <div key={c.key} style={{
                border: '1px solid #e2e8f0', borderRadius: 8, padding: 14,
                marginBottom: 12, background: idx === 0 ? '#fff' : '#f9fafb'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <strong>Child {idx + 1} {idx >= 1 && <span className="badge badge-blue">Sibling</span>}</strong>
                  {children.length > 1 && (
                    <button type="button" className="btn btn-sm btn-secondary"
                      onClick={() => removeChild(c.key)}
                      style={{ color: '#c53030', borderColor: '#fc8181' }}>
                      Remove
                    </button>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Full Name *</label>
                    <input
                      required
                      value={c.full_name}
                      onChange={e => updateChild(c.key, { full_name: e.target.value })}
                      placeholder="e.g. Shiva Sangwan"
                    />
                  </div>
                  <div className="form-group">
                    <label>Class *</label>
                    <select
                      required
                      value={c.class_name}
                      onChange={e => updateChild(c.key, { class_name: e.target.value })}
                    >
                      <option value="">Select class</option>
                      {CLASS_OPTIONS.map(cl => <option key={cl} value={cl}>{cl}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Monthly Fee (Rs) *</label>
                    <input
                      required
                      type="number"
                      value={c.monthly_fee}
                      onChange={e => updateChild(c.key, { monthly_fee: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Suggested Total ({monthsRemaining} × {c.monthly_fee})</label>
                    <input
                      readOnly
                      value={`Rs ${suggested.toLocaleString('en-IN')}`}
                      style={{ background: '#f7fafc' }}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Discount % (0 = none, 25 = sibling)</label>
                    <input
                      type="number"
                      value={c.discount_percent}
                      onChange={e => updateChild(c.key, { discount_percent: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Final Fee (Rs) {!isOverride && <span style={{ color: '#a0aec0', fontWeight: 400 }}>— auto, editable</span>}</label>
                    <input
                      type="number"
                      value={isOverride ? c.final_fee_override : String(finalFee)}
                      onChange={e => updateChild(c.key, { final_fee_override: e.target.value })}
                      placeholder={String(finalFee)}
                    />
                    {isOverride && (
                      <div style={{ fontSize: '0.75rem', color: '#dd6b20', marginTop: 4 }}>
                        Override active — auto value would be Rs {finalFee.toLocaleString('en-IN')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          <button type="button" className="btn btn-secondary" onClick={addChild}>
            + Add Another Child
          </button>
        </div>

        {/* ---- FAMILY TOTAL ---- */}
        <div className="card">
          <div className="card-title">Family Total</div>
          <div className="grid" style={{ marginBottom: 12 }}>
            <div className="stat info">
              <div className="label">Children</div>
              <div className="value">{children.length}</div>
            </div>
            <div className="stat">
              <div className="label">Months Remaining</div>
              <div className="value">{monthsRemaining}</div>
            </div>
            <div className="stat warning">
              <div className="label">Family Total Fee</div>
              <div className="value">Rs {familyTotal.toLocaleString('en-IN')}</div>
            </div>
          </div>
        </div>

        {/* ---- ADMISSION PAYMENT ---- */}
        <div className="card">
          <div className="card-title">Payment Received at Admission (optional)</div>
          <div className="form-row">
            <div className="form-group">
              <label>Amount (Rs)</label>
              <input
                type="number"
                value={paymentAmount}
                onChange={e => setPaymentAmount(e.target.value)}
                placeholder="Leave blank for no payment"
              />
            </div>
            <div className="form-group">
              <label>Method</label>
              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
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
            <label>Note</label>
            <input
              value={paymentNote}
              onChange={e => setPaymentNote(e.target.value)}
              placeholder="e.g. Admission payment at time of joining"
            />
          </div>
        </div>

        {/* ---- ACTIONS ---- */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 40 }}>
          <Link href="/fees" className="btn btn-secondary">Cancel</Link>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create Admission'}
          </button>
        </div>
      </form>
    </AppShell>
  )
}
