import { useMemo, useState } from 'react'
import useForge from '../../store/useForge'
import EmptyState from './EmptyState'

// Build a plausible Arduino sketch from whatever parts the mission loaded.
// Pure function of the entity set — regenerates as hardware changes.
function generateFirmware(entities, mission) {
  const have = (id) => !!entities[id]
  const L = []
  const p = (s = '') => L.push(s)

  p(`// ${mission.label || 'FORGE mission'} — auto-generated firmware`)
  p(`// target: ESP32-WROOM-32 · ${Object.keys(entities).length} components`)
  p()
  p('#include <Wire.h>')
  if (have('bme280'))      p('#include <Adafruit_BME280.h>')
  if (have('mpu6050'))     p('#include <Adafruit_MPU6050.h>')
  if (have('ccs811'))      p('#include <Adafruit_CCS811.h>')
  if (have('gps_neo6m'))   p('#include <TinyGPSPlus.h>')
  if (have('lora_sx1276')) p('#include <LoRa.h>')
  if (have('sd_card'))     p('#include <SD.h>')
  p()
  p('#define I2C_SDA 21')
  p('#define I2C_SCL 22')
  if (have('gps_neo6m')) { p('#define GPS_RX 16'); p('#define GPS_TX 17') }
  if (have('lora_sx1276')) { p('#define LORA_CS 5'); p('#define LORA_RST 14'); p('#define LORA_DIO0 26') }
  if (have('sd_card')) p('#define SD_CS 15')
  p()
  if (have('bme280'))    p('Adafruit_BME280 bme;')
  if (have('mpu6050'))   p('Adafruit_MPU6050 mpu;')
  if (have('ccs811'))    p('Adafruit_CCS811 ccs;')
  if (have('gps_neo6m')) p('TinyGPSPlus gps;')
  p()
  p('void setup() {')
  p('  Serial.begin(115200);')
  p('  Wire.begin(I2C_SDA, I2C_SCL);')
  if (have('bme280'))  p('  if (!bme.begin(0x76)) Serial.println("BME280 not found");')
  if (have('mpu6050')) p('  if (!mpu.begin()) Serial.println("MPU6050 not found");')
  if (have('ccs811'))  p('  if (!ccs.begin()) Serial.println("CCS811 not found");')
  if (have('gps_neo6m')) p('  Serial2.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX);')
  if (have('lora_sx1276')) {
    p('  LoRa.setPins(LORA_CS, LORA_RST, LORA_DIO0);')
    p('  if (!LoRa.begin(915E6)) Serial.println("LoRa init failed");')
  }
  if (have('sd_card')) p('  if (!SD.begin(SD_CS)) Serial.println("SD mount failed");')
  p('  Serial.println("FORGE node ready");')
  p('}')
  p()
  p('void loop() {')
  if (have('bme280')) {
    p('  float t = bme.readTemperature();')
    p('  float p = bme.readPressure() / 100.0F;')
    p('  float h = bme.readHumidity();')
  }
  if (have('ccs811')) p('  if (ccs.available()) ccs.readData();')
  if (have('gps_neo6m')) p('  while (Serial2.available()) gps.encode(Serial2.read());')
  if (have('lora_sx1276')) {
    p('  LoRa.beginPacket();')
    if (have('bme280')) p('  LoRa.printf("T=%.1f P=%.0f H=%.0f", t, p, h);')
    else                p('  LoRa.print("FORGE telemetry");')
    p('  LoRa.endPacket();')
  }
  if (have('sd_card')) p('  // append sample to log_xxxx.csv on SD')
  p('  delay(1000);')
  p('}')
  return L.join('\n')
}

export default function FirmwarePanel() {
  const { entities, mission } = useForge()
  const [copied, setCopied] = useState(false)
  const code = useMemo(() => generateFirmware(entities, mission), [entities, mission])

  if (Object.keys(entities).length === 0) return <EmptyState section="Firmware" />

  const lines = code.split('\n')
  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400) }).catch(() => {})
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '14px 18px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexShrink: 0 }}>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: 'var(--ink2)' }}>main.ino</span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 9, color: 'var(--ink4)' }}>{lines.length} linhas · ESP32 · Arduino</span>
        <div style={{ flex: 1 }} />
        <button onClick={copy} style={{
          padding: '4px 12px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
          fontFamily: "'Space Mono', monospace", letterSpacing: '.06em', textTransform: 'uppercase',
          border: '1px solid var(--rule)', background: copied ? 'var(--ok)' : 'var(--paper2)',
          color: copied ? '#fff' : 'var(--ink3)',
        }}>{copied ? 'copiado ✓' : 'copiar'}</button>
      </div>

      <div style={{
        flex: 1, overflow: 'auto', background: '#14110D', borderRadius: 6,
        border: '1px solid var(--rule)', padding: '12px 0',
      }}>
        <pre style={{ margin: 0, fontFamily: "'Space Mono', monospace", fontSize: 11.5, lineHeight: 1.65 }}>
          {lines.map((ln, i) => (
            <div key={i} style={{ display: 'flex', padding: '0 14px' }}>
              <span style={{ color: 'rgba(255,255,255,.22)', width: 30, textAlign: 'right', marginRight: 14, flexShrink: 0, userSelect: 'none' }}>{i + 1}</span>
              <code style={{ color: colorFor(ln), whiteSpace: 'pre-wrap' }}>{ln || ' '}</code>
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}

// Minimal syntax tinting — enough to read like an editor without a lexer.
function colorFor(line) {
  const t = line.trim()
  if (t.startsWith('//')) return 'rgba(255,255,255,.34)'
  if (t.startsWith('#include') || t.startsWith('#define')) return '#C8831A'
  if (/\b(void|float|if|while|return|begin)\b/.test(t)) return '#7FB5E6'
  return 'rgba(255,255,255,.82)'
}
