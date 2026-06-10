// ──────────────────────────────────────────────────────────────────
// Training scenarios — guided troubleshooting exercises.
//
// Each scenario plants ONE hidden root cause and reproduces how it
// actually looks in real life: the twin is seeded with the (possibly
// faulty) wiring and a realistic device log streams into the serial
// buffer. Students investigate using every surface of the platform
// (serial log, 2D wiring, inspector, Log Doctor) and submit a diagnosis.
//
// Deliberately NOT single-answer: each scenario lists several accepted
// causes/remedies where reality allows it (e.g. swapped UART wires can
// be fixed in the wiring OR in code), and the diagnosis options are a
// shared catalog so the answer is never "the only option shown".
//
// Pure data + generators — no store/UI imports.
// ──────────────────────────────────────────────────────────────────

// NMEA checksum: XOR of all chars between '$' and '*'
function nmea(body) {
  let c = 0
  for (let i = 0; i < body.length; i++) c ^= body.charCodeAt(i)
  return `$${body}*${c.toString(16).toUpperCase().padStart(2, '0')}`
}

const hhmmss = (s) => {
  const base = 12 * 3600 + s
  const h = Math.floor(base / 3600) % 24, m = Math.floor(base / 60) % 60, sec = base % 60
  return `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}${String(sec).padStart(2, '0')}.00`
}

// GPGGA without fix / with fix
const ggaNoFix = (t, sats) => nmea(`GPGGA,${hhmmss(t)},,,,,0,${String(sats).padStart(2, '0')},,,M,,M,,`)
const ggaFix = (t, sats) => nmea(`GPGGA,${hhmmss(t)},2333.864,S,04644.182,W,1,${String(sats).padStart(2, '0')},1.8,742.1,M,-6.1,M,,`)
const rmcNoFix = (t) => nmea(`GPRMC,${hhmmss(t)},V,,,,,,,100626,,,N`)
const rmcFix = (t) => nmea(`GPRMC,${hhmmss(t)},A,2333.864,S,04644.182,W,0.05,054.7,100626,,,A`)
// GPGSV: satellites in view with SNR values (the key diagnostic sentence)
const gsv = (sats) => {
  const fields = sats.map(([prn, el, az, snr]) =>
    `${String(prn).padStart(2, '0')},${String(el).padStart(2, '0')},${String(az).padStart(3, '0')},${snr ? String(snr).padStart(2, '0') : ''}`)
  return nmea(`GPGSV,1,1,${String(sats.length).padStart(2, '0')},${fields.join(',')}`)
}

const BOOT = [
  { d: 400, m: '=== ESP32 START ===', cls: 'info' },
  { d: 300, m: 'GPS UART2 init · 9600 8N1', cls: 'info' },
]

// random printable garbage (what a wrong baud rate actually looks like)
function garbage(n) {
  const chars = '\u00fe\u00d8\u00b1\u00a7?~^]xK\u00e6\u00f0#@\u00bf\u00ab'
  let s = ''
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

// ── shared diagnosis catalog (shuffled in the UI) ──────────────────
export const CAUSE_CATALOG = [
  { id: 'wiring_txrx', label: 'Fios TX/RX não cruzados (TX em TX)' },
  { id: 'baud', label: 'Baud rate errado no firmware' },
  { id: 'sky', label: 'Sem visada do céu / antena mal posicionada' },
  { id: 'power', label: 'Alimentação instável durante a aquisição' },
  { id: 'coldstart', label: 'Cold start normal — só precisa de tempo' },
  { id: 'pins_code', label: 'Pinos UART errados no código' },
  { id: 'broken', label: 'Módulo GPS defeituoso' },
]

export const GPS_SCENARIOS = [
  {
    id: 'gps_silent',
    title: 'Cenário 1 · GPS em silêncio',
    briefing: 'A equipe montou o GPS no payload, o firmware inicializa, mas nenhum dado de posição chega. Investigue o log, a fiação e o código — e diga por quê.',
    seed: 'txswap',     // twin gets the fault: TX→TX, RX→RX
    steps: [
      ...BOOT,
      { d: 800, m: 'aguardando NMEA…', cls: 'info' },
      { d: 2000, m: 'GPS: 0 bytes recebidos em 2000 ms', cls: 'warn' },
      { d: 2000, m: 'GPS: 0 bytes recebidos em 2000 ms', cls: 'warn' },
      { d: 1500, m: 'UART timeout · nenhuma sentença NMEA', cls: 'err' },
      { d: 2000, m: 'GPS: 0 bytes recebidos em 2000 ms', cls: 'warn' },
      { d: 1500, m: 'UART timeout · nenhuma sentença NMEA', cls: 'err' },
      { d: 1200, m: '— padrão se repete indefinidamente —', cls: 'info' },
    ],
    accepted: ['wiring_txrx', 'pins_code'],
    approaches: [
      'Cruzar os fios na fiação: TX do GPS → GPIO16 (RX2), RX do GPS → GPIO17 (TX2).',
      'Manter os fios e trocar os pinos no código: Serial2.begin(9600, SERIAL_8N1, RX, TX) com os papéis invertidos.',
      'Verificar com LED/osciloscópio se há atividade no fio do TX do GPS antes de mexer.',
    ],
    hints: [
      'Zero bytes não é sinal fraco — sinal fraco ainda produz sentenças NMEA. Zero bytes significa que nada elétrico chega ao pino.',
      'Compare a fiação 2D com a regra de UART: quem transmite (TX) precisa falar com quem recebe (RX).',
      'Olhe o erro de fiação que a vista 2D está apontando neste momento.',
    ],
    reveal: 'Causa plantada: TX→TX e RX→RX (fios não cruzados). O TX do GPS transmite NMEA, mas estava ligado ao TX2 do ESP32 — dois transmissores no mesmo fio, nenhum receptor. Correções válidas: cruzar os fios OU inverter os pinos na chamada Serial2.begin (ambas funcionam; cruzar os fios é a convenção).',
  },
  {
    id: 'gps_garbage',
    title: 'Cenário 2 · Dados ilegíveis',
    briefing: 'O GPS está claramente enviando dados — o monitor mostra atividade constante — mas nada é interpretável e o parser nunca extrai uma posição.',
    seed: 'ok',
    steps: [
      ...BOOT.map(s => ({ ...s, m: s.m.replace('9600', '115200') })),
      { d: 700, m: garbage(28), cls: 'err' },
      { d: 900, m: garbage(34), cls: 'err' },
      { d: 900, m: garbage(22), cls: 'err' },
      { d: 1000, m: 'parser NMEA: 0 sentenças válidas · 312 bytes descartados', cls: 'warn' },
      { d: 900, m: garbage(31), cls: 'err' },
      { d: 900, m: garbage(26), cls: 'err' },
      { d: 1000, m: 'parser NMEA: 0 sentenças válidas · 644 bytes descartados', cls: 'warn' },
      { d: 1200, m: '— padrão se repete indefinidamente —', cls: 'info' },
    ],
    accepted: ['baud'],
    approaches: [
      'Ajustar o firmware para 9600 baud (padrão de fábrica do NEO-6M).',
      'Alternativa avançada: reconfigurar o módulo para 115200 via comando UBX e manter o firmware.',
    ],
    hints: [
      'Há bytes chegando — então fiação e alimentação estão entregando ALGO. O problema é a interpretação.',
      'Caracteres aleatórios em volume constante são a assinatura clássica de descasamento de velocidade serial.',
      'Compare o baud do init no log com o padrão de fábrica do NEO-6M (veja a referência de engenharia no inspetor).',
    ],
    reveal: 'Causa plantada: firmware lendo a 115200 enquanto o NEO-6M fala 9600 (padrão de fábrica). Os bytes chegam, mas amostrados na velocidade errada viram lixo. Correções válidas: baixar o firmware para 9600 OU reconfigurar o módulo para 115200 — as duas pontas só precisam concordar.',
  },
  {
    id: 'gps_nosky',
    title: 'Cenário 3 · Buscando sem encontrar',
    briefing: 'O GPS responde, as sentenças NMEA são válidas, mas depois de muitos minutos continua sem posição. A bancada fica no centro do laboratório.',
    seed: 'ok',
    steps: [
      ...BOOT,
      { d: 800, m: gsv([[14, 32, 187, 11]]), cls: 'ok' },
      { d: 1000, m: ggaNoFix(2, 1), cls: 'warn' },
      { d: 1000, m: rmcNoFix(3), cls: 'warn' },
      { d: 1500, m: gsv([[14, 32, 187, 9], [22, 18, 311, 0]]), cls: 'ok' },
      { d: 1000, m: ggaNoFix(6, 1), cls: 'warn' },
      { d: 1500, m: gsv([[14, 32, 187, 13], [22, 18, 311, 8], [31, 44, 62, 0]]), cls: 'ok' },
      { d: 1000, m: ggaNoFix(9, 2), cls: 'warn' },
      { d: 1000, m: 'sem fix há 12 min · satélites rastreados: 2 · SNR máx 13 dBHz', cls: 'warn' },
      { d: 1200, m: '— padrão se repete indefinidamente —', cls: 'info' },
    ],
    accepted: ['sky'],
    approaches: [
      'Levar a montagem para perto de uma janela ou área externa e repetir a aquisição.',
      'Usar/posicionar antena externa ativa com visada do céu (cabo para fora da bancada).',
      'Confirmar que a antena cerâmica está voltada para cima e bem encaixada.',
    ],
    hints: [
      'O módulo está saudável: NMEA válido com checksum correto. Olhe o CONTEÚDO das sentenças, não a presença delas.',
      'Nas $GPGSV, o último campo de cada satélite é o SNR em dBHz. Céu aberto dá 30–45; aqui está em um dígito.',
      'Quantos satélites são necessários para um fix 3D? Quantos o log mostra sendo rastreados?',
    ],
    reveal: 'Causa plantada: sem visada do céu (bancada no meio do prédio). Eletrônica e firmware perfeitos — a física não coopera: SNR < 15 dBHz e 1–3 satélites nunca fecham um fix (mínimo 4). Qualquer abordagem que melhore a visada resolve: janela, área externa ou antena externa.',
  },
  {
    id: 'gps_resets',
    title: 'Cenário 4 · Quase lá, e recomeça',
    briefing: 'O GPS começa a rastrear satélites normalmente, mas nunca completa a aquisição — algo acontece sempre no meio do caminho.',
    seed: 'ok',
    steps: [
      ...BOOT,
      { d: 800, m: gsv([[14, 32, 187, 28], [22, 18, 311, 24]]), cls: 'ok' },
      { d: 1000, m: ggaNoFix(2, 2), cls: 'warn' },
      { d: 1000, m: gsv([[14, 32, 187, 30], [22, 18, 311, 26], [31, 44, 62, 22]]), cls: 'ok' },
      { d: 900, m: ggaNoFix(4, 3), cls: 'warn' },
      { d: 700, m: '$GPTXT,01,01,02,u-blox ag - www.u-blox.com*50', cls: 'err' },
      { d: 300, m: '$GPTXT,01,01,02,HW UBX-G60xx 00040007*52', cls: 'err' },
      { d: 500, m: 'GPS reiniciou — rastreio zerado (3.3V medido: 2.9 V no pico)', cls: 'err' },
      { d: 1000, m: gsv([[14, 32, 187, 27]]), cls: 'ok' },
      { d: 1000, m: ggaNoFix(9, 1), cls: 'warn' },
      { d: 800, m: '$GPTXT,01,01,02,u-blox ag - www.u-blox.com*50', cls: 'err' },
      { d: 400, m: 'GPS reiniciou — rastreio zerado (3.3V medido: 2.9 V no pico)', cls: 'err' },
      { d: 1200, m: '— padrão se repete indefinidamente —', cls: 'info' },
    ],
    accepted: ['power'],
    approaches: [
      'Alimentar o GPS por fonte/regulador dedicado em vez do 3V3 do ESP32.',
      'Adicionar capacitor de desacoplamento (100 uF + 100 nF) junto ao VCC do GPS.',
      'Trocar cabo/porta USB por uma fonte capaz de sustentar os picos de corrente.',
    ],
    hints: [
      'Repare na sequência: SNR bom, satélites subindo… e então o banner de boot do u-blox aparece de novo. O que um banner de boot significa?',
      'A corrente do NEO-6M tem picos justamente durante a aquisição. O que acontece com um regulador fraco sob pico de corrente?',
      'Há uma medição de tensão escondida no log. Compare com a faixa de operação na referência de engenharia.',
    ],
    reveal: 'Causa plantada: queda de tensão sob pico de corrente. O NEO-6M puxa picos de ~65 mA na aquisição; somado ao ESP32 (WiFi ~240 mA), o 3V3 afunda para 2.9 V e o GPS reseta — sempre no mesmo ponto. Qualquer reforço de alimentação resolve: fonte dedicada, capacitores ou USB melhor.',
  },
  {
    id: 'gps_patience',
    title: 'Cenário 5 · Defeito ou paciência?',
    briefing: 'Primeiro teste do GPS recém-chegado, em área externa. A equipe acha que veio com defeito porque "está demorando demais". Avalie a evidência antes de culpar o hardware.',
    seed: 'ok',
    steps: [
      ...BOOT,
      { d: 800, m: gsv([[14, 12, 187, 0]]), cls: 'warn' },
      { d: 1000, m: ggaNoFix(2, 0), cls: 'warn' },
      { d: 1400, m: gsv([[14, 12, 187, 18], [22, 18, 311, 0]]), cls: 'ok' },
      { d: 1000, m: ggaNoFix(5, 1), cls: 'warn' },
      { d: 1400, m: gsv([[14, 12, 187, 24], [22, 18, 311, 21], [31, 44, 62, 19]]), cls: 'ok' },
      { d: 1000, m: ggaNoFix(8, 3), cls: 'warn' },
      { d: 1400, m: gsv([[14, 12, 187, 31], [22, 18, 311, 28], [31, 44, 62, 25], [25, 61, 140, 33]]), cls: 'ok' },
      { d: 1000, m: ggaFix(12, 4), cls: 'ok' },
      { d: 800, m: rmcFix(13), cls: 'ok' },
      { d: 800, m: 'FIX 3D obtido · 4 satélites · TTFF 41 s (cold start, sem bateria de backup)', cls: 'ok' },
      { d: 1200, m: '— fim do trecho de log —', cls: 'info' },
    ],
    accepted: ['coldstart'],
    approaches: [
      'Nenhuma correção necessária: cold start de ~30–60 s é comportamento nominal.',
      'Adicionar/soldar bateria de backup para hot start (~1 s) nos próximos boots.',
      'Documentar o TTFF esperado no procedimento de teste da equipe.',
    ],
    hints: [
      'Acompanhe a tendência nas $GPGSV: o número de satélites e o SNR estão estagnados ou crescendo?',
      'Procure na referência de engenharia o TTFF típico de um cold start sem bateria de backup.',
      'Nem todo comportamento estranho é um defeito. O que o final do log mostra?',
    ],
    reveal: 'Causa plantada: nenhuma falha — cold start nominal. Sem bateria de backup o módulo baixa o almanaque do zero (~30–60 s de céu aberto). O log mostra exatamente a progressão saudável: satélites e SNR subindo até o fix em 41 s. Lição: estabelecer o comportamento esperado ANTES de declarar defeito; a bateria de backup reduz boots futuros para ~1 s.',
  },
]

export const getScenario = (id) => GPS_SCENARIOS.find(s => s.id === id) || null

export const randomScenario = () =>
  GPS_SCENARIOS[Math.floor(Math.random() * GPS_SCENARIOS.length)]

// Seed wires for the twin. 'ok' = correct wiring; 'txswap' = the
// planted straight-through fault (visible evidence in the 2D view).
export function scenarioWires(scenario) {
  const W = (pin, espPin) => ({ from: { comp: 'gps_neo6m', pin }, to: { comp: 'esp32', pin: espPin } })
  const base = [W('VCC', '3V3'), W('GND', 'GND')]
  if (scenario.seed === 'txswap') return [...base, W('TX', 'GPIO17'), W('RX', 'GPIO16')]
  return [...base, W('TX', 'GPIO16'), W('RX', 'GPIO17')]
}
