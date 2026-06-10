// ──────────────────────────────────────────────────────────────────
// Log Doctor — the AI debugging assistant (Wizard-of-Oz MVP).
//
// Input: raw device output (serial log text) + the digital-twin context
// (entities, wiring state, derived I2C addresses, wired GPIOs).
// Output: ranked findings { probable cause, evidence, confidence,
// suggested fixes (wiring or code) }.
//
// Under the hood it is a SIGNATURE CATALOG of known failure patterns
// cross-referenced against the twin: a log symptom alone gives medium
// confidence; symptom + corroborating twin state (e.g. "NOT FOUND" in
// the log AND the sensor is unwired in the schematic) gives high
// confidence. No model calls — but `runLogDoctor()` is async and
// provider-pluggable so a real LLM can slot in later without touching
// any caller (same seam pattern as the mission copilot).
//
// Pure: no store/UI imports. ctx is injected by the store.
// ──────────────────────────────────────────────────────────────────

export const CONFIDENCE = { HIGH: 'alta', MED: 'média', LOW: 'baixa' }

let _uid = 0
const uid = () => `dx-${++_uid}`

const has = (ctx, id) => !!ctx.entities?.[id]
const wired = (ctx, id) => !!ctx.live?.wiring?.[id]?.wired
const powered = (ctx, id) => !!ctx.live?.wiring?.[id]?.powered
const dataOk = (ctx, id) => !!ctx.live?.wiring?.[id]?.data
const addrOf = (ctx, id) => ctx.live?.addrs?.[id]?.addr || null
const i2cPins = (ctx) => ctx.live?.i2c || { sda: 21, scl: 22 }

// fix actions are DATA — the store interprets them (auto-wire a sensor,
// open the 2D wiring editor, open a firmware module, …)
const fixWire2D = () => ({ label: 'Abrir fiação 2D', kind: 'wiring', action: { type: 'open2d' } })
const fixAutoWire = (id) => ({ label: `Auto-conectar ${id}`, kind: 'wiring', action: { type: 'autowire', compId: id } })
const fixModule = (modId, file) => ({ label: `Abrir ${file}`, kind: 'code', action: { type: 'module', moduleId: modId } })
const fixInspect = (id) => ({ label: 'Inspecionar componente', kind: 'info', action: { type: 'inspect', compId: id } })

// extract I2C addresses the device actually saw ("Found device at 0x76")
function scannedAddresses(text) {
  const out = []
  const re = /found device at (0x[0-9a-f]{2})/gi
  let m
  while ((m = re.exec(text))) out.push(m[1].toLowerCase())
  return out
}

// does the live wiring validation already point at a specific fault?
const wiringIssue = (ctx, substr) =>
  (ctx.live?.validation?.issues || []).find(i => i.source === 'wiring' && i.title.includes(substr))

// max SNR (dBHz) seen across $GPGSV sentences — the sky-view signal
function maxGsvSnr(text) {
  let max = null
  for (const m of text.matchAll(/\$GPGSV,[^*\n]+/g)) {
    const fields = m[0].split(',')
    // satellite blocks of 4 fields start at index 4: prn, elev, azim, snr
    for (let i = 7; i < fields.length; i += 4) {
      const snr = parseInt(fields[i], 10)
      if (Number.isFinite(snr)) max = Math.max(max ?? 0, snr)
    }
  }
  return max
}

// ── signature catalog ───────────────────────────────────────────────
// Each signature: { id, test(text), diagnose(text, ctx) -> finding|[] }
const SIGNATURES = [
  {
    id: 'sensor_not_found',
    test: (t) => /(BMP280|MPU6050)\s+(NOT FOUND|missing|não encontrado)/i.test(t),
    diagnose: (t, ctx) => {
      const findings = []
      const seen = scannedAddresses(t)
      for (const m of t.matchAll(/(BMP280|MPU6050)\s+(?:NOT FOUND|missing|não encontrado)/gi)) {
        const id = m[1].toLowerCase()
        const evidence = [`log: "${m[0].trim()}"`]
        if (has(ctx, id) && !wired(ctx, id)) {
          const missing = []
          if (!powered(ctx, id)) missing.push('alimentação (VCC/GND)')
          if (!dataOk(ctx, id)) missing.push('barramento I²C (SDA/SCL)')
          evidence.push(`gêmeo digital: ${id} está na placa mas sem ${missing.join(' e ')}`)
          findings.push({
            id: uid(), confidence: CONFIDENCE.HIGH, severity: 'error',
            title: `${m[1]} sem resposta: fiação incompleta`,
            cause: `O firmware procurou o ${m[1]} mas o sensor não está eletricamente conectado — falta ${missing.join(' e ')}.`,
            evidence,
            fixes: [fixAutoWire(id), fixWire2D(), fixInspect(id)],
          })
        } else if (has(ctx, id)) {
          const expect = addrOf(ctx, id)
          const wrongAddr = expect && seen.length > 0 && !seen.includes(expect)
          if (wrongAddr) {
            evidence.push(`scan I²C do dispositivo viu ${seen.join(', ')} — o firmware espera ${expect}`)
            findings.push({
              id: uid(), confidence: CONFIDENCE.HIGH, severity: 'error',
              title: `${m[1]}: endereço I²C não confere`,
              cause: `O barramento respondeu em ${seen.join(', ')}, mas o código usa ${expect}. O strap SDO/AD0 físico não corresponde à fiação do projeto.`,
              evidence,
              fixes: [
                { label: `Ajustar SDO na fiação (${expect} ↔ ${seen[0]})`, kind: 'wiring', action: { type: 'open2d' } },
                fixModule(`driver_${id}`, `sensor_${id}.h`),
              ],
            })
          } else {
            evidence.push(`gêmeo digital: fiação de ${id} está completa — o problema é físico`)
            findings.push({
              id: uid(), confidence: CONFIDENCE.MED, severity: 'error',
              title: `${m[1]}: fiação ok no projeto, falha física provável`,
              cause: 'O projeto está correto, então o problema está no hardware real: jumper solto, solda fria nos headers do sensor, ou cabos trocados em relação ao esquema.',
              evidence,
              fixes: [
                { label: 'Conferir fiação física contra o esquema 2D', kind: 'wiring', action: { type: 'open2d' } },
                fixInspect(id),
              ],
            })
          }
        }
      }
      return findings
    },
  },
  {
    id: 'i2c_empty',
    test: (t) => /devices found:\s*0\b/i.test(t),
    diagnose: (t, ctx) => {
      const pins = i2cPins(ctx)
      const remapped = pins.sda !== 21 || pins.scl !== 22
      const anyUnwired = Object.keys(ctx.entities || {}).some((id) => id !== 'esp32' && !wired(ctx, id))
      const evidence = ['log: "Devices found: 0" — nenhum dispositivo respondeu no barramento']
      if (remapped) evidence.push(`projeto usa I²C remapeado (SDA GPIO${pins.sda} · SCL GPIO${pins.scl})`)
      return [{
        id: uid(), confidence: anyUnwired ? CONFIDENCE.HIGH : CONFIDENCE.MED, severity: 'error',
        title: 'Barramento I²C vazio',
        cause: anyUnwired
          ? 'Há sensores no projeto sem fiação completa — sem SDA/SCL/alimentação ligados, o scan não encontra nada.'
          : remapped
            ? `O código usa SDA GPIO${pins.sda}/SCL GPIO${pins.scl} (remapeado). Confira se a fiação física segue os MESMOS pinos — SDA/SCL trocados zeram o scan.`
            : 'Causas típicas: SDA e SCL invertidos no cabo, sensor sem alimentação, ou falta de pull-ups (os módulos breakout costumam ter os resistores integrados).',
        evidence,
        fixes: [fixWire2D(), ...(anyUnwired ? Object.keys(ctx.entities).filter((id) => id !== 'esp32' && !wired(ctx, id)).map(fixAutoWire) : [])],
      }]
    },
  },
  {
    id: 'brownout',
    test: (t) => /brownout detector was triggered/i.test(t),
    diagnose: () => [{
      id: uid(), confidence: CONFIDENCE.HIGH, severity: 'error',
      title: 'Queda de tensão (brownout)',
      cause: 'A tensão de 3.3V caiu abaixo do limite durante a operação. Típico de porta USB fraca/hub sem alimentação, cabo USB ruim, ou pico de corrente do WiFi na transmissão.',
      evidence: ['log: "Brownout detector was triggered"'],
      fixes: [
        { label: 'Trocar cabo/porta USB e repetir', kind: 'info', action: { type: 'none' } },
        { label: 'Conferir alimentação no esquema', kind: 'wiring', action: { type: 'open2d' } },
      ],
    }],
  },
  {
    id: 'crash',
    test: (t) => /guru meditation|loadprohibited|storeprohibited|abort\(\)|panic'ed/i.test(t),
    diagnose: (t, ctx) => {
      const unwired = Object.keys(ctx.entities || {}).filter((id) => id !== 'esp32' && !wired(ctx, id))
      return [{
        id: uid(), confidence: unwired.length ? CONFIDENCE.MED : CONFIDENCE.LOW, severity: 'error',
        title: 'Crash de firmware (exceção do ESP32)',
        cause: unwired.length
          ? `O firmware travou. Causa provável: leitura de um sensor não inicializado — ${unwired.join(', ')} está(ão) sem fiação, e o driver pode estar sendo chamado mesmo assim.`
          : 'O firmware travou com uma exceção. Verifique ponteiros/objetos usados antes do init e leituras de sensores que falharam no begin().',
        evidence: [`log: "${(t.match(/guru meditation[^\n]*/i) || t.match(/abort\(\)[^\n]*/i) || ['exceção'])[0]}"`],
        fixes: [fixModule('main', 'main.ino'), ...(unwired.map(fixAutoWire))],
      }]
    },
  },
  {
    id: 'reboot_loop',
    test: (t) => (t.match(/rst:0x|=== ESP32 START ===/gi) || []).length >= 3,
    diagnose: (t) => [{
      id: uid(), confidence: CONFIDENCE.MED, severity: 'error',
      title: 'Loop de reinicialização',
      cause: 'A placa está reiniciando repetidamente. Causas típicas, em ordem: alimentação insuficiente (veja se há brownout no log), crash cedo no setup(), ou watchdog estourando por bloqueio no loop().',
      evidence: [`log: ${(t.match(/rst:0x|=== ESP32 START ===/gi) || []).length} reinicializações detectadas no trecho`],
      fixes: [fixModule('health', 'health.h'), fixModule('main', 'main.ino')],
    }],
  },
  {
    id: 'oled_failed',
    test: (t) => /OLED FAILED/i.test(t),
    diagnose: (t) => {
      const seen = scannedAddresses(t)
      const saw3c = seen.includes('0x3c') || seen.includes('0x3d')
      return [{
        id: uid(), confidence: saw3c ? CONFIDENCE.MED : CONFIDENCE.HIGH, severity: 'warn',
        title: 'Display OLED não inicializou',
        cause: saw3c
          ? 'O scan viu o display no barramento mas o begin() falhou — tente reinicializar com delay maior após o Wire.begin().'
          : 'O display não apareceu no scan I²C: sem alimentação, SDA/SCL trocados, ou endereço diferente de 0x3C.',
        evidence: [`log: "OLED FAILED"${saw3c ? ' · scan viu o display no barramento' : ' · display ausente do scan'}`],
        fixes: [{ label: 'Conferir fiação do display', kind: 'wiring', action: { type: 'open2d' } }],
      }]
    },
  },
  // ── GPS / GNSS signatures ─────────────────────────────────────────
  {
    id: 'gps_silent',
    test: (t) => /uart timeout|nenhuma senten[çc]a nmea|0 bytes recebidos/i.test(t),
    diagnose: (t, ctx) => {
      const swap = wiringIssue(ctx, 'TX ligado em TX') || wiringIssue(ctx, 'RX ligado em RX')
      if (swap) {
        return [{
          id: uid(), confidence: CONFIDENCE.HIGH, severity: 'error',
          title: 'GPS mudo: fios TX/RX não cruzados',
          cause: 'Zero bytes na UART e a fiação do projeto mostra TX ligado em TX. Dois transmissores no mesmo fio — nenhum dado chega ao ESP32. Cruze os fios (TX→GPIO16, RX→GPIO17) ou inverta os pinos no Serial2.begin.',
          evidence: ['log: timeout de UART sem nenhuma sentença NMEA', `gêmeo digital: "${swap.title}"`],
          fixes: [
            { label: 'Corrigir cruzamento na fiação 2D', kind: 'wiring', action: { type: 'open2d' } },
            fixModule('driver_gps', 'sensor_gps.h'),
          ],
        }]
      }
      if (has(ctx, 'gps_neo6m') && !wired(ctx, 'gps_neo6m')) {
        return [{
          id: uid(), confidence: CONFIDENCE.HIGH, severity: 'error',
          title: 'GPS mudo: fiação incompleta',
          cause: 'O firmware espera NMEA mas o GPS não está eletricamente conectado no projeto.',
          evidence: ['log: timeout de UART', 'gêmeo digital: GPS sem fiação completa'],
          fixes: [fixAutoWire('gps_neo6m'), fixWire2D()],
        }]
      }
      return [{
        id: uid(), confidence: CONFIDENCE.MED, severity: 'error',
        title: 'GPS mudo: nenhum byte na UART',
        cause: 'Zero bytes não é sinal fraco — é ausência elétrica de dados. Verifique na ordem: TX/RX cruzados de verdade no hardware, alimentação do módulo (LED de power), e se os pinos do Serial2.begin batem com a fiação física.',
        evidence: ['log: timeout de UART sem nenhuma sentença NMEA'],
        fixes: [fixWire2D(), fixModule('driver_gps', 'sensor_gps.h'), fixInspect('gps_neo6m')],
      }]
    },
  },
  {
    id: 'gps_garbage',
    test: (t) => /0 senten[çc]as v[áa]lidas|bytes descartados/i.test(t) || /[\u00c0-\u00ff]{6,}/.test(t),
    diagnose: () => [{
      id: uid(), confidence: CONFIDENCE.HIGH, severity: 'error',
      title: 'Baud rate descasado na UART do GPS',
      cause: 'Bytes chegam em volume constante mas viram caracteres ilegíveis: a velocidade serial do firmware não bate com a do módulo. O NEO-6M sai de fábrica em 9600 baud — alinhe o Serial2.begin (ou reconfigure o módulo via UBX).',
      evidence: ['log: fluxo contínuo de bytes ilegíveis · parser NMEA descartando tudo'],
      fixes: [
        fixModule('driver_gps', 'sensor_gps.h'),
        fixInspect('gps_neo6m'),
      ],
    }],
  },
  {
    id: 'gps_no_sky',
    test: (t) => /\$GPGGA,[^,]*,,,,,0,/.test(t) && /\$GPGSV/.test(t),
    diagnose: (t) => {
      const snr = maxGsvSnr(t)
      if (snr != null && snr < 20) {
        return [{
          id: uid(), confidence: CONFIDENCE.HIGH, severity: 'warn',
          title: 'Sem fix por falta de visada do céu',
          cause: `Eletrônica saudável (NMEA válido), mas o SNR máximo é ${snr} dBHz — céu aberto entrega 30–45. Com sinal tão fraco o receptor não fecha os 4 satélites mínimos. Mova a antena para perto de janela/área externa ou use antena externa.`,
          evidence: [`$GPGSV: SNR máximo ${snr} dBHz`, '$GPGGA com indicador de fix = 0'],
          fixes: [fixInspect('gps_neo6m')],
        }]
      }
      return [{
        id: uid(), confidence: CONFIDENCE.MED, severity: 'info',
        title: 'GPS em aquisição',
        cause: snr != null
          ? `SNR razoável (${snr} dBHz) e ainda sem fix — provável cold start em andamento. Sem bateria de backup, ~30–60 s de céu aberto são normais.`
          : 'NMEA fluindo sem fix. Acompanhe as $GPGSV: satélites/SNR subindo = aquisição normal; estagnado e baixo = problema de antena/visada.',
        evidence: ['$GPGGA com indicador de fix = 0', '$GPGSV presentes (módulo rastreando)'],
        fixes: [fixInspect('gps_neo6m')],
      }]
    },
  },
  {
    id: 'gps_reset_loop',
    test: (t) => (t.match(/\$GPTXT,01,01,02,u-blox/gi) || []).length >= 2 || /gps reiniciou/i.test(t),
    diagnose: (t) => {
      const undervolt = t.match(/(\d\.\d)\s*V no pico/i)
      return [{
        id: uid(), confidence: CONFIDENCE.HIGH, severity: 'error',
        title: 'GPS reiniciando durante a aquisição — alimentação instável',
        cause: `O banner de boot do u-blox ($GPTXT) reaparece no meio do rastreio: o módulo está resetando. ${undervolt ? `O trilho 3V3 cai a ${undervolt[1]} V sob pico — abaixo da faixa de operação. ` : ''}A aquisição é o momento de maior consumo; reforce a alimentação (fonte dedicada, capacitor de desacoplamento, USB melhor).`,
        evidence: ['$GPTXT (banner de boot) repetido no meio da operação', ...(undervolt ? [`tensão sob pico: ${undervolt[1]} V`] : [])],
        fixes: [fixWire2D(), fixInspect('gps_neo6m')],
      }]
    },
  },
  {
    id: 'wifi_fail',
    test: (t) => /wifi.*(disconnect|fail|timeout)|no ap found/i.test(t),
    diagnose: () => [{
      id: uid(), confidence: CONFIDENCE.MED, severity: 'warn',
      title: 'Falha de conexão WiFi',
      cause: 'O ESP32 não conectou à rede: SSID/senha errados no firmware, rede 5 GHz (o ESP32 só usa 2.4 GHz), ou sinal fraco.',
      evidence: ['log: falha de WiFi detectada'],
      fixes: [fixModule('telemetry', 'telemetry.h')],
    }],
  },
]

// generic checklist when nothing matches — never return an empty answer
function fallbackFinding(text, ctx) {
  const unwired = Object.keys(ctx.entities || {}).filter((id) => id !== 'esp32' && !wired(ctx, id))
  return {
    id: uid(), confidence: CONFIDENCE.LOW, severity: 'info',
    title: 'Nenhuma assinatura conhecida no log',
    cause: unwired.length
      ? `O log não bate com falhas conhecidas, mas o gêmeo digital mostra ${unwired.join(', ')} sem fiação completa — comece por aí.`
      : 'O log não bate com falhas conhecidas. Checklist: alimentação estável, scan I²C encontra os endereços esperados, baud rate do monitor em 115200.',
    evidence: [`${text.trim().split('\n').length} linha(s) analisadas`],
    fixes: unwired.length ? [...unwired.map(fixAutoWire), fixWire2D()] : [fixWire2D()],
  }
}

// Deterministic local analysis.
export function diagnoseLog(text = '', ctx = {}) {
  const findings = []
  for (const sig of SIGNATURES) {
    if (!sig.test(text)) continue
    findings.push(...[].concat(sig.diagnose(text, ctx) || []))
  }
  if (!findings.length) findings.push(fallbackFinding(text, ctx))
  // rank: high confidence + errors first
  const cRank = { [CONFIDENCE.HIGH]: 0, [CONFIDENCE.MED]: 1, [CONFIDENCE.LOW]: 2 }
  const sRank = { error: 0, warn: 1, info: 2 }
  findings.sort((a, b) => (cRank[a.confidence] - cRank[b.confidence]) || (sRank[a.severity] - sRank[b.severity]))
  return {
    findings,
    summary: findings.length === 1 && findings[0].severity === 'info'
      ? 'Sem falha reconhecida no log.'
      : `${findings.length} causa(s) provável(is) identificada(s).`,
  }
}

// Provider-pluggable async entry point — same seam as the copilot.
// `local` = the deterministic engine above; an LLM provider returns the
// same { findings, summary } shape without changing any caller.
export async function runLogDoctor(input, { provider = 'local' } = {}) {
  if (provider !== 'local') {
    throw new Error(`provider '${provider}' não configurado — usando motor local`)
  }
  await Promise.resolve()
  return diagnoseLog(input.text, input.ctx)
}
