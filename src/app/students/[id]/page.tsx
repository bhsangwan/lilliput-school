'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'

// ---------- TYPES ----------
type Child = {
  id: string
  full_name: string
  class_name: string
  parent_name: string | null
  parent_phone: string | null
  family_id: string | null
  is_active: boolean
  admission_year: number | null
}

type Family = {
  id: string
  family_name: string
  primary_parent_name: string | null
  primary_parent_phone: string | null
}

type Account = {
  id: string
  family_id: string
  admission_date: string
  total_fee: number
  paid_amount: number
  balance: number
  monthly_installment: number
  plan_type: 'monthly' | 'annual'
  expected_till_date: number
  overdue_amount: number
}

type Attendance = {
  id: string
  child_id: string
  attendance_date: string
  status: 'Present' | 'Absent' | 'Late'
}

type ProgressNote = {
  id: string
  child_id: string
  note_date: string
  category: string
  note: string
  needs_support: boolean
  recorded_by: string | null
}

type Communication = {
  id: string
  child_id: string
  log_date: string
  message_summary: string
  channel: string
  status: string
  handled_by: string | null
}

type StudentNote = {
  id: string
  child_id: string
  note: string
  created_by_name: string | null
  created_at: string
}

type ClassInfo = {
  id: string
  class_name: string
  class_teacher_name: string | null
}

// ---------- HELPERS ----------
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

function daysAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

// ISO week number for a date
function weekNumber(d: Date): number {
  const onejan = new Date(d.getFullYear(), 0, 1)
  return Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7)
}

export default function StudentProfilePage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const childId = params.id as string

  const [userName, setUserName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [child, setChild] = useState<Child | null>(null)
  const [family, setFamily] = useState<Family | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null)
  const [siblings, setSiblings] = useState<Child[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [progress, setProgress] = useState<ProgressNote[]>([])
  const [comms, setComms] = useState<Communication[]>([])
  const [notes, setNotes] = useState<StudentNote[]>([])

  // Add-note form
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('profiles').select('full_name, role').eq('id', user.id).single()
      setUserName(profile?.full_name || '')
      await loadAll()
      setLoading(false)
    }
    if (childId) init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId])

  async function loadAll() {
    // 1. Child
    const { data: c, error: cErr } = await supabase
      .from('children').select('*').eq('id', childId).single()
    if (cErr || !c) { setError('Student not found'); return }
    setChild(c as Child)

    // 2. Family + siblings
    if (c.family_id) {
      const { data: f } = await supabase.from('families').select('*').eq('id', c.family_id).single()
      setFamily(f as Family)

      const { data: sibs } = await supabase
        .from('children').select('*')
        .eq('family_id', c.family_id)
        .neq('id', c.id)
      setSiblings((sibs as Child[]) || [])

      // Account
      const { data: acc } = await supabase
        .from('family_fee_accounts').select('*').eq('family_id', c.family_id).maybeSingle()
      setAccount(acc as Account)
    }

    // 3. Class teacher
    const { data: cls } = await supabase
      .from('classes').select('*').eq('class_name', c.class_name).maybeSingle()
    setClassInfo(cls as ClassInfo)

    // 4. Attendance (last 90 days)
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data: att } = await supabase
      .from('attendance').select('*')
      .eq('child_id', childId)
      .gte('attendance_date', since)
      .order('attendance_date')
    setAttendance((att as Attendance[]) || [])

    // 5. Progress notes (last 5)
    const { data: prog } = await supabase
      .from('progress_notes').select('*')
      .eq('child_id', childId)
      .order('note_date', { ascending: false })
      .limit(5)
    setProgress((prog as ProgressNote[]) || [])

    // 6. Communications (last 5)
    const { data: comm } = await supabase
      .from('communications').select('*')
      .eq('child_id', childId)
      .order('log_date', { ascending: false })
      .limit(5)
    setComms((comm as Communication[]) || [])

    // 7. Student notes
    const { data: n } = await supabase
      .from('student_notes').select('*')
      .eq('child_id', childId)
      .order('created_at', { ascending: false })
    setNotes((n as StudentNote[]) || [])
  }

  async function saveNote() {
    if (!noteText.trim()) return
    setNoteSaving(true)
    const { error: err } = await supabase.from('student_notes').insert({
      child_id: childId,
      note: noteText.trim(),
      created_by_name: userName,
    })
    setNoteSaving(false)
    if (err) { alert(err.message); return }
    setNoteText('')
    setShowNoteForm(false)
    await loadAll()
  }

  // Attendance stats
  const stats = useMemo(() => {
    const present = attendance.filter(a => a.status === 'Present').length
    const absent = attendance.filter(a => a.status === 'Absent').length
    const late = attendance.filter(a => a.status === 'Late').length
    const total = attendance.length
    const rate = total > 0 ? Math.round((present / total) * 100) : 0
    return { present, absent, late, total, rate }
  }, [attendance])

  // Weekly buckets for last 12 weeks
  const weeklyData = useMemo(() => {
    if (attendance.length === 0) return []

    const buckets = new Map<string, { present: number; total: number; label: string }>()

    // Build 12 weeks back from today
    const today = new Date()
    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - (i * 7) - today.getDay() + 1) // Monday
      const key = weekStart.toISOString().slice(0, 10)
      const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`
      buckets.set(key, { present: 0, total: 0, label })
    }

    attendance.forEach(a => {
      const d = new Date(a.attendance_date)
      // Find week start (Monday)
      const day = d.getDay() === 0 ? 7 : d.getDay() // Sun → 7
      const weekStart = new Date(d)
      weekStart.setDate(d.getDate() - day + 1)
      const key = weekStart.toISOString().slice(0, 10)
      const bucket = buckets.get(key)
      if (!bucket) return
      bucket.total += 1
      if (a.status === 'Present') bucket.present += 1
    })

    return Array.from(buckets.values())
  }, [attendance])

  if (loading) {
    return <AppShell userName={userName}><div style={{ padding: 40, textAlign: 'center', color: '#718096' }}>Loading student…</div></AppShell>
  }

  if (error || !child) {
    return (
      <AppShell userName={userName}>
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: '#c53030' }}>{error || 'Student not found'}</p>
          <Link href="/children" className="btn btn-primary">← Back to Children</Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell userName={userName}>
      <div className="page-header">
        <h2>Student Profile</h2>
        <Link href="/children" className="btn btn-secondary">← Back to Children</Link>
      </div>

      {/* HEADER */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h2 style={{ margin: 0 }}>{child.full_name}</h2>
            <div style={{ color: '#4a5568', fontSize: '0.95rem', marginTop: 6 }}>
              <span>{child.class_name}</span>
              {classInfo?.class_teacher_name && (
                <> · Class Teacher: <strong>{classInfo.class_teacher_name}</strong></>
              )}
            </div>
            <div style={{ color: '#4a5568', fontSize: '0.9rem', marginTop: 4 }}>
              {family ? (
                <>
                  <strong>{family.family_name}</strong> · {family.primary_parent_name} · {family.primary_parent_phone}
                </>
              ) : (
                <>{child.parent_name} · {child.parent_phone}</>
              )}
            </div>
            {child.admission_year && (
              <div style={{ color: '#718096', fontSize: '0.85rem', marginTop: 4 }}>
                Admitted in {child.admission_year}
              </div>
            )}
            {siblings.length > 0 && (
              <div style={{ marginTop: 10, fontSize: '0.9rem' }}>
                <span style={{ color: '#718096' }}>Siblings: </span>
                {siblings.map((s, i) => (
                  <span key={s.id}>
                    {i > 0 && ', '}
                    <Link href={`/students/${s.id}`} style={{ color: '#2b6cb0', textDecoration: 'underline' }}>
                      {s.full_name} ({s.class_name})
                    </Link>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <span className={`badge ${child.is_active ? 'badge-green' : 'badge-gray'}`}>
              {child.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>

      {/* FEES */}
      {account ? (
        <div className="card">
          <div className="card-title">💰 Fees Status</div>
          <div className="grid" style={{ marginBottom: 12 }}>
            <div className="stat info">
              <div className="label">Family Total</div>
              <div className="value">{formatRs(account.total_fee)}</div>
            </div>
            <div className="stat">
              <div className="label">Paid</div>
              <div className="value" style={{ color: '#2f855a' }}>{formatRs(account.paid_amount)}</div>
            </div>
            <div className="stat warning">
              <div className="label">Balance</div>
              <div className="value">{formatRs(account.balance)}</div>
            </div>
            {Number(account.overdue_amount) > 0 && (
              <div className="stat danger">
                <div className="label">⚠️ Overdue</div>
                <div className="value">{formatRs(account.overdue_amount)}</div>
              </div>
            )}
          </div>
          <div style={{ fontSize: '0.9rem', color: '#4a5568', marginBottom: 12 }}>
            Plan: <strong style={{ textTransform: 'capitalize' }}>{account.plan_type}</strong>
            {account.plan_type === 'monthly' && (
              <> · Monthly installment: <strong>{formatRsPrecise(account.monthly_installment)}</strong></>
            )}
          </div>
          <Link href="/fees" className="btn btn-secondary">Open Fee Ledger →</Link>
        </div>
      ) : (
        <div className="card">
          <div className="card-title">💰 Fees Status</div>
          <p style={{ color: '#718096' }}>No fee account linked to this student's family.</p>
        </div>
      )}

      {/* ATTENDANCE */}
      <div className="card">
        <div className="card-title">📊 Attendance (last 90 days)</div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 12 }}>
          <div><strong style={{ fontSize: '1.4rem', color: '#2f855a' }}>{stats.present}</strong> <span style={{ color: '#718096' }}>Present</span></div>
          <div><strong style={{ fontSize: '1.4rem', color: '#c53030' }}>{stats.absent}</strong> <span style={{ color: '#718096' }}>Absent</span></div>
          <div><strong style={{ fontSize: '1.4rem', color: '#dd6b20' }}>{stats.late}</strong> <span style={{ color: '#718096' }}>Late</span></div>
          <div><strong style={{ fontSize: '1.4rem', color: '#2b6cb0' }}>{stats.rate}%</strong> <span style={{ color: '#718096' }}>Rate</span></div>
        </div>
        {weeklyData.length > 0 && weeklyData.some(w => w.total > 0) ? (
          <div style={{ background: '#f7fafc', padding: 16, borderRadius: 8 }}>
            <div style={{ fontSize: '0.85rem', color: '#4a5568', marginBottom: 8 }}>Weekly attendance % (last 12 weeks)</div>
            <WeeklyChart data={weeklyData} />
          </div>
        ) : (
          <p style={{ color: '#718096' }}>No attendance records yet.</p>
        )}
        <div style={{ marginTop: 12 }}>
          <Link href="/attendance" className="btn btn-secondary">View Attendance →</Link>
        </div>
      </div>

      {/* PROGRESS NOTES */}
      <div className="card">
        <div className="card-title">📈 Recent Progress Notes</div>
        {progress.length === 0 ? (
          <p style={{ color: '#718096' }}>No progress notes yet.</p>
        ) : (
          <div>
            {progress.map(p => (
              <div key={p.id} style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span className="badge badge-blue">{p.category}</span>
                  <span style={{ fontSize: '0.8rem', color: '#718096' }}>
                    {formatDate(p.note_date)} · {p.recorded_by || '—'}
                  </span>
                  {p.needs_support && <span className="badge badge-yellow">Needs support</span>}
                </div>
                <div style={{ fontSize: '0.9rem' }}>{p.note}</div>
              </div>
            ))}
            <Link href="/progress" className="btn btn-sm btn-secondary">View all →</Link>
          </div>
        )}
      </div>

      {/* PARENT COMMUNICATION */}
      <div className="card">
        <div className="card-title">💬 Recent Parent Communication</div>
        {comms.length === 0 ? (
          <p style={{ color: '#718096' }}>No parent communication yet.</p>
        ) : (
          <div>
            {comms.map(c => (
              <div key={c.id} style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span className="badge badge-blue">{c.channel}</span>
                  <span className={`badge ${c.status === 'Open' ? 'badge-yellow' : 'badge-green'}`}>{c.status}</span>
                  <span style={{ fontSize: '0.8rem', color: '#718096' }}>
                    {formatDate(c.log_date)} · {c.handled_by || '—'}
                  </span>
                </div>
                <div style={{ fontSize: '0.9rem' }}>{c.message_summary}</div>
              </div>
            ))}
            <Link href="/communication" className="btn btn-sm btn-secondary">View all →</Link>
          </div>
        )}
      </div>

      {/* NOTES / REMARKS */}
      <div className="card">
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>📝 Notes / Remarks</span>
          <button className="btn btn-sm btn-primary" onClick={() => setShowNoteForm(!showNoteForm)}>
            {showNoteForm ? 'Cancel' : '+ Add Note'}
          </button>
        </div>

        {showNoteForm && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f7fafc', borderRadius: 8 }}>
            <div className="form-group">
              <label>Note *</label>
              <textarea
                rows={3}
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="e.g. Father mentioned he'll be out of town for two weeks."
              />
            </div>
            <button className="btn btn-primary" onClick={saveNote} disabled={noteSaving}>
              {noteSaving ? 'Saving…' : 'Save Note'}
            </button>
          </div>
        )}

        {notes.length === 0 ? (
          <p style={{ color: '#718096' }}>No notes yet. Add one above.</p>
        ) : (
          <div>
            {notes.map(n => (
              <div key={n.id} style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 10 }}>
                <div style={{ fontSize: '0.8rem', color: '#718096', marginBottom: 4 }}>
                  {new Date(n.created_at).toLocaleString('en-IN')}
                  {n.created_by_name && <> · {n.created_by_name}</>}
                </div>
                <div style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{n.note}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}

// ---------- INLINE CHART ----------
function WeeklyChart({ data }: { data: { present: number; total: number; label: string }[] }) {
  const W = 640
  const H = 160
  const padX = 30
  const padY = 20

  const innerW = W - padX * 2
  const innerH = H - padY * 2
  const n = data.length
  const stepX = n > 1 ? innerW / (n - 1) : 0

  const points = data.map((d, i) => {
    const pct = d.total > 0 ? (d.present / d.total) * 100 : 0
    const x = padX + i * stepX
    const y = padY + innerH - (pct / 100) * innerH
    return { x, y, pct, label: d.label }
  })

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', maxHeight: 220 }}>
      {/* gridlines at 0, 50, 100% */}
      {[0, 50, 100].map(p => {
        const y = padY + innerH - (p / 100) * innerH
        return (
          <g key={p}>
            <line x1={padX} y1={y} x2={W - padX} y2={y} stroke="#e2e8f0" strokeWidth="1" />
            <text x={padX - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#a0aec0">{p}</text>
          </g>
        )
      })}

      {/* line */}
      <path d={pathD} fill="none" stroke="#2b6cb0" strokeWidth="2" />

      {/* points */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill="#2b6cb0" />
          {p.pct > 0 && p.pct < 100 && (
            <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="9" fill="#2b6cb0">{Math.round(p.pct)}</text>
          )}
          {/* label under axis */}
          <text x={p.x} y={H - 4} textAnchor="middle" fontSize="9" fill="#a0aec0">{p.label}</text>
        </g>
      ))}
    </svg>
  )
}
