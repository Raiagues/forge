// ──────────────────────────────────────────────────────────────────
// Engineering reference — real, datasheet-grade context for each
// supported component, rendered in the inspector when a part is
// selected. Educational and engineering-focused: data structures,
// operational ranges, expected values, bus details, behaviour notes.
// Pure data — no store/UI imports, no generated text.
// ──────────────────────────────────────────────────────────────────

export const ENGINEERING = {
  esp32: {
    overview: 'Microcontrolador dual-core Xtensa LX6 a 240 MHz com WiFi 802.11 b/g/n e Bluetooth. Computador de bordo: lê os sensores pelo barramento I²C e transmite a telemetria.',
    ranges: [
      ['Tensão de operação', '3.0 – 3.6 V'],
      ['Flash', '4 MB (típico)'],
      ['Corrente (WiFi TX)', '~240 mA pico'],
      ['Corrente (modem sleep)', '~20 mA'],
      ['Temperatura', '-40 … +85 °C'],
    ],
    struct: `struct TlmPacket {      // pacote por amostra
  int32_t  temperature;  // 0.01 °C
  uint32_t pressure;     // Pa
  int16_t  accel[3];     // LSB cru
  int16_t  gyro[3];      // LSB cru
  uint32_t uptime_ms;
};`,
    notes: [
      'I²C: SDA padrão GPIO21, SCL padrão GPIO22 — remapeável para qualquer GPIO com saída.',
      'GPIO34–39 são somente entrada — não servem para SDA/SCL.',
      'WiFi e ADC2 compartilham hardware: leia baterias no ADC1 (ex.: GPIO34).',
    ],
  },
  bmp280: {
    overview: 'Sensor barométrico piezo-resistivo da Bosch. Mede pressão absoluta e temperatura; a altitude é derivada da pressão pela atmosfera padrão.',
    bus: ['Endereço I²C', '0x76 (SDO=GND) ou 0x77 (SDO=3V3)'],
    ranges: [
      ['Tensão de operação', '1.71 – 3.6 V'],
      ['Pressão', '300 – 1100 hPa'],
      ['Temperatura', '-40 … +85 °C'],
      ['Precisão pressão', '±1 hPa (≈ ±8 m)'],
      ['Consumo típico', '2.7 µA @ 1 Hz'],
    ],
    struct: `struct Bmp280Sample {
  int32_t  temperature;  // 0.01 °C (ex.: 1523 = 15.23 °C)
  uint32_t pressure;     // Pa     (ex.: 96100 = 961 hPa)
};`,
    expected: [
      ['A 400 m de altitude', '~96.1 kPa · ~15 °C (ref. nível do mar)'],
      ['No solo (nível do mar)', '~101.3 kPa · ~25 °C'],
      ['A 30 km (estratosfera)', '~1.2 kPa · ~-45 °C'],
    ],
    notes: [
      'A pressão de referência (SEA_LEVEL_HPA) deve ser ajustada no dia do voo para altitude precisa.',
      'Acima de ~9 km a leitura extrapola a faixa calibrada — trate como estimativa.',
    ],
  },
  mpu6050: {
    overview: 'IMU de 6 eixos da InvenSense: acelerômetro e giroscópio MEMS de 3 eixos cada, com DMP interno. Mede a dinâmica do payload (vibração, rotação, queda livre).',
    bus: ['Endereço I²C', '0x68 (AD0=GND) ou 0x69 (AD0=3V3)'],
    ranges: [
      ['Tensão de operação', '2.375 – 3.46 V'],
      ['Acelerômetro', 'configurável ±2g … ±16g'],
      ['Giroscópio', 'configurável ±250 … ±2000 °/s'],
      ['Taxa de amostragem', 'até 1 kHz'],
      ['Consumo típico', '3.9 mA'],
    ],
    struct: `struct Mpu6050Sample {
  int16_t accel_x, accel_y, accel_z;  // LSB cru
  int16_t gyro_x,  gyro_y,  gyro_z;   // LSB cru
};`,
    expected: [
      ['Em repouso na bancada', 'accel Z ≈ 9.8 m/s² · gyro ≈ 0 °/s'],
      ['Em queda livre', '|accel| ≈ 0 m/s²'],
      ['Balão subindo (calmo)', 'oscilação lenta ±0.5 m/s²'],
    ],
    notes: [
      'Calibre os offsets com o sensor parado e nivelado antes do voo.',
      'Vibração mecânica contamina o acelerômetro — monte com espuma/desacoplamento.',
    ],
  },
}

export const engineeringFor = (id) => ENGINEERING[id] || null
