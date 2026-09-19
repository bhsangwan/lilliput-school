'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Child = {
  id: string
  full_name: string
  class_name: string
  family_id: string | null
  admission_year: number | null
  is_active: boolean
}

type ClassInfo = {
  id: string
  class_name: string
  class_teacher_name: string | null
}

type Attendance = {
  id: string
  child_id: string
  attendance_date: string
  status: 'Present' | 'Absent' | 'Late'
}

type Row = {
  child: Child
  present: number
  absent: number
  late: number
  total: number
  rate: number
}

const CLASS_OPTIONS = [
  'Nursery A','Nursery B',
  'LKG A','LKG B',
  'UKG A','UKG B',
  'Class_1 A','Class_1 B',
  'Class_2 A','Class_2 B',
  'Class_3 A','Class_3 B',
]

type Banner = { type: 'success' | 'error'; message: string } | null

function rateColor(rate: number) {
  if (rate >= 90) return { bar: '#48bb78', text: '#22543d', bg: '#f0fff4' }
  if (rate >= 75) return { bar: '#ecc94b', text: '#744210', bg: '#fffaf0' }
  if (rate >= 60) return { bar: '#ed8936', text: '#7b341e', bg: '#fffaf0' }
  return { bar: '#f56565', text: '#742a2a', bg: '#fff5f5' }
}

export default function AttendancePage() {
  const supabase = createClient()
  const router = useRouter()

  const [userName, setUserName] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<Banner>(null)

  const [children, setChildren] = useState<Child[]>([])
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])

  // Filters
  const [filterClass, setFilterClass] = useState('')
  const [sortBy, setSortBy] = useState<'worst' | 'best' | 'name'>('worst')

  // Add form (legacy — quick entry)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addChildId, setAddChildId] = useState('')
  const [addDate, setAddDate] = useState(new Date().toISOString().slice(0, 10))
  const [addStatus, setAddStatus] = useState<'Present' | 'Absent' | 'Late'>('Present')
  const [addFollowup, setAddFollowup] = useState<'None' | 'Pending' | 'Contacted' | 'Resolved'>('None')
  const [addNote, setAddNote] = useState('')
  const [addSaving, setAddSaving] = useState(false)

  const canEdit = role === 'director' || role === 'coordinator' || role === 'office' || role === 'teacher'

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('profiles').select('full_name, role').eq('id', user.id).single()
      setUserName(profile?.full_name || '')
      setRole(profile?.role || '')

      // Load children
      const { data: kids } = await supabase
        .from('children')
        .select('id, full_name, class_name, family_id, admission_year, is_active')
        .eq('is_active', true)
        .order('full_name')
      setChildren((kids as Child[]) || [])

      // Load classes
      const { data: cls } = await supabase.from('classes').select('*')
      setClasses((cls as ClassInfo[]) || [])

      // Load attendance (all — could be big, but we need it for the summary)
      // To keep it fast, we only need Present/Absent counts per child.
      // Supabase doesn't do group-by easily from client, so fetch rows and compute.
      const { data: att } = await supabase
        .from('attendance')
        .select('id, child_id, attendance_date, status')
      setAttendance((att as Attendance[]) || [])

      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function showBanner(type: 'success' | 'error', message: string) {
    setBanner({ type, message })
    setTimeout(() => setBanner(null), 4000)
  }

  // Build rows: one per child with counts
  const rows: Row[] = useMemo(() => {
    const attByChild = new Map<string, Attendance[]>()
    attendance.forEach(a => {
      const arr = attByChild.get(a.child_id) || []
      arr.push(a)
      attByChild.set(a.child_id, arr)
    })

    return children.map(c => {
      const atts = attByChild.get(c.id) || []
      const present = atts.filter(a => a.status === 'Present').length
      const absent = atts.filter(a => a.status === 'Absent').length
      const late = atts.filter(a => a.status === 'Late').length
      const total = present + absent + late
      const rate = total > 0 ? Math.round((present / total) * 100) : 0
      return { child: c, present, absent, late, total, rate }
    })
  }, [children, attendance])

  const teacherByClass = useMemo(() => {
    const m = new Map<string, string>()
    classes.forEach(c => m.set(c.class_name, c.class_teacher_name || ''))
    return m
  }, [classes])

  const filteredRows = useMemo(() => {
    let list = rows

    if (filterClass) {
      list = list.filter(r => r.child.class_name === filterClass)
    } else {
      // Default: show a class if none chosen
      // (We'll default to the first class in useEffect below)
    }

    // Sort
    if (sortBy === 'worst') {
      list = [...list].sort((a, b) => a.rate - b.rate)
    } else if (sortBy === 'best') {
      list = [...list].sort((a, b) => b.rate - a.rate)
    } else {
      list = [...list].sort((a, b) => a.child.full_name.localeCompare(b.child.full_name))
    }

    return list
  }, [rows, filterClass, sortBy])

  // Auto-select first class if none selected
  useEffect(() => {
    if (!filterClass && children.length > 0 && CLASS_OPTIONS.length > 0) {
      const available = Array.from(new Set(children.map(c => c.class_name))).sort()
      if (available.length > 0) setFilterClass(available[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children.length])

  const classSummary = useMemo(() => {
    const present = filteredRows.reduce((s, r) => s + r.present, 0)
    const absent = filteredRows.reduce((s, r) => s + r.absent, 0)
    const late = filteredRows.reduce((s, r) => s + r.late, 0)
    const total = present + absent + late
    const avgRate = total > 0 ? Math.round((present / total) * 100) : 0
    return { present, absent, late, total, avgRate }
  }, [filteredRows])

  // Add record handler
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addChildId || !addDate) return

    setAddSaving(true)
    const { error } = await supabase.from('attendance').upsert({
      child_id: addChildId,
      attendance_date: addDate,
      status: addStatus,
      follow_up_status: addStatus === 'Present' ? 'None' : addFollowup,
      follow_up_note: addNote,
      parent_response: '',
      action_by: userName,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'child_id,attendance_date' })

    setAddSaving(false)
    if (error) { showBanner('error', error.message); return }

    showBanner('success', 'Attendance recorded.')
    setShowAddForm(false)
    setAddNote('')

    // Reload attendance
    const { data: att } = await supabase
      .from('attendance')
      .select('id, child_id, attendance_date, status')
    setAttendance((att as Attendance[]) || [])
  }

  const availableClasses = useMemo(() => {
    const s = new Set<string>()
    children.forEach(c => s.add(c.class_name))
    return Array.from(s).sort()
  }, [children])

  if (loading) {
    return <AppShell userName={userName}><div style={{ padding: 40, textAlign: 'center', color: '#718096' }}>Loading attendance…</div></AppShell>
  }

  return (
    <AppShell userName={userName}>
      <div className="page-header">
        <h2>Attendance</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
              {showAddForm ? 'Cancel' : '+ Add Record'}
            </button>
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

      {/* ADD FORM */}
      {showAddForm && canEdit && (
        <div className="card">
          <div className="card-title">Add / Update Attendance</div>
          <form onSubmit={handleAdd}>
            <div className="form-row">
              <div className="form-group">
                <label>Child *</label>
                <select required value={addChildId} onChange={e => setAddChildId(e.target.value)}>
                  <option value="">Select child</option>
                  {children
                    .filter(c => !filterClass || c.class_name === filterClass)
                    .map(c => (
                      <option key={c.id} value={c.id}>{c.full_name} ({c.class_name})</option>
                    ))}
                </select>
              </div>
              <div className="form-group">
                <label>Date *</label>
                <input required type="date" value={addDate} onChange={e => setAddDate(e.target.value)} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Status *</label>
                <select value={addStatus} onChange={e => setAddStatus(e.target.value as any)}>
                  <option value="Present">Present</option>
                  <option value="Absent">Absent</option>
                  <option value="Late">Late</option>
                </select>
              </div>
              {addStatus !== 'Present' && (
                <div className="form-group">
                  <label>Follow-up</label>
                  <select value={addFollowup} onChange={e => setAddFollowup(e.target.value as any)}>
                    <option value="Pending">Pending</option>
                    <option value="Contacted">Contacted</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </div>
              )}
            </div>
            {addStatus !== 'Present' && (
              <div className="form-group">
                <label>Note</label>
                <input value={addNote} onChange={e => setAddNote(e.target.value)} placeholder="e.g. Informed parent" />
              </div>
            )}
            <button type="submit" className="btn btn-primary" disabled={addSaving}>
              {addSaving ? 'Saving…' : 'Save'}
            </button>
          </form>
        </div>
      )}

      {/* MAIN CARD */}
      <div className="card">
        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
            <label>Class</label>
            <select value={filterClass} onChange={e => setFilterClass(e.target.value)}>
              <option value="">All classes</option>
              {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
            <label>Sort</label>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
              <option value="worst">Worst first</option>
              <option value="best">Best first</option>
              <option value="name">By name</option>
            </select>
          </div>
        </div>

        {/* Class summary */}
        {filteredRows.length > 0 && (
          <div style={{
            background: '#f7fafc', padding: 12, borderRadius: 8, marginBottom: 16,
            display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: '0.9rem'
          }}>
            <div><strong>{filteredRows.length}</strong> students</div>
            <div><span style={{ color: '#2f855a' }}><strong>{classSummary.present}</strong> Present</span></div>
            <div><span style={{ color: '#c53030' }}><strong>{classSummary.absent}</strong> Absent</span></div>
            <div><span style={{ color: '#dd6b20' }}><strong>{classSummary.late}</strong> Late</span></div>
            <div>Average: <strong>{classSummary.avgRate}%</strong></div>
          </div>
        )}

        {/* Table */}
        {filteredRows.length === 0 ? (
          <p style={{ color: '#718096' }}>No students found.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Class</th>
                  <th>Class Teacher</th>
                  <th style={{ textAlign: 'right' }}>Present</th>
                  <th style={{ textAlign: 'right' }}>Absent</th>
                  <th style={{ textAlign: 'right' }}>Late</th>
                  <th style={{ minWidth: 200 }}>Attendance</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(r => {
                  const c = rateColor(r.rate)
                  return (
                    <tr key={r.child.id}>
                      <td>
                        <Link
                          href={`/students/${r.child.id}`}
                          style={{ color: '#2b6cb0', textDecoration: 'none', fontWeight: 600 }}
                        >
                          {r.child.full_name}
                        </Link>
                      </td>
                      <td>{r.child.class_name}</td>
                      <td style={{ fontSize: '0.85rem', color: '#4a5568' }}>
                        {teacherByClass.get(r.child.class_name) || '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: '#2f855a', fontWeight: 600 }}>
                        {r.present}
                      </td>
                      <td style={{ textAlign: 'right', color: '#c53030', fontWeight: 600 }}>
                        {r.absent}
                      </td>
                      <td style={{ textAlign: 'right', color: '#dd6b20', fontWeight: 600 }}>
                        {r.late}
                      </td>
                      <td>
                        <ProgressBar rate={r.rate} color={c.bar} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  )
}

// ---------- PROGRESS BAR ----------
function ProgressBar({ rate, color }: { rate: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        flex: 1, height: 18, background: '#e2e8f0', borderRadius: 9, overflow: 'hidden',
        position: 'relative'
      }}>
        <div style={{
          width: `${rate}%`, height: '100%', background: color,
          transition: 'width 0.3s ease', borderRadius: 9
        }} />
      </div>
      <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: 40, textAlign: 'right', color }}>
        {rate}%
      </span>
    </div>
  )
}
