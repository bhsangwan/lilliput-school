import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import Link from 'next/link'

const todayISO = () => new Date().toISOString().slice(0, 10)

function formatRs(n: number) {
  return 'Rs ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  // Load everything we need
  const [
    { data: accounts },
    { data: families },
    { data: children },
    { data: installments },
  ] = await Promise.all([
    supabase.from('family_fee_accounts').select('*'),
    supabase.from('families').select('id, family_name, primary_parent_name, primary_parent_phone'),
    supabase.from('children').select('id, family_id, full_name, class_name, is_active'),
    supabase.from('family_fee_installments').select('*').order('due_date'),
  ])

  const familiesById = new Map((families || []).map((f: any) => [f.id, f]))
  const childrenByFamily = new Map<string, any[]>()
  ;(children || []).forEach((c: any) => {
    if (!c.family_id || !c.is_active) return
    const arr = childrenByFamily.get(c.family_id) || []
    arr.push(c)
    childrenByFamily.set(c.family_id, arr)
  })

  const installmentsByAccount = new Map<string, any[]>()
  ;(installments || []).forEach((i: any) => {
    const arr = installmentsByAccount.get(i.family_fee_account_id) || []
    arr.push(i)
    installmentsByAccount.set(i.family_fee_account_id, arr)
  })

  // Compute summary
  let outstandingTotal = 0
  let overdueCount = 0
  let annualFollowUpCount = 0
  let activeStudentCount = 0

  ;(accounts || []).forEach((acc: any) => {
    outstandingTotal += Number(acc.balance) || 0
    if (Number(acc.balance) <= 0) return

    if (acc.plan_type === 'annual') {
      annualFollowUpCount += 1
    } else {
      // monthly: overdue if any non-Paid installment past due
      const insts = installmentsByAccount.get(acc.id) || []
      const hasOverdue = insts.some(
        (i: any) => i.status !== 'Paid' && i.status !== 'Pending' && i.due_date < todayISO()
      ) || insts.some(
        (i: any) => i.status === 'Overdue'
      )
      if (hasOverdue) overdueCount += 1
    }
  })

  ;(children || []).forEach((c: any) => {
    if (c.is_active) activeStudentCount += 1
  })

  // Needs Attention: top 5 families with most urgent dues
  type AttentionRow = {
    familyId: string
    familyName: string
    parentName: string
    children: string
    balance: number
    planType: 'monthly' | 'annual'
    isOverdue: boolean
    oldestDueDate: string | null
  }

  const attention: AttentionRow[] = []
  ;(accounts || []).forEach((acc: any) => {
    if (Number(acc.balance) <= 0) return
    const fam = familiesById.get(acc.family_id)
    if (!fam) return
    const kids = childrenByFamily.get(fam.id) || []
    const kidNames = kids.map((k: any) => k.full_name).join(', ')

    let isOverdue = false
    let oldestDueDate: string | null = null

    if (acc.plan_type === 'monthly') {
      const insts = (installmentsByAccount.get(acc.id) || [])
        .filter((i: any) => i.status !== 'Paid' && Number(i.amount_due) > 0)
        .sort((a: any, b: any) => a.due_date.localeCompare(b.due_date))
      const overdueInsts = insts.filter((i: any) => i.due_date < todayISO())
      isOverdue = overdueInsts.length > 0
      oldestDueDate = insts[0]?.due_date || null
    }

    attention.push({
      familyId: fam.id,
      familyName: fam.family_name,
      parentName: fam.primary_parent_name || '—',
      children: kidNames,
      balance: Number(acc.balance),
      planType: acc.plan_type,
      isOverdue,
      oldestDueDate,
    })
  })

  attention.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
    return b.balance - a.balance
  })
  const topAttention = attention.slice(0, 5)

  return (
    <AppShell userName={profile?.full_name}>
      <div className="page-header">
        <h2>Dashboard</h2>
        <span style={{ color: '#718096', fontSize: '0.9rem' }}>
          {new Date().toLocaleDateString('en-IN', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          })}
        </span>
      </div>

      <div className="alert">
        Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}. This system keeps attendance follow-up, fees and parent messages in one place.
      </div>

      <div className="grid">
        <div className="stat warning">
          <div className="label">Outstanding Fees</div>
          <div className="value">{formatRs(outstandingTotal)}</div>
        </div>
        <div className="stat danger">
          <div className="label">Overdue Families</div>
          <div className="value">{overdueCount}</div>
        </div>
        <div className="stat info">
          <div className="label">Annual Follow-ups</div>
          <div className="value">{annualFollowUpCount}</div>
        </div>
        <div className="stat">
          <div className="label">Active Students</div>
          <div className="value">{activeStudentCount}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">⚠️ Needs Attention</div>
        {topAttention.length === 0 ? (
          <p style={{ color: '#718096' }}>Nothing urgent right now. 🎉</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Family</th>
                  <th>Children</th>
                  <th>Plan</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {topAttention.map(a => (
                  <tr key={a.familyId}>
                    <td>
                      <div><strong>{a.familyName}</strong></div>
                      <div style={{ fontSize: '0.8rem', color: '#718096' }}>{a.parentName}</div>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{a.children || '—'}</td>
                    <td>
                      {a.planType === 'annual'
                        ? <span className="badge badge-blue">Annual</span>
                        : <span className="badge badge-gray">Monthly</span>}
                    </td>
                    <td style={{ fontWeight: 600, color: '#c53030' }}>{formatRs(a.balance)}</td>
                    <td>
                      {a.isOverdue
                        ? <span className="badge badge-red">⚠️ Overdue</span>
                        : a.planType === 'annual'
                          ? <span className="badge badge-blue">📌 Follow-up</span>
                          : <span className="badge badge-yellow">Pending</span>}
                    </td>
                    <td>
                      <Link href="/reminders" className="btn btn-sm btn-secondary">View →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">💰 Fee Reminders</div>
        <p style={{ color: '#4a5568', fontSize: '0.9rem', marginTop: 0 }}>
          See which families have installments due or overdue, and send reminders in one click.
        </p>
        <Link href="/reminders" className="btn btn-primary">Open Reminders →</Link>
      </div>

      <div className="card">
        <div className="card-title">Quick Actions</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/attendance" className="btn btn-primary">Attendance</Link>
          <Link href="/fees" className="btn btn-secondary">Fees</Link>
          <Link href="/reminders" className="btn btn-secondary">Reminders</Link>
          <Link href="/communication" className="btn btn-secondary">Parent Log</Link>
          <Link href="/children" className="btn btn-secondary">Manage Children</Link>
        </div>
      </div>
    </AppShell>
  )
}
