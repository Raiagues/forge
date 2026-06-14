// ──────────────────────────────────────────────────────────────────
// Contextual tips — gentle, non-blocking guidance derived from the live
// build state. Pure (no store/UI): given the placed components and their
// real wiring, it returns the most relevant nudges, each with a question
// that the "Saiba mais" button funnels into the AI tutor.
// ──────────────────────────────────────────────────────────────────

import { COMPONENT_PINS, wiringStatus } from './wiring.js'

export function computeTips({ entities = {}, wires = [], wiring = {} }) {
  const ids = Object.keys(entities)
  const tips = []
  const peripherals = ids.filter((id) => id !== 'esp32' && COMPONENT_PINS[id])
  const st = (id) => wiring[id] || wiringStatus(id, wires)

  // 1) a sensor on the board without its power wired — the first thing to fix
  for (const id of peripherals) {
    if (!st(id).powered) {
      tips.push({
        id: `power-${id}`,
        message: `${entities[id].def.label}: conecte VCC ao 3V3 e GND ao GND primeiro — sem alimentação o sensor não responde.`,
        question: 'Como conecto a alimentação (VCC e GND) de um sensor ao ESP32?',
      })
    }
  }

  // 2) an I²C device with its data bus wired — pull-up / shared-bus reminder
  const i2cWired = peripherals.find((id) => entities[id].def.protocol === 'I2C' && st(id).data)
  if (i2cWired) {
    tips.push({
      id: 'i2c-pullup',
      message: 'Dispositivos I²C precisam de pull-ups em SDA e SCL (a maioria dos módulos já traz embutidos); vários sensores podem dividir o mesmo barramento.',
      question: 'O que é um resistor de pull-up e quando preciso de um?',
    })
  }

  // 3) components placed but nothing wired yet — point at routing
  if (ids.length >= 2 && wires.length === 0) {
    tips.push({
      id: 'no-traces',
      message: 'Você adicionou componentes mas ainda não há fiação. Use auto-conectar (vista 2D) ou ligue os pinos no modo "rotear".',
      question: 'O que é I²C e como funciona?',
    })
  }

  return tips
}
