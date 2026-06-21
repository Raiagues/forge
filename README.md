# GuiaSat

**Mission development platform and digital twin for university satellite teams.**

GuiaSat lets a CubeSat or high-altitude-balloon team walk a complete mission
from idea to operation in one workspace: form a team, frame a real-world
challenge, brainstorm and decide on objectives, populate a 3D printed-circuit
board with real components, wire it, generate firmware, run integration tests
and watch a live simulation — all driven from a single state store, so changing
the hardware ripples through every view at once.

It is an interactive prototype: the hardware, serial link and telemetry are
simulated, but every control is wired to real application state. There are no
fake interactions.

## Live demo

The web app runs fully in the browser, with no backend required:

**https://raiagues.github.io/forge/**

The optional backend (team accounts, saved projects, shared links, the moderated
challenge board) is not part of the public demo — the platform stays fully
usable single-user without it.

## The mission flow

The left rail follows five build phases. Each phase has explicit completion
criteria, depends on the ones before it, and goes stale if an upstream input
changes after you confirmed it — so the pipeline always reflects reality.

1. **Mission** — assemble the team, pick a form factor, choose a real-world
   challenge, brainstorm ideas on a calm decision board and produce a mission
   document.
2. **Hardware** — the same hardware graph as a 2D schematic and a 3D PCB; drag
   components, route pin-accurate traces, and wire the board. Wrong connections
   stay visible in red with the electrical rule explained.
3. **Firmware** — modular Arduino firmware generated from the components you
   actually placed and wired, as editable per-file tabs, with a project export.
4. **Testing** — a subsystem and integration test bench (AIT) with an AI log
   doctor that cross-references serial output against the digital twin.
5. **Simulação** — a read-only sensor-validation view: the PCB renderer is
   reused to rotate the board with live MPU6050 orientation, plus telemetry
   readouts and sparklines.

Throughout, an on-demand copilot reviews the design and an AI tutor chat answers
hardware-engineering questions in the corner of every screen.

## Requirements

- Node.js 18+ (20.x recommended) and npm.
- A modern browser with WebGL (Chrome, Firefox, Edge, Safari).
- Linux or macOS for the helper scripts (`*.sh`). On Windows, use the npm
  commands directly (see below).

The toolchain is intentionally conservative — Vite 5 (Rollup/esbuild) — so there
are no native-binary install surprises.

## Getting started

```bash
git clone https://github.com/Raiagues/forge.git
cd forge
npm install      # or ./install.sh — checks Node/npm and verifies the build
```

### Frontend only (matches the live demo)

```bash
npm run dev:web   # Vite on http://localhost:5173 — no backend needed
```

### With the optional backend

```bash
npm start          # ONE command: backend (:3001) + web app (:5173) together
# or
./start.sh         # backgrounds both, waits for health, opens the browser
./stop.sh          # stops both and frees the ports
```

### Other scripts

```bash
npm run server     # backend only
npm run build      # production build into dist/
npm run preview    # serve the production build
npm run lint       # eslint
```

## Architecture

The Zustand store is the single source of truth; every component is a pure
function of store state. Cross-view consistency (PCB ↔ inspector ↔ nav ↔
architecture ↔ firmware ↔ simulation) comes for free because they all read the
same data. Mission templates are generators of that state, not just labels.

```
React + Zustand store (single source of truth)
                 │
   ┌─────────────┼───────────────────────────┐
   │             │                            │
3D / 2D PCB   phase panels              inspector drawer
(R3F + drei)  (per-section views)       (per-entity, reactive)
```

- **`src/store/useForge.js`** — all state and actions. `recomputeLive` re-derives
  validation, wiring, codegen inputs and economics on every design change.
- **`src/mission/`** — a pure, UI-independent domain layer (the component catalog
  is injected, so the engines have no store/UI coupling and unit-test in
  isolation): frameworks, objectives, challenges, brainstorm, wiring, pins,
  validation, recommendations, copilot, software/firmware, pipeline, phases,
  testing, autonomy, schedule and more.
- **`src/components/`** — thin UI over those engines: the 3D canvas, the 2D
  schematic, per-section panels, the inspector drawer, onboarding and the
  assistant chat.
- **`src/lib/`** — the graceful backend client (`api.js`, degrades to offline),
  analytics, the serial link and the assistant/copilot provider seams.
- **`server/`** — the optional Express + Sequelize/SQLite backend (auth, teams,
  projects, tasks, metrics, reports, share links, the challenge board).

## Stack

- React 19 + Vite 5 (Rollup/esbuild).
- @react-three/fiber + @react-three/drei for the 3D canvas.
- Zustand for state.
- Plain CSS with design tokens in `src/index.css` (no Tailwind).
- Space Grotesk, Space Mono and Zilla Slab (Google Fonts).
- Optional backend: Express, Sequelize, SQLite, WebSocket, JWT.

## Deployment

The live demo is built and published automatically by GitHub Actions
(`.github/workflows/deploy-pages.yml`): every push to `main` builds the static
site with `npm run build` and deploys `dist/` to GitHub Pages. The Vite `base`
is relative, so the project-site path (`/forge/`) just works.

## Status and roadmap

Hardware, serial output and telemetry are simulated; the firmware is a readable,
modular scaffold rather than a compiled build; and single-user state is in
memory. The long-term direction is a real digital twin backed by Web Serial and
a flight computer, a live LLM copilot behind the existing provider seam, more
competition frameworks, and persisted projects.

See `CLAUDE.md` for product direction, conventions and the full roadmap.
