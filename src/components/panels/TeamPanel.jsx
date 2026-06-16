import { useEffect, useState } from 'react'
import useForge from '../../store/useForge'
import * as session from '../../lib/session.js'
import { isAvailable } from '../../lib/api.js'
import { TASK_STATES, groupByState, nextState, prevState, deadlineStatus, daysUntil, taskStats } from '../../mission/tasks.js'
import { canManageTeam, canEditTask, SUBSYSTEMS } from '../../mission/roles.js'
import WeeklyAvailabilityGrid from './WeeklyAvailabilityGrid'

// ──────────────────────────────────────────────────────────────────
// TeamPanel — team management + task kanban + deadlines (IMPLEMENTATION_
// PLAN §4 item 10). Managers configure the roster (roles + assigned
// subsystems) and own the backlog; members move the tasks for their own
// subsystem. Deadlines surface per card and the availability strip shows
// each member's open workload. Additive: requires a backend sign-in; the
// rest of the platform is unaffected when signed out.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const slab = { fontFamily: "'Space Grotesk', sans-serif" }
const DL_COLOR = { overdue: 'var(--err2)', soon: 'var(--warn2)', ok: 'var(--ink4)', none: 'var(--ink4)' }

export default function TeamPanel() {
  const user = useForge(s => s.auth.user)
  const role = useForge(s => s.auth.role)
  const subsystem = useForge(s => s.auth.subsystem)
  const teams = useForge(s => s.teams)
  const activeTeamId = useForge(s => s.activeTeamId)
  const projects = useForge(s => s.projects)
  const activeProjectId = useForge(s => s.activeProjectId)
  const tasks = useForge(s => s.tasks)

  const team = teams.find(t => t.id === activeTeamId)
  const teamProjects = projects.filter(p => p.teamId === activeTeamId)
  const isManager = canManageTeam(role)
  const me = { id: user?.id, subsystem }

  // auto-open the team's first project so the board is populated
  useEffect(() => {
    if (user && activeTeamId && !activeProjectId && teamProjects[0]) session.openProject(teamProjects[0].id)
  }, [user, activeTeamId, activeProjectId, teamProjects])

  if (!user) return <SignInPrompt />

  const columns = groupByState(tasks)
  const stats = taskStats(tasks)

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 26px', background: 'var(--paper)' }}>
      {/* header: team + project + share */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <h2 style={{ ...slab, margin: 0, fontSize: 22, color: 'var(--ink)' }}>{team?.name || 'Equipe'}</h2>
        {team?.isDemo && <span style={tag('var(--navy)')}>demonstração</span>}
        <span style={{ flex: 1 }} />
        <ProjectControls teamProjects={teamProjects} activeProjectId={activeProjectId} isManager={isManager} teamId={activeTeamId} />
      </div>

      <Roster team={team} isManager={isManager} />

      <AvailabilityStrip team={team} tasks={tasks} />
      <AvailabilityToggle team={team} />

      {/* kanban */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '22px 0 10px' }}>
        <h3 style={{ ...slab, margin: 0, fontSize: 16, color: 'var(--ink)' }}>Tarefas</h3>
        <span style={{ ...mono, fontSize: 11, color: 'var(--ink4)' }}>{stats.done}/{stats.total} concluídas · {stats.pct}%{stats.overdue ? ` · ${stats.overdue} atrasada(s)` : ''}</span>
        <span style={{ flex: 1 }} />
        {isManager && activeProjectId && <NewTaskButton team={team} />}
      </div>

      {!activeProjectId ? (
        <div style={{ ...mono, fontSize: 12.5, color: 'var(--ink4)' }}>Selecione ou crie um projeto para ver as tarefas.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, alignItems: 'start' }}>
          {TASK_STATES.map(col => (
            <div key={col.id} style={{ background: 'var(--paper2)', border: '1px solid var(--rule)', borderRadius: 9, padding: 10, minHeight: 80 }}>
              <div style={{ ...mono, fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span>{col.label}</span><span>{columns[col.id].length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {columns[col.id].map(t => (
                  <TaskCard key={t.id} task={t} team={team} role={role} me={me} isManager={isManager} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectControls({ teamProjects, activeProjectId, isManager, teamId }) {
  const shareToken = useForge(s => s.projects.find(p => p.id === activeProjectId)?.shareToken)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')

  const create = async () => { if (name.trim()) { const r = await session.createProject(teamId, name.trim()); if (r.ok) session.openProject(r.project.id) } setName(''); setCreating(false) }
  const share = async () => {
    const r = shareToken ? await session.disableShare() : await session.enableShare()
    if (r.ok && r.shareToken) { const url = `${location.origin}${location.pathname}?share=${r.shareToken}`; navigator.clipboard?.writeText(url).catch(() => {}); useForge.getState().notify?.('Link público copiado') }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <select value={activeProjectId || ''} onChange={e => session.openProject(Number(e.target.value))} style={select}>
        {!teamProjects.length && <option value="">sem projetos</option>}
        {teamProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {isManager && (creating
        ? <input autoFocus placeholder="nome do projeto" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && create()} onBlur={create} style={{ ...input, width: 150 }} />
        : <button onClick={() => setCreating(true)} style={ghost}>+ projeto</button>)}
      {isManager && activeProjectId && <button onClick={share} style={shareToken ? primary : ghost}>{shareToken ? 'compartilhado ✓' : 'compartilhar'}</button>}
    </div>
  )
}

function Roster({ team, isManager }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ username: '', name: '', role: 'member', subsystem: 'Hardware' })
  const [invited, setInvited] = useState(null)
  if (!team) return null

  const add = async () => {
    if (!form.username.trim()) return
    const r = await session.addTeamMember(team.id, form)
    if (r.ok) { setInvited(r.createdCredentials); setForm({ username: '', name: '', role: 'member', subsystem: 'Hardware' }); setAdding(false) }
  }

  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 9, padding: 12, background: 'var(--paper2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ ...mono, fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink3)' }}>Integrantes ({team.members?.length || 0})</div>
        <span style={{ flex: 1 }} />
        {isManager && <button onClick={() => setAdding(a => !a)} style={ghost}>{adding ? 'cancelar' : '+ integrante'}</button>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {(team.members || []).map(m => (
          <MemberChip key={m.memberId} m={m} team={team} isManager={isManager} />
        ))}
      </div>

      {adding && (
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input placeholder="usuário" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} style={{ ...input, width: 130 }} />
          <input placeholder="nome" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ ...input, width: 140 }} />
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={select}><option value="member">membro</option><option value="manager">gestor</option></select>
          <select value={form.subsystem} onChange={e => setForm(f => ({ ...f, subsystem: e.target.value }))} style={select}>{SUBSYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}</select>
          <button onClick={add} style={primary}>adicionar</button>
        </div>
      )}
      {invited && (
        <div style={{ ...mono, fontSize: 11.5, color: 'var(--ok2)', marginTop: 10, lineHeight: 1.5 }}>
          Conta criada — usuário <b>{invited.username}</b>, senha <b>{invited.password}</b>. Compartilhe com o integrante para o primeiro acesso.
          <button onClick={() => setInvited(null)} style={{ ...ghost, marginLeft: 8 }}>ok</button>
        </div>
      )}
    </div>
  )
}

function MemberChip({ m, team, isManager }) {
  const [editing, setEditing] = useState(false)
  const isOwner = team.members?.find(x => x.memberId === m.memberId) && team && m.role === 'manager'
  const save = async (patch) => { await session.updateTeamMember(team.id, m.memberId, patch); setEditing(false) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, border: '1px solid var(--rule)', borderRadius: 7, padding: '8px 10px', minWidth: 150, background: 'var(--paper)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{m.name || m.username}</span>
        <span style={{ flex: 1 }} />
        <span style={tag(m.role === 'manager' ? 'var(--ok2)' : 'var(--navy)')}>{m.role === 'manager' ? 'gestor' : 'membro'}</span>
      </div>
      <span style={{ ...mono, fontSize: 11, color: 'var(--ink3)' }}>{m.subsystem || '—'}</span>
      {isManager && !editing && <button onClick={() => setEditing(true)} style={{ ...miniLink }}>editar</button>}
      {isManager && editing && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          <select defaultValue={m.role} onChange={e => save({ role: e.target.value })} style={selectSm}><option value="member">membro</option><option value="manager">gestor</option></select>
          <select defaultValue={m.subsystem || ''} onChange={e => save({ subsystem: e.target.value })} style={selectSm}><option value="">—</option>{SUBSYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}</select>
          {!isOwner && <button onClick={() => session.removeTeamMember(team.id, m.memberId)} style={{ ...miniLink, color: 'var(--err2)' }}>remover</button>}
        </div>
      )}
    </div>
  )
}

// per-member open workload (the deferred team-availability overlay)
function AvailabilityStrip({ team, tasks }) {
  if (!team?.members?.length) return null
  const open = tasks.filter(t => t.state !== 'done')
  const max = Math.max(1, ...team.members.map(m => open.filter(t => t.assigneeId === m.memberId).length))
  return (
    <div style={{ marginTop: 14, border: '1px solid var(--rule)', borderRadius: 9, padding: 12, background: 'var(--paper2)' }}>
      <div style={{ ...mono, fontSize: 10.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 10 }}>Disponibilidade da equipe (tarefas abertas)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {team.members.map(m => {
          const mine = open.filter(t => t.assigneeId === m.memberId)
          const overdue = mine.filter(t => deadlineStatus(t) === 'overdue').length
          return (
            <div key={m.memberId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12.5, color: 'var(--ink2, var(--ink))', width: 150, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name || m.username}</span>
              <div style={{ flex: 1, height: 10, background: 'var(--paper3, var(--paper))', borderRadius: 5, overflow: 'hidden', border: '1px solid var(--rule)' }}>
                <div style={{ width: `${(mine.length / max) * 100}%`, height: '100%', background: overdue ? 'var(--err2)' : 'var(--navy)' }} />
              </div>
              <span style={{ ...mono, fontSize: 11, color: overdue ? 'var(--err2)' : 'var(--ink3)', width: 70, textAlign: 'right' }}>{mine.length} abertas{overdue ? ` · ${overdue}⚠` : ''}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NewTaskButton({ team }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', subsystem: '', assigneeId: '', deadline: '' })
  const create = async () => {
    if (!form.title.trim()) return
    const r = await session.createTask({ title: form.title.trim(), subsystem: form.subsystem || null, assigneeId: form.assigneeId ? Number(form.assigneeId) : null, deadline: form.deadline || null })
    if (r.ok) { setForm({ title: '', subsystem: '', assigneeId: '', deadline: '' }); setOpen(false) }
  }
  if (!open) return <button onClick={() => setOpen(true)} style={primary}>+ nova tarefa</button>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <input autoFocus placeholder="título" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} onKeyDown={e => e.key === 'Enter' && create()} style={{ ...input, width: 180 }} />
      <select value={form.subsystem} onChange={e => setForm(f => ({ ...f, subsystem: e.target.value }))} style={select}><option value="">subsistema</option>{SUBSYSTEMS.map(s => <option key={s} value={s}>{s}</option>)}</select>
      <select value={form.assigneeId} onChange={e => setForm(f => ({ ...f, assigneeId: e.target.value }))} style={select}><option value="">responsável</option>{(team?.members || []).map(m => <option key={m.memberId} value={m.memberId}>{m.name || m.username}</option>)}</select>
      <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} style={select} />
      <button onClick={create} style={primary}>criar</button>
      <button onClick={() => setOpen(false)} style={ghost}>×</button>
    </div>
  )
}

function TaskCard({ task, team, role, me, isManager }) {
  const editable = canEditTask(role, me, task)
  const dl = deadlineStatus(task)
  const days = daysUntil(task.deadline)
  const assignee = team?.members?.find(m => m.memberId === task.assigneeId)
  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 7, padding: '8px 9px', background: 'var(--paper)' }}>
      <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.35, marginBottom: 6 }}>{task.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {task.subsystem && <span style={tag('var(--paper3, var(--paper2))', 'var(--ink3)')}>{task.subsystem}</span>}
        {assignee && <span style={{ ...mono, fontSize: 10, color: 'var(--ink3)' }}>{assignee.name || assignee.username}</span>}
        {task.deadline && <span style={{ ...mono, fontSize: 10, color: DL_COLOR[dl] }}>{dl === 'overdue' ? `${-days}d atrasada` : dl === 'soon' ? `${days}d restantes` : task.deadline}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
        <button disabled={!editable || task.state === 'backlog'} onClick={() => session.updateTask(task.id, { state: prevState(task.state) })} style={moveBtn(!editable || task.state === 'backlog')}>←</button>
        <button disabled={!editable || task.state === 'done'} onClick={() => session.updateTask(task.id, { state: nextState(task.state) })} style={moveBtn(!editable || task.state === 'done')}>→</button>
        <span style={{ flex: 1 }} />
        {isManager && <button onClick={() => session.deleteTask(task.id)} style={{ ...miniLink, color: 'var(--err2)' }}>excluir</button>}
      </div>
    </div>
  )
}

function AvailabilityToggle({ team }) {
  const showAvailability = useForge(s => s.showAvailability)
  const toggleAvailability = useForge(s => s.toggleAvailability)
  if (!team?.members?.length) return null
  return (
    <div style={{ marginTop: 14 }}>
      <button onClick={toggleAvailability}
        style={{ ...mono, fontSize: 11, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
          border: showAvailability ? '1.5px solid var(--navy)' : '1px solid var(--rule)',
          background: showAvailability ? 'var(--paper2)' : 'var(--paper)',
          color: showAvailability ? 'var(--ink)' : 'var(--ink3)',
          fontWeight: showAvailability ? 700 : 400 }}>
        {showAvailability ? 'ocultar grade semanal' : 'grade semanal de disponibilidade'}
      </button>
      {showAvailability && (
        <div style={{ marginTop: 12, border: '1px solid var(--rule)', borderRadius: 9, padding: 14, background: 'var(--paper2)' }}>
          <WeeklyAvailabilityGrid team={team} />
        </div>
      )}
    </div>
  )
}

function SignInPrompt() {
  const available = isAvailable()
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30, textAlign: 'center' }}>
      <h2 style={{ ...slab, margin: 0, fontSize: 20, color: 'var(--ink)' }}>Equipe & tarefas</h2>
      <p style={{ ...mono, fontSize: 12.5, color: 'var(--ink3)', maxWidth: 420, lineHeight: 1.6 }}>
        {available === false
          ? 'O servidor de colaboração não está rodando. Inicie com npm run server para gerenciar equipes, alocar tarefas e colaborar em tempo real.'
          : 'Entre com uma conta (botão “Entrar” no topo) para gerenciar a equipe, alocar tarefas e ver prazos. Use uma conta de demonstração para explorar.'}
      </p>
    </div>
  )
}

const tag = (bg, fg = '#fff') => ({ ...mono, fontSize: 9.5, padding: '1px 6px', borderRadius: 4, background: bg, color: fg, letterSpacing: '.04em' })
const select = { ...mono, fontSize: 12, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)' }
const selectSm = { ...select, fontSize: 11, padding: '3px 5px' }
const input = { ...mono, fontSize: 12.5, padding: '6px 9px', borderRadius: 6, border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)', boxSizing: 'border-box' }
const ghost = { ...mono, fontSize: 11, border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink2, var(--ink))', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }
const primary = { ...mono, fontSize: 11, border: 'none', background: 'var(--navy)', color: '#fff', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontWeight: 700 }
const miniLink = { ...mono, fontSize: 10.5, border: 'none', background: 'none', color: 'var(--ink3)', cursor: 'pointer', padding: 0, textAlign: 'left' }
const moveBtn = (disabled) => ({ ...mono, fontSize: 12, width: 26, height: 22, borderRadius: 5, border: '1px solid var(--rule)', background: disabled ? 'var(--paper2)' : 'var(--paper)', color: disabled ? 'var(--ink4)' : 'var(--ink)', cursor: disabled ? 'default' : 'pointer' })
