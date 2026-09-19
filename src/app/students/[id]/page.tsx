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

// Parse "YYYY-MM-DD" without timezone surprises
function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d)
  const day = copy.getDay() === 0 ? 7 : copy.getDay() // Sunday → 7
  copy.setDate(copy.getDate() - day + 1) // Monday
  copy.setHours(0, 0, 0, 0)
  return copy
}

function shortLabel(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`
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

      const { data: acc } = await supabase
        .from('family_fee_accounts').select('*').eq('family_id', c.family_id).maybeSingle()
      setAccount(acc as Account)
    }

    // 3. Class teacher
    const { data: cls } = await supabase
      .from('classes').select('*').eq('class_name', c.class_name).maybeSingle()
    setClassInfo(cls as ClassInfo)

    // 4. Attendance — all records for this child
    const { data: att } = await supabase
      .from('attendance')
      .select('id, child_id, attendance_date, status')
      .eq('child_id', childId)
      .order('attendance_date', { ascending: true })
    setAttendance((att as Attendance[]) || [])

    // 5. Progress (last 5)
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

  // Weekly buckets: from earliest attendance → today
  const weeklyData = useMemo(() => {
    if (attendance.length === 0) return []

    // Find earliest date
    const dates = attendance.map(a => parseISODate(a.attendance_date))
    const earliest = new Date(Math.min(...dates.map(d => d.getTime())))
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // Build buckets from the week of earliest date → current week
    const buckets: { weekStart: string; label: string; present: number; total: number; pct: number }[] = []
    const cursor = startOfWeek(earliest)
    const endCursor = startOfWeek(today)

    // Precompute per-week aggregation from attendance
    const aggByWeek = new Map<string, { present: number; total: number }>()
    attendance.forEach(a => {
      const d = parseISODate(a.attendance_date)
      const w = startOfWeek(d)
      const key = w.toISOString().slice(0, 10)
      const agg = aggByWeek.get(key) || { present: 0, total: 0 }
      agg.total += 1
      if (a.status === 'Present') agg.present += 1
      aggByWeek.set(key, agg)
    })

    while (cursor <= endCursor) {
      const key = cursor.toISOString().slice(0, 10)
      const agg = aggByWeek.get(key) || { present: 0, total: 0 }
      const pct = agg.total > 0 ? Math.round((agg.present / agg.total) * 100) : -1 // -1 = no data
      buckets.push({
        weekStart: key,
        label: shortLabel(cursor),
        present: agg.present,
        total: agg.total,
        pct,
      })
      cursor.setDate(cursor.getDate() + 7)
    }

    return buckets
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
        <div className="card-title">📊 Attendance</div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 12 }}>
          <div><strong style={{ fontSize: '1.4rem', color: '#2f855a' }}>{stats.present}</strong> <span style={{ color: '#718096' }}>Present</span></div>
          <div><strong style={{ fontSize: '1.4rem', color: '#c53030' }}>{stats.absent}</strong> <span style={{ color: '#718096' }}>Absent</span></div>
          <div><strong style={{ fontSize: '1.4rem', color: '#dd6b20' }}>{stats.late}</strong> <span style={{ color: '#718096' }}>Late</span></div>
          <div><strong style={{ fontSize: '1.4rem', color: '#2b6cb0' }}>{stats.rate}%</strong> <span style={{ color: '#718096' }}>Rate</span></div>
        </div>
        {weeklyData.length > 0 ? (
          <div style={{ background: '#f7fafc', padding: 16, borderRadius: 8 }}>
            <div style={{ fontSize: '0.85rem', color: '#4a5568', marginBottom: 8 }}>
              Weekly attendance % ({weeklyData[0].label} → today)
            </div>
            <WeeklyLineChart data={weeklyData} />
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

// ---------- LINE CHART ----------
function WeeklyLineChart({ data }: { data: { label: string; pct: number; total: number }[] }) {
  const W = Math.max(640, data.length * 45)
  const H = 200
  const padX = 40
  const padY = 30
  const innerW = W - padX * 2
  const innerH = H - padY * 2

  // Filter out weeks with no data (pct = -1) for the polyline, but keep labels
  const points = data.map((d, i) => {
    const x = padX + (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2)
    const y = d.pct >= 0 ? padY + innerH - (d.pct / 100) * innerH : null
    return { x, y, pct: d.pct, label: d.label, total: d.total }
  })

  // Build path skipping nulls
  let pathD = ''
  let started = false
  points.forEach(p => {
    if (p.y === null) { started = false; return }
    pathD += (started ? ' L ' : ' M ') + p.x + ' ' + p.y
    started = true
  })

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H, display: 'block' }}>
        {/* gridlines */}
        {[0, 25, 50, 75, 100].map(p => {
          const y = padY + innerH - (p / 100) * innerH
          return (
            <g key={p}>
              <line x1={padX} y1={y} x2={W - padX} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={padX - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#a0aec0">{p}</text>
            </g>
          )
        })}

        {/* line */}
        {pathD && <path d={pathD} fill="none" stroke="#2b6cb0" strokeWidth="2.5" />}

        {/* points */}
        {points.map((p, i) => (
          <g key={i}>
            {p.y !== null && (
              <>
                <circle cx={p.x} cy={p.y} r="4" fill="#2b6cb0" />
                <title>{`Week of ${p.label}: ${p.pct}% (${p.total} records)`}</title>
                <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="10" fill="#2b6cb0" fontWeight="600">
                  {p.pct}%
                </text>
              </>
            )}
            {p.y === null && (
              <text x={p.x} y={padY + innerH / 2} textAnchor="middle" fontSize="9" fill="#cbd5e0">–</text>
            )}
            <text x={p.x} y={H - 8} textAnchor="middle" fontSize="9" fill="#a0aec0">{p.label}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}
