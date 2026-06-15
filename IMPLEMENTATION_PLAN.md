# IMPLEMENTATION_PLAN.md

Plan for the multi-part GuiaSat upgrade (auth/teams, testing-screen digital
twin + pipeline, firmware fixes, sidebar, grid removal, collaboration, metrics,
demo mode, shareable summary). Written **before** any code changes.

> Sequencing decision (confirmed with the product owner): **frontend-first,
> defer backend.** Everything that does not require a database / auth / sockets
> ships first; the auth + collaboration + metrics work follows in a later pass
> on a real backend.

---

## 1. Understanding of the current codebase (GuiaSat)

- **Stack:** React 19 + Vite 5, `@react-three/fiber` + `drei` for 3D, **Zustand**
  (`src/store/useForge.js`, ~1300 lines) as the single source of truth, plain CSS
  with design tokens in `src/index.css`. No Tailwind.
- **Backend today:** only `server/flash.js` (Express) for ESP32 flashing,
  serial SSE streaming (`/serial`, `/serial/send`, `/detect`, `/flash`) and
  analytics file logging (`/analytics/*`). `server/serial_bridge.py` owns the
  port. **No auth, no DB, no multi-user.** State is in-memory + a little
  `localStorage` (`navWidth`, `forge_onboarded`, theme, analytics buffer).
- **Architecture philosophy:** every component is a pure function of store
  state; domain logic lives in pure engines under `src/mission/` (catalog
  injected, no store/UI imports). Key engines: `phases.js` (phase/sub state),
  `hwtest.js` (the 5-stage AIT test campaign), `wiring.js` (pin catalog +
  validation), `software.js` (modular firmware), `validation.js`, `pins.js`.
- **What already exists** (so several prompt items are *refinement*, not new):
  - **Sidebar** (`IconSidebar.jsx`) is already a phase-ordered vertical nav
    (Mission → Hardware → Firmware → Testing → Telemetry) with **done / current
    / locked** states driven by `derivePhases()` in `phases.js`. The only true
    gap vs. the prompt is a bottom **Team** utility item (backend-dependent).
  - **Testing** (`HardwareTestPanel.jsx` + `hwtest.js`) already models the five
    stages (comm link → interface scan → sensor tests → integration → system)
    with honest, data-derived verdicts and a terminal playback.
  - **AI:** Log Doctor (`src/debug/logDoctor.js`), copilot seam, and a **free
    in-browser LLM** (`src/lib/webllm.js`, `@mlc-ai/web-llm`, Llama-3.2-1B over
    WebGPU) behind the AI tutor (`src/lib/assistant.js`).
  - **Serial/real hardware:** `SerialTest.jsx` connects a real ESP32 through the
    backend bridge; its stream mirrors into the store serial buffer.
- **Grid background:** the `.paper-grid` element is rendered once in
  `App.jsx` and styled in `src/index.css` (two `linear-gradient`s @ 20px).

## 2. Understanding of the login backend (`Raiagues/login_project`)

- **Stack:** Node/Express + **Sequelize + SQLite**. Models: `members`
  (with `isAdmin`, `passhash`, profile fields), `projects`, `activity`,
  `projectActivity`. Controllers/routes for member/project/activity; Swagger.
- **Auth:** `bcrypt` password hashing (✅ *not* plaintext), login issues a `jws`
  HS256 token (`x-access-token` header); `access.js` middleware verifies the
  token and loads the user; `isAdmin` gate for admin-only routes.
- **Security gaps to FIX during integration (do not carry forward):**
  - Token has **no expiration / no `exp` claim** → add expiry + refresh.
  - **bcrypt cost = 2** (far too low) → raise to ≥10.
  - No rate limiting on login; `cors()` is wide open; tokens are unscoped.
  - Move secrets to server-only env (already the GuiaSat convention; never
    `VITE_`-prefixed).

## 3. Integration approach (backend, DEFERRED phase)

- **New unified backend:** adopt the login_project Sequelize+SQLite service as
  the GuiaSat backend and fold the existing `flash/serial/analytics` routes into
  it (one process, one DB). Extend the schema with `teams`, `team_members`
  (role: `manager` | `member`, assigned subsystem), `tasks` (state, deadline,
  assignee), `events` (autonomy instrumentation), `mission_state` (shared).
- **Roles:** `manager` (full edit, team config, mission/hardware) vs `member`
  (read-all, edit only assigned subsystems/tasks). Enforce server-side; mirror
  in the store for UI gating.
- **Real-time collaboration:** **full WebSocket sync** (confirmed) — push
  mission/hardware/task/presence changes to all team members; presence avatars
  in the top bar.
- **AI diagnosis (cost-free):** reuse the existing **WebLLM** in-browser model as
  the live provider behind the diagnosis seam, with the offline heuristic engine
  (Log Doctor) as fallback. **No paid API key required.**

## 4. Delivery order

**Frontend-first pass (this work):**
1. Sidebar — verify phase order/states; document gaps (Team deferred). *[mostly done already]*
2. Remove the background grid from every screen (clean solid theme bg).
3. Firmware/serial screen state persistence across navigation + auto-reconnect.
4. Sensor diagnostic accuracy: active I²C poll every 2–3 s (BMP280 0x76/0x77,
   MPU6050 0x68/0x69) instead of init-success.
5. Redesign the diagnostic panel as clickable color+icon status blocks.
6. Make the firmware pipeline (detect → build → flash → validate) fully visible
   from screen entry.
7. Testing screen: visible 5-stage pipeline with locking, V&V log + coverage
   summary, live data panel, inline AI diagnosis (WebLLM, free) on failures,
   between-test guidance/summary cards.
8. Digital twin: MPU6050 live 3D orientation + BMP280 live gauges; clear
   live-vs-sim labelling; freeze-on-disconnect.

**Deferred backend pass (later):**
9. Unified Sequelize/SQLite backend + auth + roles + seed accounts
   (`SEED_ACCOUNTS.md`) with security fixes.
10. Team management screen + task allocation (kanban) + deadlines on schedule.
11. WebSocket real-time collaboration + presence + member onboarding flow.
12. Autonomy session instrumentation + manager metrics dashboard + funnel.
13. Demo mode + expanded seed team + reliability hardening.
14. Shareable read-only mission summary page (public URL).

Each part is committed separately with a clear message.
