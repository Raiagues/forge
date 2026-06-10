import useForge, { STATUS } from '../../store/useForge'
import { getFramework } from '../../mission/index.js'

export default function Statusbar() {
  const { entities, seq, live, missionPlan, hwLink } = useForge()
  const list = Object.values(entities)
  const ok  = list.filter(e => e.status === STATUS.OK).length
  const v = live?.validation
  const eco = live?.eco
  const fw = getFramework(missionPlan.frameworkId)

  return (
    <div style={{
      height: 26, flexShrink: 0,
      background: 'var(--paper3)', borderTop: '1px solid var(--rule)',
      display: 'flex', alignItems: 'center',
      padding: '0 14px', gap: 14,
      fontFamily: "'Space Mono', monospace", fontSize: 8,
      letterSpacing: '.06em', color: 'var(--ink4)',
    }}>
      <span style={{
        padding: '1px 6px', borderRadius: 2, letterSpacing: '.08em', textTransform: 'uppercase',
        background: hwLink.connected ? 'rgba(58,144,96,.14)' : 'rgba(26,24,20,.07)',
        color: hwLink.connected ? 'var(--ok2)' : 'var(--ink4)',
      }}>{hwLink.connected ? 'hardware real' : 'simulação'}</span>
      <Item dot="var(--ok2)">{ok} conectado{ok !== 1 ? 's' : ''}</Item>
      {v?.summary.warnings > 0 && <Item dot="var(--warn2)">{v.summary.warnings} aviso{v.summary.warnings !== 1 ? 's' : ''}</Item>}
      {v?.summary.errors > 0 && <Item dot="var(--err2)">{v.summary.errors} erro{v.summary.errors !== 1 ? 's' : ''}</Item>}
      <div style={{ flex: 1 }} />
      {eco && list.length > 0 && (
        <span style={{ color: missionPlan.budgetBRL && eco.priceBRL > missionPlan.budgetBRL ? 'var(--err2)' : 'var(--ink4)' }}>
          {eco.massG}g · {eco.currentmA.toFixed(0)}mA · R${eco.priceBRL}{missionPlan.budgetBRL ? `/${missionPlan.budgetBRL}` : ''}
        </span>
      )}
      {seq > 0 && <span>t+{seq * 3}s · live</span>}
      {fw && <span>{fw.name}</span>}
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
