import { useEffect, useMemo, useState } from 'react'
import useForge from '../../../store/useForge'
import { GPS_SCENARIOS, getScenario, CAUSE_CATALOG } from '../../../debug/scenarios.js'

// ──────────────────────────────────────────────────────────────────
// TrainingCard — guided troubleshooting exercise inside Debug.
//
// Flow: pick (or draw) a scenario → the fault is planted in the twin
// and a realistic device log streams into the serial buffer → the
// student investigates (serial, fiação 2D, inspetor, Log Doctor),
// asks for progressive hints if needed, and submits a diagnosis from a
// shuffled cause catalog. Multiple causes/fixes can be accepted; the
// reveal explains the planted fault and every valid remedy.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }

// deterministic-per-mount shuffle so the right answer has no fixed slot
function shuffled(arr, seedStr) {
  let seed = 0
  for (const c of seedStr) seed = (seed * 31 + c.charCodeAt(0)) >>> 0
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const j = seed % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function btn(primary) {
  return {
    padding: primary ? '6px 14px' : '5px 11px', borderRadius: 5, cursor: 'pointer',
    border: primary ? 'none' : '1px solid var(--rule)',
    background: primary ? 'var(--navy)' : 'var(--paper)',
    color: primary ? 'rgba(255,255,255,.88)' : 'var(--ink3)',
    fontSize: primary ? 11.5 : 11, fontFamily: "'Space Grotesk', sans-serif",
  }
}

function ScenarioPicker() {
  const startTrainingScenario = useForge(s => s.startTrainingScenario)
  return (
    <div>
      <div style={{ fontSize: 11.5, color: 'var(--ink2)', lineHeight: 1.6, marginBottom: 10 }}>
        Cada cenário planta uma falha realista de GPS no projeto e no log do dispositivo.
        Investigue como faria na bancada: monitor serial, fiação 2D, referência de engenharia
        do sensor e o assistente de depuração. Depois, registre seu diagnóstico.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        <button onClick={() => startTrainingScenario(null)} style={btn(true)}>
          Sortear cenário (recomendado)
        </button>
      </div>
      <div style={{ ...mono, fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)', margin: '8px 0 5px' }}>
        ou escolha um cenário (modo instrutor)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {GPS_SCENARIOS.map(sc => (
          <button key={sc.id} onClick={() => startTrainingScenario(sc.id)} style={btn(false)}>{sc.title}</button>
        ))}
      </div>
    </div>
  )
}

function ActiveScenario() {
  const {
    training, useTrainingHint, submitTrainingDiagnosis,
    revealTraining, stopTrainingScenario, setSection,
  } = useForge()
  const scenario = getScenario(training.scenarioId)
  const [cause, setCause] = useState(null)
  const [notes, setNotes] = useState('')
  const [, forceTick] = useState(0)

  // stream the device log into the serial buffer with realistic pacing
  useEffect(() => {
    if (!scenario) return undefined
    let stopped = false
    let timer
    const step = () => {
      if (stopped) return
      const delay = useForge.getState().trainingTick()
      if (delay != null) timer = setTimeout(step, delay)
    }
    timer = setTimeout(step, 600)
    return () => { stopped = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [training.scenarioId])

  // elapsed clock
  useEffect(() => {
    const id = setInterval(() => forceTick(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const causes = useMemo(() => shuffled(CAUSE_CATALOG, training.scenarioId || 'x'), [training.scenarioId])

  if (!scenario) return null
  const elapsed = Math.round((Date.now() - training.startedAt) / 1000)
  const solved = training.submissions.some(s => s.ok)
  const lastSubmission = training.submissions[training.submissions.length - 1]

  return (
    <div>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{scenario.title}</span>
        <span style={{ ...mono, fontSize: 9, color: 'var(--ink4)' }}>
          {Math.floor(elapsed / 60)}m{String(elapsed % 60).padStart(2, '0')}s · {training.hintsUsed} dica(s) · {training.submissions.length} tentativa(s)
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={stopTrainingScenario} style={btn(false)}>encerrar exercício</button>
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--ink2)', lineHeight: 1.6, marginBottom: 8 }}>{scenario.briefing}</div>

      {/* investigation shortcuts */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        <button onClick={() => setSection('serial')} style={btn(false)}>abrir monitor serial</button>
        <button onClick={() => { useForge.getState().setHardwareView('2d'); setSection('hardware') }} style={btn(false)}>abrir fiação 2D</button>
        <button onClick={() => { setSection('hardware'); useForge.getState().selectEntity('gps_neo6m') }} style={btn(false)}>inspecionar GPS</button>
      </div>

      {/* progressive hints */}
      <div style={{ marginBottom: 10 }}>
        {scenario.hints.slice(0, training.hintsUsed).map((h, i) => (
          <div key={i} style={{
            display: 'flex', gap: 7, padding: '6px 9px', marginBottom: 4, borderRadius: 3,
            background: 'rgba(43,94,167,.05)', borderLeft: '2px solid var(--acc)',
          }}>
            <span style={{ ...mono, fontSize: 8, color: 'var(--acc)', flexShrink: 0, paddingTop: 2 }}>DICA {i + 1}</span>
            <span style={{ fontSize: 11, color: 'var(--ink2)', lineHeight: 1.5 }}>{h}</span>
          </div>
        ))}
        {training.hintsUsed < scenario.hints.length && !training.revealed && (
          <button onClick={useTrainingHint} style={{ ...btn(false), color: 'var(--acc)' }}>
            pedir dica ({training.hintsUsed + 1}/{scenario.hints.length})
          </button>
        )}
      </div>

      {/* diagnosis submission */}
      {!training.revealed && (
        <div style={{ border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--paper)', padding: '10px 12px', marginBottom: 8 }}>
          <div style={{ ...mono, fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 7 }}>
            Seu diagnóstico — qual é a causa raiz?
          </div>
          {causes.map(c => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 2px', cursor: 'pointer' }}>
              <input type="radio" name="cause" checked={cause === c.id} onChange={() => setCause(c.id)} />
              <span style={{ fontSize: 11.5, color: 'var(--ink2)' }}>{c.label}</span>
            </label>
          ))}
          <input
            value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="evidência que sustenta o diagnóstico (opcional, mas conta pontos com o instrutor)"
            style={{
              width: '100%', marginTop: 8, padding: '6px 9px', borderRadius: 4, outline: 'none',
              border: '1px solid var(--rule)', background: 'var(--paper2)',
              fontSize: 11, color: 'var(--ink)', fontFamily: "'Space Grotesk', sans-serif",
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 9, alignItems: 'center' }}>
            <button disabled={!cause} onClick={() => submitTrainingDiagnosis(cause, notes)}
              style={{ ...btn(true), opacity: cause ? 1 : 0.5, cursor: cause ? 'pointer' : 'default' }}>
              Enviar diagnóstico
            </button>
            {training.submissions.length > 0 && (
              <button onClick={revealTraining} style={btn(false)}>revelar causa plantada</button>
            )}
            {lastSubmission && (
              <span style={{ ...mono, fontSize: 9.5, color: lastSubmission.ok ? 'var(--ok2)' : 'var(--err2)' }}>
                {lastSubmission.ok
                  ? 'diagnóstico aceito — compare com a revelação'
                  : 'a evidência não sustenta essa causa — continue investigando'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* reveal: planted cause + ALL valid remedies */}
      {training.revealed && (
        <div style={{ borderLeft: `2px solid ${solved ? 'var(--ok2)' : 'var(--warn2)'}`, background: solved ? 'rgba(42,107,74,.05)' : 'rgba(200,131,26,.05)', borderRadius: 3, padding: '10px 12px' }}>
          <div style={{ ...mono, fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: solved ? 'var(--ok2)' : 'var(--warn2)', marginBottom: 6 }}>
            {solved ? 'resolvido — causa confirmada' : 'revelação'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink2)', lineHeight: 1.6, marginBottom: 8 }}>{scenario.reveal}</div>
          <div style={{ ...mono, fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 4 }}>
            Caminhos de correção válidos
          </div>
          {scenario.approaches.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 7, padding: '2px 0' }}>
              <span style={{ ...mono, fontSize: 9, color: 'var(--ink4)', flexShrink: 0 }}>{i + 1}.</span>
              <span style={{ fontSize: 11, color: 'var(--ink3)', lineHeight: 1.5 }}>{a}</span>
            </div>
          ))}
          <button onClick={stopTrainingScenario} style={{ ...btn(true), marginTop: 10 }}>
            Encerrar e tentar outro cenário
          </button>
        </div>
      )}
    </div>
  )
}

export default function TrainingCard() {
  const scenarioId = useForge(s => s.training.scenarioId)
  return scenarioId ? <ActiveScenario /> : <ScenarioPicker />
}
