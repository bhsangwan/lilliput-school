import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/AppShell'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  const today = new Date().toISOString().slice(0, 10)

  const { data: absences } = await supabase
    .from('attendance')
    .select('*, children(full_name, class_name)')
    .eq('attendance_date', today)
    .eq('status', 'Absent')

  const { data: pendingFollowUps } = await supabase
    .from('attendance')
    .select('*, children(full_name)')
    .eq('follow_up_status', 'Pending')

  const { data: pendingFees } = await supabase
    .from('fees')
    .select('*')
    .in('status', ['Pending', 'Partial'])

  const { data: openMsgs } = await supabase
    .from('communications')
    .select('*, children(full_name)')
    .eq('status', 'Open')

  return (
    <AppShell userName={profile?.full_name}>
      <div className="page-header">
        <h2>Dashboard</h2>
        <span style={{ color: '#718096', fontSize: '0.9rem' }}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>

      <div className="alert">
        Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}. 
        This system keeps attendance follow-up, fees and parent messages in one place.
      </div>

      <div className="grid">
        <div className="stat danger">
          <div className="label">Absent Today</div>
          <div className="value">{absences?.length ?? 0}</div>
        </div>
        <div className="stat warning">
          <div className="label">Pending Follow-ups</div>
          <div className="value">{pendingFollowUps?.length ?? 0}</div>
        </div>
        <div className="stat info">
          <div className="label">Pending Fees</div>
          <div className="value">{pendingFees?.length ?? 0}</div>
        </div>
        <div className="stat">
          <div className="label">Open Parent Msgs</div>
          <div className="value">{openMsgs?.length ?? 0}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">⚠️ Needs Attention</div>
        {(!pendingFollowUps?.length && !openMsgs?.length) ? (
          <p style={{ color: '#718096' }}>No urgent items right now.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Child</th>
                <th>Details</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pendingFollowUps?.map((a: any) => (
                <tr key={a.id}>
                  <td><span className="badge badge-red">Attendance</span></td>
                  <td>{a.children?.full_name}</td>
                  <td>{a.follow_up_note || 'Follow-up needed'}</td>
                  <td><span className="badge badge-yellow">{a.follow_up_status}</span></td>
                </tr>
              ))}
              {openMsgs?.map((c: any) => (
                <tr key={c.id}>
                  <td><span className="badge badge-blue">Parent Msg</span></td>
                  <td>{c.children?.full_name}</td>
                  <td>{c.message_summary}</td>
                  <td><span className="badge badge-yellow">{c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="card-title">Quick Actions</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/attendance" className="btn btn-primary">Attendance</Link>
          <Link href="/fees" className="btn btn-secondary">Fees</Link>
          <Link href="/communication" className="btn btn-secondary">Parent Log</Link>
          <Link href="/children" className="btn btn-secondary">Manage Children</Link>
        </div>
      </div>
    </AppShell>
  )
}
