// ──────────────────────────────────────────────────────────────────
// AI tutor — the knowledge + provider seam behind the persistent chat.
//
// Pure (no store/UI import). Two responsibilities:
//   1. SEED_QA — a curated library answering the most common questions
//      from university CubeSat teams, written as a precise embedded-
//      systems tutor (never condescending). Each answer is a list of
//      blocks the UI renders: paragraphs + inline schematic diagrams
//      (the diagram is a KEY string; the component maps it to an SVG, so
//      this module stays free of JSX).
//   2. runAssistant() — the async provider seam, mirroring runCopilot /
//      runLogDoctor. The 'local' provider answers from the seed library
//      offline (no cost, no network). The 'anthropic' provider is a stub
//      that POSTs to the backend (which holds the key server-side); until
//      that route exists it throws and the caller falls back to local.
// ──────────────────────────────────────────────────────────────────

// System prompt for the live tutor (used by the backend when wired). Kept
// here so the assistant's persona is defined in one place.
export const TUTOR_SYSTEM_PROMPT = `Você é o tutor de hardware do GuiaSat, uma plataforma de desenvolvimento de missões para times universitários de CubeSat e balão de alta altitude.

Especialidade: sistemas embarcados e eletrônica de satélites, com conhecimento dos componentes desta plataforma (ESP32-WROOM-32D, BMP280, MPU6050, NEO-6M, barramentos I²C/SPI/UART).

Regras:
- Trate o usuário como um estudante capaz. Dê explicações técnicas precisas, não simplificações vazias. Nunca seja condescendente.
- Use exemplos concretos com os pinos e componentes reais da plataforma.
- Quando útil, descreva um diagrama esquemático simples em palavras (o cliente pode renderizá-lo).
- Responda em português do Brasil, em poucos parágrafos curtos.
- Se a pergunta envolver uma ligação elétrica, diga claramente o que é seguro e o que danificaria o hardware.`

// b() = a paragraph block; d() = an inline diagram block (key + caption).
const b = (text) => ({ type: 'p', text })
const d = (key, caption) => ({ type: 'diagram', key, caption })

// ── seed library ────────────────────────────────────────────────────
// Each entry: id, q (the canonical question, also the suggestion chip
// label), keywords (for matching free-typed questions and Learn-more
// deep links), answer (blocks). `chip` marks the ones surfaced as
// quick-access suggestions in the empty chat.
export const SEED_QA = [
  {
    id: 'i2c', chip: true, short: 'I²C', q: 'O que é I²C e como funciona?',
    keywords: ['i2c', 'i²c', 'iic', 'barramento', 'two wire', 'twi', 'sda scl'],
    answer: [
      b('I²C (Inter-Integrated Circuit) é um barramento serial síncrono de dois fios: SDA (dados) e SCL (clock). Um mestre (o ESP32) gera o clock e conversa com vários periféricos no mesmo par de fios.'),
      b('Cada dispositivo tem um endereço de 7 bits — o BMP280 responde em 0x76/0x77 e o MPU6050 em 0x68/0x69. O mestre envia o endereço, o dispositivo certo responde (ACK) e a troca de bytes começa. Por isso dois sensores com o mesmo endereço no mesmo barramento conflitam.'),
      d('i2c-bus', 'SDA e SCL compartilhados, com resistores de pull-up ao 3V3 e dois dispositivos no mesmo barramento.'),
      b('As linhas são open-drain: os dispositivos só puxam para 0 V; quem leva a linha de volta a 3,3 V são os resistores de pull-up (tipicamente 4,7 kΩ). Sem eles o barramento não funciona. No ESP32 o padrão é SDA=GPIO21 e SCL=GPIO22.'),
    ],
  },
  {
    id: 'spi', chip: true, short: 'SPI', q: 'O que é SPI e como funciona?',
    keywords: ['spi', 'mosi', 'miso', 'sck', 'cs', 'vspi', 'serial periférico'],
    answer: [
      b('SPI (Serial Peripheral Interface) é um barramento síncrono full-duplex de quatro fios: MOSI (mestre→escravo), MISO (escravo→mestre), SCK (clock) e CS/SS (seleção de chip). É bem mais rápido que o I²C — útil para rádios LoRa e cartões SD.'),
      d('spi-bus', 'Mestre e escravo trocando dados nos quatro fios; cada escravo tem seu próprio CS.'),
      b('MOSI, MISO e SCK são compartilhados por todos os escravos; o que diferencia cada um é uma linha CS dedicada. O mestre abaixa o CS do dispositivo com quem quer falar e mantém os outros em alto. No ESP32 o VSPI padrão é MOSI=23, MISO=19, SCK=18, CS=5.'),
    ],
  },
  {
    id: 'uart', chip: true, short: 'UART', q: 'O que é UART e como funciona?',
    keywords: ['uart', 'serial', 'tx', 'rx', 'baud', 'nmea', 'gps'],
    answer: [
      b('UART (Universal Asynchronous Receiver/Transmitter) é uma comunicação serial assíncrona ponto a ponto: sem clock compartilhado, os dois lados combinam uma taxa (baud rate, ex.: 9600 ou 115200) e cada um sabe quando amostrar os bits.'),
      b('São dois fios de dados: TX (transmite) e RX (recebe). A regra de ouro é CRUZAR: o TX de um vai no RX do outro. Ligar TX em TX é o erro clássico de bring-up — dois transmissores no mesmo fio e nenhum dado chega.'),
      d('uart-cross', 'TX→RX e RX→TX cruzados entre o ESP32 (UART2) e um módulo como o NEO-6M.'),
      b('No ESP32, a UART2 usa por padrão GPIO17 (TX2) e GPIO16 (RX2). Um GPS NEO-6M, por exemplo, manda sentenças NMEA a 9600 8N1 do seu TX para o RX2 do ESP32.'),
    ],
  },
  {
    id: 'sda', chip: false, q: 'O que significa SDA?',
    keywords: ['sda', 'serial data'],
    answer: [
      b('SDA é a linha de dados (Serial Data) do barramento I²C. É por ela que trafegam o endereço do dispositivo e os bytes lidos/escritos, sincronizados pelo clock da linha SCL.'),
      b('No ESP32 o SDA padrão é o GPIO21. Como o I²C é open-drain, a SDA precisa de um resistor de pull-up ao 3V3 para voltar ao nível alto.'),
      d('i2c-bus', 'A SDA (dados) ao lado da SCL (clock), ambas com pull-up.'),
    ],
  },
  {
    id: 'scl', chip: false, q: 'O que significa SCL?',
    keywords: ['scl', 'serial clock', 'clock'],
    answer: [
      b('SCL é a linha de clock (Serial Clock) do barramento I²C. O mestre (ESP32) gera os pulsos de clock que dizem a todos os dispositivos quando ler cada bit na linha de dados (SDA).'),
      b('No ESP32 o SCL padrão é o GPIO22. Assim como a SDA, ela é open-drain e precisa de pull-up ao 3V3.'),
    ],
  },
  {
    id: 'analog-digital', chip: true, short: 'Analógico × digital', q: 'Qual a diferença entre pinos analógicos e digitais?',
    keywords: ['analógico', 'analogico', 'digital', 'adc', 'analog', 'leitura'],
    answer: [
      b('Um pino digital só enxerga dois estados: 0 (≈0 V) ou 1 (≈3,3 V). Serve para ler botões, acionar LEDs e falar protocolos como I²C/SPI/UART.'),
      b('Um pino analógico (com ADC — conversor analógico-digital) mede uma tensão contínua e a converte num número. O ADC do ESP32 é de 12 bits, ou seja, devolve 0–4095 proporcional a 0–3,3 V. É como você lê um sensor de tensão, um divisor de bateria ou um potenciômetro.'),
      d('analog-digital', 'Sinal analógico contínuo vs. sinal digital em degraus 0/1.'),
      b('No ESP32, atenção: os pinos do ADC2 não funcionam para leitura analógica enquanto o WiFi está ligado — para medir a bateria, use um pino do ADC1 (ex.: GPIO34–39, que são somente entrada).'),
    ],
  },
  {
    id: 'two-power', chip: true, short: 'Dois pinos de power', q: 'Por que não posso ligar dois pinos de alimentação juntos?',
    keywords: ['dois pinos de alimentação', 'vcc vcc', '3v3 5v', 'power', 'curto', 'alimentação juntos', 'fontes'],
    answer: [
      b('Pinos de alimentação são saídas de uma fonte, não entradas de sinal. Ligar duas saídas de tensões diferentes — por exemplo 3V3 com 5V/VIN — faz a fonte mais forte despejar corrente na mais fraca: é um curto que aquece e pode danificar o regulador.'),
      b('E mesmo que as tensões fossem iguais, ligar VCC de um sensor no VCC de outro não alimenta nada — você só uniu dois pontos que já deveriam vir, cada um, do 3V3 do ESP32. A alimentação certa é: cada VCC vai ao 3V3, cada GND vai ao GND.'),
      b('A exceção é o GND: todos os terras DEVEM se unir (referência comum). É só nas linhas positivas que juntar fontes diferentes é perigoso.'),
    ],
  },
  {
    id: 'pullup', chip: true, short: 'Pull-up', q: 'O que é um resistor de pull-up e quando preciso de um?',
    keywords: ['pull-up', 'pullup', 'resistor', 'open-drain', 'open drain'],
    answer: [
      b('Um resistor de pull-up liga uma linha de sinal à alimentação (3V3) através de um valor moderado (ex.: 4,7 kΩ). Ele garante que, quando ninguém está puxando a linha para baixo, ela fique num nível alto bem definido em vez de "flutuar".'),
      d('pullup', 'Resistor da linha de sinal ao 3V3; o dispositivo open-drain só puxa para GND.'),
      b('Você precisa dele em barramentos open-drain como o I²C: os dispositivos só conseguem puxar SDA/SCL para 0 V, então são os pull-ups que devolvem a linha para 3,3 V. A maioria dos módulos de breakout (BMP280, MPU6050) já traz esses pull-ups embutidos — por isso costuma funcionar sem adicionar nada. Se você juntar muitos módulos, os pull-ups ficam em paralelo e podem exigir atenção.'),
    ],
  },
  {
    id: 'pwm', chip: true, short: 'PWM', q: 'Como sei quais pinos suportam PWM?',
    keywords: ['pwm', 'duty', 'ledc', 'servo', 'modulação'],
    answer: [
      b('PWM (modulação por largura de pulso) liga e desliga um pino muito rápido, variando a fração do tempo em que ele fica em alto (duty cycle) — é assim que se controla brilho de LED, velocidade de motor ou um servo.'),
      d('pwm', 'Mesma frequência, duty cycles diferentes (25%, 50%, 75%).'),
      b('No ESP32 quase todo GPIO de saída suporta PWM, porque o periférico LEDC roteia qualquer um de seus 16 canais para qualquer pino — não há "pinos de PWM" fixos. As exceções são os pinos somente-entrada GPIO34, 35, 36 e 39, que não têm driver de saída e portanto não geram PWM. (No ESP8266 o PWM é por software e mais limitado.)'),
    ],
  },
  {
    id: 'logic-levels', chip: true, short: '3,3V × 5V', q: 'Qual a diferença entre lógica de 3,3V e 5V?',
    keywords: ['3.3v', '3,3v', '5v', 'nível lógico', 'logic level', 'level shifter', 'tensão'],
    answer: [
      b('O nível lógico é a tensão que representa um "1". O ESP32 é um chip de 3,3 V: seus pinos entregam 3,3 V no nível alto e NÃO toleram 5 V na entrada — aplicar 5 V num GPIO pode danificá-lo permanentemente.'),
      d('logic-levels', 'Faixas de nível alto/baixo em 3,3 V vs 5 V.'),
      b('Muitos sensores deste ecossistema (BMP280, MPU6050) são nativamente 3,3 V e conversam direto com o ESP32. O cuidado aparece ao ligar um dispositivo de 5 V que envia dados ao ESP32: aí é preciso um conversor de nível (level shifter) ou um divisor resistivo na linha que entra no ESP32. Saídas do ESP32 (3,3 V) costumam ser lidas como "1" por dispositivos de 5 V, então o sentido ESP32→5 V geralmente é tranquilo; o perigo é o 5 V→ESP32.'),
    ],
  },
]

export const SEED_CHIPS = SEED_QA.filter((s) => s.chip)
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// Match a free-typed (or Learn-more) question to a seed entry. Exact-ish
// question match wins; otherwise score by keyword hits.
export function matchSeed(question) {
  const q = norm(question)
  if (!q.trim()) return null
  // direct: the question contains (or is contained by) a seed question
  for (const s of SEED_QA) {
    const sq = norm(s.q)
    if (q === sq || q.includes(sq) || sq.includes(q)) return s
  }
  // keyword scoring
  let best = null, bestScore = 0
  for (const s of SEED_QA) {
    const score = s.keywords.reduce((n, k) => n + (q.includes(norm(k)) ? 1 : 0), 0)
    if (score > bestScore) { best = s; bestScore = score }
  }
  return bestScore > 0 ? best : null
}

// flatten an answer (paragraph blocks) to plain text — used to feed prior
// turns to the local LLM as conversation history.
export const blocksToText = (blocks = []) => blocks.filter((b) => b.type === 'p').map((b) => b.text).join('\n\n')

// Map a wiring-validation issue to the most relevant tutor question, so a
// "Saiba mais" on an invalid connection opens the right explanation. Falls
// back to a question about the specific rule (answered by the LLM, or by
// the topic suggestions offline).
export function tutorQuestionForWiringIssue(issue) {
  const t = norm(issue?.title) + ' ' + norm(issue?.detail)
  if (/\buart\b|\btx\b|\brx\b|nmea/.test(t)) return 'O que é UART e como funciona?'
  if (/i2c|i²c|\bsda\b|\bscl\b/.test(t)) return 'O que é I²C e como funciona?'
  if (/spi|mosi|miso|\bsck\b/.test(t)) return 'O que é SPI e como funciona?'
  if (/pull-?up/.test(t)) return 'O que é um resistor de pull-up e quando preciso de um?'
  if (/curto|aliment|3v3|\bgnd\b|tensao|fonte|power/.test(t)) return 'Por que não posso ligar dois pinos de alimentação juntos?'
  return issue?.title ? `Por que "${issue.title}" é um problema nessa ligação?` : 'Por que essa ligação não é válida?'
}

// fallback answer when nothing in the library matches and no live provider
// is available — honest about the offline library, points to the topics.
export function fallbackBlocks() {
  return [
    b('Ainda não tenho uma resposta pronta para isso na biblioteca offline. Posso explicar bem qualquer um destes temas — toque numa sugestão:'),
    { type: 'suggestions', ids: SEED_CHIPS.map((s) => s.id) },
    b('Com uma chave de API configurada no servidor, o tutor passa a responder perguntas abertas em tempo real. Sem ela, ele funciona com esta biblioteca curada — sem custo e sem internet.'),
  ]
}

function localAnswer(question) {
  const seed = matchSeed(question)
  return seed
    ? { blocks: seed.answer, seedId: seed.id }
    : { blocks: fallbackBlocks(), seedId: null }
}

// Live provider stub: the key lives on the BACKEND, so the browser only
// calls our own server. Until that route exists this throws and the caller
// falls back to the local library. (Wired fully in a later step.)
async function anthropicAnswer(question, { endpoint }) {
  const res = await fetch(endpoint || 'http://localhost:3001/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, system: TUTOR_SYSTEM_PROMPT }),
  })
  if (!res.ok) throw new Error(`assistant backend ${res.status}`)
  const data = await res.json()
  // backend returns plain text; wrap as a paragraph block
  return { blocks: [b(data.text)], seedId: null }
}

// Async provider seam — same shape as runCopilot/runLogDoctor.
export async function runAssistant({ question }, { provider = 'local', endpoint } = {}) {
  if (provider === 'anthropic') {
    try { return await anthropicAnswer(question, { endpoint }) } catch { /* fall back offline */ }
  }
  return localAnswer(question)
}
