import { useEffect, useRef, useState } from 'react'
import useForge from '../../store/useForge'

const LOG_COLORS = { ok: 'var(--ok2)', err: 'var(--err2)', warn: 'var(--warn2)', info: 'var(--ink3)' }

export default function SerialPanel() {
  const { serialLog, clearSerial, pushSerial, connectionStatus, project } = useForge()
  const [filter, setFilter] = useState('all')
  const [input, setInput] = useState('')
  const endRef = useRef(null)

  // serialLog is newest-first in the store; show oldest-first like a real console.
  const ordered = [...serialLog].reverse()
  const shown = filter === 'all' ? ordered : ordered.filter(l => l.cls === filter)

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [serialLog.length])

  const send = () => {
    const cmd = input.trim()
    if (!cmd) return
    pushSerial({ m: `» ${cmd}`, cls: 'info' })
    // tiny echo "device" so the input is genuinely wired
    setTimeout(() => pushSerial({ m: `ack: ${cmd}`, cls: 'ok' }), 120)
    setInput('')
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '14px 18px 16px' }}>
      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexShrink: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Space Mono', monospace", fontSize: 10, color: 'var(--ink3)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: connectionStatus === 'connected' ? 'var(--ok2)' : 'var(--err2)', boxShadow: connectionStatus === 'connected' ? '0 0 5px var(--ok2)' : 'none' }} />
          ESP32 · COM3 · 115200
        </span>
        <div style={{ flex: 1 }} />
        {['all', 'ok', 'warn', 'err'].map(fz => (
          <button key={fz} onClick={() => setFilter(fz)} style={{
            padding: '3px 9px', borderRadius: 4, fontSize: 9, cursor: 'pointer',
            fontFamily: "'Space Mono', monospace", letterSpacing: '.06em', textTransform: 'uppercase',
            border: '1px solid var(--rule)',
            background: filter === fz ? 'var(--navy)' : 'var(--paper2)',
            color: filter === fz ? 'rgba(255,255,255,.8)' : 'var(--ink3)',
          }}>{fz}</button>
        ))}
        <button onClick={clearSerial} style={{
          padding: '3px 9px', borderRadius: 4, fontSize: 9, cursor: 'pointer',
          fontFamily: "'Space Mono', monospace", letterSpacing: '.06em', textTransform: 'uppercase',
          border: '1px solid var(--rule)', background: 'var(--paper2)', color: 'var(--ink3)',
        }}>limpar</button>
      </div>

      {/* console */}
      <div style={{
        flex: 1, overflowY: 'auto', background: '#14110D', borderRadius: 6,
        border: '1px solid var(--rule)', padding: '10px 12px',
        fontFamily: "'Space Mono', monospace", fontSize: 11, lineHeight: 1.7,
      }}>
        {shown.length === 0 && <div style={{ color: 'rgba(255,255,255,.3)' }}># sem mensagens</div>}
        {shown.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 10 }}>
            <span style={{ color: 'rgba(255,255,255,.28)', flexShrink: 0 }}>{l.t}</span>
            <span style={{ color: LOG_COLORS[l.cls] || 'rgba(255,255,255,.7)' }}>{l.m}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* input */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexShrink: 0 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          placeholder="enviar comando ao dispositivo…"
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 5, outline: 'none',
            border: '1px solid var(--rule)', background: 'var(--paper2)',
            fontFamily: "'Space Mono', monospace", fontSize: 11, color: 'var(--ink)',
          }}
        />
        <button onClick={send} style={{
          padding: '8px 16px', borderRadius: 5, border: 'none', cursor: 'pointer',
          background: 'var(--navy)', color: 'rgba(255,255,255,.8)', fontSize: 12,
          fontFamily: "'Space Grotesk', sans-serif",
        }}>Enviar</button>
      </div>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, color: 'var(--ink4)', marginTop: 6 }}>
        {project.name} · monitor serial simulado · {serialLog.length} linhas no buffer
      </div>
    </div>
  )
}
