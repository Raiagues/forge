// ──────────────────────────────────────────────────────────────────
// Flashable firmware file set — generated from the mission state.
//
// Unlike software.js (the conceptual module catalog shown in the
// Architecture view), this engine emits the EXACT set of files that is
// compiled and flashed in the Serial Test view:
//
//   main.ino              — entry point (núcleo)
//   sensor_<id>.h         — one driver per placed sensor (drivers)
//   telemetry.h           — packet assembly from active sensors (sistema)
//   scheduler.h           — periodic sampling at the mission rate (sistema)
//
// Every pin number comes from the wiring canvas state at generation
// time — nothing is hardcoded. When the user has not wired the I2C bus
// yet, the generated code falls back to Wire.begin() with a note
// pointing at the wiring tab.
//
// Driver bodies live in a per-component template catalog (data, like
// software.js); which drivers exist, their addresses and their pins are
// all derived from the injected defs + wires. Pure: no store/UI imports.
// ──────────────────────────────────────────────────────────────────

import { pinDef, ADDR_STRAPS } from './wiring.js'

export const FILE_GROUPS = [
  { id: 'core',   label: 'Núcleo'  },
  { id: 'driver', label: 'Drivers' },
  { id: 'system', label: 'Sistema' },
]

// SDA/SCL GPIOs actually wired on the canvas; null when unwired (no
// silent defaults — honesty about the wiring state drives the output).
function wiredI2CPins(wires = []) {
  let sda = null, scl = null
  for (const w of wires) {
    for (const [end, other] of [[w.from, w.to], [w.to, w.from]]) {
      const d = pinDef(end.comp, end.pin)
      const od = pinDef(other.comp, other.pin)
      if (d?.role === 'sda' && od?.role === 'gpio') sda = parseInt(other.pin.replace('GPIO', ''), 10)
      if (d?.role === 'scl' && od?.role === 'gpio') scl = parseInt(other.pin.replace('GPIO', ''), 10)
    }
  }
  return { sda, scl }
}

// Guarded pin defines emitted into each I2C driver header (guarded so
// several drivers can repeat them without redefinition warnings).
const pinDefines = (i2c) => (i2c.sda == null || i2c.scl == null ? '' : `#ifndef SDA_PIN
#define SDA_PIN ${i2c.sda}   // da aba Fiação
#define SCL_PIN ${i2c.scl}   // da aba Fiação
#endif

`)

// The OTHER strap address of a sensor (HW-611-style modules ship with
// either SDO/AD0 state from the factory) — null when there is no alt.
const altStrap = (id, addr) => (ADDR_STRAPS[id] || []).find((a) => a !== addr) || null

// ── per-component driver templates ─────────────────────────────────
// Keyed by catalog id. Each template contributes: the header body, the
// fields it adds to the telemetry packet and the read call used by the
// scheduler. Labels/addresses/voltages come from the injected def.
const DRIVER_TEMPLATES = {
  bmp280: {
    // an SSD1306 OLED ships alongside this sensor in the bring-up kit:
    // its presence is what turns on the display checkpoints in main.ino
    oledCompanion: true,
    fields: [
      { decl: 'float temperature;', comment: '°C' },
      { decl: 'float pressure;', comment: 'hPa' },
    ],
    readInto: (pkt) => `${pkt} = bmp280_read();`,
    packetAssign: (id) => `  pkt.temperature = ${id}.temperature;\n  pkt.pressure    = ${id}.pressure;`,
    displayLines: (pkt) => [
      `display.print("T: "); display.print(${pkt}.temperature, 1); display.println(" C");`,
      `display.print("P: "); display.print(${pkt}.pressure, 1); display.println(" hPa");`,
    ],
    body: ({ def, addr, i2c }) => {
      const alt = altStrap(def.id, addr)
      return `#include <Adafruit_BMP280.h>

${pinDefines(i2c)}#define ${def.id.toUpperCase()}_ADDR     ${addr}  // strap SDO da fiação no canvas
${alt ? `#define ${def.id.toUpperCase()}_ADDR_ALT ${alt}  // strap SDO oposto (módulos HW-611 variam de fábrica)\n` : ''}
struct Bmp280Reading {
  float temperature;   // °C
  float pressure;      // hPa
};

Adafruit_BMP280 _bmp;
bool ${def.id}_ok = false;

void bmp280_init() {
  Serial.println("[${def.label}] init @ ${addr}${alt ? `/${alt}` : ''}");
  // o endereço depende do pino SDO do módulo — sonde os dois straps
  if (_bmp.begin(${def.id.toUpperCase()}_ADDR)) {
    ${def.id}_ok = true;
    Serial.println("[${def.label}] OK @ ${addr}");
  }
${alt ? `  else if (_bmp.begin(${def.id.toUpperCase()}_ADDR_ALT)) {
    ${def.id}_ok = true;
    Serial.println("[${def.label}] OK @ ${alt} — strap SDO difere da fiação no canvas");
  }
` : ''}  if (!${def.id}_ok) {
    Serial.println("[${def.label}] nao encontrado — verifique a fiação");
    return;
  }
  // configuração de amostragem obrigatória para leituras estáveis
  _bmp.setSampling(
    Adafruit_BMP280::MODE_NORMAL,
    Adafruit_BMP280::SAMPLING_X2,
    Adafruit_BMP280::SAMPLING_X16,
    Adafruit_BMP280::FILTER_X16,
    Adafruit_BMP280::STANDBY_MS_500
  );
}

Bmp280Reading bmp280_read() {
  Bmp280Reading r;
  r.temperature = _bmp.readTemperature();
  r.pressure    = _bmp.readPressure() / 100.0F;
  Serial.print("[${def.label}] T="); Serial.print(r.temperature, 1);
  Serial.print(" P=");               Serial.println(r.pressure, 1);
  return r;
}`
    },
  },

  mpu6050: {
    fields: [
      { decl: 'float accel[3];', comment: 'g' },
      { decl: 'float gyro[3];', comment: '°/s' },
    ],
    readInto: (pkt) => `${pkt} = mpu6050_read();`,
    packetAssign: (id) => `  memcpy(pkt.accel, ${id}.accel, sizeof(pkt.accel));\n  memcpy(pkt.gyro,  ${id}.gyro,  sizeof(pkt.gyro));`,
    displayLines: (pkt) => [
      `display.print("AX: "); display.println(${pkt}.accel[0], 2);`,
    ],
    body: ({ def, addr, i2c }) => {
      const alt = altStrap(def.id, addr)
      return `#include <Adafruit_MPU6050.h>

${pinDefines(i2c)}#define ${def.id.toUpperCase()}_ADDR     ${addr}  // strap AD0 da fiação no canvas
${alt ? `#define ${def.id.toUpperCase()}_ADDR_ALT ${alt}  // strap AD0 oposto\n` : ''}
struct Mpu6050Reading {
  float accel[3];   // g
  float gyro[3];    // °/s
  float euler[3];   // roll, pitch, yaw (°) — estimativa de atitude
};

Adafruit_MPU6050 _mpu;
bool ${def.id}_ok = false;

// ── filtro complementar (atitude) ──────────────────────────────────
// Fusão leve accel+gyro p/ orientação estável o suficiente p/ o gêmeo
// digital, sem o custo do Madgwick. O acelerômetro dá roll/pitch
// absolutos (vetor gravidade); o giroscópio é integrado p/ resposta
// rápida; o complementar mistura os dois (alpha=0.98 favorece o gyro no
// curto prazo, o accel corrige a deriva). Yaw vem só do gyro (sem
// magnetômetro não há referência absoluta) — pode derivar lentamente.
static float _roll = 0, _pitch = 0, _yaw = 0;
static unsigned long _attLast = 0;
const float ATT_ALPHA = 0.98f;

void mpu6050_update_attitude(const Mpu6050Reading &r) {
  unsigned long now = micros();
  float dt = _attLast ? (now - _attLast) / 1e6f : 0;
  _attLast = now;
  // roll/pitch absolutos do vetor gravidade (graus)
  float accRoll  = atan2f(r.accel[1], r.accel[2]) * 57.2958f;
  float accPitch = atan2f(-r.accel[0], sqrtf(r.accel[1]*r.accel[1] + r.accel[2]*r.accel[2])) * 57.2958f;
  // integra o giroscópio e mistura
  _roll  = ATT_ALPHA * (_roll  + r.gyro[0] * dt) + (1 - ATT_ALPHA) * accRoll;
  _pitch = ATT_ALPHA * (_pitch + r.gyro[1] * dt) + (1 - ATT_ALPHA) * accPitch;
  _yaw  += r.gyro[2] * dt;   // sem magnetômetro: só integração
}

void mpu6050_init() {
  Serial.println("[${def.label}] init @ ${addr}${alt ? `/${alt}` : ''}");
  // o endereço depende do pino AD0 do módulo — sonde os dois straps
  if (_mpu.begin(${def.id.toUpperCase()}_ADDR)) {
    ${def.id}_ok = true;
    Serial.println("[${def.label}] OK @ ${addr}");
  }${alt ? ` else if (_mpu.begin(${def.id.toUpperCase()}_ADDR_ALT)) {
    ${def.id}_ok = true;
    Serial.println("[${def.label}] OK @ ${alt} — strap AD0 difere da fiação no canvas");
  }` : ''}
  if (!${def.id}_ok) {
    Serial.println("[${def.label}] nao encontrado — verifique a fiação");
    return;
  }
  _mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  _mpu.setGyroRange(MPU6050_RANGE_500_DEG);
}

Mpu6050Reading mpu6050_read() {
  Mpu6050Reading r;
  sensors_event_t a, g, t;
  _mpu.getEvent(&a, &g, &t);
  r.accel[0] = a.acceleration.x / 9.80665f; r.accel[1] = a.acceleration.y / 9.80665f; r.accel[2] = a.acceleration.z / 9.80665f;  // m/s² → g
  r.gyro[0]  = g.gyro.x * 57.2958f; r.gyro[1] = g.gyro.y * 57.2958f; r.gyro[2] = g.gyro.z * 57.2958f;  // rad/s → °/s
  mpu6050_update_attitude(r);
  r.euler[0] = _roll; r.euler[1] = _pitch; r.euler[2] = _yaw;
  // pacote estruturado — campos rotulados que o gêmeo digital parseia
  // (ax/ay/az g · gx/gy/gz °/s · roll/pitch/yaw °)
  Serial.print("[${def.label}] ax="); Serial.print(r.accel[0], 3);
  Serial.print(" ay="); Serial.print(r.accel[1], 3); Serial.print(" az="); Serial.print(r.accel[2], 3);
  Serial.print(" gx="); Serial.print(r.gyro[0], 2); Serial.print(" gy="); Serial.print(r.gyro[1], 2); Serial.print(" gz="); Serial.print(r.gyro[2], 2);
  Serial.print(" roll="); Serial.print(r.euler[0], 2); Serial.print(" pitch="); Serial.print(r.euler[1], 2); Serial.print(" yaw="); Serial.println(r.euler[2], 2);
  return r;
}`
    },
  },
}

// Sensors of the current design that have a driver template.
const activeSensors = (defs, componentIds) =>
  componentIds.filter((id) => defs[id]?.category === 'sensor' && DRIVER_TEMPLATES[id])

// ── generators ──────────────────────────────────────────────────────
function genMain({ defs, sensors, i2c, missionName }) {
  const wired = i2c.sda != null && i2c.scl != null
  const defines = wired ? `#define SDA_PIN ${i2c.sda}   // da aba Fiação\n#define SCL_PIN ${i2c.scl}   // da aba Fiação\n\n` : ''
  const wireBegin = wired
    ? 'Wire.begin(SDA_PIN, SCL_PIN);'
    : 'Wire.begin();  // defina SDA e SCL na aba Fiação'

  // OLED checkpoints: enabled when a sensor whose bring-up kit carries
  // the SSD1306 companion display is part of the mission hardware.
  const oled = sensors.some((id) => DRIVER_TEMPLATES[id].oledCompanion)
  const bootName = (missionName || 'GuiaSat').replace(/["\\]/g, '')

  const oledIncludes = oled ? `#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define OLED_ADDR 0x3C
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
bool _oled_ok = false;
unsigned long _oled_hold_until = 0;   // segura mensagens de falha sem delay()

` : ''

  const oledHelpers = oled ? `

// checkpoint visual: "<sensor> OK" ou "<sensor> FALHA" (falha fica 3 s)
void oled_status(const char *name, bool ok) {
  if (!_oled_ok) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print(name);
  display.println(ok ? " OK" : " FALHA");
  display.display();
  if (!ok) _oled_hold_until = millis() + 3000;
}

// leituras atuais no display, atualizadas a cada tick do scheduler;
// um sensor com falha vira UMA linha "FALHA" — os demais continuam
void oled_show_readings() {
  if (!_oled_ok || millis() < _oled_hold_until) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
${sensors.map((id) => `  if (!${id}_ok) {
    display.println("${defs[id].label} FALHA");
  } else {
${DRIVER_TEMPLATES[id].displayLines('_sched_pkt').map((l) => `    ${l}`).join('\n')}
  }`).join('\n')}
  display.display();
}` : ''

  const oledBoot = oled ? `
  // tela de boot — sem delay: o BMP280 deve inicializar logo após o Wire.begin
  _oled_ok = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  if (_oled_ok) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.println("GuiaSat");
    display.println("${bootName}");
    display.display();
  }
` : ''

  const initCalls = sensors
    .map((id) => `  ${id}_init();${oled ? `\n  oled_status("${defs[id].label}", ${id}_ok);` : ''}`)
    .join('\n')

  return `// ${missionName || 'missão GuiaSat'} — gerado pelo GuiaSat a partir do estado da missão
// núcleo — regenerado quando o hardware ou a fiação mudam

#include <Wire.h>
${oledIncludes}${defines}${sensors.map((id) => `#include "sensor_${id}.h"`).join('\n')}${sensors.length ? '\n' : ''}#include "telemetry.h"
#include "scheduler.h"

void setup() {
  Serial.begin(115200);
  delay(1000);  // obrigatório — estabiliza alimentação/barramento antes do Wire.begin
  ${wireBegin}
${oledBoot}${initCalls}${sensors.length ? '\n' : ''}  telemetry_init();
  Serial.println("[${bootName}] pronto");
}

void loop() {
  ${oled ? 'if (scheduler_tick()) oled_show_readings();' : 'scheduler_tick();'}
}${oledHelpers}`
}

function genTelemetry({ defs, sensors, rateHz }) {
  const fields = sensors.flatMap((id) => DRIVER_TEMPLATES[id].fields.map((f) => `  ${f.decl}   // ${f.comment} (${defs[id].label})`))
  return `// sistema — pacote de telemetria montado das leituras ativas
#define TLM_RATE_HZ ${rateHz || 1}

struct TlmPacket {
${fields.length ? fields.join('\n') + '\n' : ''}  uint32_t uptime_ms;
};

void telemetry_init() {
  Serial.println("[telemetria] init");
}

void telemetry_send(const TlmPacket &pkt) {
  Serial.print("[telemetria] uptime_ms=");
  Serial.println(pkt.uptime_ms);
  // serializacao do pacote — formato definido pela competição
}`
}

function genScheduler({ defs, sensors, rateHz }) {
  const interval = Math.max(1, Math.round(1000 / (parseFloat(rateHz) || 1)))
  const reads = sensors.map((id) => {
    const t = DRIVER_TEMPLATES[id]
    // honest sampling: a sensor that failed init is skipped, never read
    // (its packet fields stay zerados) — no garbage in the telemetry
    return `  // ${defs[id].label} — pulado se o init falhou\n  if (${id}_ok) {\n    ${t.readInto(`auto _${id}`)}\n${t.packetAssign(`_${id}`).replace(/^ {2}/gm, '    ')}\n  }`
  })
  return `// sistema — amostragem periódica na taxa configurada da missão
#define SAMPLE_INTERVAL_MS ${interval}

unsigned long _sched_last = 0;
TlmPacket _sched_pkt = {};   // ultimo pacote amostrado (lido pelo display)

// retorna true quando uma nova amostra foi coletada neste tick
bool scheduler_tick() {
  if (millis() - _sched_last < SAMPLE_INTERVAL_MS) return false;
  _sched_last = millis();

  TlmPacket pkt = {};
${reads.length ? reads.join('\n') + '\n' : ''}  pkt.uptime_ms = millis();
  _sched_pkt = pkt;
  telemetry_send(pkt);
  return true;
}`
}

// ── public API ──────────────────────────────────────────────────────
// Generate the full flashable file set from the mission state.
//   defs         — component catalog
//   componentIds — placed hardware
//   wires        — wiring canvas state
//   addrs        — effective I2C address per sensor ({ id: { addr } })
//   rateHz       — mission sampling rate
//   missionName  — user-given mission name
// Returns ordered [{ file, group, compId?, code }] — empty when there
// is no MCU placed (nothing meaningful to flash yet).
export function generateFirmwareFiles({ defs, componentIds = [], wires = [], addrs = {}, rateHz = 1, missionName = '' }) {
  const hasMcu = componentIds.some((id) => defs[id]?.category === 'mcu')
  if (!hasMcu) return []

  const sensors = activeSensors(defs, componentIds)
  const i2c = wiredI2CPins(wires)
  const ctx = { defs, sensors, i2c, rateHz, missionName }

  return [
    { file: 'main.ino', group: 'core', code: genMain(ctx) },
    ...sensors.map((id) => ({
      file: `sensor_${id}.h`, group: 'driver', compId: id,
      code: DRIVER_TEMPLATES[id].body({ def: defs[id], addr: addrs[id]?.addr || defs[id].address, i2c }),
    })),
    { file: 'telemetry.h', group: 'system', code: genTelemetry(ctx) },
    { file: 'scheduler.h', group: 'system', code: genScheduler(ctx) },
  ]
}
