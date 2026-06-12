import { useState } from 'react'
import useForge from '../../../store/useForge'
import { CONFIDENCE } from '../../../debug/logDoctor.js'

// ──────────────────────────────────────────────────────────────────
// LogDoctorCard — interactive card for the debugging assistant inside
// the Debug panel. Paste device output (or pull the in-app serial
// buffer), get ranked probable causes cross-referenced with the digital
// twin, accept/reject each diagnosis and apply suggested fixes.
// All interactions are tracked by the store actions.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const SEV_COLOR = { error: 'var(--err2)', warn: 'var(--warn2)', info: 'var(--ink3)' }
const CONF_COLOR = {
  [CONFIDENCE.HIGH]: 'var(--ok2)',
  [CONFIDENCE.MED]: 'var(--warn2)',
  [CONFIDENCE.LOW]: 'var(--ink4)',
}

const EXAMPLE = `=== ESP32 START ===
Scanning I2C...
Devices found: 0
BMP280 NOT FOUND`

function Finding({ f, rating, onRate, onFix }) {
  return (
    <div style={{
      border: '1px solid var(--rule)',
      background: f.severity === 'error' ? 'rgba(184,75,44,.05)' : f.severity === 'warn' ? 'rgba(200,131,26,.05)' : 'var(--paper)',
      borderRadius: 'var(--r-md)', padding: '9px 11px', marginBottom: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: SEV_COLOR[f.severity] }} />
        <span style={{
          ...mono, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase',
          color: 'var(--btn-fg)', background: CONF_COLOR[f.confidence], borderRadius: 2, padding: '1px 5px',
        }}>confiança {f.confidence}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{f.title}</span>
      </div>

      <div style={{ fontSize: 13.5, color: 'var(--ink2)', lineHeight: 1.55, marginBottom: 6 }}>{f.cause}</div>

      {f.evidence?.length > 0 && (
        <div style={{ marginBottom: 7 }}>
          {f.evidence.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, padding: '1px 0' }}>
              <span style={{ ...mono, fontSize: 12, color: 'var(--ink4)', flexShrink: 0 }}>›</span>
              <span style={{ ...mono, fontSize: 12, color: 'var(--ink3)', lineHeight: 1.5 }}>{e}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {f.fixes?.map((fix, i) => (
          <button key={i} onClick={() => onFix(fix, f.title)} style={{
            fontSize: 13, cursor: 'pointer', padding: '4px 10px', borderRadius: 4,
            border: '1px solid var(--rule)',
            background: fix.kind === 'wiring' ? 'rgba(43,94,167,.07)' : 'var(--paper)',
            color: fix.kind === 'wiring' ? 'var(--acc)' : 'var(--ink2)',
            fontFamily: "'Space Grotesk', sans-serif",
          }}>{fix.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        {/* accept / reject — the core validation signal */}
        {rating == null ? (
          <>
            <button onClick={() => onRate(f.id, true)} title="O diagnóstico ajudou"
              style={rateBtn('var(--ok2)')}>útil</button>
            <button onClick={() => onRate(f.id, false)} title="O diagnóstico não ajudou"
              style={rateBtn('var(--err2)')}>não ajudou</button>
          </>
        ) : (
          <span style={{ ...mono, fontSize: 11, color: rating ? 'var(--ok2)' : 'var(--err2)' }}>
            {rating ? 'marcado como útil' : 'marcado como não útil'}
          </span>
        )}
      </div>
    </div>
  )
}

function rateBtn(color) {
  return {
    ...mono, fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase',
    padding: '3px 9px', borderRadius: 3, cursor: 'pointer',
    border: `1px solid ${color}`, background: 'transparent', color,
  }
}

export default function LogDoctorCard() {
  const {
    logDoctor, runLogDoctorOnText, runLogDoctorOnSerial,
    rateDoctorFinding, applyDoctorFix, serialLog,
  } = useForge()
  const [text, setText] = useState('')
  const { running, result, ratings, source } = logDoctor

  return (
    <div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={`Cole aqui a saída serial do dispositivo, por exemplo:\n\n${EXAMPLE}`}
        spellCheck={false}
        style={{
          width: '100%', minHeight: 96, resize: 'vertical', outline: 'none',
          border: '1px solid var(--rule)', borderRadius: 5, padding: '8px 10px',
          background: '#14110D', color: 'rgba(255,255,255,.82)',
          ...mono, fontSize: 13, lineHeight: 1.6,
        }}
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
        <button onClick={() => runLogDoctorOnText(text, 'paste')} disabled={running} style={{
          padding: '6px 14px', borderRadius: 5, border: 'none', cursor: running ? 'default' : 'pointer',
          background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontSize: 13.5,
          fontFamily: "'Space Grotesk', sans-serif",
        }}>{running ? 'Analisando…' : 'Diagnosticar log'}</button>
        <button onClick={runLogDoctorOnSerial} disabled={running || serialLog.length === 0} style={{
          padding: '6px 12px', borderRadius: 5, cursor: 'pointer',
          border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink3)',
          fontSize: 13.5, fontFamily: "'Space Grotesk', sans-serif",
        }}>Usar serial atual</button>
        <button onClick={() => setText(EXAMPLE)} style={{
          padding: '6px 12px', borderRadius: 5, cursor: 'pointer',
          border: '1px solid var(--rule)', background: 'var(--paper)', color: 'var(--ink4)',
          fontSize: 13.5, fontFamily: "'Space Grotesk', sans-serif",
        }}>Exemplo</button>
      </div>

      {result && !running && (
        <div style={{ marginTop: 12 }}>
          <div style={{ ...mono, fontSize: 12, color: 'var(--ink3)', marginBottom: 8 }}>
            {result.summary}
            {source === 'serial-real' ? ' · fonte: ESP32 real' : source === 'serial' ? ' · fonte: buffer serial (simulação)' : ''}
          </div>
          {result.findings.map(f => (
            <Finding key={f.id} f={f} rating={ratings[f.id]}
              onRate={rateDoctorFinding} onFix={applyDoctorFix} />
          ))}
          <div style={{ ...mono, fontSize: 11, color: 'var(--ink4)', lineHeight: 1.5 }}>
            O assistente cruza o log com o estado real do projeto (fiação, endereços, pinos).
            Marque cada diagnóstico como útil ou não — isso orienta a evolução da ferramenta.
          </div>
        </div>
      )}
    </div>
  )
}
