import { useEffect, useMemo, useRef, useState } from 'react'
import useForge, { COMPONENT_DEFS } from '../../store/useForge'
import CodeEditor from '../ui/CodeEditor'
import TaskHighlightStrip from '../ui/TaskHighlightStrip'
import { diagnoseI2C } from '../../debug/i2cDiagnosis.js'
import { FILE_GROUPS } from '../../mission/firmwareFiles.js'
import { ADDR_STRAPS } from '../../mission/wiring.js'
import { track } from '../../lib/analytics.js'
import * as serialLink from '../../lib/serialLink.js'

// ──────────────────────────────────────────────────────────────────
// Serial Test — a hardware bring-up console that lives inside the GuiaSat
// workstation language (paper cards, soft navy panels, mono labels, the
// SerialPanel segmented-button idiom). Serial runs through the backend
// (server/flash.js + serial_bridge.py): hardcoded port, no browser popup,
// persistent link, flashing releases/reacquires the port so the monitor
// resumes on its own. This file is presentation only — backend unchanged.
//
// Layout: a drag-resizable workflow column (pipeline + readouts) beside a
// soft navy editor and ONE tabbed console (Serial · Build · Diagnostics).
// ──────────────────────────────────────────────────────────────────

// Soft navy-tinted dark — harmonises with the navy chrome, not a black terminal.
const EDITOR_BG = '#1E283C'
const CONSOLE_BG = '#1A2333'
const PANEL_INK = 'rgba(231,237,247,.86)'

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
void rescanI2C();

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

  // active I2C re-scan every ~2.5s — the diagnostic on screen polls the
  // LIVE bus, so a sensor removed mid-run drops out within one cycle.
  static unsigned long lastScan = 0;
  if (millis() - lastScan > 2500) { lastScan = millis(); rescanI2C(); }

  delay(1000);
}

void blink2() {
  for (int i = 0; i < 2; i++) {
    digitalWrite(LED_PIN, HIGH); delay(80);
    digitalWrite(LED_PIN, LOW);  delay(80);
  }
}

// Re-scan the I2C bus on demand and print the same lines the setup scan
// does, so the platform's diagnostic re-evaluates device presence live.
void rescanI2C() {
  Serial.println("Scanning I2C...");
  int found = 0;
  for (uint8_t addr = 8; addr < 120; addr++) {
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

// MPU6050 orientation stream — feeds the digital twin. Scans I2C (so the
// diagnostic lights up) then streams accel + gyro every ~50ms in a format
// the platform parses ("[MPU6050] ax=.. ay=.. az=.. gx=.. gy=.. gz=..").
const MPU_SKETCH = `#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

#define LED_PIN 2
#define SDA_PIN 21
#define SCL_PIN 22

Adafruit_MPU6050 mpu;
bool haveMpu = false;

void scanI2C() {
  Serial.println("Scanning I2C...");
  int found = 0;
  for (uint8_t a = 8; a < 120; a++) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) {
      Serial.print("Found device at 0x");
      if (a < 16) Serial.print("0");
      Serial.println(a, HEX);
      found++;
    }
  }
  Serial.print("Devices found: ");
  Serial.println(found);
}

void setup() {
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(115200);
  delay(1000);
  Serial.println("=== ESP32 START ===");
  Wire.begin(SDA_PIN, SCL_PIN);
  delay(100);
  scanI2C();
  if (mpu.begin(0x68) || mpu.begin(0x69)) {
    haveMpu = true;
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    Serial.println("MPU6050 OK");
  } else {
    Serial.println("MPU6050 NOT FOUND");
  }
  Serial.println("Setup complete");
}

void loop() {
  if (!haveMpu) { Serial.println("MPU6050 missing"); delay(1500); return; }
  sensors_event_t a, g, t;
  mpu.getEvent(&a, &g, &t);
  // accel in g (÷9.81), gyro in deg/s (×57.3)
  Serial.print("[MPU6050] ax="); Serial.print(a.acceleration.x / 9.81, 3);
  Serial.print(" ay="); Serial.print(a.acceleration.y / 9.81, 3);
  Serial.print(" az="); Serial.print(a.acceleration.z / 9.81, 3);
  Serial.print(" gx="); Serial.print(g.gyro.x * 57.3, 1);
  Serial.print(" gy="); Serial.print(g.gyro.y * 57.3, 1);
  Serial.print(" gz="); Serial.println(g.gyro.z * 57.3, 1);
  digitalWrite(LED_PIN, HIGH); delay(5); digitalWrite(LED_PIN, LOW);

  static unsigned long lastScan = 0;
  if (millis() - lastScan > 2500) { lastScan = millis(); scanI2C(); }
  delay(50);
}
`

const PRESETS = [
  { id: 'bmp', label: 'BMP280 + OLED', code: BMP_SKETCH, sensors: ['bmp280'] },
  { id: 'mpu', label: 'MPU6050 (gêmeo digital)', code: MPU_SKETCH, sensors: ['mpu6050'] },
  { id: 'echo', label: 'Echo', code: ECHO_SKETCH, sensors: [] },
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
]

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

const S_COLOR = { rx: PANEL_INK, tx: '#8FC0F0', sys: 'rgba(231,237,247,.42)' }
const S_PREFIX = { rx: '‹', tx: '»', sys: '#' }

const ST_ACTIVE = 'active', ST_DONE = 'done', ST_ERROR = 'error'

export default function SerialTest() {
  // Durable bring-up state lives in the store (Part 4a) so the connection
  // status, detected board and diagnostics survive navigation. The serial
  // EventSource itself is owned by the navigation-proof singleton in
  // src/lib/serialLink.js; this component only renders state + binds it.
  const fw = useForge(s => s.fw)
  const setSection = useForge(s => s.setSection)
  const openPhaseReview = useForge(s => s.openPhaseReview)
  const askAssistant = useForge(s => s.askAssistant)
  const fwSetTab = useForge(s => s.fwSetTab)
  const fwSetExpandedStep = useForge(s => s.fwSetExpandedStep)
  const fwSetCode = useForge(s => s.fwSetCode)
  const fwClearSerial = useForge(s => s.fwClearSerial)
  const fwClearLog = useForge(s => s.fwClearLog)
  const wires = useForge(s => s.wires)
  const fwFiles = useForge(s => s.fwFiles)
  const fwEdits = useForge(s => s.fwEdits)
  const setFwEdit = useForge(s => s.setFwEdit)
  const addrs = useForge(s => s.live?.addrs) || {}

  // durable bring-up state (from the store)
  const { connected, detecting, flashing, chip, stages, hw, reading } = fw
  const serialLines = fw.serial, logLines = fw.log, diagLines = fw.diag
  const tab = fw.tab, expandedStep = fw.expandedStep
  const code = fw.code ?? BMP_SKETCH
  const setCode = fwSetCode
  const setTab = fwSetTab
  const setExpandedStep = fwSetExpandedStep

  // local UI-only state (safe to reset on navigation)
  const [activeFileName, setActiveFileName] = useState(null)
  const [input, setInput] = useState('')
  const [colW, setColW] = useState(252)
  const [consoleH, setConsoleH] = useState(200)

  const serialEndRef = useRef(null)
  const logEndRef = useRef(null)
  const diagEndRef = useRef(null)

  useEffect(() => { serialEndRef.current?.scrollIntoView({ block: 'end' }) }, [serialLines])
  useEffect(() => { logEndRef.current?.scrollIntoView({ block: 'end' }) }, [logLines])
  useEffect(() => { diagEndRef.current?.scrollIntoView({ block: 'end' }) }, [diagLines])
  // on mount: keep the link alive across navigation; reconnect after a
  // full reload if we were connected. The singleton makes this a no-op
  // when the link is already open.
  useEffect(() => { serialLink.ensureConnected() }, [])

  // thin wrappers over the link singleton — all parsing/state lives there
  const connect = () => serialLink.connect()
  const disconnect = () => serialLink.disconnect()
  const send = async () => { if (await serialLink.send(input)) setInput('') }
  const detect = () => serialLink.detect()
  const flash = () => {
    // mission mode flashes the whole generated file set (main.ino +
    // headers) so the #include references resolve in the temp sketch dir
    const payload = missionMode
      ? { files: Object.fromEntries(fwFiles.map((f) => [f.file, fileContent(f)])) }
      : { code }
    serialLink.flash(payload)
  }

  // ── custom splitters (no browser resize handles) ───────────────────
  const startDrag = (kind) => (e) => {
    e.preventDefault()
    const x0 = e.clientX, y0 = e.clientY, w0 = colW, h0 = consoleH
    const move = (ev) => {
      if (kind === 'col') setColW(clamp(w0 + ev.clientX - x0, 208, 420))
      else setConsoleH(clamp(h0 - (ev.clientY - y0), 90, 520)) // dragging up grows the console
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const activePreset = PRESETS.find((p) => p.code === code)?.id

  // ── mission firmware mode: the generated multi-file set from the
  // store drives the editor; the preset sketches remain only as a
  // fallback while no mission hardware exists yet.
  const missionMode = fwFiles.length > 0
  const activeFile = missionMode ? (fwFiles.find((f) => f.file === activeFileName) || fwFiles[0]) : null
  const fileContent = (f) => fwEdits[f.file] ?? f.code
  const editorValue = missionMode ? fileContent(activeFile) : code
  const editorName = missionMode ? activeFile.file : 'forge_sketch.ino'
  const onEditorChange = missionMode ? (v) => setFwEdit(activeFile.file, v) : setCode
  // the full source the board will actually run (for diagnosis + flash)
  const fullSource = missionMode ? fwFiles.map(fileContent).join('\n') : code

  // sensors under test: the mission's driver set, or the preset's
  const testSensors = missionMode
    ? fwFiles.filter((f) => f.group === 'driver').map((f) => f.compId)
    : (PRESETS.find((p) => p.code === code)?.sensors || [])
  const expectedAddrs = (id) =>
    ADDR_STRAPS[id] || (COMPONENT_DEFS[id]?.address ? [COMPONENT_DEFS[id].address] : [])

  // Cross-referenced diagnosis: sketch #defines × ESP32 pin db × canvas
  // wiring × real I2C scan, for EVERY sensor under test. Only runs after
  // a scan completed — never on speculation. Sensors the scan found are
  // skipped by the engine.
  const findings = useMemo(() => {
    if (hw.i2c == null) return []
    return diagnoseI2C({
      sketch: fullSource, wires,
      scan: { complete: true, addresses: hw.found },
      sensors: testSensors.map((id) => ({ id, label: COMPONENT_DEFS[id]?.label || id, addrs: expectedAddrs(id) })),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hw.i2c, hw.found, fullSource, wires, testSensors.join(',')])

  // per-sensor diagnostic status — driven by the LATEST I²C scan (Part 4b),
  // not by init success. Each completed scan re-evaluates presence, so a
  // sensor that stops responding flips to red within one poll cycle.
  // status: 'ok' (nominal) | 'warn' (connected, awaiting/uncertain) |
  //         'err' (disconnected/pin error) | 'idle' (not configured/no link).
  const sensorCard = (id) => {
    const def = COMPONENT_DEFS[id]
    const exp = expectedAddrs(id)
    const found = exp.find((a) => hw.found.includes(a.toLowerCase())) || null
    const base = { id, name: def?.friendly || id, part: def?.label || id, expected: exp.join('/') || '—', caps: def?.caps || [], lastReadAt: hw.lastReadAt }
    if (!connected) return { ...base, status: 'idle', label: 'sem conexão', detail: 'Conecte o monitor serial para varrer o barramento I²C.' }
    const pinErr = findings.find((f) => f.kind === 'invalid-pin' || f.kind === 'pin-mismatch')
    if (pinErr) return { ...base, status: 'err', label: 'erro de pino', detail: pinErr.what, fix: pinErr.fix }
    if ((hw.scanCount || 0) === 0) return { ...base, status: 'warn', label: 'aguardando varredura', detail: 'Aguardando a primeira varredura I²C da placa.' }
    if (found) return { ...base, status: 'ok', label: 'nominal', addrFound: found, detail: `Respondeu em ${found} na última varredura I²C.` }
    const mine = findings.find((f) => f.sensor === id)
    return { ...base, status: 'err', label: 'desconectado',
      detail: mine ? mine.what : `Sem resposta em ${base.expected} na última varredura I²C.`,
      fix: mine ? mine.fix : 'Verifique a alimentação (3V3/GND) e a fiação SDA/SCL do módulo.' }
  }
  const cards = testSensors.map(sensorCard)

  // ── guided bring-up: 4 active steps driven by the same REAL signals
  // that lit the old checklist. The user always sees exactly one thing
  // to do next; completed steps collapse to a green one-liner.
  const validateFailed = stages.sensor === ST_ERROR || findings.length > 0
  const guidedSteps = [
    { id: 'detect', n: 1, title: 'Detectar placa',
      hint: 'Conecte o ESP32 via USB e clique em Detectar',
      btn: detecting ? 'detectando…' : 'Detectar placa', action: detect, busy: detecting || flashing,
      done: stages.board === ST_DONE, summary: chip ? `Placa detectada · ${chip}` : 'Placa detectada' },
    { id: 'serial', n: 2, title: 'Verificar conexão serial',
      hint: 'Clique em Conectar para abrir a porta serial',
      btn: 'Conectar', action: connect, busy: false,
      done: connected, summary: 'Serial ativo · 115200' },
    // done ONLY on a real flash success ("Flash complete" → upload DONE).
    // The reboot marker is NOT used here: opening the serial port also
    // resets the board, which used to self-complete this step and hide
    // the inline Flash button before the user ever saw it.
    { id: 'flash', n: 3, title: 'Enviar firmware',
      hint: 'O código gerado está pronto. Clique para enviar ao ESP32.',
      btn: flashing ? 'Flashing…' : 'Flash to ESP32', action: flash, busy: flashing || detecting,
      done: stages.upload === ST_DONE, summary: 'Firmware enviado ao ESP32' },
    { id: 'validate', n: 4, title: 'Validar sensores',
      hint: 'Aguardando resposta dos sensores via serial...',
      done: stages.telem === ST_DONE && stages.sensor === ST_DONE,
      failed: validateFailed,
      failures: findings.length ? findings : (validateFailed ? [{ what: 'Sensor não respondeu', fix: 'Verifique alimentação e conexão física' }] : []),
      summary: reading ? `Sensores validados · ${reading}` : 'Sensores validados' },
    // final step IS the handoff: once the board is up, the user picks the
    // next campaign — validate subsystems (AIT testing) OR fly the mission
    // (ground station). Two EQUAL forward options, never one primary.
    { id: 'operate', n: 5, title: 'Próximo passo',
      hint: 'Bring-up concluído. Valide os subsistemas na bancada de testes ou assuma a estação terrestre.',
      fork: [
        { label: 'Bancada de testes →', section: 'hwtest',
          action: () => { track('handoff_to_testing', { target: stages.upload === ST_DONE ? 'real' : 'sim' }); openPhaseReview('firmware') } },
        { label: 'Estação terrestre →', section: 'telemetry',
          action: () => { track('handoff_to_telemetry', { target: stages.upload === ST_DONE ? 'real' : 'sim' }); setSection('telemetry') } },
      ],
      busy: false, done: false, summary: 'Bring-up concluído' },
  ]

  // overall bring-up status shown at the top of the diagnostics panel
  const overall = validateFailed
    ? { label: 'Falha detectada', color: 'var(--err2)' }
    : stages.telem === ST_DONE && stages.sensor === ST_DONE
      ? { label: 'Tudo certo', color: 'var(--ok2)' }
      : stages.reboot === ST_DONE
        ? { label: 'Validando sensores', color: 'var(--acc2)' }
        : (stages.board === ST_DONE || connected)
          ? { label: 'Pronto para flash', color: 'var(--warn2)' }
          : { label: 'Aguardando conexão', color: 'var(--ink4)' }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TaskHighlightStrip section="serialtest" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '14px 18px 16px', minHeight: 0 }}>

      {/* header / toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Bring-up de hardware</span>
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: 'var(--ink4)', letterSpacing: '.04em' }}>ESP32-WROOM-32D · editar → gravar → validar</span>
        </div>
        <div style={{ flex: 1 }} />
        {/* status only — detect/connect live in the guided pipeline steps */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: "'Space Mono', monospace", fontSize: 13, color: 'var(--ink3)' }}>
          <span className={connected ? 'pulse' : ''} style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? 'var(--ok2)' : 'var(--ink4)', boxShadow: connected ? '0 0 6px var(--ok2)' : 'none' }} />
          {connected ? 'ESP32 · ttyUSB0 · 115200' : 'desconectado'}
        </span>
        {connected && (
          <button onClick={disconnect} style={{
            fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase',
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--err2)', padding: '2px 4px',
          }}>desconectar</button>
        )}
      </div>

      {/* main */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* ── workflow column ─────────────────────────────────────── */}
        <div style={{ width: colW, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', paddingRight: 2 }}>
          <Card title={`Bring-up guiado · ${guidedSteps.filter((s) => s.done).length}/${guidedSteps.length}`}>
            <GuidedSteps steps={guidedSteps} expanded={expandedStep} onToggle={setExpandedStep} />
          </Card>

          <Card title="Arquitetura do projeto">
            {missionMode ? (
              <ArchitectureBlocks files={fwFiles} activeFile={activeFile} edited={fwEdits} onSelect={(f) => setActiveFileName(f.file)} />
            ) : (
              <div style={{ fontSize: 13.5, color: 'var(--ink4)', lineHeight: 1.5, padding: '2px 0 4px' }}>
                Monte o hardware para gerar os módulos.
              </div>
            )}
          </Card>

          {!missionMode && (
            <Card title="Sketches de validação">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
                {PRESETS.map((p) => {
                  const active = activePreset === p.id
                  return (
                    <button key={p.id} onClick={() => setCode(p.code)} disabled={flashing} style={{
                      display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left', cursor: 'pointer',
                      padding: '6px 9px', borderRadius: 5,
                      border: `1px solid ${active ? 'var(--acc)' : 'var(--rule)'}`,
                      background: active ? 'rgba(43,94,167,.06)' : 'var(--paper)',
                      fontFamily: "'Space Grotesk', sans-serif", fontSize: 13.5,
                      color: active ? 'var(--ink)' : 'var(--ink2)', fontWeight: active ? 500 : 400,
                    }}>{p.label}</button>
                  )
                })}
              </div>
            </Card>
          )}
        </div>

        {/* column resize handle */}
        <Handle dir="v" onPointerDown={startDrag('col')} />

        {/* ── editor + console ────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>

          {/* editor — fills all the vertical space the console leaves */}
          <Pane style={{ flex: 1, minHeight: 120 }}>
            <PaneHeader>
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: 'var(--ink4)' }}>{editorName}</span>
              {missionMode && fwEdits[activeFile.file] != null && (
                <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--warn2)' }}>editado</span>
              )}
              <div style={{ flex: 1 }} />
              {flashing && <Spinner label="gravando" />}
              <button onClick={flash} disabled={flashing || detecting} style={solidBtn(flashing || detecting)}>{flashing ? 'Flashing…' : 'Flash to ESP32'}</button>
            </PaneHeader>
            <CodeEditor value={editorValue} onChange={onEditorChange} disabled={flashing} background={EDITOR_BG} style={{ flex: 1, minHeight: 0 }} />
            {missionMode && <FileContext file={activeFile} wires={wires} addrs={addrs} />}
          </Pane>

          {/* editor/console resize handle */}
          <Handle dir="h" onPointerDown={startDrag('editor')} />

          {/* single tabbed console — fixed, drag the divider to resize */}
          <Pane style={{ height: consoleH, flexShrink: 0 }}>
            <PaneHeader>
              <span style={{ display: 'flex', gap: 4 }}>
                {TABS.map((tb) => <button key={tb.id} onClick={() => setTab(tb.id)} style={tabBtn(tab === tb.id)}>{tb.label}</button>)}
              </span>
              <div style={{ flex: 1 }} />
              <button onClick={() => (tab === 'serial' ? fwClearSerial() : fwClearLog())} style={miniBtn}>limpar</button>
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
            {/* send row — only meaningful on the Serial tab */}
            {tab === 'serial' && (
              <div style={{ display: 'flex', gap: 8, padding: '8px 10px', borderTop: '1px solid var(--rule)', background: 'var(--paper2)', flexShrink: 0 }}>
                <input
                  value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send() }} disabled={!connected}
                  placeholder={connected ? 'mensagem para o ESP32…' : 'conecte para enviar'}
                  style={{ flex: 1, padding: '7px 11px', borderRadius: 5, outline: 'none', border: '1px solid var(--rule)', background: connected ? 'var(--paper)' : 'var(--paper3)', fontFamily: "'Space Mono', monospace", fontSize: 13.5, color: connected ? 'var(--ink)' : 'var(--ink4)' }}
                />
                <button onClick={send} disabled={!connected} style={connected ? primaryBtn : { ...primaryBtn, background: 'var(--paper4)', cursor: 'not-allowed' }}>Enviar</button>
              </div>
            )}
          </Pane>
        </div>

        {/* ── persistent diagnostics panel (always on screen) ──────── */}
        <DiagPanel
          overall={overall} cards={cards} events={diagLines}
          chip={chip} connected={connected} endRef={diagEndRef}
          onAsk={(q) => askAssistant(q)}
        />
      </div>
      </div>
    </div>
  )
}

// ── presentational pieces (GuiaSat card / row idiom) ───────────────────

// Guided bring-up flow — the FULL pipeline is always visible (Part 4d):
// completed steps are green checked one-liners (re-expand to re-run), the
// current step is the prominent action card, and future steps stay
// visible but dimmed/locked so the user always sees what comes next.
function GuidedSteps({ steps, expanded, onToggle }) {
  const currentIdx = steps.findIndex((s) => !s.done)
  const mono9 = { fontFamily: "'Space Mono', monospace", fontSize: 12 }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
      {steps.map((s, i) => {
        const future = currentIdx !== -1 && i > currentIdx
        const isOpen = i === currentIdx || expanded === s.id

        // future steps stay VISIBLE but dimmed/locked (Part 4d)
        if (future) {
          return (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '6px 9px', borderRadius: 5, opacity: 0.5,
              border: '1px dashed var(--rule)', background: 'transparent',
            }}>
              <span style={{ ...mono9, fontSize: 11, color: 'var(--ink4)', flexShrink: 0 }}>{s.n}</span>
              <span style={{ fontSize: 13.5, color: 'var(--ink4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
            </div>
          )
        }

        // completed + collapsed → green one-liner, clickable to re-open
        if (!isOpen) {
          return (
            <button key={s.id} onClick={() => onToggle(s.id)}
              title="Clique para reabrir e reexecutar"
              style={{
                display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left',
                padding: '5px 9px', borderRadius: 5, cursor: 'pointer',
                border: '1px solid rgba(58,144,96,.35)', background: 'rgba(58,144,96,.07)',
                color: 'var(--ok2)', fontSize: 13.5, fontFamily: "'Space Grotesk', sans-serif",
              }}>
              <span style={{ fontWeight: 700, flexShrink: 0 }}>✓</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.summary}</span>
            </button>
          )
        }

        // current step (or re-opened completed step) — prominent
        return (
          <div key={s.id} style={{
            border: `1px solid ${s.failed ? 'rgba(192,64,48,.4)' : 'var(--acc)'}`, borderRadius: 6,
            background: s.failed ? 'rgba(192,64,48,.05)' : 'rgba(43,94,167,.05)', padding: '9px 11px',
          }}>
            <div style={{ ...mono9, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: s.failed ? 'var(--err2)' : 'var(--acc2)', marginBottom: 3 }}>
              Passo {s.n} de {steps.length}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: 13.5, color: 'var(--ink3)', lineHeight: 1.5, marginBottom: s.btn || s.fork || s.failed ? 8 : 0 }}>{s.hint}</div>
            {s.fork && (
              <div style={{ display: 'flex', gap: 8 }}>
                {s.fork.map((opt) => (
                  <button key={opt.section} onClick={opt.action} style={{
                    flex: 1, padding: '8px 10px', borderRadius: 5, cursor: 'pointer',
                    border: '1px solid var(--acc)', background: 'var(--paper)', color: 'var(--ink)',
                    fontSize: 13.5, fontWeight: 500, fontFamily: "'Space Grotesk', sans-serif",
                  }}>{opt.label}</button>
                ))}
              </div>
            )}
            {s.failed && (s.failures || []).map((f, fi) => (
              <div key={fi} style={{ ...mono9, lineHeight: 1.55, marginBottom: 7, padding: '5px 8px', borderRadius: 'var(--r-sm)', background: 'rgba(184,75,44,.06)' }}>
                <div style={{ color: 'var(--err2)' }}>{f.what}</div>
                <div style={{ color: 'var(--ink3)' }}>→ {f.fix}</div>
              </div>
            ))}
            {s.btn && (
              <button onClick={s.action} disabled={s.busy} style={{
                width: '100%', padding: '7px 12px', borderRadius: 5, border: 'none',
                cursor: s.busy ? 'default' : 'pointer',
                background: s.busy ? 'var(--paper4)' : 'var(--btn-bg)', color: 'var(--btn-fg)',
                fontSize: 13.5, fontFamily: "'Space Grotesk', sans-serif",
              }}>{s.btn}</button>
            )}
            {s.done && expanded === s.id && (
              <button onClick={() => onToggle(null)} style={{
                width: '100%', marginTop: 6, padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                border: '1px solid var(--rule)', background: 'transparent', color: 'var(--ink4)',
                ...mono9, fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase',
              }}>recolher</button>
            )}
          </div>
        )
      })}
    </div>
  )
}
function Card({ title, children }) {
  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 7, background: 'var(--paper2)', padding: '10px 12px', flexShrink: 0 }}>
      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  )
}

// ── generated firmware files as clickable module blocks ─────────────
// Grouped by layer: núcleo (fundo escuro) → drivers (médio) → sistema
// (claro). Compact blocks, filename only; the active one is highlighted.
const GROUP_STYLE = {
  core:   { bg: 'var(--btn-bg)',   fg: 'var(--btn-fg)', border: 'transparent' },
  driver: { bg: 'var(--paper4)', fg: 'var(--ink)',            border: 'transparent' },
  system: { bg: 'var(--paper)',  fg: 'var(--ink2)',           border: 'var(--rule)' },
}
function ArchitectureBlocks({ files, activeFile, edited, onSelect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 2 }}>
      {FILE_GROUPS.map((g) => {
        const items = files.filter((f) => f.group === g.id)
        if (!items.length) return null
        const st = GROUP_STYLE[g.id] || GROUP_STYLE.system
        return (
          <div key={g.id}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 4 }}>{g.label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {items.map((f) => {
                const active = activeFile?.file === f.file
                return (
                  <button key={f.file} onClick={() => onSelect(f)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                    width: '100%', textAlign: 'left', cursor: 'pointer',
                    padding: '6px 9px', borderRadius: 4,
                    background: st.bg, color: st.fg,
                    border: `1px solid ${active ? 'var(--acc)' : st.border}`,
                    boxShadow: active ? '0 0 0 1px var(--acc)' : 'none',
                    fontFamily: "'Space Mono', monospace", fontSize: 13,
                    fontWeight: active ? 700 : 400,
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file}</span>
                    {edited[f.file] != null && <span style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--warn2)', flexShrink: 0 }}>editado</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── context strip under the editor ───────────────────────────────────
// main.ino → one line per data wire ("SDA — GPIO21 — BMP280"); a driver
// file → the sensor's identity (address, voltage) and its wired GPIOs.
// Everything is derived from the wiring canvas state + catalog.
function FileContext({ file, wires, addrs }) {
  const pairs = wires.map((w) => {
    const mcu = [w.from, w.to].find((e) => COMPONENT_DEFS[e.comp]?.category === 'mcu')
    const dev = [w.from, w.to].find((e) => COMPONENT_DEFS[e.comp]?.category !== 'mcu')
    return mcu && dev ? { mcu, dev } : null
  }).filter((p) => p && p.mcu.pin.startsWith('GPIO'))

  let body = null
  if (file.group === 'core') {
    body = pairs.length
      ? pairs.map((p, i) => <div key={i}>{p.dev.pin} — {p.mcu.pin} — {COMPONENT_DEFS[p.dev.comp]?.label || p.dev.comp}</div>)
      : <div>nenhum pino de dados fiado — conecte os sensores na aba Fiação</div>
  } else if (file.group === 'driver') {
    const def = COMPONENT_DEFS[file.compId]
    const mine = pairs.filter((p) => p.dev.comp === file.compId)
    body = (
      <>
        <div style={{ color: 'var(--ink)' }}>{def?.friendly} · {def?.label}</div>
        <div>endereço I2C: {addrs[file.compId]?.addr || def?.address || '—'} · tensão: {def?.voltage || '—'}</div>
        <div>{mine.length ? mine.map((p) => `${p.dev.pin} — ${p.mcu.pin}`).join(' · ') : 'sem fiação de dados — conecte na aba Fiação'}</div>
      </>
    )
  }
  if (!body) return null
  return (
    <div style={{ flexShrink: 0, padding: '7px 12px', borderTop: '1px solid var(--rule)', background: 'var(--paper2)', fontFamily: "'Space Mono', monospace", fontSize: 12, lineHeight: 1.7, color: 'var(--ink3)', maxHeight: 96, overflowY: 'auto' }}>
      {body}
    </div>
  )
}
function Row({ k, v, dot, mono, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: last ? 'none' : '1px solid var(--rule2)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: 'var(--ink3)' }}>
        {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot }} />}{k}
      </span>
      <span style={{ fontFamily: "'Space Mono', monospace", fontSize: mono ? 9.5 : 11, color: 'var(--ink)' }}>{v}</span>
    </div>
  )
}
// ── persistent diagnostics panel ─────────────────────────────────────
// Always visible to the right of the editor. The sensors render as a grid
// of square color+icon STATUS BLOCKS (Part 4c): the colour + icon carry
// the status at a glance (green nominal / amber warning / red error /
// grey not configured), not a text string. Clicking a block expands its
// raw diagnostic detail inline (address found, last read, error + fix)
// with a "saiba mais" link that asks the persistent AI chat about it.
const BLOCK_ST = {
  ok:   { color: 'var(--ok2)',   bg: 'rgba(58,144,96,.10)',  ring: 'rgba(58,144,96,.45)' },
  warn: { color: 'var(--warn2)', bg: 'rgba(200,131,26,.10)', ring: 'rgba(200,131,26,.45)' },
  err:  { color: 'var(--err2)',  bg: 'rgba(192,64,48,.10)',  ring: 'rgba(192,64,48,.45)' },
  idle: { color: 'var(--ink4)',  bg: 'transparent',          ring: 'var(--rule)' },
}
const STATUS_LABEL = { ok: 'nominal', warn: 'atenção', err: 'erro', idle: '—' }

// simple sensor-type glyphs (thermometer / IMU axes / satellite / chip)
function SensorGlyph({ caps = [], color }) {
  const sw = { fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  let path
  if (caps.includes('imu')) path = <g {...sw}><path d="M12 3v18M3 12h18" /><circle cx="12" cy="12" r="3" /></g>
  else if (caps.includes('gnss')) path = <g {...sw}><circle cx="12" cy="12" r="3" /><path d="M5 5l4 4M19 5l-4 4M5 19l4-4M19 19l-4-4" /></g>
  else if (caps.includes('pressure') || caps.includes('temp')) path = <g {...sw}><path d="M12 14V5a2 2 0 0 0-4 0v9a4 4 0 1 0 4 0z" /></g>
  else path = <g {...sw}><rect x="5" y="5" width="14" height="14" rx="2" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></g>
  return <svg viewBox="0 0 24 24" width="20" height="20">{path}</svg>
}

function StatusBlock({ c, expanded, onToggle, onAsk }) {
  const st = BLOCK_ST[c.status] || BLOCK_ST.idle
  const mono = { fontFamily: "'Space Mono', monospace" }
  const ago = c.lastReadAt ? `${Math.max(0, Math.round((Date.now() - c.lastReadAt) / 1000))}s atrás` : '—'
  return (
    <div style={{ border: `1px solid ${expanded ? st.ring : 'var(--rule)'}`, borderRadius: 'var(--r-md)', background: st.bg, marginBottom: 7, overflow: 'hidden' }}>
      <button onClick={onToggle} title="Ver dados do diagnóstico" style={{
        display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
        padding: '9px 10px', border: 'none', background: 'transparent', cursor: 'pointer',
      }}>
        {/* icon tile carries the colour */}
        <span style={{ position: 'relative', width: 38, height: 38, borderRadius: 7, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: c.status === 'idle' ? 'var(--paper3)' : st.bg, border: `1px solid ${st.ring}` }}>
          <SensorGlyph caps={c.caps} color={st.color} />
          <span className={c.status === 'ok' ? 'pulse' : ''} style={{ position: 'absolute', top: -3, right: -3, width: 11, height: 11, borderRadius: '50%', background: st.color, border: '2px solid var(--paper2)' }} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.part}</span>
          <span style={{ ...mono, fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: st.color }}>{c.label || STATUS_LABEL[c.status]}</span>
        </span>
        <span style={{ ...mono, fontSize: 12, color: 'var(--ink4)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
      </button>

      {expanded && (
        <div style={{ padding: '2px 11px 10px', borderTop: '1px solid var(--rule2)' }}>
          <DiagRow k="I²C esperado" v={c.expected} />
          <DiagRow k="endereço respondeu" v={c.addrFound || '—'} />
          <DiagRow k="última leitura" v={ago} />
          {c.detail && <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.5, marginTop: 6 }}>{c.detail}</div>}
          {c.fix && <div style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.5, marginTop: 3 }}>→ {c.fix}</div>}
          <button onClick={() => onAsk(`Estou diagnosticando o sensor ${c.part} (${c.name}) no meu ESP32. Status: ${c.label}. Endereço I²C esperado ${c.expected}${c.addrFound ? `, respondeu em ${c.addrFound}` : ', não respondeu na varredura'}. ${c.detail || ''} Como investigo e resolvo isso?`)}
            style={{ marginTop: 8, padding: '5px 10px', borderRadius: 5, cursor: 'pointer',
              border: '1px solid var(--acc)', background: 'transparent', color: 'var(--acc2)',
              ...mono, fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase' }}>
            saiba mais →
          </button>
        </div>
      )}
    </div>
  )
}
function DiagRow({ k, v }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0', fontFamily: "'Space Mono', monospace", fontSize: 11.5 }}>
      <span style={{ color: 'var(--ink4)' }}>{k}</span>
      <span style={{ color: 'var(--ink2)' }}>{v}</span>
    </div>
  )
}

function DiagPanel({ overall, cards, events, chip, connected, endRef, onAsk }) {
  const mono = { fontFamily: "'Space Mono', monospace" }
  const [open, setOpen] = useState(null)
  return (
    <div style={{
      width: 256, flexShrink: 0, marginLeft: 10, minHeight: 0,
      border: '1px solid var(--rule)', borderRadius: 7, background: 'var(--paper2)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '8px 11px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
        <div style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', marginBottom: 6 }}>Diagnóstico</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: overall.color, flexShrink: 0 }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: overall.color }}>{overall.label}</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '9px 11px' }}>
        {cards.length === 0 && (
          <div style={{ fontSize: 13.5, color: 'var(--ink4)', lineHeight: 1.6 }}>
            Nenhum sensor sob teste — monte a missão ou escolha o sketch BMP280 + OLED.
          </div>
        )}
        {cards.map((c) => (
          <StatusBlock key={c.id} c={c} expanded={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} onAsk={onAsk} />
        ))}

        <div style={{ ...mono, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink4)', margin: '10px 0 5px' }}>eventos interpretados</div>
        {events.length === 0 && <div style={{ ...mono, fontSize: 12, color: 'var(--ink4)' }}>nenhum evento ainda</div>}
        {events.map((l, i) => (
          <div key={i} style={{ ...mono, fontSize: 12, color: 'var(--ink3)', lineHeight: 1.6, display: 'flex', gap: 6 }}>
            <span style={{ color: 'var(--ink4)', flexShrink: 0 }}>{l.t}</span>
            <span>{l.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div style={{ padding: '7px 11px', borderTop: '1px solid var(--rule)', flexShrink: 0, ...mono, fontSize: 11, color: 'var(--ink4)', lineHeight: 1.6 }}>
        <div>{chip || 'ESP32-WROOM-32D'} · {connected ? 'ttyUSB0 · 115200' : 'sem conexão'}</div>
        <div>arduino-cli · framework Arduino</div>
      </div>
    </div>
  )
}
function Pane({ children, style }) {
  return <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--rule)', borderRadius: 7, overflow: 'hidden', minHeight: 0, ...style }}>{children}</div>
}
function PaneHeader({ children }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', background: 'var(--paper2)', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>{children}</div>
}
const consoleBase = { background: CONSOLE_BG, fontFamily: "'Space Mono', monospace", fontSize: 13.5, lineHeight: 1.65 }
function Console({ children, endRef, empty }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children
  return (
    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '9px 12px', ...consoleBase }}>
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
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'Space Mono', monospace", fontSize: 12, color: 'var(--warn2)' }}>
      <span className="spin" style={{ display: 'block', width: 10, height: 10, border: '1.5px solid var(--warn2)', borderTopColor: 'transparent', borderRadius: '50%' }} />
      {label}…
    </span>
  )
}

// ── buttons (platform language) ──────────────────────────────────────
const primaryBtn = {
  padding: '6px 16px', borderRadius: 5, border: 'none', cursor: 'pointer',
  background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontSize: 14, fontFamily: "'Space Grotesk', sans-serif",
}
function tabBtn(active) {
  return {
    padding: '3px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
    fontFamily: "'Space Mono', monospace", letterSpacing: '.04em',
    border: `1px solid ${active ? 'var(--btn-bg)' : 'var(--rule)'}`,
    background: active ? 'var(--btn-bg)' : 'var(--paper2)',
    color: active ? 'var(--btn-fg)' : 'var(--ink3)',
  }
}
function solidBtn(busy) {
  return {
    padding: '5px 14px', borderRadius: 5, border: 'none', cursor: busy ? 'default' : 'pointer',
    background: busy ? 'var(--paper4)' : 'var(--btn-bg)', color: 'var(--btn-fg)',
    fontSize: 13.5, fontFamily: "'Space Grotesk', sans-serif",
  }
}
const miniBtn = {
  padding: '2px 8px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
  fontFamily: "'Space Mono', monospace", letterSpacing: '.05em', textTransform: 'uppercase',
  border: '1px solid var(--rule)', background: 'transparent', color: 'var(--ink4)',
}
