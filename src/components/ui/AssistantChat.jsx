import { useEffect, useRef, useState } from 'react'
import useForge from '../../store/useForge'
import { SEED_QA } from '../../lib/assistant.js'
import TutorDiagram from './AssistantDiagrams'

// ──────────────────────────────────────────────────────────────────
// AssistantChat — the persistent, minimizable hardware-tutor chat that
// lives in the corner of every screen. Minimized: a compact launcher with
// an unread badge. Expanded: a ~340px panel with the conversation, inline
// schematic diagrams, and quick-access suggestion chips when empty. The
// answers come from the store's askAssistant (seeded library now; live
// Anthropic provider behind the same seam later). Every "Saiba mais"
// button in the platform funnels into this same chat.
// ──────────────────────────────────────────────────────────────────

const mono = { fontFamily: "'Space Mono', monospace" }
const byId = Object.fromEntries(SEED_QA.map((s) => [s.id, s]))

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
    </svg>
  )
}

// render one answer block: paragraph · inline diagram · suggestion chips
function Block({ block, onAsk }) {
  if (block.type === 'p') {
    return <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink2)', margin: '0 0 8px' }}>{block.text}</p>
  }
  if (block.type === 'diagram') {
    return (
      <div style={{ marginBottom: 8 }}>
        <TutorDiagram kind={block.key} />
        {block.caption && <div style={{ ...mono, fontSize: 10.5, color: 'var(--ink4)', lineHeight: 1.4, marginTop: 2 }}>{block.caption}</div>}
      </div>
    )
  }
  if (block.type === 'suggestions') {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '2px 0 8px' }}>
        {block.ids.map((id) => byId[id] && (
          <button key={id} onClick={() => onAsk(byId[id].q)} style={chipStyle}>{byId[id].q}</button>
        ))}
      </div>
    )
  }
  return null
}

// streamed / LLM answers arrive as plain text — render paragraphs, with a
// caret while still streaming
function TextAnswer({ text, streaming }) {
  const paras = (text || '').split(/\n\n+/).filter(Boolean)
  return (
    <div>
      {paras.map((p, i) => (
        <p key={i} style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink2)', margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>{p}</p>
      ))}
      {streaming && <span style={{ display: 'inline-block', width: 7, height: 14, background: 'var(--acc)', verticalAlign: 'text-bottom', animation: 'pulse-dot .9s ease-in-out infinite' }} />}
    </div>
  )
}

function Message({ m, onAsk }) {
  if (m.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <div style={{
          maxWidth: '85%', padding: '7px 11px', borderRadius: '10px 10px 2px 10px',
          background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontSize: 13.5, lineHeight: 1.45,
        }}>{m.text}</div>
      </div>
    )
  }
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ ...mono, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 4 }}>tutor</div>
      {m.blocks
        ? m.blocks.map((blk, i) => <Block key={i} block={blk} onAsk={onAsk} />)
        : <TextAnswer text={m.text} streaming={m.streaming} />}
    </div>
  )
}

// compact local-AI control: enable / progress / ready, shown under the header
function AIStatusBar() {
  const ai = useForge(s => s.ai)
  const enableLocalAI = useForge(s => s.enableLocalAI)
  const disableLocalAI = useForge(s => s.disableLocalAI)
  const base = { ...mono, fontSize: 10.5, letterSpacing: '.04em', display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }

  if (!ai.supported) {
    return <div style={{ ...base, color: 'var(--ink4)' }}>biblioteca offline · navegador sem WebGPU para IA local</div>
  }
  if (ai.loading) {
    return (
      <div style={{ ...base, color: 'var(--ink3)', background: 'var(--paper2)', flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
        <span>baixando modelo · {Math.round((ai.progress || 0) * 100)}%</span>
        <div style={{ height: 3, borderRadius: 2, background: 'var(--paper4)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.round((ai.progress || 0) * 100)}%`, height: '100%', background: 'var(--acc)', transition: 'width .3s' }} />
        </div>
      </div>
    )
  }
  if (ai.ready) {
    return (
      <div style={{ ...base, color: 'var(--ok2)' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ok2)' }} />IA local ativa · grátis, no navegador
        <button onClick={disableLocalAI} style={{ ...mono, fontSize: 10, marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink4)', cursor: 'pointer' }}>desativar</button>
      </div>
    )
  }
  return (
    <div style={{ ...base, color: 'var(--ink3)', background: 'var(--paper2)' }}>
      <span style={{ flex: 1 }}>perguntas abertas? ative a IA local</span>
      <button onClick={enableLocalAI} title="Baixa um modelo (~700 MB) que roda no seu navegador via WebGPU. Grátis, sem chave, sem servidor; fica em cache depois."
        style={{ ...mono, fontSize: 10.5, padding: '3px 9px', borderRadius: 4, border: '1px solid var(--acc)', background: 'transparent', color: 'var(--acc)', cursor: 'pointer' }}>ativar</button>
    </div>
  )
}

export default function AssistantChat() {
  const assistant = useForge(s => s.assistant)
  const openAssistant = useForge(s => s.openAssistant)
  const closeAssistant = useForge(s => s.closeAssistant)
  const clearAssistant = useForge(s => s.clearAssistant)
  const askAssistant = useForge(s => s.askAssistant)
  const onboarding = useForge(s => s.onboarding)
  const [text, setText] = useState('')
  const endRef = useRef(null)
  const { open, running, unread, messages } = assistant

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ block: 'end' }) }, [messages, running, open])

  const ask = (q) => { askAssistant(q); setText('') }
  const onSend = () => { const q = text.trim(); if (q) ask(q) }

  // stay out of the first-run onboarding overlay
  if (onboarding) return null

  // ── minimized: compact launcher with unread badge ─────────────────
  if (!open) {
    return (
      <button onClick={openAssistant} title="Tutor de hardware" style={{
        position: 'fixed', bottom: 18, right: 18, zIndex: 60,
        width: 48, height: 48, borderRadius: '50%', cursor: 'pointer',
        border: 'none', background: 'var(--btn-bg)', color: 'var(--btn-fg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 6px 18px rgba(14,30,51,.22)',
      }}>
        <ChatIcon />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, padding: '0 5px',
            borderRadius: 9, background: 'var(--err2)', color: '#fff', ...mono, fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--paper)',
          }}>{unread}</span>
        )}
      </button>
    )
  }

  // ── expanded: full chat panel ─────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', bottom: 18, right: 18, zIndex: 60,
      width: 340, maxWidth: 'calc(100vw - 36px)', height: 'min(72vh, 560px)',
      display: 'flex', flexDirection: 'column', background: 'var(--paper)',
      border: '1px solid var(--rule)', borderRadius: 12, overflow: 'hidden',
      boxShadow: '0 12px 36px rgba(14,30,51,.24)',
    }}>
      {/* header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', background: 'var(--navy)' }}>
        <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--rail-active-fg)', color: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ChatIcon />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--navyt)' }}>Tutor de hardware</div>
          <div style={{ ...mono, fontSize: 10, letterSpacing: '.08em', color: 'var(--navyt3)' }}>sistemas embarcados · eletrônica de satélite</div>
        </div>
        {messages.length > 0 && (
          <button onClick={clearAssistant} title="Limpar conversa" style={iconBtn}>limpar</button>
        )}
        <button onClick={closeAssistant} title="Minimizar" style={{ ...iconBtn, fontSize: 18, lineHeight: 1 }}>–</button>
      </div>

      {/* local-AI status / enable */}
      <AIStatusBar />

      {/* body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 4px', minHeight: 0 }}>
        {/* clean empty state — no pre-populated suggestion chips; just a
            quiet prompt and the input below (open clean, wait for input) */}
        {messages.length === 0 && (
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink4)', marginTop: 2 }}>
            Pergunte sobre barramentos, pinos, alimentação ou qualquer dúvida de eletrônica embarcada.
          </p>
        )}
        {messages.map((m) => <Message key={m.id} m={m} onAsk={ask} />)}
        {running && (
          <div style={{ ...mono, fontSize: 12, color: 'var(--ink4)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
            <span className="spin" style={{ display: 'block', width: 11, height: 11, border: '1.5px solid var(--ink4)', borderTopColor: 'transparent', borderRadius: '50%' }} />
            pensando…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* input */}
      <div style={{ flexShrink: 0, display: 'flex', gap: 7, padding: '9px 10px', borderTop: '1px solid var(--rule)', background: 'var(--paper2)' }}>
        <input
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSend() }}
          placeholder="escreva sua pergunta…"
          style={{
            flex: 1, padding: '8px 11px', borderRadius: 7, outline: 'none',
            border: '1px solid var(--rule)', background: 'var(--paper)',
            fontSize: 13.5, color: 'var(--ink)', fontFamily: "'Space Grotesk', sans-serif",
          }}
        />
        <button onClick={onSend} disabled={!text.trim() || running} style={{
          padding: '0 14px', borderRadius: 7, border: 'none',
          cursor: text.trim() && !running ? 'pointer' : 'default',
          background: text.trim() && !running ? 'var(--btn-bg)' : 'var(--paper4)',
          color: 'var(--btn-fg)', fontSize: 13.5, fontFamily: "'Space Grotesk', sans-serif",
        }}>→</button>
      </div>
    </div>
  )
}

const chipStyle = {
  fontSize: 12.5, padding: '6px 10px', borderRadius: 14, cursor: 'pointer',
  border: '1px solid var(--rule)', background: 'var(--paper2)', color: 'var(--ink2)',
  fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1.3,
}
const iconBtn = {
  ...mono, fontSize: 11, letterSpacing: '.04em',
  padding: '3px 7px', borderRadius: 4, cursor: 'pointer',
  border: 'none', background: 'rgba(247,239,221,.12)', color: 'var(--navyt)',
}
