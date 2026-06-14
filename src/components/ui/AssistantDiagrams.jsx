// ──────────────────────────────────────────────────────────────────
// AssistantDiagrams — inline schematic illustrations for the AI tutor.
// The pure engine (src/lib/assistant.js) returns a diagram KEY; this maps
// each key to a small SVG so the answer can show a concept, not just
// describe it. Themed with the same CSS tokens as the rest of GuiaSat so
// the drawings read on both paper and midnight backgrounds.
// ──────────────────────────────────────────────────────────────────

const mono = "'Space Mono', monospace"
const INK = 'var(--ink)'
const DIM = 'var(--ink4)'
const WIRE = 'var(--ink3)'
const ACC = 'var(--acc)'
const OK = 'var(--ok2)'
const WARN = 'var(--warn2)'

// shared chip box
function Box({ x, y, w, h, label }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="4" fill="var(--paper2)" stroke={WIRE} strokeWidth="1.2" />
      <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontFamily={mono} fontSize="10" fontWeight="700" fill={INK}>{label}</text>
    </g>
  )
}
function Label({ x, y, children, color = DIM, anchor = 'start' }) {
  return <text x={x} y={y} textAnchor={anchor} fontFamily={mono} fontSize="9" fill={color}>{children}</text>
}
// little zig-zag resistor (horizontal=false → vertical)
function Resistor({ x, y, len = 22, vertical = true }) {
  const pts = vertical
    ? `${x},${y} ${x - 4},${y + 3} ${x + 4},${y + 8} ${x - 4},${y + 13} ${x + 4},${y + 18} ${x},${y + len}`
    : `${x},${y} ${x + 3},${y - 4} ${x + 8},${y + 4} ${x + 13},${y - 4} ${x + 18},${y + 4} ${x + len},${y}`
  return <polyline points={pts} fill="none" stroke={ACC} strokeWidth="1.4" />
}

function I2CBus() {
  return (
    <svg viewBox="0 0 300 150" width="100%" style={{ display: 'block' }}>
      <Label x={10} y={16} color={WARN}>3V3</Label>
      <line x1="30" y1="12" x2="290" y2="12" stroke={WARN} strokeWidth="1.2" />
      {/* pull-ups */}
      <Resistor x={70} y={12} len={26} />
      <Resistor x={95} y={12} len={48} />
      <Label x={104} y={30} color={ACC}>Rp</Label>
      {/* MCU */}
      <Box x={12} y={56} w={64} h={56} label="ESP32" />
      {/* devices */}
      <Box x={150} y={44} w={58} h={32} label="BMP280" />
      <Box x={150} y={92} w={58} h={32} label="MPU6050" />
      {/* SDA / SCL buses */}
      <line x1="76" y1="70" x2="290" y2="70" stroke={INK} strokeWidth="1.4" />
      <line x1="76" y1="100" x2="290" y2="100" stroke={INK} strokeWidth="1.4" />
      <Label x={250} y={66}>SDA (21)</Label>
      <Label x={250} y={116}>SCL (22)</Label>
      {/* drops to devices */}
      <line x1="70" y1="70" x2="70" y2="38" stroke={WARN} strokeWidth="1" opacity="0.5" />
      <line x1="95" y1="100" x2="95" y2="60" stroke={WARN} strokeWidth="1" opacity="0.5" />
      <line x1="179" y1="76" x2="179" y2="70" stroke={INK} strokeWidth="1" />
      <line x1="179" y1="92" x2="179" y2="70" stroke={INK} strokeWidth="1" />
    </svg>
  )
}

function SPIBus() {
  const lines = [
    { y: 50, label: 'MOSI', dir: 1 },
    { y: 68, label: 'MISO', dir: -1 },
    { y: 86, label: 'SCK', dir: 1 },
    { y: 104, label: 'CS', dir: 1 },
  ]
  return (
    <svg viewBox="0 0 300 130" width="100%" style={{ display: 'block' }}>
      <Box x={12} y={44} w={72} h={68} label="mestre" />
      <Box x={208} y={44} w={80} h={68} label="escravo" />
      {lines.map((l) => (
        <g key={l.label}>
          <line x1="84" y1={l.y} x2="208" y2={l.y} stroke={INK} strokeWidth="1.3" />
          <polygon points={l.dir === 1 ? `200,${l.y - 3} 208,${l.y} 200,${l.y + 3}` : `92,${l.y - 3} 84,${l.y} 92,${l.y + 3}`} fill={ACC} />
          <Label x={120} y={l.y - 4}>{l.label}</Label>
        </g>
      ))}
    </svg>
  )
}

function UARTCross() {
  return (
    <svg viewBox="0 0 300 120" width="100%" style={{ display: 'block' }}>
      <Box x={12} y={36} w={76} h={56} label="ESP32" />
      <Box x={212} y={36} w={76} h={56} label="NEO-6M" />
      <Label x={92} y={54}>TX2(17)</Label>
      <Label x={92} y={86}>RX2(16)</Label>
      <Label x={208} y={54} anchor="end">RX</Label>
      <Label x={208} y={86} anchor="end">TX</Label>
      {/* crossing wires */}
      <path d="M88 58 C 150 58, 150 80, 212 80" fill="none" stroke={OK} strokeWidth="1.6" />
      <path d="M88 80 C 150 80, 150 58, 212 58" fill="none" stroke={ACC} strokeWidth="1.6" />
      <text x="150" y="108" textAnchor="middle" fontFamily={mono} fontSize="9" fill={DIM}>TX → RX · RX → TX (cruzado)</text>
    </svg>
  )
}

function AnalogDigital() {
  // analog sine + digital square
  let sine = 'M10 40'
  for (let x = 10; x <= 140; x += 4) sine += ` L${x} ${40 - Math.sin((x - 10) / 12) * 22}`
  return (
    <svg viewBox="0 0 300 110" width="100%" style={{ display: 'block' }}>
      <Label x={10} y={14}>analógico (contínuo)</Label>
      <path d={sine} fill="none" stroke={ACC} strokeWidth="1.6" />
      <Label x={165} y={14}>digital (0/1)</Label>
      <polyline points="160,62 185,62 185,30 215,30 215,62 245,62 245,30 280,30" fill="none" stroke={OK} strokeWidth="1.6" />
      <line x1="155" y1="86" x2="290" y2="86" stroke={DIM} strokeWidth="0.8" strokeDasharray="3 3" />
      <Label x={250} y={98}>0 / 3,3V</Label>
    </svg>
  )
}

function PullUp() {
  return (
    <svg viewBox="0 0 300 130" width="100%" style={{ display: 'block' }}>
      <Label x={120} y={16} color={WARN}>3V3</Label>
      <line x1="60" y1="20" x2="240" y2="20" stroke={WARN} strokeWidth="1.2" />
      <Resistor x={150} y={20} len={34} />
      <Label x={158} y={42} color={ACC}>pull-up</Label>
      <line x1="150" y1="54" x2="150" y2="78" stroke={INK} strokeWidth="1.3" />
      <circle cx="150" cy="78" r="3" fill={INK} />
      <Label x={158} y={82}>linha de sinal</Label>
      <Box x={108} y={92} w={84} h={28} label="open-drain" />
      <line x1="150" y1="120" x2="150" y2="128" stroke={WIRE} strokeWidth="1.3" />
      <line x1="140" y1="128" x2="160" y2="128" stroke={WIRE} strokeWidth="1.6" />
      <Label x={196} y={110}>puxa p/ GND</Label>
    </svg>
  )
}

function PWM() {
  const wave = (y, duty) => {
    let p = `M10 ${y}`
    for (let i = 0; i < 4; i++) {
      const x0 = 10 + i * 68
      const xh = x0 + 68 * duty
      p += ` L${x0} ${y - 18} L${xh} ${y - 18} L${xh} ${y} L${x0 + 68} ${y}`
    }
    return p
  }
  return (
    <svg viewBox="0 0 300 130" width="100%" style={{ display: 'block' }}>
      <path d={wave(36, 0.25)} fill="none" stroke={ACC} strokeWidth="1.5" />
      <Label x={282} y={30} anchor="end" color={DIM}>25%</Label>
      <path d={wave(76, 0.5)} fill="none" stroke={OK} strokeWidth="1.5" />
      <Label x={282} y={70} anchor="end" color={DIM}>50%</Label>
      <path d={wave(116, 0.75)} fill="none" stroke={WARN} strokeWidth="1.5" />
      <Label x={282} y={110} anchor="end" color={DIM}>75%</Label>
    </svg>
  )
}

function LogicLevels() {
  return (
    <svg viewBox="0 0 300 130" width="100%" style={{ display: 'block' }}>
      {/* 3.3V column */}
      <rect x="50" y="20" width="50" height="90" fill="none" stroke={WIRE} strokeWidth="1" />
      <rect x="50" y="20" width="50" height="24" fill={OK} opacity="0.25" />
      <rect x="50" y="86" width="50" height="24" fill={DIM} opacity="0.2" />
      <Label x={75} y={16} anchor="middle">3,3V</Label>
      <Label x={104} y={34}>alto</Label>
      <Label x={104} y={104}>baixo</Label>
      {/* 5V column */}
      <rect x="200" y="8" width="50" height="102" fill="none" stroke={WIRE} strokeWidth="1" />
      <rect x="200" y="8" width="50" height="30" fill={WARN} opacity="0.25" />
      <rect x="200" y="86" width="50" height="24" fill={DIM} opacity="0.2" />
      <Label x={225} y={4} anchor="middle">5V</Label>
      <text x="150" y="124" textAnchor="middle" fontFamily={mono} fontSize="9" fill={WARN}>5V→ESP32 exige conversor de nível</text>
    </svg>
  )
}

const MAP = {
  'i2c-bus': I2CBus,
  'spi-bus': SPIBus,
  'uart-cross': UARTCross,
  'analog-digital': AnalogDigital,
  'pullup': PullUp,
  'pwm': PWM,
  'logic-levels': LogicLevels,
}

export default function TutorDiagram({ kind }) {
  const D = MAP[kind]
  if (!D) return null
  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--paper)', padding: '8px 8px 4px', margin: '8px 0' }}>
      <D />
    </div>
  )
}
