import { useEffect } from 'react'
import useForge from '../../store/useForge'
import * as session from '../../lib/session.js'
import { isAvailable } from '../../lib/api.js'
import { computeMetrics } from '../../mission/autonomy.js'
import { canManageTeam } from '../../mission/roles.js'

// ──────────────────────────────────────────────────────────────────
// MetricsPanel — manager autonomy dashboard + funnel (IMPLEMENTATION_PLAN
// §4 item 12). Reads the team's instrumentation events from the backend
// and derives, with the pure autonomy engine: a build-pipeline funnel
// (how far teams progress) and an autonomy index (independent work vs.
// AI/assistant help), with a per-member breakdown. Manager-only.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const slab = { fontFamily: "'Space Grotesk', sans-serif" }

export default function MetricsPanel() {
  const user = useForge(s => s.auth.user)
  const role = useForge(s => s.auth.role)
  const activeTeamId = useForge(s => s.activeTeamId)
  const metrics = useForge(s => s.metrics)

  useEffect(() => { if (user && canManageTeam(role) && activeTeamId) session.loadMetrics(activeTeamId) }, [user, role, activeTeamId])

  if (!user || !canManageTeam(role)) {
    return <Centered title="Métricas de autonomia" text={isAvailable() === false
      ? 'Inicie o servidor (npm run server) e entre como gestor para ver as métricas.'
      : 'Somente o gestor da equipe vê o painel de autonomia. Entre como gestor para continuar.'} />
  }

  const events = metrics?.events || []
  const m = computeMetrics(events)
  const memberName = (id) => metrics?.members?.find(x => x.memberId === id)?.name || metrics?.members?.find(x => x.memberId === id)?.username || (id ? `#${id}` : 'anônimo')

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 26px', background: 'var(--paper)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h2 style={{ ...slab, margin: 0, fontSize: 22, color: 'var(--ink)' }}>Métricas de autonomia</h2>
        <span style={{ flex: 1 }} />
        <button onClick={() => session.loadMetrics(activeTeamId)} style={ghost}>atualizar</button>
      </div>
      <p style={{ ...mono, fontSize: 11.5, color: 'var(--ink4)', margin: '0 0 18px' }}>{m.totalEvents} eventos · {m.totalSessions} sessões instrumentadas</p>

      {/* top cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 22 }}>
        <Stat label="Índice de autonomia" value={m.autonomy.index == null ? '—' : `${m.autonomy.index}%`} sub={`${m.autonomy.self} próprias · ${m.autonomy.assisted} assistidas`} accent="var(--ok2)" />
        <Stat label="Concluíram o pipeline" value={String(m.completedAll)} sub={`de ${m.totalSessions} sessões`} />
        <Stat label="Sessões" value={String(m.totalSessions)} sub="distintas" />
      </div>

      {/* funnel */}
      <h3 style={{ ...slab, margin: '0 0 10px', fontSize: 16, color: 'var(--ink)' }}>Funil do pipeline</h3>
      <div style={{ border: '1px solid var(--rule)', borderRadius: 9, padding: 14, background: 'var(--paper2)', marginBottom: 22 }}>
        {m.funnel.map((f, i) => (
          <div key={f.id} style={{ marginBottom: i === m.funnel.length - 1 ? 0 : 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, color: 'var(--ink)' }}>{f.label}</span>
              <span style={{ ...mono, fontSize: 11, color: 'var(--ink3)' }}>{f.count} sessões · {f.ofTotal}%{i > 0 ? ` · conv. ${f.conversion}%` : ''}</span>
            </div>
            <div style={{ height: 14, background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 7, overflow: 'hidden' }}>
              <div style={{ width: `${f.ofTotal}%`, height: '100%', background: 'var(--navy)', transition: 'width .3s' }} />
            </div>
          </div>
        ))}
        {!m.totalSessions && <div style={{ ...mono, fontSize: 12, color: 'var(--ink4)' }}>Sem dados ainda — a instrumentação aparece conforme a equipe usa a plataforma.</div>}
      </div>

      {/* per-member autonomy */}
      <h3 style={{ ...slab, margin: '0 0 10px', fontSize: 16, color: 'var(--ink)' }}>Por integrante</h3>
      <div style={{ border: '1px solid var(--rule)', borderRadius: 9, overflow: 'hidden' }}>
        <Row header cells={['Integrante', 'Autonomia', 'Próprias', 'Assistidas', 'Fases', 'Sessões']} />
        {m.members.sort((a, b) => (b.autonomy ?? -1) - (a.autonomy ?? -1)).map((mem, i) => (
          <Row key={mem.memberId ?? `anon-${i}`} cells={[memberName(mem.memberId), mem.autonomy == null ? '—' : `${mem.autonomy}%`, String(mem.self), String(mem.assisted), String(mem.phasesDone), String(mem.sessions)]} />
        ))}
        {!m.members.length && <div style={{ ...mono, fontSize: 12, color: 'var(--ink4)', padding: 12 }}>Sem atividade registrada.</div>}
      </div>
    </div>
  )
}

function Stat({ label, value, sub, accent }) {
  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 9, padding: 14, background: 'var(--paper2)' }}>
      <div style={{ ...mono, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 6 }}>{label}</div>
      <div style={{ ...slab, fontSize: 30, fontWeight: 700, color: accent || 'var(--ink)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ ...mono, fontSize: 10.5, color: 'var(--ink3)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

function Row({ cells, header }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr .8fr .8fr', borderBottom: '1px solid var(--rule)', background: header ? 'var(--paper2)' : 'var(--paper)' }}>
      {cells.map((c, i) => (
        <div key={i} style={{ ...mono, fontSize: header ? 10 : 12, letterSpacing: header ? '.08em' : 0, textTransform: header ? 'uppercase' : 'none', color: header ? 'var(--ink3)' : 'var(--ink)', padding: '8px 10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c}</div>
      ))}
    </div>
  )
}

function Centered({ title, text }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 30, textAlign: 'center' }}>
      <h2 style={{ ...slab, margin: 0, fontSize: 20, color: 'var(--ink)' }}>{title}</h2>
      <p style={{ ...mono, fontSize: 12.5, color: 'var(--ink3)', maxWidth: 420, lineHeight: 1.6 }}>{text}</p>
    </div>
  )
}

const ghost = { ...mono, fontSize: 11, border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink2, var(--ink))', borderRadius: 6, padding: '5px 10px', cursor: 'pointer' }
