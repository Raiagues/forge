# FORGE — Claude Code Instructions

## What this is
FORGE is a **mission development platform / digital twin** for university
satellite (CubeSat / high-altitude-balloon) teams. A team picks a mission
profile and instantly gets a coherent engineering workspace: a 3D PCB populated
with components, a contextual inspector, live telemetry, a serial monitor,
generated firmware and a system architecture view — all synchronized from one
store.

It is an interactive prototype: hardware, serial and telemetry are **simulated**,
but every control is wired to real state. There must be no "fake" interactions.

## Intended product direction
A single workspace where a student can go *mission → hardware → architecture →
firmware → debug → telemetry* without leaving the app, and where changing the
hardware set ripples through every view. The long-term goal is a real digital
twin backed by Web Serial / a flight computer; today the simulation stands in
for that backend behind the same interfaces.

## Stack
- React 18/19 + **Vite 5** (Rollup/esbuild — chosen for stability; do **not**
  jump to bleeding-edge Vite/rolldown, it broke native bindings and Node compat)
- @react-three/fiber + @react-three/drei (3D canvas, OrbitControls)
- Zustand (state)
- Plain CSS with design tokens in `src/index.css` (**no Tailwind** — it was
  unused dead weight and removed)
- Space Grotesk + Space Mono (Google Fonts)

## How to run
```bash
./install.sh   # or npm install
./start.sh     # or npm run dev   → http://localhost:5173
./stop.sh
npm run build  # production build
npm run lint
```

## Visual language (preserve this)
- Muted, paper-like workspace tones (`--paper*`) with navy sidebars (`--navy*`).
- Subtle fixed grid background; calm, technical, aerospace-lab feeling.
- Restrained typography: Space Grotesk for UI, Space Mono for data/labels.
- Engineering-workstation proportions: 48px icon rail, resizable context nav,
  central workspace, contextual right drawer, thin top/bottom bars.
- Status palette: OK `#3A9060`, WARN `#C8831A`, ERR `#C04030`,
  SCANNING `#4A7DD4`, IDLE gray.

Do **not**: redesign wholesale, add neon/glassmorphism/SaaS flash, or make it
look like a game-engine editor. New UI should read like the existing code:
inline style objects + CSS variables, same density and naming.

## Architecture philosophy
The Zustand store is the single source of truth; **every component is a pure
function of store state**. Cross-view consistency (PCB ↔ drawer ↔ nav ↔
architecture ↔ telemetry) comes for free because they all read the same data.
Mission templates are *generators* of that state, not just labels.

## Zustand structure (`src/store/useForge.js`)
- `COMPONENT_DEFS` — catalog: id, label, category, protocol, address, voltage,
  current, mass, color, measures.
- `MISSION_TEMPLATES` — each lists `components` + objectives/constraints/altitude.
- `entities` — map of `id → { id, type, def, protocol, position, rotation,
  status, readings, connections, logs }`.
- State: `mission`, `activeSection`, `selectedId`, `drawerOpen`, `isScanning`,
  `navWidth` (persisted), `seq`, `telemetry` (rolling samples), `serialLog`.
- Key actions: `loadTemplate` / `clearMission`, `addEntity` / `removeEntity`,
  `selectEntity` / `closeDrawer`, `updatePosition/Rotation/Status`, `runScan`,
  `simulateTick`, `pushSerial` / `clearSerial`, `setNavWidth`, `setSection`.
- A 3s interval in `App.jsx` calls `simulateTick`: refreshes readings, appends a
  telemetry sample, advances `seq`.

## Scene structure (`ForgeCanvas.jsx`)
- `PCBBoard` — FR4 board with silkscreen dots and mounting holes.
- `ComponentMesh` — one chip per entity: category-colored body, pins, pulsing
  status LED, hover lift, drag-with-grid-snap (updates `position` in store),
  selection ring, error glow.
- `BusWires` — bezier curves ESP32→peripheral, colored by protocol, from the
  entity `connections`/protocol.
- `OrbitControls` (left=orbit, right=pan, scroll=zoom) + axis gizmo.

## Mission system — the platform driver
The Mission section is a full planning workflow, backed by a modular domain
layer in `src/mission/` (catalog injected as a param — engines have NO store/UI
import, so no cycles and they unit-test in isolation). Keep logic in these
engines, not in components:

- `frameworks.js` — competitions/references as structured data. OBSAT carries
  declarative `requirements` (rule kinds: `capability` | `system` | `count` |
  `mass`), timeline, scoring, environment, payload limits. `custom` = NL mission.
- `capabilities.js` — capability model (`def.caps`) + helpers (the catalog in the
  store now tags every part with `caps`, e.g. esp32 has `wifi`, rp2040 does not).
- `validation.js` — `validateDesign({defs,framework,componentIds})` → structured
  issues with severity, explanation and suggested fixes.
- `recommendations.js` — objective/NL → capabilities → parts; power budget; risks.
- `copilot.js` — composes validation+recommendations into *findings*. On-demand
  only. `runCopilot(input,{provider})` is the async **LLM seam** — default is the
  local engine; implement an `anthropic` provider (model `claude-opus-4-8`) to go
  live without touching callers.
- `pipeline.js` — `generateArchitecture()` → ordered component ids (guarantees an
  MCU + power) which the store instantiates as entities.
- `workflow.js` — the 10 steps + `isComplete` predicates.

Store slice: `missionPlan` (frameworkId, objectives, environment, components,
software, custom), `workflowStep`, `validation`, `copilot`. Actions
(`selectFramework`, `togglePlanComponent`, `runValidation`, `runCopilot`,
`applyFinding`, `generateArchitectureFromPlan`, …) are thin wrappers that inject
`COMPONENT_DEFS` into the engines. UI: `MissionSection` (home vs workflow),
`mission/MissionSteps.jsx` (step panels), `mission/CopilotPanel.jsx`.

The legacy `loadTemplate(id)` still exists as a "quick profile": it lays out
components, creates entities with readings/logs/connections, resets telemetry/
serial and jumps to Hardware.

## Copilot interaction philosophy
The copilot is an advisor/reviewer, never a chatbot and never interruptive. It
runs only when the user clicks (workflow header, nav button, validate step, or
custom "Analisar"). Findings are structured and carry one-click fix actions —
prefer this over free-form chat.

## Section routing (`App.jsx`)
`mission`→picker · `hardware`/`debug`→3D canvas · `architecture`→SVG block
diagram · `firmware`→generated sketch · `serial`→monitor · `telemetry`→charts.
With no mission loaded, workspace sections render `EmptyState` (never blank).

## Interaction philosophy
No dead controls. If a button exists it must change state or navigate. Prefer
wiring a minimal real behavior over rendering a disabled/placeholder affordance.
The nav is resizable and remembers its width; selection drives the drawer; the
scan, telemetry and serial all reflect live state.

## Future roadmap
1. Live LLM copilot: implement the `anthropic` provider behind `runCopilot()`
   (model `claude-opus-4-8`) — local engine stays as offline fallback.
2. More frameworks (CanSat, university CubeSat standards) as `frameworks.js` data.
3. Real Web Serial connection to a flight ESP32 (replace the serial sim).
4. Persist projects (load/save) beyond in-memory state.
5. Pin-level routing and hover highlighting of actual connections in 3D.
6. Monaco-based firmware editor + compile/flash pipeline; link/thermal budgets.
