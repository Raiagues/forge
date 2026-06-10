import { useEffect, useRef, useState } from 'react'
import useForge from '../../store/useForge'
import CodeEditor from '../ui/CodeEditor'

// ──────────────────────────────────────────────────────────────────
// Serial Test — a hardware bring-up console that lives inside the FORGE
// workstation language (paper cards, soft navy panels, mono labels, the
// SerialPanel segmented-button idiom). Serial runs through the backend
// (server/flash.js + serial_bridge.py): hardcoded port, no browser popup,
// persistent link, flashing releases/reacquires the port so the monitor
// resumes on its own. This file is presentation only — backend unchanged.
//
// Layout: a drag-resizable workflow column (pipeline + readouts) beside a
// soft navy editor and ONE tabbed console (Serial · Build · Diagnostics).
// ──────────────────────────────────────────────────────────────────

const SERVER = 'http://localhost:3001'

// Soft navy-tinted dark — harmonises with the navy chrome, not a black terminal.
const EDITOR_BG = '#1E283C'
const CONSOLE_BG = '#1A2333'
const PANEL_INK = 'rgba(231,237,247,.86)'
const SOFT_GRID = {
  backgroundImage: 'linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)',
  backgroundSize: '22px 22px',
}

// ── Firmware: the version proven on the real board, evolved only to drive
//    the onboard LED (GPIO2). The Wire.begin + delay(100) settle and the
//    direct display.begin() are why it works — do not reorder them.
const BMP_SKETCH = `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_BMP280.h>

#define LED_PIN 2          // ESP32 onboard LED (GPIO2)

// ESP32 I2C pins
#define SDA_PIN 21
#define SCL_PIN 22

// OLED
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_ADDR 0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
Adafruit_BMP280 bmp;

bool haveDisplay = false;
bool haveSensor = false;

void blink2();

void setup() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);   // onboard LED steady ON = booting

  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("=== ESP32 START ===");

  // Start I2C (let the bus settle before scanning — this delay matters)
  Wire.begin(SDA_PIN, SCL_PIN);
  delay(100);

  // Scan I2C bus — onboard LED blinks while scanning
  Serial.println("Scanning I2C...");
  int found = 0;
  for (uint8_t addr = 8; addr < 120; addr++) {
    digitalWrite(LED_PIN, (addr & 0x04) ? HIGH : LOW);
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.print("Found device at 0x");
      if (addr < 16) Serial.print("0");
      Serial.println(addr, HEX);
      found++;
    }
  }
  Serial.print("Devices found: ");
  Serial.println(found);

  // OLED init
  if (display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    haveDisplay = true;
    Serial.println("OLED OK");
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("OLED READY");
    display.display();
  } else {
    Serial.println("OLED FAILED");
  }

  // BMP280 init
  if (bmp.begin(0x76) || bmp.begin(0x77)) {
    haveSensor = true;
    bmp.setSampling(
      Adafruit_BMP280::MODE_NORMAL,
      Adafruit_BMP280::SAMPLING_X2,
      Adafruit_BMP280::SAMPLING_X16,
      Adafruit_BMP280::FILTER_X16,
      Adafruit_BMP280::STANDBY_MS_500
    );
    Serial.println("BMP280 OK");
    // sensor-detected cue: 3 quick pulses on the onboard LED
    for (int i = 0; i < 3; i++) {
      digitalWrite(LED_PIN, HIGH); delay(60);
      digitalWrite(LED_PIN, LOW);  delay(60);
    }
  } else {
    Serial.println("BMP280 NOT FOUND");
  }

  Serial.println("Setup complete");
  digitalWrite(LED_PIN, haveSensor ? HIGH : LOW);  // steady ON after good boot
}

void loop() {
  if (!haveSensor) {
    blink2();                       // error pattern: double blink
    Serial.println("BMP280 missing");
    delay(1500);
    return;
  }

  float tempC = bmp.readTemperature();
  float presHpa = bmp.readPressure() / 100.0F;

  Serial.print("Temp: ");
  Serial.print(tempC, 1);
  Serial.print(" C  Pressure: ");
  Serial.print(presHpa, 1);
  Serial.println(" hPa");

  if (haveDisplay) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("BMP280 SENSOR");
    display.setTextSize(2);
    display.setCursor(0, 18);
    display.print(tempC, 1);
    display.println(" C");
    display.setTextSize(1);
    display.setCursor(0, 50);
    display.print(presHpa, 1);
    display.println(" hPa");
    display.display();
  }

  digitalWrite(LED_PIN, HIGH);      // telemetry pulse per reading
  delay(40);
  digitalWrite(LED_PIN, LOW);

  delay(1000);
}

void blink2() {
  for (int i = 0; i < 2; i++) {
    digitalWrite(LED_PIN, HIGH); delay(80);
    digitalWrite(LED_PIN, LOW);  delay(80);
  }
}
`

// Echo loopback — quick send/receive round-trip test.
const ECHO_SKETCH = `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define LED_PIN 2
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);
  delay(1000);
  Serial.println("=== ESP32 START ===");
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("ECHO READY");
  display.display();
  Serial.println("Setup complete");
}

void loop() {
  if (Serial.available()) {
    String msg = Serial.readStringUntil('\\n');
    digitalWrite(LED_PIN, HIGH); delay(30); digitalWrite(LED_PIN, LOW);
    display.clearDisplay();
    display.setCursor(0, 0);
    display.println(msg);
    display.display();
    Serial.print("RECEIVED: ");
    Serial.println(msg);
  }
}
`

const PRESETS = [
  { id: 'bmp', label: 'BMP280 + OLED', code: BMP_SKETCH },
  { id: 'echo', label: 'Echo', code: ECHO_SKETCH },
]

// The bring-up pipeline — 7 milestones, each lit by a REAL signal.
const STAGES = [
  { id: 'board', label: 'Placa detectada' },
  { id: 'active', label: 'Serial ativo' },
  { id: 'compile', label: 'Compilando' },
  { id: 'upload', label: 'Enviando' },
  { id: 'reboot', label: 'Reinício' },
  { id: 'telem', label: 'Telemetria' },
  { id: 'sensor', label: 'Sensor validado' },
]

const LED_LEGEND = [
  ['boot', 'aceso fixo'],
  ['scan I2C', 'piscando'],
  ['sensor OK', '3 pulsos'],
  ['telemetria', 'pulso/leitura'],
  ['falha', 'piscar duplo'],
]

const TABS = [
  { id: 'serial', label: 'Serial' },
  { id: 'build', label: 'Build / Flash' },
  { id: 'diag', label: 'Diagnóstico' },
]

const clock = () => new Date().toTimeString().slice(0, 8)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

const S_COLOR = { rx: PANEL_INK, tx: '#8FC0F0', sys: 'rgba(231,237,247,.42)' }
const S_PREFIX = { rx: '‹', tx: '»', sys: '#' }

const ST_IDLE = 'idle', ST_ACTIVE = 'active', ST_DONE = 'done', ST_ERROR = 'error'

export default function SerialTest() {
  // single store touchpoint: report the REAL link state so the rest of
  // the platform can honestly distinguish hardware from simulation.
  const setHwLink = useForge(s => s.setHwLink)
  const [connected, setConnected] = useState(false)
  const [code, setCode] = useState(BMP_SKETCH)
  const [flashing, setFlashing] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [serialLines, setSerialLines] = useState([])
  const [logLines, setLogLines] = useState([])
  const [diagLines, setDiagLines] = useState([])
  const [input, setInput] = useState('')
  const [tab, setTab] = useState('serial')
  const [stages, setStages] = useState({})
  const [hw, setHw] = useState({ sda: 21, scl: 22, oled: null, bmp: null, i2c: null, oledOk: false })
  const [chip, setChip] = useState(null)
  const [reading, setReading] = useState(null)

  // drag-resizable regions
  const [colW, setColW] = useState(252)
  const [editorH, setEditorH] = useState(240)

  const esRef = useRef(null)
  const serialEndRef = useRef(null)
  const logEndRef = useRef(null)
  const diagEndRef = useRef(null)
  const notedRef = useRef(new Set())

  const pushSerial = (dir, text) => setSerialLines((l) => [...l, { t: clock(), dir, text }].slice(-600))
  const pushLog = (text) => setLogLines((l) => [...l, { t: clock(), text }].slice(-600))
  const setStage = (id, status) => setStages((s) => (s[id] === status ? s : { ...s, [id]: status }))
  const note = (text) => { if (!notedRef.current.has(text)) { notedRef.current.add(text); setDiagLines((l) => [...l, { t: clock(), text }].slice(-200)) } }

  useEffect(() => { serialEndRef.current?.scrollIntoView({ block: 'end' }) }, [serialLines])
  useEffect(() => { logEndRef.current?.scrollIntoView({ block: 'end' }) }, [logLines])
  useEffect(() => { diagEndRef.current?.scrollIntoView({ block: 'end' }) }, [diagLines])
  useEffect(() => () => { esRef.current?.close() }, [])

  // ── parse REAL serial output into pipeline stages + hardware facts ──
  const ingestSerial = (line) => {
    setStage('active', ST_DONE)
    if (/rst:0x|ets [A-Z][a-z]{2} |SPI_FAST_FLASH_BOOT|entry 0x/.test(line)) {
      notedRef.current = new Set()
      setStage('reboot', ST_DONE); setStage('board', ST_DONE)
      note('Placa reiniciou — recuperando stream serial')
    }
    if (/=== ESP32 START ===/.test(line)) { setStage('active', ST_DONE); setStage('board', ST_DONE); note('Handshake da placa estabelecido') }
    if (/Scanning I2C/i.test(line)) note('Varredura I2C iniciada')
    let m = line.match(/Found device at (0x[0-9a-fA-F]+)/i)
    if (m) {
      const a = m[1].toLowerCase()
      if (a === '0x3c' || a === '0x3d') setHw((h) => ({ ...h, oled: a }))
      if (a === '0x76' || a === '0x77') setHw((h) => ({ ...h, bmp: a }))
      note(`Dispositivo I2C em ${a}`)
    }
    m = line.match(/Devices found:\s*(\d+)/i)
    if (m) { const n = +m[1]; setHw((h) => ({ ...h, i2c: n })); note(`Varredura I2C concluída — ${n} dispositivo(s)`) }
    if (/OLED OK/.test(line)) { setHw((h) => ({ ...h, oledOk: true, oled: h.oled || '0x3c' })); note('OLED respondeu em 0x3c') }
    if (/OLED FAILED/.test(line)) setHw((h) => ({ ...h, oledOk: false }))
    if (/BMP280 OK/.test(line)) { setStage('sensor', ST_DONE); setHw((h) => { note(`BMP280 reconhecido em ${h.bmp || '0x76'}`); return { ...h, bmp: h.bmp || '0x76' } }) }
    if (/BMP280 (NOT FOUND|missing)/i.test(line)) { setStage('sensor', ST_ERROR); note('BMP280 não respondeu — verifique a fiação') }
    m = line.match(/Temp:\s*([\d.]+)\s*C\s*Pressure:\s*([\d.]+)/i)
    if (m) { setReading(`${m[1]} °C · ${m[2]} hPa`); setStage('telem', ST_DONE); note('Telemetria fluindo') }
  }

  const ingestLog = (line) => {
    if (/Compiling\.\.\./i.test(line)) setStage('compile', ST_ACTIVE)
    if (/Uploading\.\.\./i.test(line)) { setStage('compile', ST_DONE); setStage('upload', ST_ACTIVE) }
    const m = line.match(/Chip type:\s*(ESP32[^\s(]*)/i) || line.match(/Detecting chip type\.{0,3}\s*(ESP32\S*)/i)
    if (m) { setChip(m[1]); setStage('board', ST_DONE) }
    if (/Flash complete/i.test(line)) setStage('upload', ST_DONE)
    if (/compile failed/i.test(line)) setStage('compile', ST_ERROR)
    if (/upload failed/i.test(line)) setStage('upload', ST_ERROR)
  }

  function connect() {
    if (esRef.current) return
    const es = new EventSource(`${SERVER}/serial`)
    esRef.current = es
    es.onopen = () => {
      setConnected(true)
      setHwLink({ connected: true, port: 'bridge · 115200' })
      pushSerial('sys', 'monitor conectado · porta gerida pelo backend (sem popup)')
    }
    es.onmessage = (ev) => {
      const line = ev.data
      if (line.startsWith('#')) { pushSerial('sys', line.replace(/^#\s?/, '')); return }
      pushSerial('rx', line); ingestSerial(line)
      // mirror REAL device output into the platform serial buffer so the
      // Serial monitor and the Log Doctor analyze the physical hardware
      const cls = /not found|failed|error|timeout|missing|brownout|guru meditation/i.test(line) ? 'err'
        : /warn|retry/i.test(line) ? 'warn'
        : /ok|ready|complete|ack/i.test(line) ? 'ok' : 'info'
      useForge.getState().pushSerial({ m: line, cls })
    }
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setConnected(false)
        setHwLink({ connected: false, port: '' })
      } else pushSerial('sys', 'servidor serial indisponível — rode ./start.sh')
    }
  }

  function disconnect() {
    esRef.current?.close(); esRef.current = null
    setConnected(false)
    setHwLink({ connected: false, port: '' })
    pushSerial('sys', 'monitor desconectado')
  }

  async function send() {
    const msg = input.trim()
    if (!msg) return
    try {
      const res = await fetch(`${SERVER}/serial/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line: msg }) })
      if (res.ok) { pushSerial('tx', msg); setInput('') }
      else pushSerial('sys', 'serial não conectado — clique Conectar')
    } catch { pushSerial('sys', 'falha ao enviar — servidor fora do ar') }
  }

  async function streamInto(url, opts) {
    const res = await fetch(url, opts)
    if (!res.body) { (await res.text()).split('\n').forEach((l) => l && (ingestLog(l), pushLog(l))); return }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let i
      while ((i = buffer.indexOf('\n')) >= 0) { const l = buffer.slice(0, i); buffer = buffer.slice(i + 1); ingestLog(l); pushLog(l) }
    }
    if (buffer.trim()) { ingestLog(buffer); pushLog(buffer) }
  }

  async function detect() {
    if (detecting || flashing) return
    setDetecting(true); setTab('build'); setStage('board', ST_ACTIVE)
    pushLog('── detectando placa (esptool) ──')
    try { await streamInto(`${SERVER}/detect`) }
    catch (err) { pushLog(`ERROR: servidor inacessível — rode ./start.sh (${err.message})`) }
    finally { setDetecting(false) }
  }

  async function flash() {
    if (flashing || detecting) return
    setFlashing(true); setTab('build')
    setStages((s) => ({ board: s.board })) // keep board; re-validate the rest from this flash
    setHw((h) => ({ ...h, oled: null, bmp: null, i2c: null, oledOk: false }))
    setReading(null); notedRef.current = new Set()
    pushLog('── flash iniciado ──')
    try {
      await streamInto(`${SERVER}/flash`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
    } catch (err) { pushLog(`ERROR: servidor de flash inacessível — rode ./start.sh (${err.message})`) }
    finally { setFlashing(false) }
  }

  // ── custom splitters (no browser resize handles) ───────────────────
  const startDrag = (kind) => (e) => {
    e.preventDefault()
    const x0 = e.clientX, y0 = e.clientY, w0 = colW, h0 = editorH
    const move = (ev) => {
      if (kind === 'col') setColW(clamp(w0 + ev.clientX - x0, 208, 420))
      else setEditorH(clamp(h0 + ev.clientY - y0, 130, 560))
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const activePreset = PRESETS.find((p) => p.code === code)?.id
  const currentStage = [...STAGES].reverse().find((s) => stages[s.id] === ST_ACTIVE)
    || [...STAGES].reverse().find((s) => stages[s.id] === ST_DONE)
  const doneCount = STAGES.filter((s) => stages[s.id] === ST_DONE).length

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '14px 18px 16px', minHeight: 0 }}>
      {/* header / toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Bring-up de hardware</span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: 'var(--ink4)', letterSpacing: '.04em' }}>ESP32-WROOM-32D · editar → gravar → validar</span>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: "'Space Mono', monospace", fontSize: 10, color: 'var(--ink3)' }}>
          <span className={connected ? 'pulse' : ''} style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? 'var(--ok2)' : 'var(--ink4)', boxShadow: connected ? '0 0 6px var(--ok2)' : 'none' }} />
          {connected ? 'ESP32 · ttyUSB0 · 115200' : 'desconectado'}
        </span>
        <button onClick={detect} disabled={detecting || flashing} style={ghostBtn}>{detecting ? 'detectando…' : 'detectar'}</button>
        {connected
          ? <button onClick={disconnect} style={{ ...ghostBtn, borderColor: 'rgba(150,48,32,.4)', color: 'var(--err2)' }}>Desconectar</button>
          : <button onClick={connect} style={primaryBtn}>Conectar</button>}
      </div>

      {/* main */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* ── workflow column ─────────────────────────────────────── */}
        <div style={{ width: colW, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', paddingRight: 2 }}>
          <Card title={`Pipeline · ${doneCount}/${STAGES.length}`}>
            <div style={{ marginTop: 4 }}>
              {STAGES.map((s, i) => {
                const st = stages[s.id] || ST_IDLE
                return (
                  <div key={s.id} style={{ display: 'flex', gap: 9, alignItems: 'stretch' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 14 }}>
                      <StageDot status={st} />
                      {i < STAGES.length - 1 && <div style={{ flex: 1, width: 2, minHeight: 12, background: st === ST_DONE ? 'var(--ok2)' : 'var(--rule)', opacity: st === ST_DONE ? .45 : 1 }} />}
                    </div>
                    <div style={{ flex: 1, paddingBottom: 9, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontSize: 11.5, color: st === ST_IDLE ? 'var(--ink4)' : 'var(--ink)', fontWeight: st === ST_ACTIVE || st === ST_DONE ? 500 : 400 }}>{s.label}</span>
                      {st === ST_ACTIVE && <span className="pulse" style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, letterSpacing: '.06em', color: 'var(--acc2)' }}>EM CURSO</span>}
                      {st === ST_ERROR && <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, letterSpacing: '.06em', color: 'var(--err2)' }}>FALHA</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card title="Barramento I2C">
            <Row k="SDA" v={`GPIO${hw.sda}`} />
            <Row k="SCL" v={`GPIO${hw.scl}`} />
            <Row k="OLED" v={hw.oledOk ? `${hw.oled} ✓` : (hw.oled || '—')} dot={hw.oledOk ? 'var(--ok2)' : null} />
            <Row k="BMP280" v={hw.bmp ? `${hw.bmp} ✓` : (stages.sensor === ST_ERROR ? 'ausente' : '—')} dot={hw.bmp ? 'var(--ok2)' : (stages.sensor === ST_ERROR ? 'var(--err2)' : null)} />
            <Row k="dispositivos" v={hw.i2c != null ? `${hw.i2c}` : '—'} last />
          </Card>

          <Card title="LED onboard · GPIO2">
            {LED_LEGEND.map(([k, v], i) => <Row key={k} k={k} v={v} mono last={i === LED_LEGEND.length - 1} />)}
          </Card>
        </div>

        {/* column resize handle */}
        <Handle dir="v" onPointerDown={startDrag('col')} />

        {/* ── editor + console ────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>

          {/* editor */}
          <Pane style={{ height: editorH, flexShrink: 0 }}>
            <PaneHeader>
              <span style={{ display: 'flex', gap: 4 }}>
                {PRESETS.map((p) => <button key={p.id} onClick={() => setCode(p.code)} disabled={flashing} style={tabBtn(activePreset === p.id)}>{p.label}</button>)}
              </span>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9.5, color: 'var(--ink4)' }}>forge_sketch.ino</span>
              <div style={{ flex: 1 }} />
              {flashing && <Spinner label="gravando" />}
              <button onClick={flash} disabled={flashing || detecting} style={solidBtn(flashing || detecting)}>{flashing ? 'Flashing…' : 'Flash to ESP32'}</button>
            </PaneHeader>
            <CodeEditor value={code} onChange={setCode} disabled={flashing} background={EDITOR_BG} style={{ flex: 1, minHeight: 0 }} />
          </Pane>

          {/* editor/console resize handle */}
          <Handle dir="h" onPointerDown={startDrag('editor')} />

          {/* single tabbed console */}
          <Pane style={{ flex: 1, minHeight: 80 }}>
            <PaneHeader>
              <span style={{ display: 'flex', gap: 4 }}>
                {TABS.map((tb) => <button key={tb.id} onClick={() => setTab(tb.id)} style={tabBtn(tab === tb.id)}>{tb.label}</button>)}
              </span>
              <div style={{ flex: 1 }} />
              {tab !== 'diag' && <button onClick={() => (tab === 'serial' ? setSerialLines([]) : setLogLines([]))} style={miniBtn}>limpar</button>}
            </PaneHeader>

            {tab === 'serial' && (
              <Console endRef={serialEndRef} empty="aguardando — clique Conectar para o serial real">
                {serialLines.map((l, i) => <Line key={i} t={l.t} color={S_COLOR[l.dir]} prefix={S_PREFIX[l.dir]} text={l.text} />)}
              </Console>
            )}
            {tab === 'build' && (
              <Console endRef={logEndRef} empty="logs de compilar / gravar / detectar aparecem aqui">
                {logLines.map((l, i) => <Line key={i} t={l.t} color={/ERROR|failed/i.test(l.text) ? '#EE8A6A' : '#E0B057'} prefix="⚑" text={l.text} />)}
              </Console>
            )}
            {tab === 'diag' && (
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '10px 13px', ...consoleBase }}>
                <DiagRow k="placa" v={chip || '—'} />
                <DiagRow k="porta" v={connected ? '/dev/ttyUSB0 · 115200' : '—'} />
                <DiagRow k="OLED" v={hw.oledOk ? `${hw.oled} respondeu` : (hw.oled || '—')} />
                <DiagRow k="BMP280" v={hw.bmp ? `${hw.bmp} validado` : (stages.sensor === ST_ERROR ? 'ausente' : '—')} />
                <DiagRow k="I2C" v={hw.i2c != null ? `${hw.i2c} dispositivo(s)` : '—'} />
                <DiagRow k="última leitura" v={reading || '—'} />
                <DiagRow k="etapa atual" v={currentStage ? currentStage.label : '—'} last />
                <div style={{ height: 10 }} />
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 8.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(231,237,247,.35)', marginBottom: 6 }}>eventos interpretados</div>
                {diagLines.length === 0 && <div style={{ color: 'rgba(231,237,247,.28)', fontFamily: "'Space Mono', monospace", fontSize: 11 }}># nenhum evento ainda</div>}
                {diagLines.map((l, i) => <Line key={i} t={l.t} color="#9AD0A8" prefix="✓" text={l.text} />)}
                <div ref={diagEndRef} />
              </div>
            )}

            {/* send row — only meaningful on the Serial tab */}
            {tab === 'serial' && (
              <div style={{ display: 'flex', gap: 8, padding: '8px 10px', borderTop: '1px solid var(--rule)', background: 'var(--paper2)', flexShrink: 0 }}>
                <input
                  value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send() }} disabled={!connected}
                  placeholder={connected ? 'mensagem para o ESP32…' : 'conecte para enviar'}
                  style={{ flex: 1, padding: '7px 11px', borderRadius: 5, outline: 'none', border: '1px solid var(--rule)', background: connected ? 'var(--paper)' : 'var(--paper3)', fontFamily: "'Space Mono', monospace", fontSize: 11, color: connected ? 'var(--ink)' : 'var(--ink4)' }}
                />
                <button onClick={send} disabled={!connected} style={connected ? primaryBtn : { ...primaryBtn, background: 'var(--paper4)', cursor: 'not-allowed' }}>Enviar</button>
              </div>
            )}
          </Pane>
        </div>
      </div>
    </div>
  )
}

// ── presentational pieces (FORGE card / row idiom) ───────────────────
function StageDot({ status }) {
  if (status === 'done') return <Glyph bg="var(--ok2)" glyph="✓" />
  if (status === 'error') return <Glyph bg="var(--err2)" glyph="✕" />
  if (status === 'active') return <span className="pulse" style={{ display: 'block', width: 12, height: 12, borderRadius: '50%', background: 'var(--acc2)', boxShadow: '0 0 0 3px rgba(74,125,212,.18)' }} />
  return <span style={{ display: 'block', width: 12, height: 12, borderRadius: '50%', background: 'transparent', border: '1.5px solid var(--ink4)' }} />
}
function Glyph({ bg, glyph }) {
  return <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 12, height: 12, borderRadius: '50%', background: bg, color: '#fff', fontSize: 8, fontWeight: 700 }}>{glyph}</span>
}
function Card({ title, children }) {
  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 7, background: 'var(--paper2)', padding: '10px 12px', flexShrink: 0 }}>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 8, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  )
}
function Row({ k, v, dot, mono, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: last ? 'none' : '1px solid var(--rule2)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink3)' }}>
        {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot }} />}{k}
      </span>
      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: mono ? 9.5 : 11, color: 'var(--ink)' }}>{v}</span>
    </div>
  )
}
function DiagRow({ k, v, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: last ? 'none' : '1px solid rgba(255,255,255,.06)' }}>
      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9.5, letterSpacing: '.04em', color: 'rgba(231,237,247,.45)' }}>{k}</span>
      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: PANEL_INK }}>{v}</span>
    </div>
  )
}
function Pane({ children, style }) {
  return <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--rule)', borderRadius: 7, overflow: 'hidden', minHeight: 0, ...style }}>{children}</div>
}
function PaneHeader({ children }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', background: 'var(--paper2)', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>{children}</div>
}
const consoleBase = { background: CONSOLE_BG, fontFamily: "'Space Mono', monospace", fontSize: 11, lineHeight: 1.65 }
function Console({ children, endRef, empty }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children
  return (
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '9px 12px', ...consoleBase, ...SOFT_GRID }}>
      {!has && <div style={{ color: 'rgba(231,237,247,.28)' }}># {empty}</div>}
      {children}
      <div ref={endRef} />
    </div>
  )
}
function Line({ t, color, prefix, text }) {
  return (
    <div style={{ display: 'flex', gap: 9 }}>
      <span style={{ color: 'rgba(231,237,247,.26)', flexShrink: 0 }}>{t}</span>
      <span style={{ color, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{prefix} {text}</span>
    </div>
  )
}
function Handle({ dir, onPointerDown }) {
  const v = dir === 'v'
  return (
    <div onPointerDown={onPointerDown} style={{ flexShrink: 0, cursor: v ? 'col-resize' : 'row-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', width: v ? 11 : 'auto', height: v ? 'auto' : 9 }}>
      <span style={{ width: v ? 3 : 34, height: v ? 34 : 3, borderRadius: 2, background: 'var(--paper4)' }} />
    </div>
  )
}
function Spinner({ label }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Space Mono', monospace", fontSize: 9, color: 'var(--warn2)' }}>
      <span className="spin" style={{ display: 'block', width: 10, height: 10, border: '1.5px solid var(--warn2)', borderTopColor: 'transparent', borderRadius: '50%' }} />
      {label}…
    </span>
  )
}

// ── buttons (platform language) ──────────────────────────────────────
const ghostBtn = {
  padding: '5px 12px', borderRadius: 5, fontSize: 10, cursor: 'pointer',
  fontFamily: "'Space Mono', monospace", letterSpacing: '.05em', textTransform: 'uppercase',
  border: '1px solid var(--rule)', background: 'var(--paper2)', color: 'var(--ink3)',
}
const primaryBtn = {
  padding: '6px 16px', borderRadius: 5, border: 'none', cursor: 'pointer',
  background: 'var(--navy)', color: 'rgba(255,255,255,.88)', fontSize: 12, fontFamily: "'Space Grotesk', sans-serif",
}
function tabBtn(active) {
  return {
    padding: '3px 10px', borderRadius: 4, fontSize: 9.5, cursor: 'pointer',
    fontFamily: "'Space Mono', monospace", letterSpacing: '.04em',
    border: `1px solid ${active ? 'var(--navy)' : 'var(--rule)'}`,
    background: active ? 'var(--navy)' : 'var(--paper2)',
    color: active ? 'rgba(255,255,255,.85)' : 'var(--ink3)',
  }
}
function solidBtn(busy) {
  return {
    padding: '5px 14px', borderRadius: 5, border: 'none', cursor: busy ? 'default' : 'pointer',
    background: busy ? 'var(--paper4)' : 'var(--navy)', color: 'rgba(255,255,255,.9)',
    fontSize: 11, fontFamily: "'Space Grotesk', sans-serif",
  }
}
const miniBtn = {
  padding: '2px 8px', borderRadius: 3, fontSize: 8.5, cursor: 'pointer',
  fontFamily: "'Space Mono', monospace", letterSpacing: '.05em', textTransform: 'uppercase',
  border: '1px solid var(--rule)', background: 'transparent', color: 'var(--ink4)',
}
