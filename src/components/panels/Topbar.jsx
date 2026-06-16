import { useEffect, useState } from 'react'
import useForge from '../../store/useForge'
import SessionBar from '../ui/SessionBar'

const mono = { fontFamily: "'Space Mono', monospace" }

// Honest save-feedback (UX audit §7). For a logged-in project the platform
// auto-syncs to the backend (App.jsx debounced saveShared → presence
// .lastSyncAt), so we reflect that; single-user work is in-memory only, so
// we say so plainly rather than fake "salvo".
function SaveIndicator() {
  const activeProjectId = useForge(s => s.activeProjectId)
  const presence = useForge(s => s.presence)
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick(t => t + 1), 5000); return () => clearInterval(id) }, [])

  let dot, text, title
  if (!activeProjectId) {
    dot = 'var(--ink4)'; text = 'local'; title = 'Trabalho em memória — entre num projeto para salvar no servidor.'
  } else if (presence?.connected) {
    const ago = presence.lastSyncAt ? Math.max(0, Math.round((Date.now() - presence.lastSyncAt) / 1000)) : null
    dot = 'var(--ok2)'; text = ago != null && ago < 8 ? 'salvando…' : 'salvo'
    title = presence.lastSyncAt ? `Sincronizado com o servidor${ago != null ? ` há ${ago}s` : ''}.` : 'Sincronizado com o servidor.'
  } else {
    dot = 'var(--warn2)'; text = 'reconectando'; title = 'Sem conexão com o servidor — alterações sincronizam ao reconectar.'
  }
  return (
    <span title={title} style={{ display: 'flex', alignItems: 'center', gap: 6, ...mono, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ink4)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />{text}
    </span>
  )
}

export default function Topbar() {
  const activeSection = useForge(s => s.activeSection)

  const sectionLabels = {
    mission: 'Mission', hardware: 'Hardware', architecture: 'Architecture',
    telemetry: 'Validação de sensores',
    serialtest: 'Firmware', hwtest: 'Testing',
    schedule: 'Cronograma',
    team: 'Equipe', reports: 'Relatórios', metrics: 'Métricas',
    analytics: 'Analytics · dev',
  }

  return (
    <div style={{
      height: 40, flexShrink: 0,
      background: 'var(--paper2)',
      borderBottom: '1px solid var(--rule)',
      display: 'flex', alignItems: 'center',
      padding: '0 14px', gap: 10,
    }}>
      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink3)' }}>Sistema</span>
      <span style={{ color: 'var(--ink4)', fontSize: 13.5 }}>›</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{sectionLabels[activeSection] || activeSection}</span>
      <span style={{ flex: 1 }} />
      <SaveIndicator />
      <SessionBar />
    </div>
  )
}
