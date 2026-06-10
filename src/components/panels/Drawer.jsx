import { useEffect, useRef } from 'react'
import useForge, { STATUS, COMPONENT_DEFS } from '../../store/useForge'

const STATUS_LABEL = {
  [STATUS.OK]:       'operacional',
  [STATUS.WARN]:     'atenção',
  [STATUS.ERR]:      'falha',
  [STATUS.SCANNING]: 'verificando',
  [STATUS.IDLE]:     'aguardando',
}

const STATUS_BG = {
  [STATUS.OK]:   'badge-ok',
  [STATUS.WARN]: 'badge-warn',
  [STATUS.ERR]:  'badge-err',
  [STATUS.IDLE]: 'badge-off',
  [STATUS.SCANNING]: 'badge-off',
}

const LOG_COLORS = {
  ok:   'var(--ok)',
  err:  'var(--err2)',
  warn: 'var(--warn2)',
  info: 'var(--ink3)',
}

const DIAGNOSTIC = {
  gps_neo6m: {
    title: 'Sem resposta UART',
    body: 'Nenhum dado NMEA após 3 tentativas. Causas comuns: TX/RX invertidos, módulo alimentado com 5V sem divisor de tensão no RX, ou módulo sem alimentação. Verifique: TX GPS → GPIO 16, RX GPS → GPIO 17.',
    sev: 'err',
  },
  mpu6050: {
    title: 'Ruído elevado nas leituras',
    body: 'Variação acima do esperado no acelerômetro. Possível causa: capacitor de desacoplamento 100nF ausente no VCC, ou vibração mecânica na montagem.',
    sev: 'warn',
  },
}

function PropRow({ label, value, badge }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--rule2)' }}>
      <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{label}</span>
      {badge
        ? <span className={`badge badge-${badge}`}>{value}</span>
        : <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: 'var(--ink)' }}>{value}</span>
      }
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  )
}

export default function Drawer() {
  const { drawerOpen, selectedId, entities, closeDrawer } = useForge()
  const entity = selectedId ? entities[selectedId] : null
  const scrollRef = useRef()

  // reset scroll on new selection
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [selectedId])

  const W = 300

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0,
      width: W, background: 'var(--paper)',
      borderLeft: '1px solid var(--rule)',
      transform: drawerOpen ? 'translateX(0)' : `translateX(${W}px)`,
      transition: 'transform .25s cubic-bezier(.4,0,.2,1)',
      zIndex: 30, display: 'flex', flexDirection: 'column',
      boxShadow: drawerOpen ? '-6px 0 20px rgba(26,24,20,.07)' : 'none',
    }}>
      {entity ? <EntityContent entity={entity} id={selectedId} onClose={closeDrawer} scrollRef={scrollRef} /> : null}
    </div>
  )
}

function EntityContent({ entity, id, onClose, scrollRef }) {
  const { def, status, readings, logs, connections } = entity
  const { setSection, pushSerial, updateStatus } = useForge()
  const diag = DIAGNOSTIC[id]

  const testComm = () => {
    pushSerial({ m: `${def.protocol} test ${def.address || ''} ${def.label}`.replace(/\s+/g, ' ').trim(), cls: 'info' })
    updateStatus(id, STATUS.SCANNING)
    setTimeout(() => {
      const final = status === STATUS.SCANNING ? STATUS.OK : status
      updateStatus(id, final)
      pushSerial({ m: `${def.label} → ${final === STATUS.ERR ? 'no response' : 'ACK'}`, cls: final === STATUS.ERR ? 'err' : 'ok' })
    }, 1200)
  }

  const actions = [
    { label: 'Testar comunicação', primary: true, onClick: testComm },
    { label: 'Ver na arquitetura', onClick: () => setSection('architecture') },
    { label: 'Abrir monitor serial', onClick: () => setSection('serial') },
  ]

  const statusIcon = status === STATUS.OK ? '●' : status === STATUS.ERR ? '✕' : status === STATUS.WARN ? '!' : '◌'
  const statusColor = status === STATUS.OK ? 'var(--ok)' : status === STATUS.ERR ? 'var(--err2)' : status === STATUS.WARN ? 'var(--warn2)' : 'var(--ink4)'

  return (
    <>
      {/* header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'flex-start', gap: 10, flexShrink: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 4, flexShrink: 0,
          background: status === STATUS.ERR ? 'rgba(184,75,44,.1)' : status === STATUS.WARN ? 'rgba(200,131,26,.1)' : 'rgba(42,107,74,.1)',
          color: statusColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Space Mono', monospace", fontSize: 14, fontWeight: 700,
        }}>{statusIcon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{def.label}</div>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: 'var(--ink3)', letterSpacing: '.06em' }}>{def.protocol}{def.address ? ` · ${def.address}` : ''} · {def.voltage}</div>
        </div>
        <button onClick={onClose} style={{
          width: 24, height: 24, borderRadius: 4, border: '1px solid var(--rule)', background: 'var(--paper2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink3)', fontSize: 14,
        }}>×</button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>

        {/* properties */}
        <Section label="Propriedades">
          <PropRow label="Categoria" value={def.category} />
          {def.protocol && <PropRow label="Protocolo" value={def.protocol} />}
          {def.address  && <PropRow label="Endereço I2C" value={def.address} />}
          <PropRow label="Tensão" value={def.voltage} />
          <PropRow label="Corrente" value={def.current ? `${def.current} mA` : '—'} />
          <PropRow label="Massa" value={`${def.mass} g`} />
          <PropRow label="Status" value={STATUS_LABEL[status] || status} badge={STATUS_BG[status]?.replace('badge-','')} />
        </Section>

        {/* live readings */}
        {Object.keys(readings).length > 0 && (
          <Section label="Leituras em tempo real">
            {Object.entries(readings).map(([k, v]) => (
              <PropRow key={k} label={k.replace(/_/g, ' ')} value={v} />
            ))}
          </Section>
        )}

        {/* connections */}
        {connections && connections.length > 0 && (
          <Section label="Conexões">
            {connections.map((c, i) => (
              <div key={i} style={{ marginBottom: i < connections.length - 1 ? 8 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span className={`badge badge-${c.bus === 'PWR' ? 'warn' : 'ok'}`}>{c.bus}</span>
                  <span style={{ fontSize: 11, color: 'var(--ink3)' }}>→ {COMPONENT_DEFS[c.to]?.label || c.to}</span>
                </div>
                <div style={{ paddingLeft: 4 }}>
                  {c.pins.map((p, j) => (
                    <div key={j} style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, color: 'var(--ink3)', lineHeight: 1.6 }}>{p}</div>
                  ))}
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* diagnostic */}
        {diag && (
          <Section label="Diagnóstico">
            <div style={{
              borderLeft: `2px solid ${diag.sev === 'err' ? 'var(--err2)' : 'var(--warn2)'}`,
              background: diag.sev === 'err' ? 'rgba(184,75,44,.07)' : 'rgba(200,131,26,.07)',
              borderRadius: 2, padding: '8px 10px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{diag.title}</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)', lineHeight: 1.6 }}>{diag.body}</div>
            </div>
          </Section>
        )}

        {/* log */}
        {logs.length > 0 && (
          <Section label="Log recente">
            <div style={{ background: 'var(--paper2)', border: '1px solid var(--rule)', borderRadius: 3, padding: '6px 8px' }}>
              {logs.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '2px 0', borderBottom: i < logs.length-1 ? '1px solid var(--rule2)' : 'none' }}>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: 'var(--ink4)', flexShrink: 0 }}>{l.t}</span>
                  <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: LOG_COLORS[l.cls] || 'var(--ink3)', flex: 1, lineHeight: 1.4 }}>{l.m}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* actions */}
        <Section label="Ações">
          {actions.map(a => (
            <button key={a.label} onClick={a.onClick} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              width: '100%', padding: '7px 10px', borderRadius: 4, marginBottom: 5,
              border: '1px solid var(--rule)', cursor: 'pointer', fontSize: 11,
              fontFamily: "'Space Grotesk', sans-serif",
              background: a.primary ? 'var(--navy)' : 'var(--paper2)',
              color: a.primary ? 'rgba(255,255,255,.75)' : 'var(--ink3)',
              transition: 'all .15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = a.primary ? 'var(--navy2)' : 'var(--paper3)'}
              onMouseLeave={e => e.currentTarget.style.background = a.primary ? 'var(--navy)' : 'var(--paper2)'}
            >{a.label}</button>
          ))}
        </Section>

      </div>
    </>
  )
}
