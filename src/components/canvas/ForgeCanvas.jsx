import { useRef, useState, useCallback } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei'
import * as THREE from 'three'
import useForge, { STATUS } from '../../store/useForge'

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

// ── single component chip ─────────────────────────────────────────
function ComponentMesh({ id, entity, isSelected, onSelect, onDragEnd }) {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const { gl, raycaster } = useThree()
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
  const dragOffset = useRef(new THREE.Vector3())

  const { def, position, status } = entity
  const baseColor = CATEGORY_COLOR[def.category] || '#2A2A2A'
  const statusColor = STATUS_COLOR[status]
  const isScanning = status === STATUS.SCANNING

  // component size by category
  const size = def.category === 'mcu' ? [1.4, 0.18, 1.1]
             : def.category === 'power' ? [1.6, 0.16, 0.9]
             : [0.9, 0.14, 0.7]

  // ── drag ─────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e) => {
    e.stopPropagation()
    onSelect(id)
    setDragging(true)
    gl.domElement.style.cursor = 'grabbing'
    const intersect = new THREE.Vector3()
    raycaster.ray.intersectPlane(dragPlane.current, intersect)
    dragOffset.current.subVectors(new THREE.Vector3(...position), intersect)
  }, [id, position, onSelect, gl, raycaster])

  const onPointerMove = useCallback((e) => {
    if (!dragging) return
    e.stopPropagation()
    const intersect = new THREE.Vector3()
    raycaster.ray.intersectPlane(dragPlane.current, intersect)
    intersect.add(dragOffset.current)
    // snap to 0.4 grid
    intersect.x = Math.round(intersect.x / 0.4) * 0.4
    intersect.z = Math.round(intersect.z / 0.4) * 0.4
    onDragEnd(id, [intersect.x, 0, intersect.z])
  }, [dragging, id, onDragEnd, raycaster])

  const onPointerUp = useCallback((e) => {
    e.stopPropagation()
    setDragging(false)
    gl.domElement.style.cursor = 'auto'
  }, [gl])

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
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); gl.domElement.style.cursor = 'grab' }}
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

      {/* error glow halo */}
      {status === STATUS.ERR && (
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
function BusWires({ entities }) {
  const mcu = entities['esp32']
  if (!mcu) return null

  const mcuPos = new THREE.Vector3(...mcu.position)
  const lines = []

  Object.entries(entities).forEach(([id, e]) => {
    if (id === 'esp32' || !e.def.protocol || e.def.protocol === 'MCU') return
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

    lines.push(
      <primitive key={id} object={
        new THREE.Line(geo, new THREE.LineBasicMaterial({ color, linewidth: 1, transparent: true, opacity: e.status === STATUS.ERR ? 0.9 : 0.55 }))
      } />
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
  const { entities, selectedId, selectEntity, updatePosition } = useForge()

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
      <BusWires entities={entities} />

      {Object.entries(entities).map(([id, entity]) => (
        <ComponentMesh
          key={id}
          id={id}
          entity={entity}
          isSelected={selectedId === id}
          onSelect={selectEntity}
          onDragEnd={updatePosition}
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
