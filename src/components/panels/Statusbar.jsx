import useForge, { STATUS } from '../../store/useForge'

export default function Statusbar() {
  const { entities, project, seq } = useForge()
  const list = Object.values(entities)
  const ok  = list.filter(e => e.status === STATUS.OK).length
  const err = list.filter(e => e.status === STATUS.ERR)
  const warn = list.filter(e => e.status === STATUS.WARN).length

  return (
    <div style={{
      height: 26, flexShrink: 0,
      background: 'var(--paper3)', borderTop: '1px solid var(--rule)',
      display: 'flex', alignItems: 'center',
      padding: '0 14px', gap: 14,
      fontFamily: "'Space Mono', monospace", fontSize: 8,
      letterSpacing: '.06em', color: 'var(--ink4)',
    }}>
      <Item dot="var(--ok2)">{ok} operaciona{ok !== 1 ? 'is' : 'l'}</Item>
      {warn > 0 && <Item dot="var(--warn2)">{warn} aviso{warn !== 1 ? 's' : ''}</Item>}
      {err.map(e => (
        <Item key={e.id} dot="var(--err2)">{e.def.label} · falha</Item>
      ))}
      <div style={{ flex: 1 }} />
      {seq > 0 && <span>t+{seq * 3}s · live</span>}
      <span>{project.competition} · {project.daysLeft} dias</span>
    </div>
  )
}

function Item({ dot, children }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      {children}
    </span>
  )
}
