// ──────────────────────────────────────────────────────────────────
// Engineering reference — real, datasheet-grade context for each
// supported component, rendered in the inspector when a part is
// selected. Educational and engineering-focused: data structures,
// operational ranges, bus details, behaviour notes.
// Pure data — no store/UI imports.
// ──────────────────────────────────────────────────────────────────

export const ENGINEERING = {
  esp32: {
    overview: 'Microcontrolador dual-core Xtensa LX6 a 240 MHz com WiFi 802.11 b/g/n e Bluetooth. Computador de bordo: lê os sensores pelo barramento I²C e transmite a telemetria.',
    ranges: [
      ['Tensão de operação', '3.0 – 3.6 V'],
      ['Corrente (WiFi TX)', '~240 mA pico'],
      ['Corrente (modem sleep)', '~20 mA'],
      ['Temperatura', '-40 … +85 °C'],
      ['GPIO máx por pino', '12 mA fonte'],
    ],
    struct: `struct TlmPacket {      // pacote por amostra
  float    temperature;  // °C
  float    pressure;     // hPa
  float    accel[3];     // m/s²
  float    gyro[3];      // rad/s
  uint32_t uptime_ms;
};`,
    notes: [
      'O barramento I²C padrão usa GPIO21 (SDA) e GPIO22 (SCL), remapeável por software.',
      'GPIO34–39 são somente entrada — não servem para SDA/SCL.',
      'WiFi e ADC2 compartilham hardware: leia baterias no ADC1 (ex.: GPIO34).',
    ],
  },
  bmp280: {
    overview: 'Sensor barométrico piezo-resistivo da Bosch. Mede pressão absoluta e temperatura; a altitude é derivada da pressão pela atmosfera padrão.',
    bus: ['Endereço I²C', '0x76 (SDO→GND) ou 0x77 (SDO→VCC)'],
    ranges: [
      ['Pressão', '300 – 1100 hPa'],
      ['Temperatura', '-40 … +85 °C'],
      ['Precisão pressão', '±1 hPa (≈ ±8 m)'],
      ['Resolução altitude', '~0.16 m (ultra high res)'],
      ['Consumo típico', '2.7 µA @ 1 Hz'],
    ],
    struct: `struct Bmp280Sample {
  float temperature;  // °C    (ex.: 23.4)
  float pressure;     // hPa   (ex.: 1013.2)
  float altitude;     // m     (derivada, ref. nível do mar)
};`,
    expected: [
      ['No solo (nível do mar)', '~1013 hPa · ~25 °C'],
      ['A 10 km de altitude', '~265 hPa · ~-50 °C'],
      ['A 30 km (estratosfera)', '~12 hPa · ~-45 °C'],
    ],
    notes: [
      'A pressão de referência (SEA_LEVEL_HPA) deve ser ajustada no dia do voo para altitude precisa.',
      'Acima de ~9 km a leitura extrapola a faixa calibrada — trate como estimativa.',
    ],
  },
  mpu6050: {
    overview: 'IMU de 6 eixos da InvenSense: acelerômetro e giroscópio MEMS de 3 eixos cada, com DMP interno. Mede a dinâmica do payload (vibração, rotação, queda livre).',
    bus: ['Endereço I²C', '0x68 (AD0→GND) ou 0x69 (AD0→VCC)'],
    ranges: [
      ['Acelerômetro', '±2 / ±4 / ±8 / ±16 g'],
      ['Giroscópio', '±250 … ±2000 °/s'],
      ['Taxa de amostragem', 'até 1 kHz'],
      ['Consumo típico', '3.9 mA'],
      ['Temperatura', '-40 … +85 °C'],
    ],
    struct: `struct Mpu6050Sample {
  float accel[3];  // m/s²  (z ≈ 9.81 em repouso)
  float gyro[3];   // rad/s (≈ 0 em repouso)
  float temp;      // °C    (die interno)
};`,
    expected: [
      ['Em repouso na bancada', 'a=[0, 0, 9.81] m/s² · g≈0'],
      ['Em queda livre', '|a| ≈ 0 m/s²'],
      ['Balão subindo (calmo)', 'oscilação lenta ±0.5 m/s²'],
    ],
    notes: [
      'Calibre os offsets com o sensor parado e nivelado antes do voo.',
      'Vibração mecânica contamina o acelerômetro — monte com espuma/desacoplamento.',
    ],
  },
}

export const engineeringFor = (id) => ENGINEERING[id] || null
