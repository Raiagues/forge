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
- `COMPONENT_DEFS` — catalog: id, label (part number), **`friendly`** (human
  meaning, shown first in UI), category, protocol, address, voltage, current,
  mass, **`price`**, color, caps. Only `supported: true` parts are placeable
  today (**esp32, bmp280, mpu6050**); everything else carries `comingSoon: true`
  and renders disabled ("em breve").
- `entities` — map of `id → { id, type, def, protocol, position, rotation,
  status, readings, connections, logs }`.
- `missionPlan` — frameworkId, name, **objectiveId** (single primary objective)
  + **objectiveMeta** (user edits), **budgetBRL**, **overrides** (per-part
  editable price/mass/current), components, software, environment, custom.
- `live` — **recomputed on every design change** (`recomputeLive`): validation
  (source-tagged issues with component targets), pin suggestions, **real wiring
  state** (`live.wiring`, from user-made wires), `live.i2c` (actually wired
  GPIOs for codegen) and economics totals. Entity statuses are derived here:
  a sensor is OK only when actually wired, otherwise IDLE ("não conectado").
- `wires` — user-made pin connections `[{from:{comp,pin},to:{comp,pin}}]`.
  Actions: `addWire` (keeps electrically-wrong wires VISIBLE in red with the
  rule explained), `removeWire`, `clearAllWires`, `autoWire(compId)`.
- `hwLink` — HONEST physical link state; only true when Serial Test has a real
  ESP32 stream open. Everything else is labelled "simulação" (statusbar tag,
  nav footer, serial panel). Never fake-positive hardware state.
- `hardwareView` — '3d' | '2d'; both views share the same hardware graph.
- `featureInfo` + `openFeatureInfo(key)` — coming-soon items are clickable and
  open a contextual explanation modal (data in `src/lib/futureFeatures.js`).
- Other state: `mission`, `activeSection`, `selectedId`, `drawerOpen`,
  `isScanning`, `navWidth` (persisted), `seq`, `telemetry`, `serialLog`,
  `notice` (toast), `activeModuleId` + `firmwareEdits` (modular firmware).
- **Analytics**: store actions call `track()` from `src/lib/analytics.js` —
  structured event log in localStorage AND batch-flushed to the backend,
  which appends per-session files to `analytics/sessions/<sid>.jsonl`
  (endpoints in `server/flash.js`: POST /analytics/events, GET
  /analytics/sessions, GET /analytics/export). Inspect in the dev
  Analytics view (gear icon); "nova sessão de teste" there resets between
  testers (flush + new session id + reload).
- **User testing**: `./start_test_user.sh` = one-command session launcher
  (user-test mode via `VITE_USER_TEST=1` hides the Serial Test rail entry).
  Facilitator guide + metrics interpretation in `user_testing_env/README.md`;
  `node user_testing_env/aggregate.js` merges all sessions into
  `analytics/aggregate.json` with a validation summary.
- **Log Doctor** (`src/debug/logDoctor.js`): the AI debugging assistant —
  a pure signature catalog (sensor not found, empty I²C scan, brownout,
  crash, reboot loop, GPS: silent UART / baud garbage / low-SNR no-sky /
  power reset loop) cross-referenced with the digital twin for
  high-confidence diagnoses + fix actions. Async provider seam like the
  copilot (local heuristics now, LLM later). Registered in the debug
  registry as an interactive tool (`ui: 'logdoctor'` → card mapped in
  `DebugPanel.jsx`); user decisions tracked as `debug_session`,
  `suggestion_accepted/rejected`, `fix_applied`.
- **Physical hardware diagnostics**: when Serial Test connects a real
  ESP32, its stream is mirrored into the store serial buffer (with simple
  severity classification), so the Serial monitor shows the live device
  and the Log Doctor's "Usar serial atual" analyzes REAL output cross-
  referenced with the twin (source reported as "ESP32 real"). There is no
  separate simulated test layer — diagnostics run on the normal surfaces.
- **GPS NEO-6M is a supported component**: UART pins (TX/RX/VCC/GND) with
  crossing rules in `wiring.js` (TX-em-TX/RX-em-RX errors, remap warnings,
  `uartPinsFromWires` → `Serial2.begin` pins in the generated
  `sensor_gps.h`), engineering reference (TTFF, SNR, backup battery) and
  honest cold-start readings simulation.
- Key actions: **`toggleHardware`** (single canonical add/remove — syncs plan +
  entities + revalidates), `selectFramework`, `selectObjective` /
  `setObjectiveMetaField`, `setBudget` / `setOverride`, `notify`,
  `openModuleInFirmware` / `setFirmwareEdit`, `selectEntity` / `closeDrawer`,
  `updatePosition/Rotation/Status`, `runScan`, `simulateTick`,
  `pushSerial` / `clearSerial`, `setNavWidth`, `setSection`.
- A 3s interval in `App.jsx` calls `simulateTick`: refreshes readings, appends a
  telemetry sample, advances `seq`.

## Hardware views (2D/3D — same hardware graph)
`HardwareViews.jsx` toggles between the 3D board and the 2D schematic; the
choice persists in the store and is available in Mission, Hardware and Debug.

### 3D (`ForgeCanvas.jsx`)
- `PCBBoard` — FR4 board with silkscreen dots and mounting holes.
- `ComponentMesh` — one chip per entity: category-colored body, pins, pulsing
  status LED, hover lift, drag-with-grid-snap (updates `position` in store),
  selection ring, error glow. Validation issues override the LED/glow color and
  render an inline `IssueBadge` (drei `Html`) showing the rule SOURCE
  (competição/objetivo/orçamento/comunicação/dependência/fiação). Hover shows
  the friendly name + part number.
- `BusWires` — HONEST: a solid protocol-colored wire only when the user
  actually wired the pins; otherwise a faint dashed "rota sugerida".
- `OrbitControls` (left=orbit, right=pan, scroll=zoom) + axis gizmo.

### 2D (`SchematicView.jsx`)
Schematic systems view with prototyping-style pin wiring: click a pin → click
the destination → real wire in the store. Wrong connections stay visible (red,
dashed, with the electrical rule explained inline and in a feedback strip).
Click a wire to remove it; per-sensor auto-connect buttons. Pin/wire engine in
`src/mission/wiring.js` (`COMPONENT_PINS`, `validateWires`, `wiringStatus`,
`i2cPinsFromWires`) — rules: shorts (3V3/VCC→GND), power on data pins, crossed
SDA/SCL, GND mismatches, double-used sensor pins, I²C remap warnings, sensors
without MCU, unwired sensors. The generated firmware uses the GPIOs the user
actually wired (`ctx.i2c` → `Wire.begin(sda, scl)`).

## Mission builder — the platform driver
The Mission section is a **collapsible systems-engineering flow**: stages
(competition → objective → mission & budget → hardware → wiring) connected by
a flow rail. The first incomplete stage opens automatically; completed stages
collapse to a one-line summary of what was configured. The live hardware view
(3D or 2D) is always visible in the center. Every change ripples to the board
immediately. Backed by a modular domain layer in `src/mission/` (catalog
injected as a param — engines have NO store/UI import, so no cycles and they
unit-test in isolation). Keep logic in these engines, not in components:

- `wiring.js` — pin catalog + manual-wiring validation (see Hardware views).
- `engineering.js` — datasheet-grade reference per part (overview, operational
  ranges, expected values, data structs, notes) rendered in the Drawer — the
  inspector is engineering-focused, not copilot-focused.

- `frameworks.js` — competitions as structured data. OBSAT carries declarative
  `requirements` (rule kinds: `capability` | `system` | `count` | `mass`, each
  with a `source` tag), timeline, scoring, environment, payload limits.
  `COMING_SOON_FRAMEWORKS` (LASC, CanSat) render disabled. `custom` = NL mission.
- `objectives.js` — single-select scientific objectives with **editable
  metadata** (`meta`: sensors, telemetry, rateHz, altitude, notes) and their own
  declarative requirements. `resolveObjective(plan)` merges the preset meta with
  user edits; the metadata feeds validation AND firmware generation (rateHz).
- `pins.js` — realistic ESP32-WROOM-32D pin catalog + `assignPins()` auto
  -assignment (shared I²C bus on GPIO21/22, UART2, VSPI) with wiring issue
  detection (I²C address conflict, UART contention, sensors without MCU).
  Manual remapping intentionally not implemented — UI shows "em breve".
- `capabilities.js` — capability model (`def.caps`) + helpers.
- `validation.js` — `validateLive({defs,framework,objective,componentIds,
  overrides,budgetBRL,pinIssues,softwareIds,modules})` composes competition +
  objective + budget + wiring + dependency rules into issues carrying
  `source` and `targets` (component ids) for inline feedback.
  `issuesForComponent()` filters per chip. `economics()` totals mass/price/
  current honouring user overrides. `validateDesign` remains for the copilot.
- `recommendations.js` — objective/NL → capabilities → parts (never suggests
  coming-soon parts); power budget; risks.
- `copilot.js` — composes validation+recommendations into *findings*. On-demand
  only. `runCopilot(input,{provider})` is the async **LLM seam** — default is the
  local engine; implement an `anthropic` provider (model `claude-opus-4-8`) to go
  live without touching callers.
- `software.js` — the modular firmware model: `SOFTWARE_LAYERS` (**core** =
  rarely touched / **adaptive** = reusable base needing adaptation / **mission**
  = fully custom apps), `SOFTWARE_MODULES` each mapping to its own file
  (main.ino, telemetry.h, sensor_bmp280.h, app_environment.h, …) with a
  `code(ctx)` generator. `activeModules()` derives a mission's module set from
  placed hardware + objective. The Firmware panel renders these as editable
  per-file tabs (edits stored in `firmwareEdits`); the Architecture panel has a
  hardware/software toggle showing the three layers as grouped blocks.
- `pipeline.js` — `generateArchitecture()` → ordered component ids which the
  store instantiates as entities.

UI: `MissionSection` (progressive builder + live canvas + contextual
validation notices), `mission/CopilotPanel.jsx`, `Drawer.jsx` (contextual dev
workspace: source-tagged validation, auto-assigned pins, editable economics,
firmware module link, clean remove).

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
