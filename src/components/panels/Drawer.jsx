import { useEffect, useRef } from 'react'
import useForge, { STATUS, COMPONENT_DEFS } from '../../store/useForge'
import {
  issuesForComponent, SOURCE_LABEL, effectiveProps,
  activeModules, engineeringFor, COMPONENT_PINS,
} from '../../mission/index.js'

// ──────────────────────────────────────────────────────────────────
// Drawer — contextual engineering workspace for the selected module:
// honest connection state, real pin wiring, datasheet-grade reference
// (data structures, operational ranges, expected values), telemetry
// preview, editable economics and the firmware module link.
// ──────────────────────────────────────────────────────────────────

const STATUS_LABEL = {
  [STATUS.OK]:       'operacional (simulado)',
  [STATUS.WARN]:     'atenção',
  [STATUS.ERR]:      'falha',
  [STATUS.SCANNING]: 'verificando',
  [STATUS.IDLE]:     'não conectado',
}

// Tiny inline sparkline for the telemetry preview — no chart lib.
function MiniSpark({ data, color }) {
  const pts = data.filter(v => v != null)
  if (pts.length < 2) return <span style={{ ...{ fontFamily: "'Space Mono', monospace" }, fontSize: 9, color: 'var(--ink4)' }}>aguardando amostras…</span>
  const W = 250, H = 38, pad = 3
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1
  const step = (W - pad * 2) / (pts.length - 1)
  const d = pts.map((v, i) =>
    `${i ? 'L' : 'M'}${(pad + i * step).toFixed(1)},${(H - pad - ((v - min) / span) * (H - pad * 2)).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
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

const SEV_COLOR = { error: 'var(--err2)', warn: 'var(--warn2)', info: 'var(--ink3)' }
const mono = { fontFamily: "'Space Mono', monospace" }

function PropRow({ label, value, badge }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--rule2)' }}>
      <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{label}</span>
      {badge
        ? <span className={`badge badge-${badge}`}>{value}</span>
        : <span style={{ ...mono, fontSize: 11, color: 'var(--ink)' }}>{value}</span>
      }
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ ...mono, fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  )
}

// Editable economics row: default values from the catalog, overridable.
function EcoRow({ label, unit, value, defaultValue, onChange }) {
  const overridden = value != null && value !== defaultValue
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--rule2)' }}>
      <span style={{ fontSize: 11, color: 'var(--ink3)', flex: 1 }}>{label}</span>
      <input
        type="number" min="0"
        value={value ?? defaultValue}
        onChange={e => onChange(e.target.value)}
        style={{
          width: 64, padding: '3px 6px', borderRadius: 4, outline: 'none', textAlign: 'right',
          border: `1px solid ${overridden ? 'var(--acc)' : 'var(--rule)'}`,
          background: 'var(--paper2)', ...mono, fontSize: 10.5,
          color: overridden ? 'var(--acc)' : 'var(--ink)',
        }}
      />
      <span style={{ ...mono, fontSize: 9, color: 'var(--ink4)', width: 24 }}>{unit}</span>
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
  const { def, status, readings, logs } = entity
  const {
    setSection, pushSerial, updateStatus,
    live, missionPlan, setOverride, toggleHardware, openModuleInFirmware,
    wires, autoWire, setHardwareView, openFeatureInfo, telemetry,
  } = useForge()

  const issues = issuesForComponent(live?.validation, id)
  const override = missionPlan.overrides[id] || {}
  const eff = effectiveProps(def, override)
  const wiring = live?.wiring?.[id]
  const isWired = !!wiring?.wired
  const eng = engineeringFor(id)

  // actual connection per physical pin (from real user wires)
  const physPins = COMPONENT_PINS[id] || []
  const pinConnection = (pin) => {
    const w = wires.find(w =>
      (w.from.comp === id && w.from.pin === pin) || (w.to.comp === id && w.to.pin === pin))
    if (!w) return null
    const other = w.from.comp === id && w.from.pin === pin ? w.to : w.from
    return `${other.pin} (${COMPONENT_DEFS[other.comp]?.label || other.comp})`
  }

  // telemetry preview series for this component (simulated readings)
  const sparks = id === 'bmp280'
    ? [{ key: 'press', label: 'Pressão (hPa)', color: 'var(--acc2)' }, { key: 'temp', label: 'Temperatura (°C)', color: 'var(--err2)' }]
    : id === 'mpu6050'
      ? [{ key: 'accel', label: 'Aceleração Z (g)', color: 'var(--warn2)' }]
      : id === 'esp32'
        ? [{ key: 'heap', label: 'Heap livre (kB)', color: 'var(--ok2)' }]
        : []

  // the firmware module generated for this component (modular firmware)
  const mods = activeModules({ defs: COMPONENT_DEFS, componentIds: Object.keys(useForge.getState().entities), objectiveId: missionPlan.objectiveId })
  const ownModule = mods.find(m => m.file.includes(id)) || (def.category === 'mcu' ? mods.find(m => m.id === 'main') : null)

  const testComm = () => {
    pushSerial({ m: `${def.protocol} test ${def.address || ''} ${def.label} (simulação)`.replace(/\s+/g, ' ').trim(), cls: 'info' })
    updateStatus(id, STATUS.SCANNING)
    setTimeout(() => {
      // honest result: only a wired component ACKs
      const final = isWired ? STATUS.OK : STATUS.IDLE
      updateStatus(id, final)
      pushSerial({
        m: isWired ? `${def.label} → ACK` : `${def.label} → sem resposta · sensor não conectado`,
        cls: isWired ? 'ok' : 'err',
      })
    }, 1200)
  }

  const actions = [
    { label: 'Testar comunicação', primary: true, onClick: testComm },
    ...(ownModule ? [{ label: `Abrir ${ownModule.file} no firmware`, onClick: () => openModuleInFirmware(ownModule.id) }] : []),
    { label: 'Ver na arquitetura', onClick: () => setSection('architecture') },
    ...(def.category !== 'mcu' ? [{ label: 'Remover da placa', danger: true, onClick: () => { toggleHardware(id); onClose() } }] : []),
  ]

  const hasErr = issues.some(i => i.severity === 'error')
  const statusIcon = hasErr ? '✕' : status === STATUS.OK ? '●' : status === STATUS.ERR ? '✕' : status === STATUS.WARN ? '!' : '◌'
  const statusColor = hasErr ? 'var(--err2)' : status === STATUS.OK ? 'var(--ok)' : status === STATUS.ERR ? 'var(--err2)' : status === STATUS.WARN ? 'var(--warn2)' : 'var(--ink4)'

  return (
    <>
      {/* header — human meaning first, part number second */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'flex-start', gap: 10, flexShrink: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 4, flexShrink: 0,
          background: hasErr ? 'rgba(184,75,44,.1)' : status === STATUS.WARN ? 'rgba(200,131,26,.1)' : 'rgba(42,107,74,.1)',
          color: statusColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          ...mono, fontSize: 14, fontWeight: 700,
        }}>{statusIcon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {def.friendly || def.label}
          </div>
          <div style={{ ...mono, fontSize: 9, color: 'var(--ink3)', letterSpacing: '.06em' }}>
            {def.label} · {def.protocol}{def.address ? ` · ${def.address}` : ''} · {def.voltage}
          </div>
        </div>
        <button onClick={onClose} style={{
          width: 24, height: 24, borderRadius: 4, border: '1px solid var(--rule)', background: 'var(--paper2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--ink3)', fontSize: 14,
        }}>×</button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>

        {/* inline validation, with rule source */}
        {issues.length > 0 && (
          <Section label="Validação">
            {issues.map((iss, i) => (
              <div key={i} style={{
                borderLeft: `2px solid ${SEV_COLOR[iss.severity]}`,
                background: iss.severity === 'error' ? 'rgba(184,75,44,.07)' : 'rgba(200,131,26,.07)',
                borderRadius: 2, padding: '7px 9px', marginBottom: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <span style={{
                    ...mono, fontSize: 7, letterSpacing: '.08em', textTransform: 'uppercase',
                    color: '#fff', background: SEV_COLOR[iss.severity], borderRadius: 2, padding: '1px 4px',
                  }}>{SOURCE_LABEL[iss.source] || iss.source}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)' }}>{iss.title}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink3)', lineHeight: 1.55 }}>{iss.detail}</div>
              </div>
            ))}
          </Section>
        )}

        {/* honest connection state + real pin wiring */}
        {def.category !== 'mcu' && (
          <Section label="Conexão">
            <PropRow label="Alimentação" value={wiring?.powered ? 'conectada' : 'não conectada'} badge={wiring?.powered ? 'ok' : 'off'} />
            <PropRow label="Barramento I²C" value={wiring?.data ? 'conectado' : 'não conectado'} badge={wiring?.data ? 'ok' : 'off'} />
            {!isWired && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={() => autoWire(id)} style={{
                  flex: 1, padding: '5px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10.5,
                  border: '1px solid var(--rule)', background: 'var(--paper2)', color: 'var(--acc)',
                  fontFamily: "'Space Grotesk', sans-serif",
                }}>Auto-conectar</button>
                <button onClick={() => { setHardwareView('2d'); setSection('hardware') }} style={{
                  flex: 1, padding: '5px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 10.5,
                  border: '1px solid var(--rule)', background: 'var(--paper2)', color: 'var(--ink3)',
                  fontFamily: "'Space Grotesk', sans-serif",
                }}>Fiação manual 2D</button>
              </div>
            )}
          </Section>
        )}

        {/* ESP32: pin assignment table derived from the live wiring */}
        {id === 'esp32' && (
          <Section label="Atribuição de pinos">
            <div style={{ display: 'flex', padding: '3px 2px', borderBottom: '1px solid var(--rule)' }}>
              <span style={{ ...mono, fontSize: 7.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)', width: 84, flexShrink: 0 }}>Pino ESP32</span>
              <span style={{ ...mono, fontSize: 7.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)' }}>Conectado a</span>
            </div>
            {wires.filter(w => w.from.comp === 'esp32' || w.to.comp === 'esp32').map((w, i) => {
              const own = w.from.comp === 'esp32' ? w.from : w.to
              const other = w.from.comp === 'esp32' ? w.to : w.from
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '5px 2px', borderBottom: '1px solid var(--rule2)' }}>
                  <span style={{ ...mono, fontSize: 10.5, color: 'var(--ink2)', width: 84, flexShrink: 0 }}>{own.pin}</span>
                  <span style={{ ...mono, fontSize: 10.5, color: 'var(--acc)' }}>
                    {other.pin} · {COMPONENT_DEFS[other.comp]?.label || other.comp}
                  </span>
                </div>
              )
            })}
            {!wires.some(w => w.from.comp === 'esp32' || w.to.comp === 'esp32') && (
              <div style={{ fontSize: 11, color: 'var(--ink4)', padding: '5px 2px' }}>
                Nenhum pino atribuído — faça a fiação na vista 2D.
              </div>
            )}
            <div style={{ ...mono, fontSize: 8, color: 'var(--ink4)', marginTop: 6, lineHeight: 1.5 }}>
              Derivado da fiação ao vivo · I²C padrão: SDA GPIO21 · SCL GPIO22 (remapeável)
            </div>
          </Section>
        )}

        {/* sensors: physical pins — what is ACTUALLY wired, pin by pin */}
        {id !== 'esp32' && physPins.length > 0 && (
          <Section label="Pinos">
            {physPins.map((p) => {
              const conn = pinConnection(p.id)
              return (
                <button key={p.id}
                  onClick={() => openFeatureInfo('pin_remap')}
                  title={p.note}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '5px 2px', border: 'none', borderBottom: '1px solid var(--rule2)',
                    background: 'none', cursor: 'pointer', textAlign: 'left',
                  }}>
                  <span style={{ ...mono, fontSize: 10.5, color: 'var(--ink2)', width: 64, flexShrink: 0 }}>{p.id}</span>
                  <span style={{ fontSize: 10, color: 'var(--ink4)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.note}</span>
                  <span style={{ ...mono, fontSize: 10, color: conn ? 'var(--acc)' : 'var(--ink4)', flexShrink: 0 }}>
                    {conn || '—'}
                  </span>
                </button>
              )
            })}
            {live?.addrs?.[id] && (
              <PropRow label="Endereço I²C efetivo" value={`${live.addrs[id].addr} · ${live.addrs[id].strap}`} />
            )}
            <div style={{ ...mono, fontSize: 8, color: 'var(--ink4)', marginTop: 6, lineHeight: 1.5 }}>
              Conexões reais feitas na fiação 2D
            </div>
          </Section>
        )}

        {/* editable mission economics */}
        <Section label="Economia do módulo">
          <EcoRow label="Preço"   unit="R$" value={override.price}   defaultValue={def.price ?? 0}   onChange={v => setOverride(id, 'price', v)} />
          <EcoRow label="Massa"   unit="g"  value={override.mass}    defaultValue={def.mass ?? 0}    onChange={v => setOverride(id, 'mass', v)} />
          <EcoRow label="Consumo" unit="mA" value={override.current} defaultValue={def.current ?? 0} onChange={v => setOverride(id, 'current', v)} />
          <div style={{ ...mono, fontSize: 8, color: 'var(--ink4)', marginTop: 6, lineHeight: 1.5 }}>
            Valores padrão do catálogo — edite para refletir o seu hardware real. Totais recalculam ao vivo.
          </div>
        </Section>

        {/* properties */}
        <Section label="Propriedades">
          <PropRow label="Categoria" value={def.category} />
          {def.protocol && <PropRow label="Protocolo" value={def.protocol} />}
          {def.address  && <PropRow label="Endereço I2C" value={def.address} />}
          <PropRow label="Tensão" value={def.voltage} />
          <PropRow label="Consumo" value={`${eff.current} mA`} />
          <PropRow label="Massa" value={`${eff.mass} g`} />
          <PropRow label="Status" value={STATUS_LABEL[status] || status} badge={STATUS_BG[status]?.replace('badge-','')} />
        </Section>

        {/* live readings — only when actually wired, clearly simulated */}
        <Section label={isWired ? 'Leituras · simulação' : 'Leituras'}>
          {isWired && Object.keys(readings).length > 0 ? (
            <>
              {Object.entries(readings).map(([k, v]) => (
                <PropRow key={k} label={k.replace(/_/g, ' ')} value={v} />
              ))}
              {sparks.map(s => (
                <div key={s.key} style={{ marginTop: 8 }}>
                  <div style={{ ...mono, fontSize: 7.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 3 }}>{s.label}</div>
                  <MiniSpark data={telemetry.map(t => t[s.key])} color={s.color} />
                </div>
              ))}
            </>
          ) : (
            <div style={{ fontSize: 11, color: 'var(--ink4)', lineHeight: 1.5 }}>
              {def.category === 'mcu'
                ? 'Sem dados — aguardando inicialização.'
                : 'sensor não conectado — verifique a fiação'}
            </div>
          )}
        </Section>

        {/* engineering reference — what this part actually is and does */}
        {eng && (
          <Section label="Referência de engenharia">
            <div style={{ fontSize: 11, color: 'var(--ink2)', lineHeight: 1.55, marginBottom: 8 }}>{eng.overview}</div>
            {eng.bus && <PropRow label={eng.bus[0]} value={eng.bus[1]} />}
            {eng.ranges.map(([k, v]) => <PropRow key={k} label={k} value={v} />)}

            {eng.expected && (
              <>
                <div style={{ ...mono, fontSize: 7.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)', margin: '10px 0 4px' }}>Valores esperados</div>
                {eng.expected.map(([k, v]) => <PropRow key={k} label={k} value={v} />)}
              </>
            )}

            <div style={{ ...mono, fontSize: 7.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)', margin: '10px 0 4px' }}>Estrutura de dados</div>
            <pre style={{
              margin: 0, background: '#14110D', borderRadius: 4, padding: '8px 10px', overflowX: 'auto',
              ...mono, fontSize: 9.5, lineHeight: 1.55, color: 'rgba(255,255,255,.78)',
            }}>{eng.struct}</pre>

            {eng.notes?.map((n, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <span style={{ color: 'var(--ink4)', fontSize: 10, flexShrink: 0 }}>▸</span>
                <span style={{ fontSize: 10.5, color: 'var(--ink3)', lineHeight: 1.5 }}>{n}</span>
              </div>
            ))}
          </Section>
        )}

        {/* firmware module */}
        {ownModule && (
          <Section label="Módulo de firmware">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ ...mono, fontSize: 11, color: 'var(--ink)' }}>{ownModule.file}</span>
              <span style={{
                ...mono, fontSize: 7, letterSpacing: '.08em', textTransform: 'uppercase',
                padding: '1px 5px', borderRadius: 2,
                background: ownModule.layer === 'core' ? 'rgba(43,94,167,.12)' : ownModule.layer === 'adaptive' ? 'rgba(200,131,26,.12)' : 'rgba(58,144,96,.12)',
                color: ownModule.layer === 'core' ? 'var(--acc)' : ownModule.layer === 'adaptive' ? 'var(--warn2)' : 'var(--ok2)',
              }}>{ownModule.layer}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink3)', lineHeight: 1.5 }}>{ownModule.desc}</div>
          </Section>
        )}

        {/* log */}
        {logs.length > 0 && (
          <Section label="Log recente">
            <div style={{ background: 'var(--paper2)', border: '1px solid var(--rule)', borderRadius: 3, padding: '6px 8px' }}>
              {logs.map((l, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '2px 0', borderBottom: i < logs.length-1 ? '1px solid var(--rule2)' : 'none' }}>
                  <span style={{ ...mono, fontSize: 9, color: 'var(--ink4)', flexShrink: 0 }}>{l.t}</span>
                  <span style={{ ...mono, fontSize: 9, color: LOG_COLORS[l.cls] || 'var(--ink3)', flex: 1, lineHeight: 1.4 }}>{l.m}</span>
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
              border: `1px solid ${a.danger ? 'rgba(184,75,44,.3)' : 'var(--rule)'}`, cursor: 'pointer', fontSize: 11,
              fontFamily: "'Space Grotesk', sans-serif",
              background: a.primary ? 'var(--navy)' : 'var(--paper2)',
              color: a.primary ? 'rgba(255,255,255,.75)' : a.danger ? 'var(--err2)' : 'var(--ink3)',
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
