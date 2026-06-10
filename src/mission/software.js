// ──────────────────────────────────────────────────────────────────
// Software modules — firmware building blocks the user composes in the
// "Software" step. Each module may require hardware capabilities; the
// copilot flags modules whose requirements aren't met by the design.
// ──────────────────────────────────────────────────────────────────

export const SOFTWARE_MODULES = [
  { id: 'telemetry_pkt', label: 'Codificador de telemetria', desc: 'Monta o pacote padronizado de dados.', requires: [] },
  { id: 'wifi_uplink',   label: 'Uplink WiFi',               desc: 'Envia pacotes à estação base por WiFi.', requires: ['wifi'] },
  { id: 'lora_uplink',   label: 'Uplink LoRa',               desc: 'Telemetria de longo alcance via LoRa.', requires: ['lora'] },
  { id: 'data_logger',   label: 'Data logger',               desc: 'Grava CSV em cartão SD.', requires: ['storage'] },
  { id: 'sensor_sched',  label: 'Agendador de sensores',     desc: 'Amostragem periódica determinística.', requires: [] },
  { id: 'attitude',      label: 'Estimador de atitude',      desc: 'Fusão de IMU (accel + giro).', requires: ['imu'] },
  { id: 'gnss_parser',   label: 'Parser GNSS',               desc: 'Decodifica sentenças NMEA do GPS.', requires: ['gnss'] },
  { id: 'watchdog',      label: 'Watchdog / recuperação',    desc: 'Reinicia o sistema em caso de falha.', requires: [] },
]

export const SOFTWARE_BY_ID = Object.fromEntries(SOFTWARE_MODULES.map((m) => [m.id, m]))
export const getModule = (id) => SOFTWARE_BY_ID[id] || null
