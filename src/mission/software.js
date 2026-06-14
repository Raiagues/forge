// ──────────────────────────────────────────────────────────────────
// Software architecture — modular, aerospace-inspired firmware layout.
//
// Three layers:
//   core     — present in nearly every mission, rarely modified
//   adaptive — reusable base that needs mission-specific adaptation
//   mission  — fully custom apps unique to this mission/objective
//
// Each module maps to its own logical file (NOT one giant sketch) and
// carries a `code(ctx)` generator. `activeModules()` derives which
// modules a mission actually uses from the placed hardware + objective.
// Pure: catalog (`defs`) injected. No store/UI imports.
// ──────────────────────────────────────────────────────────────────

import { defsForIds, hasCapability } from './capabilities.js'

export const SOFTWARE_LAYERS = [
  { id: 'core',     label: 'Core Apps',        color: '#2B5EA7', desc: 'Presentes em quase toda missão. Normalmente não são modificados.' },
  { id: 'adaptive', label: 'Adaptive Apps',    color: '#C8831A', desc: 'Base reutilizável que exige adaptação para a missão.' },
  { id: 'mission',  label: 'Mission Apps',     color: '#3A9060', desc: 'Módulos totalmente específicos desta missão.' },
]

const ctxHave = (ctx, id) => (ctx.componentIds || []).includes(id)
// the I²C GPIOs the user ACTUALLY wired (defaults to 21/22)
const ctxI2c = (ctx) => ctx.i2c || { sda: 21, scl: 22 }
// honest generation: drivers warn when the sensor isn't wired yet
const ctxWired = (ctx, id) => !ctx.wiring || ctx.wiring[id]?.wired
// I²C address derived from the SDO strap the user actually wired
const ctxAddr = (ctx, id, fallback) => ctx.addrs?.[id]?.addr || fallback

export const SOFTWARE_MODULES = [
  // ── core ─────────────────────────────────────────────────────────
  {
    id: 'main', label: 'Inicialização & loop', file: 'main.ino', layer: 'core', requires: [],
    desc: 'Ponto de entrada: inicializa os módulos e roda o ciclo principal. Não modifique.',
    code: (ctx) => {
      const inc = []
      if (ctxHave(ctx, 'bmp280')) inc.push('#include "sensor_bmp280.h"')
      if (ctxHave(ctx, 'mpu6050')) inc.push('#include "sensor_mpu6050.h"')
      return `// ${ctx.missionName || 'GuiaSat mission'} — gerado pelo GuiaSat
// camada: core — não modifique

#include <Wire.h>
#include "telemetry.h"
#include "health.h"
#include "scheduler.h"
${inc.join('\n')}

void setup() {
  Serial.begin(115200);
  Wire.begin(${ctxI2c(ctx).sda}, ${ctxI2c(ctx).scl});  // SDA, SCL — pinos da SUA fiação
  health_init();
${ctxHave(ctx, 'bmp280') ? '  bmp280_init();\n' : ''}${ctxHave(ctx, 'mpu6050') ? '  mpu6050_init();\n' : ''}  telemetry_init();
  Serial.println("GuiaSat node ready");
}

void loop() {
  scheduler_tick();
  health_feed_watchdog();
}`
    },
  },
  {
    id: 'telemetry', label: 'Telemetria', file: 'telemetry.h', layer: 'core', requires: [],
    desc: 'Monta e envia o pacote padronizado de telemetria (WiFi no OBSAT).',
    code: (ctx) => `// camada: core — pacote de telemetria
#include <WiFi.h>

#define TLM_RATE_HZ ${ctx.rateHz || 1}

struct TlmPacket {
${ctxHave(ctx, 'bmp280') ? '  float temperature;   // °C (BMP280)\n  float pressure;      // hPa (BMP280)\n' : ''}${ctxHave(ctx, 'mpu6050') ? '  float accel[3];      // g (MPU6050)\n  float gyro[3];       // °/s (MPU6050)\n' : ''}  uint32_t uptime_ms;
};

void telemetry_init() {
  // OBSAT: conexão WiFi com a estação base
  WiFi.begin("OBSAT_BASE", "********");
}

void telemetry_send(const TlmPacket &pkt) {
  // serializa e envia o pacote — formato definido no edital
}`,
  },
  {
    id: 'health', label: 'Saúde & watchdog', file: 'health.h', layer: 'core', requires: [],
    desc: 'Monitoramento de saúde do sistema e watchdog de recuperação.',
    code: () => `// camada: core — health monitoring + watchdog
#include <esp_task_wdt.h>

#define WDT_TIMEOUT_S 8

void health_init() {
  esp_task_wdt_init(WDT_TIMEOUT_S, true);
  esp_task_wdt_add(NULL);
}

void health_feed_watchdog() { esp_task_wdt_reset(); }

bool health_ok() {
  return ESP.getFreeHeap() > 20000;  // heap mínimo saudável
}`,
  },
  {
    id: 'data_logger', label: 'Log de dados', file: 'logging.h', layer: 'core', requires: ['storage'],
    desc: 'Grava amostras em armazenamento local como backup do enlace.',
    code: () => `// camada: core — data logging (requer cartão SD)
// hardware de armazenamento ainda não disponível nesta missão`,
  },

  // ── adaptive ─────────────────────────────────────────────────────
  {
    id: 'scheduler', label: 'Agendador de missão', file: 'scheduler.h', layer: 'adaptive', requires: [],
    desc: 'Amostragem periódica determinística. Adapte taxas por fase de voo.',
    code: (ctx) => `// camada: adaptive — adapte as taxas para sua missão
#define SAMPLE_INTERVAL_MS ${Math.round(1000 / (parseFloat(ctx.rateHz) || 1))}

unsigned long _last = 0;

void scheduler_tick() {
  if (millis() - _last < SAMPLE_INTERVAL_MS) return;
  _last = millis();

  TlmPacket pkt = {};
${ctxHave(ctx, 'bmp280') ? '  pkt.temperature = bmp280_temp();\n  pkt.pressure    = bmp280_pressure();\n' : ''}${ctxHave(ctx, 'mpu6050') ? '  mpu6050_read(pkt.accel, pkt.gyro);\n' : ''}  pkt.uptime_ms = millis();
  telemetry_send(pkt);
}`,
  },
  {
    id: 'power_mgmt', label: 'Gestão de energia', file: 'power.h', layer: 'adaptive', requires: [],
    desc: 'Distribuição e economia de energia. Adapte thresholds à sua bateria.',
    code: () => `// camada: adaptive — adapte para sua fonte de energia
#define BATTERY_MIN_V  3.2   // tensão mínima (V)
#define BATTERY_FULL_V 4.2   // tensão máxima (V)
#define VBAT_ADC_PIN   34    // GPIO34 · ADC1_CH6

float power_voltage() {
  int raw = analogRead(VBAT_ADC_PIN);
  return raw * (3.3 / 4095.0) * 2.0;  // divisor 1:1
}`,
  },
  {
    id: 'driver_bmp280', label: 'Driver · sensor ambiental', file: 'sensor_bmp280.h', layer: 'adaptive', requires: ['pressure'],
    desc: 'Temperatura e pressão (BMP280, I²C 0x76). Adapte a pressão de referência.',
    code: (ctx) => `// camada: adaptive — adapte a pressão de referência local
${ctxWired(ctx, 'bmp280') ? '' : '// AVISO: BMP280 ainda sem fiação — conecte VCC/GND/SDA/SCL na vista 2D\n'}#include <Adafruit_BMP280.h>

#define BMP_I2C_ADDR    ${ctxAddr(ctx, 'bmp280', '0x76')}  // derivado do strap SDO da sua fiação
#define SEA_LEVEL_HPA   1013.25  // adapte para o dia do voo

Adafruit_BMP280 bmp;  // SDA→GPIO${ctxI2c(ctx).sda} · SCL→GPIO${ctxI2c(ctx).scl} (fiação atual)

void bmp280_init() {
  if (!bmp.begin(BMP_I2C_ADDR)) Serial.println("BMP280 não encontrado!");
}

float bmp280_temp()     { return bmp.readTemperature(); }
float bmp280_pressure() { return bmp.readPressure() / 100.0F; }
float bmp280_altitude() { return bmp.readAltitude(SEA_LEVEL_HPA); }`,
  },
  {
    id: 'driver_mpu6050', label: 'Driver · IMU', file: 'sensor_mpu6050.h', layer: 'adaptive', requires: ['imu'],
    desc: 'Acelerômetro + giroscópio (MPU6050, I²C 0x68). Calibre offsets em solo.',
    code: (ctx) => `// camada: adaptive — calibre com o sensor parado
${ctxWired(ctx, 'mpu6050') ? '' : '// AVISO: MPU6050 ainda sem fiação — conecte VCC/GND/SDA/SCL na vista 2D\n'}#include <Adafruit_MPU6050.h>

Adafruit_MPU6050 mpu;  // SDA→GPIO${ctxI2c(ctx).sda} · SCL→GPIO${ctxI2c(ctx).scl}

void mpu6050_init() {
  // endereço derivado do strap SDO/AD0 da sua fiação
  if (!mpu.begin(${ctxAddr(ctx, 'mpu6050', '0x68')})) Serial.println("MPU6050 não encontrado!");
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
}

void mpu6050_read(float accel[3], float gyro[3]) {
  sensors_event_t a, g, t;
  mpu.getEvent(&a, &g, &t);
  accel[0] = a.acceleration.x; accel[1] = a.acceleration.y; accel[2] = a.acceleration.z;
  gyro[0]  = g.gyro.x;         gyro[1]  = g.gyro.y;         gyro[2]  = g.gyro.z;
}`,
  },

  {
    id: 'driver_gps', label: 'Driver · GPS', file: 'sensor_gps.h', layer: 'adaptive', requires: ['gnss'],
    desc: 'Receptor NEO-6M via UART2 (NMEA). Confira baud e cruzamento TX/RX.',
    code: (ctx) => {
      const u = ctx.uart || { rx: 16, tx: 17 }
      return `// camada: adaptive — adapte baud/pinos à sua montagem
${ctxWired(ctx, 'gps_neo6m') ? '' : '// AVISO: GPS ainda sem fiação — conecte VCC/GND e cruze TX/RX na vista 2D\n'}#include <TinyGPSPlus.h>

// NEO-6M fala 9600 8N1 de fábrica. Fios CRUZADOS:
//   TX do GPS → GPIO${u.rx} (RX2)   ·   RX do GPS → GPIO${u.tx} (TX2)
#define GPS_BAUD   9600
#define GPS_RX_PIN ${u.rx}   // pino do ESP32 que RECEBE o TX do GPS
#define GPS_TX_PIN ${u.tx}   // pino do ESP32 que alimenta o RX do GPS

TinyGPSPlus gps;

void gps_init() {
  Serial2.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
}

bool gps_read() {
  while (Serial2.available()) gps.encode(Serial2.read());
  return gps.location.isValid();
}

double  gps_lat()  { return gps.location.lat(); }
double  gps_lng()  { return gps.location.lng(); }
float   gps_alt()  { return gps.altitude.meters(); }
uint8_t gps_sats() { return gps.satellites.value(); }`
    },
  },

  // ── mission-specific ─────────────────────────────────────────────
  {
    id: 'app_environment', label: 'Análise ambiental', file: 'app_environment.h', layer: 'mission', requires: ['temperature'],
    desc: 'Processamento científico do perfil atmosférico — escreva a sua análise.',
    objective: 'environmental',
    code: () => `// camada: mission — módulo específico desta missão
// Analise o perfil atmosférico durante o voo.

float env_lapse_rate(float t_now, float t_prev, float alt_now, float alt_prev) {
  float dAlt = alt_now - alt_prev;
  if (dAlt == 0) return 0;
  return (t_now - t_prev) / dAlt * 1000.0;  // °C/km
}`,
  },
  {
    id: 'app_attitude', label: 'Estimador de atitude', file: 'app_attitude.h', layer: 'mission', requires: ['imu'],
    desc: 'Fusão accel+giro para atitude — algoritmo específico da missão.',
    objective: 'attitude',
    code: () => `// camada: mission — módulo específico desta missão
// Filtro complementar simples para atitude (roll/pitch).

#define ALPHA 0.98f

void attitude_update(float accel[3], float gyro[3], float dt,
                     float *roll, float *pitch) {
  float accRoll  = atan2f(accel[1], accel[2]) * 57.2958f;
  float accPitch = atan2f(-accel[0], sqrtf(accel[1]*accel[1] + accel[2]*accel[2])) * 57.2958f;
  *roll  = ALPHA * (*roll  + gyro[0] * dt) + (1 - ALPHA) * accRoll;
  *pitch = ALPHA * (*pitch + gyro[1] * dt) + (1 - ALPHA) * accPitch;
}`,
  },
  {
    id: 'app_flight_events', label: 'Eventos de voo', file: 'app_flight.h', layer: 'mission', requires: ['pressure'],
    desc: 'Detecção de subida, burst e queda pelo perfil barométrico.',
    objective: 'altitude_profile',
    code: () => `// camada: mission — módulo específico desta missão
// Detecta fases do voo pela taxa de variação de altitude.

enum FlightPhase { GROUND, ASCENT, BURST, DESCENT, LANDED };

FlightPhase flight_phase(float climbRate_mps) {
  if (climbRate_mps >  1.0f) return ASCENT;
  if (climbRate_mps < -3.0f) return DESCENT;
  return GROUND;
}`,
  },
  {
    id: 'app_experiment', label: 'Experimento científico', file: 'app_experiment.h', layer: 'mission', requires: [],
    desc: 'Esqueleto do experimento personalizado — construa livremente.',
    objective: 'custom',
    code: () => `// camada: mission — módulo específico desta missão
// Implemente aqui o processamento do seu experimento.

void experiment_init() {
  // setup do experimento
}

void experiment_process() {
  // processamento por amostra
}`,
  },
]

export const SOFTWARE_BY_ID = Object.fromEntries(SOFTWARE_MODULES.map((m) => [m.id, m]))
export const getModule = (id) => SOFTWARE_BY_ID[id] || null

// Derive the modules a mission actually uses from hardware + objective.
// Returns ordered list (core → adaptive → mission).
export function activeModules({ defs, componentIds = [], objectiveId = null }) {
  const design = defsForIds(defs, componentIds)
  const rank = { core: 0, adaptive: 1, mission: 2 }
  return SOFTWARE_MODULES
    .filter((m) => {
      if (m.objective && m.objective !== objectiveId) return false
      if (m.requires.length && !m.requires.every((c) => hasCapability(design, c))) return false
      return true
    })
    .sort((a, b) => (rank[a.layer] ?? 9) - (rank[b.layer] ?? 9))
}

// Generate the code for a module given the mission context.
export function moduleCode(mod, ctx = {}) {
  if (!mod) return ''
  return typeof mod.code === 'function' ? mod.code(ctx) : (mod.code || '')
}
