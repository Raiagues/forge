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

import { pinDef } from './wiring.js'

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

// ── per-component driver templates ─────────────────────────────────
// Keyed by catalog id. Each template contributes: the header body, the
// fields it adds to the telemetry packet and the read call used by the
// scheduler. Labels/addresses/voltages come from the injected def.
const DRIVER_TEMPLATES = {
  bmp280: {
    fields: [
      { decl: 'float temperature;', comment: '°C' },
      { decl: 'float pressure;', comment: 'hPa' },
    ],
    readInto: (pkt) => `${pkt} = bmp280_read();`,
    packetAssign: (id) => `  pkt.temperature = ${id}.temperature;\n  pkt.pressure    = ${id}.pressure;`,
    body: ({ def, addr, i2c }) => `#include <Adafruit_BMP280.h>

${pinDefines(i2c)}#define ${def.id.toUpperCase()}_ADDR ${addr}

struct Bmp280Reading {
  float temperature;   // °C
  float pressure;      // hPa
};

Adafruit_BMP280 _bmp;

void bmp280_init() {
  Serial.println("[${def.label}] init @ ${addr}");
  if (!_bmp.begin(${def.id.toUpperCase()}_ADDR)) {
    Serial.println("[${def.label}] nao encontrado — verifique a fiação");
    return;
  }
  Serial.println("[${def.label}] OK");
}

Bmp280Reading bmp280_read() {
  Bmp280Reading r;
  r.temperature = _bmp.readTemperature();
  r.pressure    = _bmp.readPressure() / 100.0F;
  Serial.print("[${def.label}] T="); Serial.print(r.temperature, 1);
  Serial.print(" P=");               Serial.println(r.pressure, 1);
  return r;
}`,
  },

  mpu6050: {
    fields: [
      { decl: 'float accel[3];', comment: 'g' },
      { decl: 'float gyro[3];', comment: '°/s' },
    ],
    readInto: (pkt) => `${pkt} = mpu6050_read();`,
    packetAssign: (id) => `  memcpy(pkt.accel, ${id}.accel, sizeof(pkt.accel));\n  memcpy(pkt.gyro,  ${id}.gyro,  sizeof(pkt.gyro));`,
    body: ({ def, addr, i2c }) => `#include <Adafruit_MPU6050.h>

${pinDefines(i2c)}#define ${def.id.toUpperCase()}_ADDR ${addr}

struct Mpu6050Reading {
  float accel[3];   // g
  float gyro[3];    // °/s
};

Adafruit_MPU6050 _mpu;

void mpu6050_init() {
  Serial.println("[${def.label}] init @ ${addr}");
  if (!_mpu.begin(${def.id.toUpperCase()}_ADDR)) {
    Serial.println("[${def.label}] nao encontrado — verifique a fiação");
    return;
  }
  _mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  _mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  Serial.println("[${def.label}] OK");
}

Mpu6050Reading mpu6050_read() {
  Mpu6050Reading r;
  sensors_event_t a, g, t;
  _mpu.getEvent(&a, &g, &t);
  r.accel[0] = a.acceleration.x; r.accel[1] = a.acceleration.y; r.accel[2] = a.acceleration.z;
  r.gyro[0]  = g.gyro.x;         r.gyro[1]  = g.gyro.y;         r.gyro[2]  = g.gyro.z;
  Serial.print("[${def.label}] ax="); Serial.println(r.accel[0], 2);
  return r;
}`,
  },
}

// Sensors of the current design that have a driver template.
const activeSensors = (defs, componentIds) =>
  componentIds.filter((id) => defs[id]?.category === 'sensor' && DRIVER_TEMPLATES[id])

// ── generators ──────────────────────────────────────────────────────
function genMain({ sensors, i2c, missionName }) {
  const wired = i2c.sda != null && i2c.scl != null
  const defines = wired ? `#define SDA_PIN ${i2c.sda}   // da aba Fiação\n#define SCL_PIN ${i2c.scl}   // da aba Fiação\n\n` : ''
  const wireBegin = wired
    ? 'Wire.begin(SDA_PIN, SCL_PIN);'
    : 'Wire.begin();  // defina SDA e SCL na aba Fiação'
  return `// ${missionName || 'missão FORGE'} — gerado pelo FORGE a partir do estado da missão
// núcleo — regenerado quando o hardware ou a fiação mudam

#include <Wire.h>
${defines}${sensors.map((id) => `#include "sensor_${id}.h"`).join('\n')}${sensors.length ? '\n' : ''}#include "telemetry.h"
#include "scheduler.h"

void setup() {
  Serial.begin(115200);
  ${wireBegin}
${sensors.map((id) => `  ${id}_init();`).join('\n')}${sensors.length ? '\n' : ''}  telemetry_init();
  Serial.println("[${missionName || 'FORGE'}] pronto");
}

void loop() {
  scheduler_tick();
}`
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
    return `  // ${defs[id].label}\n  ${t.readInto(`auto _${id}`)}\n${t.packetAssign(`_${id}`)}`
  })
  return `// sistema — amostragem periódica na taxa configurada da missão
#define SAMPLE_INTERVAL_MS ${interval}

unsigned long _sched_last = 0;

void scheduler_tick() {
  if (millis() - _sched_last < SAMPLE_INTERVAL_MS) return;
  _sched_last = millis();

  TlmPacket pkt = {};
${reads.length ? reads.join('\n') + '\n' : ''}  pkt.uptime_ms = millis();
  telemetry_send(pkt);
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
