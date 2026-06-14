// ──────────────────────────────────────────────────────────────────
// Fabrication design-rule sets. Each entry is the capability envelope of
// a board house / fab lab: minimum copper trace width, minimum clearance
// between copper, minimum drill, and base material. The active rule set
// drives the live DRC (design-rule check) on the board canvas.
//
// NUMAE (Núcleo de Automação e Processos de Fabricação, UFSM) is the
// DEFAULT fabrication target. NOTE: NUMAE is a mechanical/aerospace
// machining lab — at the time of writing it publishes NO PCB design
// rules, so the values below are CONSERVATIVE DEFAULTS typical of a
// low-cost university prototyping setup (0.2 mm trace / 0.2 mm clearance).
// CONFIRM and update these with NUMAE's actual process specs once known.
// Pure data — no store/UI imports.
// ──────────────────────────────────────────────────────────────────

export const FAB_RULES = [
  {
    id: 'numae', name: 'NUMAE · UFSM', default: true,
    minTraceMm: 0.2, minClearanceMm: 0.2, minDrillMm: 0.3, material: 'FR-4',
    note: 'Defaults conservadores — o NUMAE é um laboratório de manufatura mecânica; confirmar as regras reais de PCB.',
  },
  {
    id: 'jlcpcb', name: 'JLCPCB · 2 camadas',
    minTraceMm: 0.127, minClearanceMm: 0.127, minDrillMm: 0.2, material: 'FR-4',
    note: 'Processo industrial padrão (5 mil / 5 mil).',
  },
  {
    id: 'home', name: 'Caseira · toner transfer',
    minTraceMm: 0.4, minClearanceMm: 0.4, minDrillMm: 0.8, material: 'FR-1/FR-4',
    note: 'Corrosão manual: trilhas e isolamentos largos para tolerar o processo.',
  },
]

export const getFabRule = (id) => FAB_RULES.find((r) => r.id === id) || FAB_RULES[0]
export const DEFAULT_FAB_RULE = FAB_RULES.find((r) => r.default) || FAB_RULES[0]
