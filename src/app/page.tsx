import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import Link from 'next/link'

function formatRs(n: number) {
  return 'Rs ' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
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

  const [
    { data: accounts },
    { data: families },
    { data: children },
  ] = await Promise.all([
    supabase.from('family_fee_accounts').select('*'),
    supabase.from('families').select('id, family_name, primary_parent_name, primary_parent_phone'),
    supabase.from('children').select('id, family_id, full_name, class_name, is_active'),
  ])

  const familiesById = new Map<string, any>((families || []).map((f: any) => [f.id, f]))
  const childrenByFamily = new Map<string, any[]>()
  ;(children || []).forEach((c: any) => {
    if (!c.family_id || !c.is_active) return
    const arr = childrenByFamily.get(c.family_id) || []
    arr.push(c)
    childrenByFamily.set(c.family_id, arr)
  })

  // Summary
  let totalOutstanding = 0
  let totalOverdue = 0
  let overdueCount = 0
  let activeStudentCount = 0

  ;(accounts || []).forEach((acc: any) => {
    const bal = Number(acc.balance) || 0
    const od = Number(acc.overdue_amount) || 0
    totalOutstanding += bal
    totalOverdue += od
    if (od > 0) overdueCount += 1
  })

  ;(children || []).forEach((c: any) => {
    if (c.is_active) activeStudentCount += 1
  })

  // Filtered "Needs Attention" — top 5
  type AttentionRow = {
    familyId: string
    familyName: string
    parentName: string
    children: string
    balance: number
    overdue: number
    planType: 'monthly' | 'annual'
  }

  const attention: AttentionRow[] = []
  ;(accounts || []).forEach((acc: any) => {
    const bal = Number(acc.balance) || 0
    if (bal <= 0) return

    const fam = familiesById.get(acc.family_id)
    if (!fam) return

    const overdue = Number(acc.overdue_amount) || 0
    const monthly = Number(acc.monthly_installment) || 0

    // Filter: annual (any balance) OR monthly with overdue > 3× monthly
    if (acc.plan_type === 'annual') {
      // qualifies
    } else {
      if (monthly <= 0) return
      if (overdue <= monthly * 3) return
    }

    const kids = childrenByFamily.get(fam.id) || []
    const kidNames = kids.map((k: any) => `${k.full_name} (${k.class_name})`).join(', ')

    attention.push({
      familyId: fam.id,
      familyName: fam.family_name,
      parentName: fam.primary_parent_name || '—',
      children: kidNames,
      balance: bal,
      overdue,
      planType: acc.plan_type,
    })
  })

  // Sort: annual first, then by overdue desc
  attention.sort((a, b) => {
    if (a.planType !== b.planType) {
      return a.planType === 'annual' ? -1 : 1
    }
    if (a.planType === 'annual') return b.balance - a.balance
    return b.overdue - a.overdue
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
        <div className="stat danger">
          <div className="label">Overdue Amount</div>
          <div className="value">{formatRs(totalOverdue)}</div>
        </div>
        <div className="stat warning">
          <div className="label">Outstanding Total</div>
          <div className="value">{formatRs(totalOutstanding)}</div>
        </div>
        <div className="stat info">
          <div className="label">Overdue Families</div>
          <div className="value">{overdueCount}</div>
        </div>
        <div className="stat">
          <div className="label">Active Students</div>
          <div className="value">{activeStudentCount}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">⚠️ Needs Attention</div>
        <p style={{ color: '#718096', fontSize: '0.85rem', marginTop: 0 }}>
          Annual families with pending balance, and monthly families with more than 3 overdue installments.
        </p>

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
                  <th>Overdue</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {topAttention.map(a => (
                  <tr key={a.familyId} style={{ background: a.planType === 'monthly' ? '#fff5f5' : undefined }}>
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
                    <td style={{ fontWeight: 600, color: a.overdue > 0 ? '#c53030' : '#a0aec0' }}>
                      {a.overdue > 0 ? formatRs(a.overdue) : '—'}
                    </td>
                    <td style={{ fontWeight: 600 }}>{formatRs(a.balance)}</td>
                    <td>
                      {a.planType === 'annual'
                        ? <span className="badge badge-blue">Pending (Annual)</span>
                        : <span className="badge badge-red">⚠️ Overdue</span>}
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

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <Link href="/reminders" className="btn btn-primary">See all Fee Reminders →</Link>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Quick Actions</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/attendance" className="btn btn-primary">Attendance</Link>
          <Link href="/fees" className="btn btn-secondary">Fees</Link>
          <Link href="/reminders" className="btn btn-secondary">Fee Reminders</Link>
          <Link href="/communication" className="btn btn-secondary">Parent Log</Link>
          <Link href="/children" className="btn btn-secondary">Manage Children</Link>
        </div>
      </div>
    </AppShell>
  )
}
