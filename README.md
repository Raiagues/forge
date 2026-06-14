# GuiaSat

> **Serial Test (real ESP32):** run `npm run server` in one terminal and `npm run dev` in another.
> The flash server runs silently in the background — you only interact with the browser interface.

**Mission development platform & digital twin for university satellite teams.**

🌐 **Live demo (GitHub Pages):** https://raiagues.github.io/forge/

GuiaSat lets a CubeSat / high-altitude-balloon team pick a mission profile and
immediately get a synchronized digital twin: a 3D PCB populated with real
components, live telemetry, a serial monitor, auto-generated firmware and a
system architecture diagram — all driven from a single state store.

This is an interactive prototype (the hardware, serial and telemetry are
simulated), but every interaction is wired to real application state.

---

## Requirements

- **Node.js 18+** (20.x recommended) and npm
- A modern browser with WebGL (Chrome, Firefox, Edge, Safari)
- Linux / macOS for the helper scripts (`*.sh`). On Windows use the npm
  commands directly (see below).

The toolchain is intentionally conservative — **Vite 5 (Rollup/esbuild)** — so
there are no native-binary install surprises and it runs on Node 20.18+.

---

## Download (clone the repo)

```bash
git clone https://github.com/Raiagues/forge.git
cd forge
```

Or download the ZIP from GitHub (**Code → Download ZIP**) and extract it.

## Installation

```bash
./install.sh        # checks Node/npm, installs deps, verifies the build
# or, manually:
npm install
```

## Running

```bash
./start.sh          # starts the dev server, waits until it's live, opens the browser
# → http://localhost:5173/

./stop.sh           # stops the dev server cleanly and frees the port
```

Manual / Windows equivalent:

```bash
npm run dev         # start dev server (Ctrl-C to stop)
npm run build       # production build into dist/
npm run preview     # serve the production build
npm run lint        # eslint
```

Then open **http://localhost:5173/** and:

1. **Mission** → click a template (e.g. *Monitoramento atmosférico*).
2. You're dropped into **Hardware**: the PCB is populated with the ESP32 and
   its peripherals. Click any chip (in the 3D scene or the left list) to open a
   contextual inspector.
3. Explore **Architecture**, **Firmware**, **Serial** and **Telemetry** — each
   is generated live from the loaded mission.

---

## Architecture overview

```
React + Zustand store (single source of truth)
                 │
   ┌─────────────┼───────────────────────────┐
   │             │                           │
3D scene      side panels                inspector drawer
(R3F+drei)  (per-section views)        (per-entity, reactive)
```

- **Zustand** (`src/store/useForge.js`) holds *everything*: component
  definitions, mission templates, the live entity map, selection, telemetry
  history and the serial log. The UI is a pure function of this store.
- **Mission templates are generators.** `loadTemplate(id)` builds the entity
  map (with positions, connections, readings, logs), resets telemetry and the
  serial log, and switches to the Hardware view.
- **React Three Fiber** renders the PCB and components; chips are draggable and
  snap to a grid, bus wires are drawn from the same connection metadata used by
  the Architecture panel.
- A global 3-second tick (`simulateTick`) refreshes sensor readings, appends a
  telemetry sample and keeps the digital twin "alive".

## Folder structure

```
forge/
├── install.sh / start.sh / stop.sh   # local dev lifecycle
├── index.html                        # Vite entry + fonts + favicon
├── vite.config.js                    # Vite 5 + @vitejs/plugin-react
├── eslint.config.js
├── public/                           # static assets (favicon, icons)
└── src/
    ├── main.jsx                      # React root
    ├── App.jsx                       # layout + section router
    ├── index.css                     # design tokens (CSS vars) + globals
    ├── store/
    │   └── useForge.js               # Zustand store: state + all actions
    ├── mission/                      # mission engineering domain layer (pure, DI)
    │   ├── capabilities.js           # capability model + helpers
    │   ├── frameworks.js             # OBSAT + custom frameworks (structured rules)
    │   ├── workflow.js               # the 10-step planning workflow
    │   ├── software.js               # firmware module catalog
    │   ├── validation.js             # requirement/validation engine
    │   ├── recommendations.js        # recommendation + NL analysis engine
    │   ├── copilot.js                # analysis layer + LLM provider seam
    │   ├── pipeline.js               # architecture-generation pipeline
    │   └── index.js                  # barrel
    └── components/
        ├── mission/                  # mission workflow UI (thin — logic lives in /mission)
        │   ├── MissionSteps.jsx      # the 10 step panels + workflow router
        │   └── CopilotPanel.jsx      # on-demand copilot findings panel
        ├── sidebar/
        │   ├── IconSidebar.jsx       # 48px icon rail (section switch)
        │   └── NavPanel.jsx          # resizable context nav (per section)
        ├── canvas/
        │   └── ForgeCanvas.jsx       # R3F PCB, components, drag, bus wires
        └── panels/
            ├── Topbar.jsx            # breadcrumb + I2C scan + alerts
            ├── Statusbar.jsx         # bottom status strip
            ├── Drawer.jsx            # contextual entity inspector
            ├── MissionSection.jsx    # mission template picker / summary
            ├── ArchitecturePanel.jsx # SVG block diagram + power/mass budget
            ├── FirmwarePanel.jsx     # firmware generated from the entity set
            ├── SerialPanel.jsx       # live serial monitor + command input
            ├── TelemetryPanel.jsx    # live SVG sparkline charts
            └── EmptyState.jsx        # shown when no mission is loaded
```

## Mission engineering layer

The **Mission** section is the platform's driver. It is backed by a modular,
UI-independent domain layer in `src/mission/` (the component catalog is injected,
so the engines have no store/UI coupling and are unit-testable in isolation):

- **Frameworks** (`frameworks.js`) — competitions/references as first-class data.
  **OBSAT** ships with description, structured requirements, timeline, scoring,
  environment and payload limits. A **Custom** framework supports natural-language
  missions.
- **Requirements as rules** — requirements are declarative objects
  (`capability` / `system` / `count` / `mass`), not prose.
- **Validation engine** (`validation.js`) — evaluates the design against the
  rules and returns structured issues with explanations and suggested fixes.
  E.g. selecting an MCU without WiFi for OBSAT is flagged as an incompatibility
  with ESP32/ESP8266 offered as alternatives.
- **Recommendation engine** (`recommendations.js`) — maps objectives / NL
  descriptions → capabilities → catalog parts; also estimates a power budget and
  environmental risks.
- **Copilot** (`copilot.js`) — an on-demand analysis layer composing the above
  into structured *findings* (incompatibilities, risks, suggestions, tradeoffs).
  It never interrupts; the user explicitly requests analysis. It runs behind an
  async `runCopilot()` **provider seam** — the default is a local, offline engine
  (no API key); a real model (e.g. Claude via `@anthropic-ai/sdk`) can be dropped
  in without changing the store or UI.
- **Pipeline** (`pipeline.js`) — turns the validated plan into live entities
  (the digital twin / 3D PCB).

The user journey: choose a framework → objectives → environment → sensors →
communication → software → validate → generate architecture → test → operate.

## Current features

- A 10-step mission planning workflow driven by the engines above (OBSAT + custom).
- An on-demand AI copilot with structured findings and one-click fixes.
- Three mission templates that generate a full hardware stack on click.
- 3D PCB with draggable, grid-snapping components, status LEDs and bus wires.
- Contextual inspector drawer per component (properties, live readings,
  connections/pinout, diagnostics, recent log, wired actions).
- **Architecture** — interactive block diagram + electrical/mass budget and
  estimated autonomy.
- **Firmware** — an Arduino sketch generated from the loaded components.
- **Serial** — auto-scrolling monitor with filters, a working command input and
  a clear button; the I2C/SPI scan writes to it live.
- **Telemetry** — live sparkline charts (temperature, CO₂, battery, LoRa RSSI).
- Resizable navigation panel (drag the right edge; width persists across
  reloads via `localStorage`).
- Simulated I2C/SPI scan that transitions component statuses.

## Current limitations

- Hardware, serial output and telemetry are **simulated** — there is no real
  Web Serial / device connection yet.
- The 3D PCB layout is schematic, not a manufacturable board.
- Mission objectives/constraints are read-only (editing is on the roadmap).
- Firmware generation is a readable scaffold, not a compiled/flashable build.
- State is in-memory (except nav width); reloading resets the loaded mission.
- The copilot is a **local deterministic reasoning engine** (rules + heuristics),
  not a live LLM. A real model can be added at the `runCopilot()` provider seam.

See `CLAUDE.md` for product direction, conventions and the roadmap.
