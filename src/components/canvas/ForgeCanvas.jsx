import { useRef, useState, useCallback, useEffect } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport, Html } from '@react-three/drei'
import * as THREE from 'three'
import useForge, { STATUS } from '../../store/useForge'
import { issuesForComponent, SOURCE_LABEL, pinSummary } from '../../mission/index.js'

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

// ── single component chip ─────────────────────────────────────────
function ComponentMesh({ id, entity, isSelected, onSelect, onDragEnd, draggable = true, issues = [] }) {
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

  // component size by category
  const size = def.category === 'mcu' ? [1.4, 0.18, 1.1]
             : def.category === 'power' ? [1.6, 0.16, 0.9]
             : [0.9, 0.14, 0.7]

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

      {/* pin row left */}
      {Array.from({ length: 4 }, (_, i) => (
        <mesh key={i} position={[-size[0]/2 - 0.06, -0.02, -size[2]/3 + i * (size[2]/3)]} castShadow>
          <boxGeometry args={[0.1, 0.06, 0.04]} />
          <meshStandardMaterial color="#8A7A40" roughness={0.3} metalness={0.9} />
        </mesh>
      ))}
      {/* pin row right */}
      {Array.from({ length: 4 }, (_, i) => (
        <mesh key={i} position={[size[0]/2 + 0.06, -0.02, -size[2]/3 + i * (size[2]/3)]} castShadow>
          <boxGeometry args={[0.1, 0.06, 0.04]} />
          <meshStandardMaterial color="#8A7A40" roughness={0.3} metalness={0.9} />
        </mesh>
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

// ── bus wires between components ─────────────────────────────────
// HONEST wiring display: a solid protocol-colored wire only when the
// user actually connected the pins; a faint dashed line otherwise
// (suggested route, not a real connection). Pin labels come from the
// real wires when connected.
function BusWires({ entities, pinMap, selectedId, wiring }) {
  const mcu = entities['esp32']
  if (!mcu) return null

  const mcuPos = new THREE.Vector3(...mcu.position)
  const lines = []

  Object.entries(entities).forEach(([id, e]) => {
    if (id === 'esp32' || !e.def.protocol || e.def.protocol === 'MCU') return
    const wired = !!wiring?.[id]?.wired
    const color = e.def.protocol === 'I2C' ? '#2B5EA7'
                : e.def.protocol === 'SPI' ? '#2A6B4A'
                : e.def.protocol === 'UART' ? '#963020'
                : '#7A736A'
    const start = mcuPos.clone().add(new THREE.Vector3(0, 0.05, 0))
    const end   = new THREE.Vector3(...e.position).add(new THREE.Vector3(0, 0.05, 0))
    const mid   = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.18, 0))

    // quadratic bezier via curve
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
    const pts   = curve.getPoints(16)
    const geo   = new THREE.BufferGeometry().setFromPoints(pts)

    let lineObj
    if (wired) {
      lineObj = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color, linewidth: 1, transparent: true, opacity: e.status === STATUS.ERR ? 0.9 : 0.6,
      }))
    } else {
      lineObj = new THREE.Line(geo, new THREE.LineDashedMaterial({
        color: '#7A736A', dashSize: 0.16, gapSize: 0.14, transparent: true, opacity: 0.3,
      }))
      lineObj.computeLineDistances()
    }

    const pins = pinSummary(pinMap?.[id] || [])
    lines.push(
      <group key={id}>
        <primitive object={lineObj} />
        {selectedId === id && (
          <Html position={[mid.x, mid.y + 0.12, mid.z]} center distanceFactor={9} zIndexRange={[5, 0]}>
            <div style={{
              fontFamily: "'Space Mono', monospace", fontSize: 8.5, whiteSpace: 'nowrap',
              color: wired ? color : '#7A736A', background: 'rgba(244,239,230,.92)', pointerEvents: 'none',
              border: `1px ${wired ? 'solid' : 'dashed'} ${wired ? color : '#ADA69E'}`,
              borderRadius: 3, padding: '1px 6px', opacity: .92,
            }}>{wired ? `${e.def.protocol} · ${pins}` : 'não conectado · rota sugerida'}</div>
          </Html>
        )}
      </group>
    )
  })
  return <>{lines}</>
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
  const { entities, selectedId, selectEntity, updatePosition, live, canvasMode } = useForge()
  const validation = live?.validation

  return (
    <Canvas
      shadows
      camera={{ fov: 45, near: 0.1, far: 100 }}
      style={{ background: '#F4EFE6' }}
      onPointerMissed={() => selectEntity(null)}
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
      <BusWires entities={entities} pinMap={live?.pins} selectedId={selectedId} wiring={live?.wiring} />

      {Object.entries(entities).map(([id, entity]) => (
        <ComponentMesh
          key={id}
          id={id}
          entity={entity}
          isSelected={selectedId === id}
          onSelect={selectEntity}
          onDragEnd={updatePosition}
          draggable={canvasMode === 'edit'}
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
