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
  let annualPendingCount = 0
  let activeStudentCount = 0

  ;(accounts || []).forEach((acc: any) => {
    const bal = Number(acc.balance) || 0
    const od = Number(acc.overdue_amount) || 0
    totalOutstanding += bal
    totalOverdue += od
    if (od > 0) overdueCount += 1
    if (bal > 0 && acc.plan_type === 'annual') annualPendingCount += 1
  })

  ;(children || []).forEach((c: any) => {
    if (c.is_active) activeStudentCount += 1
  })

  // Needs Attention
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
    if (Number(acc.balance) <= 0) return
    const fam = familiesById.get(acc.family_id)
    if (!fam) return
    const kids = childrenByFamily.get(fam.id) || []
    const kidNames = kids.map((k: any) => `${k.full_name} (${k.class_name})`).join(', ')

    attention.push({
      familyId: fam.id,
      familyName: fam.family_name,
      parentName: fam.primary_parent_name || '—',
      children: kidNames,
      balance: Number(acc.balance),
      overdue: Number(acc.overdue_amount) || 0,
      planType: acc.plan_type,
    })
  })

  attention.sort((a, b) => {
    // Overdue first (biggest overdue at top), then by balance desc
    if (a.overdue !== b.overdue) return b.overdue - a.overdue
    return b.balance - a.balance
  })
  const topAttention = attention.slice(0, 6)

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
                  <tr key={a.familyId} style={{ background: a.overdue > 0 ? '#fff5f5' : undefined }}>
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
                      {a.overdue > 0
                        ? <span className="badge badge-red">⚠️ Overdue</span>
                        : a.planType === 'annual'
                          ? <span className="badge badge-blue">Pending (Annual)</span>
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
          See which families have overdue or upcoming dues, and send reminders in one click.
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
