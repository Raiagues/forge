import { useRef, useState } from 'react'
import useForge from '../../store/useForge'
import { BRAINSTORM_ZONES, ZONE_BY_ID, suggestForZone, VW, VH, ZONE_RECT, CARD_W, CARD_H } from '../../mission/brainstorm.js'
import { mono, GOLD } from '../onboarding/posterKit.jsx'

// ──────────────────────────────────────────────────────────────────
// MissionBrainstorm — a spatial, zoomable/pannable ideation canvas inside
// the mission-definition flow (Prompt A Part 3). Structured FMEA/design-
// thinking zones; click a zone to drop a card, drag cards between zones,
// connect cards with arrows, and ask the (free, local) AI for zone-
// specific suggestions seeded from the mission context. Persisted in
// missionPlan.brainstorm. Aesthetic: the poster navy field with cream
// cards + colour-coded zones — technical, not a sticky-note app.
// ──────────────────────────────────────────────────────────────────

// virtual canvas space + zone layout now live in mission/brainstorm.js
// (shared with the challenge board seeding)
const zoneAt = (x, y) => BRAINSTORM_ZONES.find(z => {
  const r = ZONE_RECT[z.id]
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
})?.id

export default function MissionBrainstorm() {
  const missionPlan = useForge(s => s.missionPlan)
  const addCard = useForge(s => s.addBrainstormCard)
  const updateCard = useForge(s => s.updateBrainstormCard)
  const removeCard = useForge(s => s.removeBrainstormCard)
  const acceptDraft = useForge(s => s.acceptBrainstormDraft)
  const addArrow = useForge(s => s.addBrainstormArrow)
  const removeArrow = useForge(s => s.removeBrainstormArrow)

  const bs = missionPlan.brainstorm || { cards: [], arrows: [] }
  const cards = bs.cards
  const cardById = Object.fromEntries(cards.map(c => [c.id, c]))

  const [view, setView] = useState({ tx: 40, ty: 20, scale: 0.62 })
  const [connectFrom, setConnectFrom] = useState(null)
  const [editing, setEditing] = useState(null)
  const wrapRef = useRef(null)
  const action = useRef(null)   // { kind:'pan'|'card', id, x0,y0, ox,oy, moved }

  // client → virtual coords
  const toVirtual = (clientX, clientY) => {
    const r = wrapRef.current.getBoundingClientRect()
    return { x: (clientX - r.left - view.tx) / view.scale, y: (clientY - r.top - view.ty) / view.scale }
  }

  const ctx = {
    categories: missionPlan.objectiveCategories || [],
    cubeU: missionPlan.cubeU,
    budgetBRL: missionPlan.budgetBRL,
    teamSize: (missionPlan.team?.members || []).length,
  }

  const onWheel = (e) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    setView(v => ({ ...v, scale: Math.max(0.3, Math.min(1.6, v.scale * factor)) }))
  }

  const onBgPointerDown = (e) => {
    if (e.button !== 0) return
    action.current = { kind: 'pan', x0: e.clientX, y0: e.clientY, tx: view.tx, ty: view.ty, moved: false }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  const onCardPointerDown = (e, c) => {
    e.stopPropagation()
    if (connectFrom) { if (connectFrom !== c.id) addArrow(connectFrom, c.id); setConnectFrom(null); return }
    action.current = { kind: 'card', id: c.id, x0: e.clientX, y0: e.clientY, ox: c.x, oy: c.y, moved: false }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  const onMove = (e) => {
    const a = action.current
    if (!a) return
    const dx = e.clientX - a.x0, dy = e.clientY - a.y0
    if (Math.abs(dx) + Math.abs(dy) > 3) a.moved = true
    if (a.kind === 'pan') setView(v => ({ ...v, tx: a.tx + dx, ty: a.ty + dy }))
    else updateCard(a.id, { x: a.ox + dx / view.scale, y: a.oy + dy / view.scale })
  }
  const onUp = (e) => {
    const a = action.current
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    action.current = null
    if (!a) return
    if (a.kind === 'pan' && !a.moved) {
      // click on empty canvas inside a zone → drop a card
      const v = toVirtual(e.clientX, e.clientY)
      const z = zoneAt(v.x, v.y)
      if (z) { const id = addCard({ zone: z, x: v.x - CARD_W / 2, y: v.y - CARD_H / 2, text: '' }); setEditing(id) }
      setConnectFrom(null)
    }
    if (a.kind === 'card' && a.moved) {
      // re-assign zone by where the card center landed
      const c = useForge.getState().missionPlan.brainstorm.cards.find(x => x.id === a.id)
      if (c) { const z = zoneAt(c.x + CARD_W / 2, c.y + CARD_H / 2); if (z && z !== c.zone) updateCard(a.id, { zone: z }) }
    }
  }

  const runAI = (zoneId) => {
    const r = ZONE_RECT[zoneId]
    const sugg = suggestForZone(zoneId, ctx)
    sugg.forEach((text, i) => {
      addCard({ zone: zoneId, x: r.x + 16 + (i % 2) * (CARD_W + 12), y: r.y + 150 + Math.floor(i / 2) * (CARD_H + 12), text, draft: true })
    })
  }

  const cardCenter = (c) => ({ x: c.x + CARD_W / 2, y: c.y + CARD_H / 2 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--poster-fg)' }}>Brainstorming da missão</span>
        <span style={{ ...mono, fontSize: 11, color: 'var(--poster-fg-dim)' }}>
          clique numa zona para criar um cartão · arraste para mover · {connectFrom ? 'clique no cartão de destino para ligar' : 'use ⛓ para ligar ideias'}
        </span>
        {connectFrom && <button onClick={() => setConnectFrom(null)} style={miniBtn}>cancelar ligação</button>}
      </div>

      <div
        ref={wrapRef}
        onWheel={onWheel}
        onPointerDown={onBgPointerDown}
        style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden', borderRadius: 10, border: '1px solid var(--poster-line)', background: 'var(--poster-bg)', cursor: action.current?.kind === 'pan' ? 'grabbing' : 'default', touchAction: 'none' }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, width: VW, height: VH, transform: `translate(${view.tx}px,${view.ty}px) scale(${view.scale})`, transformOrigin: '0 0' }}>
          {/* arrows layer */}
          <svg width={VW} height={VH} style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible' }}>
            <defs>
              <marker id="bs-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
                <path d="M0,0 L8,3 L0,6 Z" fill={GOLD} />
              </marker>
            </defs>
            {bs.arrows.map(a => {
              const f = cardById[a.from], t = cardById[a.to]
              if (!f || !t) return null
              const p = cardCenter(f), q = cardCenter(t)
              return (
                <g key={a.id} style={{ pointerEvents: 'stroke', cursor: 'pointer' }} onClick={() => removeArrow(a.id)}>
                  <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={GOLD} strokeWidth={2} markerEnd="url(#bs-arrow)" opacity={0.8} />
                  <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="transparent" strokeWidth={12} />
                </g>
              )
            })}
          </svg>

          {/* zones */}
          {BRAINSTORM_ZONES.map(z => {
            const r = ZONE_RECT[z.id]
            return (
              <div key={z.id} style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: 12, border: `1.5px solid ${z.color}`, background: `${z.color}14` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: z.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--poster-fg)' }}>{z.label}</span>
                  <button onClick={(e) => { e.stopPropagation(); runAI(z.id) }} title="sugestões da IA (local, sem custo)"
                    style={{ marginLeft: 'auto', ...mono, fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: z.color, background: `${z.color}1f`, border: `1px solid ${z.color}`, borderRadius: 5, padding: '3px 8px', cursor: 'pointer' }}>
                    ✦ IA
                  </button>
                </div>
                <div style={{ ...mono, fontSize: 11, color: 'var(--poster-fg-dim)', padding: '0 12px' }}>{z.hint}</div>
              </div>
            )
          })}

          {/* cards */}
          {cards.map(c => {
            const z = ZONE_BY_ID[c.zone] || ZONE_BY_ID.ideas
            const isEditing = editing === c.id
            return (
              <div key={c.id}
                onPointerDown={(e) => onCardPointerDown(e, c)}
                onDoubleClick={(e) => { e.stopPropagation(); setEditing(c.id) }}
                style={{
                  position: 'absolute', left: c.x, top: c.y, width: CARD_W, minHeight: CARD_H,
                  borderRadius: 8, padding: '8px 9px',
                  background: c.draft ? 'rgba(244,239,230,.55)' : '#F4EFE6',
                  border: `1.5px ${c.draft ? 'dashed' : 'solid'} ${z.color}`,
                  boxShadow: connectFrom === c.id ? `0 0 0 2px ${GOLD}` : '0 2px 8px rgba(8,16,28,.35)',
                  cursor: 'grab', display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                {isEditing ? (
                  <textarea autoFocus value={c.text} onChange={(e) => updateCard(c.id, { text: e.target.value })}
                    onPointerDown={(e) => e.stopPropagation()} onBlur={() => setEditing(null)}
                    placeholder="escreva a ideia…"
                    style={{ width: '100%', minHeight: 44, resize: 'none', border: 'none', outline: 'none', background: 'transparent', color: '#142231', fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, lineHeight: 1.35 }} />
                ) : (
                  <div style={{ color: '#142231', fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, lineHeight: 1.35, flex: 1, wordBreak: 'break-word' }}>
                    {c.text || <span style={{ color: '#7A736A' }}>cartão vazio — clique 2× para editar</span>}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {c.draft ? (
                    <>
                      <button onPointerDown={(e) => e.stopPropagation()} onClick={() => acceptDraft(c.id)} style={{ ...cardBtn, color: 'var(--ok2)', borderColor: 'var(--ok2)' }}>✓ aceitar</button>
                      <button onPointerDown={(e) => e.stopPropagation()} onClick={() => removeCard(c.id)} style={{ ...cardBtn, color: 'var(--err2)', borderColor: 'var(--err2)' }}>descartar</button>
                    </>
                  ) : (
                    <>
                      <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setConnectFrom(c.id)} title="ligar a outra ideia" style={cardIconBtn}>⛓</button>
                      <span style={{ flex: 1 }} />
                      <button onPointerDown={(e) => e.stopPropagation()} onClick={() => removeCard(c.id)} title="remover" style={cardIconBtn}>×</button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* zoom controls */}
        <div style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', gap: 6 }}>
          <button onClick={() => setView(v => ({ ...v, scale: Math.min(1.6, v.scale * 1.15) }))} style={zoomBtn}>+</button>
          <button onClick={() => setView(v => ({ ...v, scale: Math.max(0.3, v.scale / 1.15) }))} style={zoomBtn}>−</button>
          <button onClick={() => setView({ tx: 40, ty: 20, scale: 0.62 })} style={{ ...zoomBtn, width: 'auto', padding: '0 10px', fontSize: 11 }}>ajustar</button>
        </div>
      </div>
    </div>
  )
}

const miniBtn = { ...mono, fontSize: 11, color: GOLD, background: 'none', border: '1px solid var(--poster-line)', borderRadius: 5, padding: '3px 9px', cursor: 'pointer' }
const cardBtn = { fontFamily: "'Space Mono', monospace", fontSize: 10.5, letterSpacing: '.04em', textTransform: 'uppercase', background: 'transparent', border: '1px solid', borderRadius: 4, padding: '2px 7px', cursor: 'pointer' }
const cardIconBtn = { fontFamily: "'Space Mono', monospace", fontSize: 13, color: '#5B6873', background: 'transparent', border: 'none', cursor: 'pointer', lineHeight: 1, padding: 0 }
const zoomBtn = { width: 30, height: 30, borderRadius: 6, border: '1px solid var(--poster-line)', background: 'var(--poster-card)', color: 'var(--poster-fg)', cursor: 'pointer', fontSize: 16, fontFamily: "'Space Mono', monospace" }
