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
  is_active: boolean
}

type ClassInfo = {
  id: string
  class_name: string
  class_teacher_name: string | null
}

type Status = 'Present' | 'Absent' | 'Late' | 'unmarked'

type Row = {
  child: Child
  status: Status
  followUp: 'None' | 'Pending' | 'Contacted' | 'Resolved'
  note: string
  existing: boolean   // true if DB already has a record for this date
}

type Banner = { type: 'success' | 'error'; message: string } | null

const todayISO = () => new Date().toISOString().slice(0, 10)

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
}

function isSunday(iso: string) {
  return new Date(iso + 'T00:00:00').getDay() === 0
}

export default function MarkAttendancePage() {
  const supabase = createClient()
  const router = useRouter()

  const [userName, setUserName] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<Banner>(null)

  const [children, setChildren] = useState<Child[]>([])
  const [classes, setClasses] = useState<ClassInfo[]>([])

  const [selClass, setSelClass] = useState('')
  const [selDate, setSelDate] = useState(todayISO())
  const [rows, setRows] = useState<Row[]>([])
  const [alreadyMarked, setAlreadyMarked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(false)

  const canEdit = role === 'director' || role === 'coordinator' || role === 'office' || role === 'teacher'

  // Load classes + children once
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('profiles').select('full_name, role').eq('id', user.id).single()
      setUserName(profile?.full_name || '')
      setRole(profile?.role || '')

      const { data: kids } = await supabase
        .from('children')
        .select('id, full_name, class_name, family_id, is_active')
        .eq('is_active', true)
        .order('full_name')
      setChildren((kids as Child[]) || [])

      const { data: cls } = await supabase.from('classes').select('*').order('class_name')
      setClasses((cls as ClassInfo[]) || [])

      setLoading(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Default class selection
  const availableClasses = useMemo(() => {
    const s = new Set<string>()
    children.forEach(c => s.add(c.class_name))
    return Array.from(s).sort()
  }, [children])

  useEffect(() => {
    if (!selClass && availableClasses.length > 0) setSelClass(availableClasses[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableClasses.length])

  // When class or date changes, load the roster + any existing records
  useEffect(() => {
    async function loadRoster() {
      if (!selClass || !selDate) return
      setLoadingExisting(true)

      const classChildren = children
        .filter(c => c.class_name === selClass)
        .sort((a, b) => a.full_name.localeCompare(b.full_name))

      // Fetch existing attendance for this class+date
      const childIds = classChildren.map(c => c.id)
      let existingByChild = new Map<string, { status: string; follow_up_status: string | null; follow_up_note: string | null }>()

      if (childIds.length > 0) {
        const { data: existing } = await supabase
          .from('attendance')
          .select('child_id, status, follow_up_status, follow_up_note')
          .eq('attendance_date', selDate)
          .in('child_id', childIds)

        if (existing) {
          existing.forEach((e: any) => {
            existingByChild.set(e.child_id, {
              status: e.status,
              follow_up_status: e.follow_up_status,
              follow_up_note: e.follow_up_note,
            })
          })
        }
      }

      const hasAny = existingByChild.size > 0
      setAlreadyMarked(hasAny)

      const newRows: Row[] = classChildren.map(c => {
        const e = existingByChild.get(c.id)
        return {
          child: c,
          status: (e?.status as Status) || 'unmarked',
          followUp: (e?.follow_up_status as any) || 'Pending',
          note: e?.follow_up_note || '',
          existing: !!e,
        }
      })

      setRows(newRows)
      setLoadingExisting(false)
    }
    loadRoster()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selClass, selDate, children.length])

  function showBanner(type: 'success' | 'error', message: string) {
    setBanner({ type, message })
    setTimeout(() => setBanner(null), 4000)
  }

  function setStatus(childId: string, status: Status) {
    setRows(prev => prev.map(r => r.child.id === childId ? { ...r, status } : r))
  }

  function setFollowUp(childId: string, followUp: Row['followUp']) {
    setRows(prev => prev.map(r => r.child.id === childId ? { ...r, followUp } : r))
  }

  function setNote(childId: string, note: string) {
    setRows(prev => prev.map(r => r.child.id === childId ? { ...r, note } : r))
  }

  function markAll(status: Status) {
    setRows(prev => prev.map(r => ({ ...r, status })))
  }

  const counts = useMemo(() => {
    const p = rows.filter(r => r.status === 'Present').length
    const a = rows.filter(r => r.status === 'Absent').length
    const l = rows.filter(r => r.status === 'Late').length
    const u = rows.filter(r => r.status === 'unmarked').length
    return { present: p, absent: a, late: l, unmarked: u, total: rows.length }
  }, [rows])

  async function saveAll() {
    if (!canEdit) return
    if (rows.length === 0) return

    if (counts.unmarked > 0) {
      if (!confirm(`${counts.unmarked} students are still unmarked. Save only the marked ones?`)) return
    }

    const toSave = rows.filter(r => r.status !== 'unmarked')
    if (toSave.length === 0) { showBanner('error', 'Nothing to save.'); return }

    setSaving(true)

    const payloads = toSave.map(r => ({
      child_id: r.child.id,
      attendance_date: selDate,
      status: r.status,
      follow_up_status: r.status === 'Present' ? 'None' : r.followUp,
      follow_up_note: r.note,
      parent_response: '',
      action_by: userName,
      updated_at: new Date().toISOString(),
    }))

    const { error } = await supabase
      .from('attendance')
      .upsert(payloads, { onConflict: 'child_id,attendance_date' })

    setSaving(false)
    if (error) { showBanner('error', error.message); return }

    showBanner('success', `Saved ${payloads.length} records for ${selClass} on ${selDate}.`)
    setAlreadyMarked(true)
    // Refresh row existing flags
    setRows(prev => prev.map(r => r.status !== 'unmarked' ? { ...r, existing: true } : r))
  }

  if (loading) {
    return <AppShell userName={userName}><div style={{ padding: 40, textAlign: 'center', color: '#718096' }}>Loading…</div></AppShell>
  }

  if (!canEdit) {
    return (
      <AppShell userName={userName}>
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ color: '#c53030' }}>You don't have permission to mark attendance.</p>
          <Link href="/attendance" className="btn btn-primary">← Back to Attendance</Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell userName={userName}>
      <div className="page-header">
        <h2>Mark Attendance</h2>
        <Link href="/attendance" className="btn btn-secondary">← Back to Attendance</Link>
      </div>

      {banner && (
        <div style={{
          padding: '10px 14px', borderRadius: 6, marginBottom: 14, fontSize: '0.9rem',
          background: banner.type === 'success' ? '#c6f6d5' : '#fed7d7',
          color: banner.type === 'success' ? '#22543d' : '#822727',
          border: `1px solid ${banner.type === 'success' ? '#9ae6b4' : '#feb2b2'}`,
        }}>{banner.message}</div>
      )}

      {/* FILTERS */}
      <div className="card">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 180 }}>
            <label>Class *</label>
            <select value={selClass} onChange={e => setSelClass(e.target.value)}>
              {availableClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
            <label>Date *</label>
            <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)} />
          </div>
          <div style={{ fontSize: '0.9rem', color: '#4a5568' }}>
            {formatDate(selDate)}
            {isSunday(selDate) && <span style={{ color: '#dd6b20', marginLeft: 8 }}>(Sunday)</span>}
          </div>
        </div>

        {alreadyMarked && !loadingExisting && (
          <div style={{
            marginTop: 12, padding: '8px 12px', background: '#fffaf0', border: '1px solid #fbd38d',
            borderRadius: 6, fontSize: '0.9rem', color: '#7b341e'
          }}>
            ⚠️ Attendance for this class on this date has already been recorded. You are editing existing records.
          </div>
        )}
      </div>

      {/* QUICK ACTIONS */}
      {rows.length > 0 && (
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', color: '#4a5568' }}>Quick:</span>
            <button className="btn btn-sm btn-secondary" onClick={() => markAll('Present')}>
              ✓ All Present
            </button>
            <button className="btn btn-sm btn-secondary" onClick={() => markAll('Absent')}>
              ✗ All Absent
            </button>
            <button className="btn btn-sm btn-secondary" onClick={() => markAll('unmarked')}>
              ⟲ Clear All
            </button>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: '0.85rem' }}>
              <span style={{ color: '#2f855a', fontWeight: 600 }}>{counts.present} P</span>
              <span style={{ color: '#c53030', fontWeight: 600 }}>{counts.absent} A</span>
              <span style={{ color: '#dd6b20', fontWeight: 600 }}>{counts.late} L</span>
              <span style={{ color: '#718096', fontWeight: 600 }}>{counts.unmarked} ?</span>
            </div>
          </div>
        </div>
      )}

      {/* ROSTER */}
      <div className="card">
        {loadingExisting ? (
          <p style={{ color: '#718096', textAlign: 'center', padding: 20 }}>Loading roster…</p>
        ) : rows.length === 0 ? (
          <p style={{ color: '#718096' }}>No students in this class.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map(r => {
              const isAbsentOrLate = r.status === 'Absent' || r.status === 'Late'
              const statusColor = r.status === 'Present' ? '#2f855a'
                : r.status === 'Absent' ? '#c53030'
                : r.status === 'Late' ? '#dd6b20'
                : '#718096'

              return (
                <div
                  key={r.child.id}
                  style={{
                    padding: 12,
                    border: `1px solid ${r.status === 'unmarked' ? '#e2e8f0' : statusColor + '55'}`,
                    borderRadius: 8,
                    background: r.status === 'unmarked' ? '#fff' : `${statusColor}08`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <Link
                        href={`/students/${r.child.id}`}
                        style={{ color: '#2b6cb0', textDecoration: 'none', fontWeight: 600 }}
                      >
                        {r.child.full_name}
                      </Link>
                      {r.existing && (
                        <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#718096' }}>· already recorded</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className={r.status === 'Present' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary'}
                        onClick={() => setStatus(r.child.id, 'Present')}
                        style={r.status === 'Present' ? { background: '#2f855a', borderColor: '#2f855a' } : {}}
                      >
                        ✓ P
                      </button>
                      <button
                        className={r.status === 'Absent' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary'}
                        onClick={() => setStatus(r.child.id, 'Absent')}
                        style={r.status === 'Absent' ? { background: '#c53030', borderColor: '#c53030' } : {}}
                      >
                        ✗ A
                      </button>
                      <button
                        className={r.status === 'Late' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary'}
                        onClick={() => setStatus(r.child.id, 'Late')}
                        style={r.status === 'Late' ? { background: '#dd6b20', borderColor: '#dd6b20' } : {}}
                      >
                        ⏱ L
                      </button>
                    </div>
                  </div>

                  {isAbsentOrLate && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <select
                        value={r.followUp}
                        onChange={e => setFollowUp(r.child.id, e.target.value as any)}
                        style={{ padding: 6, borderRadius: 4, border: '1px solid #cbd5e0', fontSize: '0.85rem' }}
                      >
                        <option value="Pending">Pending</option>
                        <option value="Contacted">Contacted</option>
                        <option value="Resolved">Resolved</option>
                      </select>
                      <input
                        value={r.note}
                        onChange={e => setNote(r.child.id, e.target.value)}
                        placeholder="Note (e.g. Parent informed)"
                        style={{ padding: 6, borderRadius: 4, border: '1px solid #cbd5e0', flex: 1, minWidth: 200, fontSize: '0.85rem' }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* SAVE BAR */}
      {rows.length > 0 && (
        <div style={{
          position: 'sticky', bottom: 16, zIndex: 100,
          background: 'white', borderRadius: 10, padding: 12, marginTop: 16,
          boxShadow: '0 -4px 12px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: '0.9rem' }}>
            <strong>{counts.present + counts.absent + counts.late}</strong> marked, <strong>{counts.unmarked}</strong> unmarked
          </div>
          <button className="btn btn-primary" onClick={saveAll} disabled={saving}>
            {saving ? 'Saving…' : '💾 Save Attendance'}
          </button>
        </div>
      )}
    </AppShell>
  )
}
