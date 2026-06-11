import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, Html } from '@react-three/drei'
import * as THREE from 'three'
import useForge, { STATUS } from '../../store/useForge'
import { issuesForComponent, SOURCE_LABEL, COMPONENT_PINS } from '../../mission/index.js'
import { footprint } from './pinLayout.js'
import { track } from '../../lib/analytics.js'

// ── status → color map ────────────────────────────────────────────
const STATUS_COLOR = {
  [STATUS.OK]:       '#3A9060',
  [STATUS.WARN]:     '#C8831A',
  [STATUS.ERR]:      '#C04030',
  [STATUS.SCANNING]: '#4A7DD4',
  [STATUS.IDLE]:     '#7A736A',
}

const CATEGORY_COLOR = {
  mcu:     '#2B3F7A',
  sensor:  '#1E3A28',
  comm:    '#2A1E3A',
  storage: '#1E2814',
  power:   '#2A1E0A',
}

// ── PCB board ─────────────────────────────────────────────────────
function PCBBoard() {
  return (
    <group>
      {/* main board */}
      <mesh receiveShadow position={[0, -0.12, 0]}>
        <boxGeometry args={[8.5, 0.12, 6.5]} />
        <meshStandardMaterial color="#1E3A1E" roughness={0.8} metalness={0.1} />
      </mesh>
      {/* board edge highlight */}
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[8.52, 0.13, 6.52]} />
        <meshStandardMaterial color="#2A5020" roughness={0.9} metalness={0.0} transparent opacity={0.4} />
      </mesh>
      {/* silkscreen grid dots */}
      {Array.from({ length: 7 }, (_, i) =>
        Array.from({ length: 5 }, (_, j) => (
          <mesh key={`${i}-${j}`} position={[-3 + i * 1, -0.055, -2 + j * 1]}>
            <cylinderGeometry args={[0.025, 0.025, 0.01, 6]} />
            <meshStandardMaterial color="#2A5020" roughness={1} />
          </mesh>
        ))
      )}
      {/* mounting holes */}
      {[[-3.8,-2.8],[3.8,-2.8],[-3.8,2.8],[3.8,2.8]].map(([x,z], i) => (
        <mesh key={i} position={[x, -0.05, z]}>
          <cylinderGeometry args={[0.12, 0.12, 0.16, 12]} />
          <meshStandardMaterial color="#0A1A0A" roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

// ── inline validation badge (floats above a chip) ─────────────────
// Shows WHERE the issue comes from (competition / objective / budget /
// comm / dependency / wiring) directly on the affected hardware.
function IssueBadge({ issues, size }) {
  if (!issues.length) return null
  const worst = issues.some(i => i.severity === 'error') ? 'error' : 'warn'
  const color = worst === 'error' ? '#C04030' : '#C8831A'
  const first = issues[0]
  return (
    <Html position={[0, size[1] + 0.55, 0]} center distanceFactor={9} zIndexRange={[20, 0]}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: 'rgba(244,239,230,.95)', border: `1px solid ${color}`,
        borderLeft: `3px solid ${color}`, borderRadius: 4,
        padding: '3px 7px', pointerEvents: 'none', whiteSpace: 'nowrap',
        fontFamily: "'Space Mono', monospace", fontSize: 9,
        boxShadow: '0 2px 8px rgba(26,24,20,.12)',
      }}>
        <span style={{
          fontSize: 7, letterSpacing: '.08em', textTransform: 'uppercase',
          color: '#F4EFE6', background: color, borderRadius: 2, padding: '1px 4px',
        }}>{SOURCE_LABEL[first.source] || first.source}</span>
        <span style={{ color: '#1A1814' }}>
          {first.title}{issues.length > 1 ? ` +${issues.length - 1}` : ''}
        </span>
      </div>
    </Html>
  )
}

// ── pin-accurate header pin (from COMPONENT_PINS) ─────────────────
// Hover identifies the pin (silkscreen label + role note); click
// selects it — in route mode that starts/closes a trace.
function PinMesh({ compId, pin, pos, onPinClick, isPending, isConnected }) {
  const [hov, setHov] = useState(false)
  const { gl } = useThree()
  const d = pin
  return (
    <group position={[pos.x, pos.y, pos.z]}>
      {/* invisible fat hit target — header pins are tiny */}
      <mesh
        visible={false}
        onClick={(e) => { e.stopPropagation(); onPinClick?.(compId, d.id) }}
        onPointerDown={(e) => { if (onPinClick) e.stopPropagation() }}
        onPointerOver={(e) => { e.stopPropagation(); setHov(true); gl.domElement.style.cursor = 'crosshair' }}
        onPointerOut={() => { setHov(false); gl.domElement.style.cursor = 'auto' }}
      >
        <boxGeometry args={[0.15, 0.22, 0.15]} />
      </mesh>
      {/* header pin */}
      <mesh castShadow>
        <boxGeometry args={[0.06, 0.12, 0.06]} />
        <meshStandardMaterial
          color={isPending ? '#4A7DD4' : hov ? '#D4B860' : '#8A7A40'}
          roughness={0.3} metalness={0.9}
          emissive={isPending ? '#2B5EA7' : '#000000'} emissiveIntensity={isPending ? 0.6 : 0}
        />
      </mesh>
      {/* solder pad on the board surface — copper when a trace lands here */}
      <mesh position={[0, -0.034, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.028, 0.055, 16]} />
        <meshStandardMaterial color={isConnected ? '#C98E3F' : '#8A8378'} roughness={0.4} metalness={0.7} />
      </mesh>
      {(hov || isPending) && (
        <Html position={[0, 0.26, 0]} center distanceFactor={7} zIndexRange={[30, 0]}>
          <div style={{
            fontFamily: "'Space Mono', monospace", fontSize: 9, whiteSpace: 'nowrap', pointerEvents: 'none',
            color: '#1A1814', background: 'rgba(244,239,230,.95)', border: '1px solid rgba(26,24,20,.18)',
            borderRadius: 3, padding: '2px 6px',
          }}>
            <b>{d.label || d.id}</b>{d.note ? <span style={{ color: '#7A736A' }}> · {d.note}</span> : null}
          </div>
        </Html>
      )}
    </group>
  )
}

// ── single component chip ─────────────────────────────────────────
function ComponentMesh({ id, entity, isSelected, onSelect, onDragEnd, draggable = true, issues = [], onPinClick, pendingPin, connectedPins }) {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const { gl, controls } = useThree()
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
  const dragOffset = useRef(new THREE.Vector3())

  const { def, position, status } = entity
  const baseColor = CATEGORY_COLOR[def.category] || '#2A2A2A'
  // validation issues override the visual status so problems read inline
  const hasErr  = issues.some(i => i.severity === 'error')
  const hasWarn = issues.some(i => i.severity === 'warn')
  const effStatus = status === STATUS.SCANNING ? status
                  : hasErr ? STATUS.ERR : hasWarn ? STATUS.WARN : status
  const statusColor = STATUS_COLOR[effStatus]
  const isScanning = status === STATUS.SCANNING

  // pin-accurate footprint derived from the shared pin catalog
  const fp = footprint(id, def)
  const { size } = fp
  const pinDefs = COMPONENT_PINS[id] || []

  // ── drag ─────────────────────────────────────────────────────────
  // A drag that starts ON a chip must translate the chip, never orbit
  // the camera. R3F's stopPropagation does not reach OrbitControls (it
  // listens on the canvas DOM element directly), so the controls are
  // explicitly disabled for the duration of the drag. Pointer capture
  // keeps move/up events flowing even when the cursor leaves the mesh.
  const onPointerDown = useCallback((e) => {
    e.stopPropagation()
    onSelect(id)
    if (!draggable) return                // navigate/route modes: click selects, drag orbits
    if (e.button !== 0) return            // right/middle button → camera pan stays free
    e.target.setPointerCapture(e.pointerId)
    if (controls) controls.enabled = false
    setDragging(true)
    gl.domElement.style.cursor = 'grabbing'
    const intersect = new THREE.Vector3()
    e.ray.intersectPlane(dragPlane.current, intersect)
    dragOffset.current.subVectors(new THREE.Vector3(...position), intersect)
  }, [id, position, onSelect, gl, controls, draggable])

  const onPointerMove = useCallback((e) => {
    if (!dragging) return
    e.stopPropagation()
    const intersect = new THREE.Vector3()
    if (!e.ray.intersectPlane(dragPlane.current, intersect)) return
    intersect.add(dragOffset.current)
    // snap to 0.4 grid
    intersect.x = Math.round(intersect.x / 0.4) * 0.4
    intersect.z = Math.round(intersect.z / 0.4) * 0.4
    onDragEnd(id, [intersect.x, 0, intersect.z])
  }, [dragging, id, onDragEnd])

  const onPointerUp = useCallback((e) => {
    if (!dragging) return
    e.stopPropagation()
    e.target.releasePointerCapture(e.pointerId)
    if (controls) controls.enabled = true
    setDragging(false)
    gl.domElement.style.cursor = 'auto'
  }, [gl, controls, dragging])

  // safety: never leave the camera locked if the component unmounts mid-drag
  useEffect(() => () => { if (controls) controls.enabled = true }, [controls])

  useFrame(() => {
    if (!meshRef.current) return
    // smooth hover lift
    const targetY = hovered || isSelected ? 0.18 : 0
    meshRef.current.position.y += (targetY - meshRef.current.position.y) * 0.18
  })

  return (
    <group
      position={position}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); gl.domElement.style.cursor = draggable ? 'grab' : 'pointer' }}
      onPointerOut={() => { setHovered(false); if (!dragging) gl.domElement.style.cursor = 'auto' }}
    >
      {/* selection ring */}
      {isSelected && (
        <mesh position={[0, -0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[size[0] * 0.72, size[0] * 0.82, 32]} />
          <meshBasicMaterial color="#4A7DD4" transparent opacity={0.7} />
        </mesh>
      )}

      {/* chip body */}
      <mesh ref={meshRef} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={baseColor}
          roughness={0.45}
          metalness={0.55}
          emissive={isSelected ? '#1A3060' : '#000000'}
          emissiveIntensity={isSelected ? 0.3 : 0}
        />
      </mesh>

      {/* status LED */}
      <StatusLED position={[size[0]*0.38, size[1]*0.5+0.06, size[2]*0.38]} color={statusColor} scanning={isScanning} />

      {/* real pins from the shared catalog — exact count and order */}
      {pinDefs.map((p) => fp.pins[p.id] && (
        <PinMesh
          key={p.id} compId={id} pin={p} pos={fp.pins[p.id]}
          onPinClick={onPinClick}
          isPending={pendingPin?.comp === id && pendingPin?.pin === p.id}
          isConnected={!!connectedPins?.has?.(`${id}.${p.id}`)}
        />
      ))}

      {/* label billboard - always faces camera */}
      <ChipLabel text={def.label} size={size} status={status} />

      {/* inline validation feedback */}
      <IssueBadge issues={issues} size={size} />

      {/* friendly name on hover/selection — human meaning first */}
      {(hovered || isSelected) && (
        <Html position={[0, -0.18, size[2] / 2 + 0.32]} center distanceFactor={9} zIndexRange={[10, 0]}>
          <div style={{
            fontFamily: "'Space Mono', monospace", fontSize: 9, whiteSpace: 'nowrap',
            color: '#3E3A34', background: 'rgba(244,239,230,.9)', pointerEvents: 'none',
            border: '1px solid rgba(26,24,20,.09)', borderRadius: 3, padding: '2px 6px',
          }}>
            {def.friendly || def.label}<span style={{ color: '#ADA69E' }}> · {def.label}</span>
          </div>
        </Html>
      )}

      {/* error glow halo */}
      {(effStatus === STATUS.ERR) && (
        <pointLight position={[0, 0.3, 0]} color="#C04030" intensity={0.8} distance={1.8} />
      )}
    </group>
  )
}

// ── pulsing status LED ────────────────────────────────────────────
function StatusLED({ position, color, scanning }) {
  const ref = useRef()
  useFrame(({ clock }) => {
    if (!ref.current) return
    if (scanning) {
      ref.current.intensity = 0.4 + Math.sin(clock.elapsedTime * 8) * 0.35
    } else {
      ref.current.intensity = 0.5 + Math.sin(clock.elapsedTime * 2) * 0.15
    }
  })
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} roughness={0.2} />
      </mesh>
      <pointLight ref={ref} color={color} intensity={0.5} distance={0.9} />
    </group>
  )
}

// ── chip text label ───────────────────────────────────────────────
function ChipLabel({ size, status }) {
  return (
    <group position={[0, size[1]/2 + 0.01, 0]} rotation={[-Math.PI/2, 0, 0]}>
      <mesh>
        <planeGeometry args={[size[0]*0.85, 0.22]} />
        <meshBasicMaterial color={CATEGORY_COLOR[status] || '#1A2A1A'} transparent opacity={0} />
      </mesh>
    </group>
  )
}

// ── PCB traces on the board surface ───────────────────────────────
// Every trace is a REAL wire from the store (same array the 2D
// schematic and the firmware generator use). Geometry is re-derived
// from the live pin positions each render, so traces FOLLOW their
// components when these are moved (chosen behavior: stretch, never
// detach — consistent with the 2D view). Routing is a classic 45°
// dogleg on the board plane, rendered as flat copper segments.
const TRACE_Y = -0.048   // just above the board top (-0.06) and silkscreen

// 45° dogleg: diagonal first, then axis-aligned to the target
function tracePoints(a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1]
  const d = Math.min(Math.abs(dx), Math.abs(dz))
  const m = [a[0] + Math.sign(dx) * d, a[1] + Math.sign(dz) * d]
  const pts = [a]
  if (d > 1e-3) pts.push(m)
  if (Math.abs(m[0] - b[0]) > 1e-3 || Math.abs(m[1] - b[1]) > 1e-3) pts.push(b)
  if (pts.length === 1) pts.push(b)
  return pts
}

function TraceSegment({ a, b, color, width = 0.038, y = TRACE_Y, opacity = 1 }) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (len < 1e-4) return null
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0])
  return (
    <mesh position={[(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2]} rotation={[0, -angle, 0]}>
      <boxGeometry args={[len, 0.012, width]} />
      <meshStandardMaterial color={color} roughness={0.35} metalness={0.8} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  )
}

const TRACE_COPPER = '#C98E3F'

function Trace({ from, to, issue, selected, onClick }) {
  const color = selected ? '#4A7DD4'
    : issue?.severity === 'error' ? '#C04030'
    : issue ? '#C8831A'
    : TRACE_COPPER
  const pts = tracePoints(from, to)
  const segs = pts.slice(1).map((p, i) => [pts[i], p])
  const mid = pts[Math.floor(pts.length / 2)]
  return (
    <group onClick={onClick}>
      {segs.map(([a, b], i) => (
        <group key={i}>
          <TraceSegment a={a} b={b} color={color} />
          {/* invisible fat hit volume so the thin trace is clickable */}
          <mesh visible={false}
            position={[(a[0] + b[0]) / 2, TRACE_Y, (a[1] + b[1]) / 2]}
            rotation={[0, -Math.atan2(b[1] - a[1], b[0] - a[0]), 0]}>
            <boxGeometry args={[Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.01), 0.1, 0.2]} />
          </mesh>
        </group>
      ))}
      {(selected || issue) && (
        <Html position={[mid[0], TRACE_Y + 0.14, mid[1]]} center distanceFactor={9} zIndexRange={[15, 0]}>
          <div style={{
            fontFamily: "'Space Mono', monospace", fontSize: 8.5, whiteSpace: 'nowrap', pointerEvents: 'none',
            color: issue ? (issue.severity === 'error' ? '#C04030' : '#C8831A') : '#4A7DD4',
            background: 'rgba(244,239,230,.94)', borderRadius: 3, padding: '1px 6px',
            border: `1px ${issue ? 'dashed' : 'solid'} ${issue ? (issue.severity === 'error' ? '#C04030' : '#C8831A') : '#4A7DD4'}`,
          }}>{issue ? issue.title : 'trilha selecionada · Delete remove'}</div>
        </Html>
      )}
    </group>
  )
}

// All traces + honest suggestions. A faint dashed line still hints the
// suggested route for placed-but-unwired sensors (never solid — only
// real wires render as copper).
function Traces3D({ entities, wires, wireIssues, selWire, onSelectWire, wiring, selectedId }) {
  const fps = {}
  const pinXZ = (end) => {
    const e = entities[end.comp]
    if (!e) return null
    fps[end.comp] = fps[end.comp] || footprint(end.comp, e.def)
    const p = fps[end.comp].pins[end.pin]
    return p ? [e.position[0] + p.x, e.position[2] + p.z] : null
  }

  const mcu = entities['esp32']
  return (
    <group>
      {wires.map((w, i) => {
        const a = pinXZ(w.from), b = pinXZ(w.to)
        if (!a || !b) return null
        return (
          <Trace key={i} from={a} to={b} issue={wireIssues[i]} selected={selWire === i}
            onClick={(e) => { e.stopPropagation(); onSelectWire(selWire === i ? null : i) }} />
        )
      })}
      {/* suggested (not real) routes for unwired sensors */}
      {mcu && Object.entries(entities).map(([id, e]) => {
        if (id === 'esp32' || !COMPONENT_PINS[id] || wiring?.[id]?.wired) return null
        const geo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(mcu.position[0], TRACE_Y, mcu.position[2]),
          new THREE.Vector3(e.position[0], TRACE_Y, e.position[2]),
        ])
        const line = new THREE.Line(geo, new THREE.LineDashedMaterial({
          color: '#7A736A', dashSize: 0.16, gapSize: 0.14, transparent: true, opacity: 0.35,
        }))
        line.computeLineDistances()
        const mid = [(mcu.position[0] + e.position[0]) / 2, (mcu.position[2] + e.position[2]) / 2]
        return (
          <group key={id}>
            <primitive object={line} />
            {selectedId === id && (
              <Html position={[mid[0], TRACE_Y + 0.14, mid[1]]} center distanceFactor={9} zIndexRange={[5, 0]}>
                <div style={{
                  fontFamily: "'Space Mono', monospace", fontSize: 8.5, whiteSpace: 'nowrap',
                  color: '#7A736A', background: 'rgba(244,239,230,.92)', pointerEvents: 'none',
                  border: '1px dashed #ADA69E', borderRadius: 3, padding: '1px 6px', opacity: .92,
                }}>não conectado · rota sugerida</div>
              </Html>
            )}
          </group>
        )
      })}
    </group>
  )
}

// Live preview of the trace being drawn (route mode, after the first
// pin click). Cursor tracking lives HERE so pointermove only re-renders
// this subtree, never the whole canvas.
function RoutePreview({ from }) {
  const [cursor, setCursor] = useState(null)
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, TRACE_Y, 0]}
        onPointerMove={(e) => setCursor([e.point.x, e.point.z])}>
        <planeGeometry args={[40, 40]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {cursor && tracePoints(from, cursor).slice(1).map((p, i, arr) => (
        <TraceSegment key={i} a={i === 0 ? from : arr[i - 1]} b={p} color="#4A7DD4" opacity={0.5} y={TRACE_Y + 0.004} />
      ))}
    </group>
  )
}

// ── Camera that starts isometric ─────────────────────────────────
function IsoCamera() {
  const { camera } = useThree()
  const set = useRef(false)
  useFrame(() => {
    if (set.current) return
    camera.position.set(6, 7, 8)
    camera.lookAt(0, 0, 0)
    set.current = true
  })
  return null
}

// ── Main canvas ───────────────────────────────────────────────────
export default function ForgeCanvas() {
  const {
    entities, selectedId, selectEntity, updatePosition, live, canvasMode,
    wires, addWire, removeWire,
  } = useForge()
  const validation = live?.validation
  const routing = canvasMode === 'route'

  // ── trace routing (route mode): click pin → click pin = real wire ─
  // Same semantics as the 2D schematic; the wire lands in the shared
  // store array, so validation, statuses and codegen see it instantly.
  const [pendingPin, setPendingPin] = useState(null)
  const [selWire, setSelWire] = useState(null)

  const onPinClick = useCallback((comp, pin) => {
    setSelWire(null)
    if (!pendingPin) {
      track('pin_select', { target: `${comp}.${pin}` })
      setPendingPin({ comp, pin })
    } else if (pendingPin.comp === comp && pendingPin.pin === pin) {
      setPendingPin(null)                       // same pin deselects
    } else {
      addWire(pendingPin, { comp, pin })
      setPendingPin(null)
    }
  }, [addWire, pendingPin])

  // leaving route mode never strands an in-progress trace
  useEffect(() => { if (!routing) { setPendingPin(null); setSelWire(null) } }, [routing])
  // wires re-index after removal — drop stale selection
  useEffect(() => { if (selWire != null && selWire >= wires.length) setSelWire(null) }, [wires.length, selWire])

  // Esc cancels the pending trace / deselects · Delete removes the trace
  useEffect(() => {
    if (!routing) return
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape') { setPendingPin(null); setSelWire(null) }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selWire != null) {
        e.preventDefault()
        removeWire(selWire)
        setSelWire(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [routing, selWire, removeWire])

  // per-trace validation issue (same wireIndex mapping as the 2D view)
  const wireIssues = useMemo(() => {
    const map = {}
    ;(validation?.issues || []).forEach(i => {
      if (i.source === 'wiring' && i.wireIndex != null && !map[i.wireIndex]) map[i.wireIndex] = i
    })
    return map
  }, [validation])

  // pins that have at least one trace landing on them (copper pads)
  const connectedPins = useMemo(() => {
    const s = new Set()
    wires.forEach(w => { s.add(`${w.from.comp}.${w.from.pin}`); s.add(`${w.to.comp}.${w.to.pin}`) })
    return s
  }, [wires])

  // world XZ of the pending pin (preview start)
  const pendingXZ = useMemo(() => {
    if (!pendingPin) return null
    const e = entities[pendingPin.comp]
    if (!e) return null
    const p = footprint(pendingPin.comp, e.def).pins[pendingPin.pin]
    return p ? [e.position[0] + p.x, e.position[2] + p.z] : null
  }, [pendingPin, entities])

  return (
    <Canvas
      shadows
      camera={{ fov: 45, near: 0.1, far: 100 }}
      style={{ background: '#F4EFE6' }}
      onPointerMissed={() => { selectEntity(null); setPendingPin(null); setSelWire(null) }}
    >
      <IsoCamera />

      {/* lighting */}
      <ambientLight intensity={0.55} color="#EDE8DF" />
      <directionalLight
        position={[6, 10, 6]} intensity={1.1} castShadow
        shadow-mapSize={[1024, 1024]}
        color="#FFF8F0"
      />
      <directionalLight position={[-4, 4, -4]} intensity={0.3} color="#C8D8F0" />
      <pointLight position={[0, 5, 0]} intensity={0.2} color="#FFFFFF" />

      {/* grid */}
      <Grid
        position={[0, -0.062, 0]}
        args={[12, 12]}
        cellSize={0.4}
        cellThickness={0.4}
        cellColor="#2A5020"
        sectionSize={2}
        sectionThickness={0.8}
        sectionColor="#3A6A30"
        fadeDistance={18}
        fadeStrength={1}
        infiniteGrid={false}
      />

      <PCBBoard />
      <Traces3D
        entities={entities} wires={wires} wireIssues={wireIssues}
        selWire={selWire} onSelectWire={setSelWire}
        wiring={live?.wiring} selectedId={selectedId}
      />
      {routing && pendingXZ && <RoutePreview from={pendingXZ} />}

      {Object.entries(entities).map(([id, entity]) => (
        <ComponentMesh
          key={id}
          id={id}
          entity={entity}
          isSelected={selectedId === id}
          onSelect={selectEntity}
          onDragEnd={updatePosition}
          draggable={canvasMode === 'edit'}
          onPinClick={routing ? onPinClick : undefined}
          pendingPin={pendingPin}
          connectedPins={connectedPins}
          issues={issuesForComponent(validation, id)}
        />
      ))}

      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableRotate
        panSpeed={0.8}
        zoomSpeed={0.9}
        rotateSpeed={0.5}
        minDistance={3}
        maxDistance={22}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, 0, 0]}
      />

      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport axisColors={['#C04030', '#3A9060', '#2B5EA7']} labelColor="#1A1814" />
      </GizmoHelper>
    </Canvas>
  )
}
