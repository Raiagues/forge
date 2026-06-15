import { useEffect, useState } from 'react'
import useForge from '../../store/useForge'
import * as session from '../../lib/session.js'
import { isAvailable } from '../../lib/api.js'
import { PHASES } from '../../mission/index.js'

// ──────────────────────────────────────────────────────────────────
// ReportsPanel — backend-stored phase reports (IMPLEMENTATION_PLAN §4
// item 14 / A7). Walks the build phases; each confirmed phase can carry a
// filed report (summary + author + timestamp) persisted on the backend and
// shared across the team + the public summary. Falls back to a local,
// read-only timeline when signed out. Reports are filed automatically on
// phase confirmation (see App.jsx) and can be edited/added here.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const slab = { fontFamily: "'Space Grotesk', sans-serif" }

export default function ReportsPanel() {
  const user = useForge(s => s.auth.user)
  const activeProjectId = useForge(s => s.activeProjectId)
  const reports = useForge(s => s.reports)
  const phaseState = useForge(s => s.phaseState)

  useEffect(() => { if (user && activeProjectId) session.loadReports(activeProjectId) }, [user, activeProjectId])

  const byPhase = {}
  for (const r of reports) if (!byPhase[r.phaseId]) byPhase[r.phaseId] = r // latest first (server sorts DESC)

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 26px', background: 'var(--paper)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <h2 style={{ ...slab, margin: 0, fontSize: 22, color: 'var(--ink)' }}>Relatórios de fase</h2>
        <span style={{ flex: 1 }} />
        {user && activeProjectId && <ShareControl />}
      </div>
      <p style={{ ...mono, fontSize: 11.5, color: 'var(--ink4)', margin: '0 0 18px' }}>
        {user
          ? (activeProjectId ? 'Registros de conclusão de cada fase do projeto.' : 'Abra um projeto (em Equipe) para registrar relatórios compartilhados.')
          : 'Linha do tempo local. Entre para registrar relatórios compartilhados com a equipe.'}
      </p>

      {!user && isAvailable() === false && (
        <Note>O servidor de colaboração não está rodando — exibindo apenas o histórico local. Inicie com <b>npm run server</b> para relatórios compartilhados.</Note>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {PHASES.map(p => (
          <PhaseRow key={p.id} phase={p} confirmed={!!phaseState[p.id]?.confirmed} confirmedAt={phaseState[p.id]?.confirmedAt}
            report={byPhase[p.id]} canFile={!!user && !!activeProjectId} />
        ))}
      </div>
    </div>
  )
}

function PhaseRow({ phase, confirmed, confirmedAt, report, canFile }) {
  const [filing, setFiling] = useState(false)
  const [summary, setSummary] = useState(report?.summary || '')

  const file = async () => {
    const r = await session.fileReport({ phaseId: phase.id, summary, confirmedAt: confirmedAt || new Date().toISOString() })
    if (r.ok) setFiling(false)
  }

  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 9, padding: 14, background: 'var(--paper2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: confirmed ? 'var(--ok2)' : 'var(--ink4)', flexShrink: 0 }} />
        <h3 style={{ ...slab, margin: 0, fontSize: 16, color: 'var(--ink)' }}>{phase.label}</h3>
        <span style={{ ...mono, fontSize: 10.5, color: confirmed ? 'var(--ok2)' : 'var(--ink4)', letterSpacing: '.06em', textTransform: 'uppercase' }}>{confirmed ? 'concluída' : 'pendente'}</span>
        <span style={{ flex: 1 }} />
        {confirmedAt && <span style={{ ...mono, fontSize: 10.5, color: 'var(--ink4)' }}>{new Date(confirmedAt).toLocaleDateString('pt-BR')}</span>}
      </div>

      {report ? (
        <div style={{ marginTop: 10, paddingLeft: 20 }}>
          <div style={{ fontSize: 13, color: 'var(--ink2, var(--ink))', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{report.summary || <em style={{ color: 'var(--ink4)' }}>sem descrição</em>}</div>
          <div style={{ ...mono, fontSize: 10.5, color: 'var(--ink4)', marginTop: 6 }}>registrado por {report.authorName} · {new Date(report.confirmedAt || report.createdAt).toLocaleString('pt-BR')}</div>
          {canFile && !filing && <button onClick={() => { setSummary(report.summary || ''); setFiling(true) }} style={{ ...miniLink, marginTop: 6 }}>editar relatório</button>}
        </div>
      ) : (
        canFile && confirmed && !filing && <button onClick={() => setFiling(true)} style={{ ...ghost, marginTop: 10, marginLeft: 20 }}>registrar relatório</button>
      )}

      {filing && (
        <div style={{ marginTop: 10, paddingLeft: 20 }}>
          <textarea autoFocus value={summary} onChange={e => setSummary(e.target.value)} placeholder="Resumo do que foi concluído nesta fase…"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 70, padding: 9, borderRadius: 6, border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink)', fontSize: 13, fontFamily: "'Space Grotesk', sans-serif", resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={file} style={primary}>salvar</button>
            <button onClick={() => setFiling(false)} style={ghost}>cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ShareControl() {
  const activeProjectId = useForge(s => s.activeProjectId)
  const shareToken = useForge(s => s.projects.find(p => p.id === activeProjectId)?.shareToken)
  const toggle = async () => {
    const r = shareToken ? await session.disableShare() : await session.enableShare()
    if (r.ok && r.shareToken) {
      const url = `${location.origin}${location.pathname}?share=${r.shareToken}`
      navigator.clipboard?.writeText(url).catch(() => {})
      useForge.getState().notify?.('Link público copiado')
    }
  }
  return <button onClick={toggle} style={shareToken ? primary : ghost}>{shareToken ? 'link público ✓' : 'compartilhar resumo'}</button>
}

function Note({ children }) {
  return <div style={{ ...mono, fontSize: 11.5, color: 'var(--warn2)', border: '1px solid var(--rule)', background: 'var(--paper2)', borderRadius: 6, padding: '8px 10px', marginBottom: 14, lineHeight: 1.5 }}>{children}</div>
}

const ghost = { ...mono, fontSize: 11, border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink2, var(--ink))', borderRadius: 6, padding: '6px 11px', cursor: 'pointer' }
const primary = { ...mono, fontSize: 11, border: 'none', background: 'var(--navy)', color: '#fff', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontWeight: 700 }
const miniLink = { ...mono, fontSize: 10.5, border: 'none', background: 'none', color: 'var(--ink3)', cursor: 'pointer', padding: 0 }
