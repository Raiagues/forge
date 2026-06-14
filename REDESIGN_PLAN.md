# GuiaSat — Redesign Plan

> Written before any implementation. The goal of this redesign is **not** to
> bolt features onto the current structure. It is to reshape the core
> experience so building a satellite feels like a game you want to keep
> playing, not a form you are trying to finish.
>
> **North star:** every decision below is judged against one question — *does
> this make the user feel like they are building something real, watching it
> grow, and making meaningful choices?* Reference feel: Kerbal Space Program's
> VAB/mission planning, Lego's build sequence, a great consumer-app onboarding.

---

## Part A — Understanding what exists today

### A.1 The architectural spine
GuiaSat is a digital twin for university CubeSat / high-altitude-balloon teams.
The whole app obeys one rule, and the redesign must keep it:

> **The Zustand store (`src/store/useForge.js`) is the single source of truth.
> Every component is a pure function of store state.** Cross-view consistency
> (PCB ↔ drawer ↔ nav ↔ architecture ↔ telemetry) is free because everything
> reads the same data. Mission templates are *generators* of that state.

The store holds: `missionPlan` (the plan being built), `entities` (the live
PCB graph), `wires` (real user connections), `live` (validation + pin map +
economics, **recomputed on every design change** via `recomputeLive`), plus
UI/session state (`activeSection`, `selectedId`, `hwLink`, `theme`, etc.).

The engineering rules live in a **pure domain layer** under `src/mission/`
(catalog injected as a param — no store/UI imports, no cycles, unit-testable):
`frameworks.js`, `objectives.js`, `validation.js`, `recommendations.js`,
`copilot.js`, `wiring.js`, `pins.js`, `software.js`, `pipeline.js`, `hwtest.js`,
`workflow.js`, `capabilities.js`, `drc.js`, `fabRules.js`, `tips.js`,
`engineering.js`. The barrel `src/mission/index.js` re-exports all of it.

### A.2 Sections and routing
`App.jsx` maps `activeSection` → one panel. Sections (`SECTIONS` in the store):
`mission` → `MissionWindow`, `hardware` → `HardwareSection`, `serialtest`
("Firmware") → `SerialTest`, `hwtest` ("Testing") → `HardwareTestPanel`,
`telemetry` → `TelemetryPanel`. Plus `architecture` → `ArchitecturePanel` and
`analytics` (dev). With no mission, workspace sections render `EmptyState`.

Navigation is the 48px `IconSidebar` — icon-only nodes connected by a vertical
"build-sequence" line, each carrying a progress ring (done / partial / to-do
from `sectionProgress`). Downstream sections are gated until ≥2 components are
on the board; a gated click raises an anchored popover. `Topbar` is a thin 40px
breadcrumb.

### A.3 The current user flow
1. **Onboarding** (`Onboarding.jsx`): poster landing → "configuração guiada"
   (opens Mission) or "pular" (drops into Hardware). Persisted via
   `localStorage forge_onboarded`.
2. **Mission** (`MissionWindow.jsx`): a 4-step guided intake — *tipo de missão
   → competição → objetivo → identidade (name + budget)*. A persistent
   `SatelliteAssembly` SVG in the side column adds one subsystem per decision
   (bus → solar wings → payload → antenna). Every choice writes to
   `missionPlan` immediately.
3. **Hardware** (`HardwareSection.jsx`): **the same pipeline is also editable
   in-page here** (kind → framework → objective → identity → **hardware →
   wiring**) as collapsible "stages" with a flow rail; the first incomplete
   stage auto-opens, completed ones collapse to a one-line summary. Center is
   the always-live `HardwareViews` (3D `ForgeCanvas` default, or 2D
   `SchematicView`, or breadboard), with a `ViewToggle`. A bottom statusline
   shows live economics (`mass / mA / R$`) and wiring progress.
4. **Firmware** (`SerialTest.jsx`): generated multi-file sketch + real
   flash/serial via the backend.
5. **Testing** (`HardwareTestPanel.jsx`): AIT bench + Log Doctor.
6. **Telemetry** (`TelemetryPanel.jsx`): ground station.

### A.4 Mission data model (what we extend, not replace)
- `COMPONENT_DEFS` — catalog with `friendly`, `category`, `protocol`,
  `mass`, `current`, `price`, `caps`, `supported`/`comingSoon`. Supported
  today: **esp32, bmp280, mpu6050**.
- `missionPlan = { frameworkId, name, kind, objectiveId, objectiveMeta,
  budgetBRL, overrides, environment, components, software, custom }`.
- `frameworks.js` already has a structured **OBSAT** profile with declarative
  `requirements` (kinds `capability | system | count | mass`, each `source`-
  tagged), `timeline`, `scoring`, `environment`, `payload.massMaxG = 250`.
- `validation.js` `validateLive(...)` composes competition + objective + budget
  + wiring + dependency rules into `issues` carrying `source` + `targets`;
  `economics(...)` totals mass/price/current honouring overrides.

### A.5 The AI seam (already designed for, not yet live)
Three call sites already follow the same async provider pattern: `runCopilot`
(`copilot.js`), `runLogDoctor` (`debug/logDoctor.js`), `runAssistant`
(`lib/assistant.js`). Each defaults to a local engine and has an `anthropic`
provider stub that POSTs to a **backend** route holding `ANTHROPIC_API_KEY`
server-side (`.env.example`; never bundled — no `VITE_` prefix). The backend is
`server/flash.js` (Express). **The consultant AI in Part 2 reuses this exact
seam** and adds the first real backend route, model **`claude-opus-4-8`**.

### A.6 Visual language (must preserve)
Paper/ink + navy tokens in `src/index.css`; poster surfaces (onboarding,
Mission, Telemetry) use the vintage space-agency direction via `posterKit.jsx`.
Inline style objects + CSS variables, Space Grotesk / Space Mono / Zilla Slab.
No Tailwind, no neon/glassmorphism. Legibility enforced by
`scripts/legibility_audit.mjs` (WCAG AA). New UI must read like existing code.

### A.7 What is fragile / must not break
- `recomputeLive` is called by nearly every mutating action and regenerates
  firmware files; changes to `missionPlan` shape must thread through it.
- `HardwareSection` already contains an in-page mission pipeline (recent work).
  Part 8 narrows this; Part 2 moves full mission definition out — these two
  must be reconciled, not duplicated.
- Section gating logic lives in `IconSidebar` (`FREE`, `hwStageDone`). The new
  sidebar (Part 5) and pipeline bar (Part 9) must share one gating predicate.
- The Vite 5 / three / drei versions are pinned deliberately. No dep jumps.

---

## Part B — Implementation strategy, part by part

Guiding principles: (1) **extend the store + domain layer first**, UI second;
(2) keep all new rules in pure `src/mission/*` engines; (3) every new surface is
a pure function of store state; (4) one shared predicate for phase
gating/completion (no duplicated truth); (5) reuse `posterKit` tokens.

### Part 1 — OBSat focus + competition integration
- **Research** the current/most-recent OBSat *edital* (mass, size, required
  subsystems, telemetry/power/comms constraints, phases + deadlines, scoring).
  If unavailable, use the latest found and **flag stale data with a code
  comment** + a `sourceNote`/`asOf` field on the profile.
- Enrich the existing `OBSAT` object in `frameworks.js` (do not fork it):
  fill `requirements`, `timeline` (real dated phases), `scoring`, and a new
  `telemetry` packet spec + `power`/`size` constraints as declarative data.
- Add any new rule *kinds* the edital needs (e.g. `volume`, `power`,
  `telemetryField`) to `validation.js` `evalRule`, keeping the
  `{id, severity, source, title, detail, suggest}` shape.
- OBSat becomes the default, fully-validated path; requirements are surfaced
  **contextually** (Part 7), never dumped as a checklist up front.
- *No breakage:* additive to existing data; old rules keep working.

### Part 2 — Mission definition as interactive consultant
- **Remove pre-defined mission templates** as the entry path (keep
  `MISSION_TEMPLATES`/`loadTemplate` only if still referenced; otherwise
  retire). The single path becomes a guided **consultant flow**.
- A structured, one-question-at-a-time flow (NOT a chat box) that gives
  immediate contextual feedback. Sequence: **competition/project context →
  satellite format → mission objective (free-form + AI suggestions) → team
  composition (+ NL "team situation" field) → constraints & priorities (budget
  by category, timeline, known constraints) → early sensor/subsystem draft** so
  the user reaches Hardware with a *draft component list, not a blank board*.
- Store changes: extend `missionPlan` with `format`, `team` (name,
  institution, size, roles, situationText), `budgetCategories` (electronics,
  structure, propulsion, travel, fees), `priorities`, and a `draftComponents`
  result. Thread all through `recomputeLive` (default safely when absent).
- New engine `src/mission/consultant.js`: pure question graph + a
  local-heuristic responder (reusing `recommendations.js` `analyzeText` /
  `recommend`) behind the **same provider seam** as `runCopilot`. Live provider
  = Anthropic via new backend route `POST /consult` in `server/flash.js`
  (key server-side, model `claude-opus-4-8`, system prompt = senior CubeSat/
  CanSat systems engineer familiar with OBSat, focused on tradeoffs). Falls
  back to local heuristics offline.
- UI: rework `MissionWindow.jsx` into the consultant; keep `SatelliteAssembly`
  growing per answer. Reconcile with the in-page pipeline now in
  `HardwareSection` (Part 8 strips mission-definition stages out of Hardware).

### Part 3 — Live budget visualization (foundational — build early)
- Pure engine `src/mission/budgets.js`: given plan format + components +
  overrides → four meters: **mass (g)**, **volume / form-factor utilization**,
  **financial (BRL, by category)**, **power (mW)**. Limits come from the format
  (Part 2) and OBSat profile (Part 1). Power = Σ(current × voltage) → mW.
- Component volume: add an estimated `volumeCm3` (or bounding box) to
  `COMPONENT_DEFS` so volume is honest, not faked.
- Store: surface `live.budgets` from `recomputeLive`. Add a hover/preview
  "delta" helper so a candidate component shows its contribution to each meter
  *before* it is added.
- UI: `BudgetMeters` component (constraint meters, not progress bars) —
  color shift near a limit, **visual overflow + forward-progress block** when
  exceeded. Lives compactly in the persistent left sidebar (Part 5) so it is
  visible from mission definition through hardware.
- *Everything else depends on this*, so it ships right after the OBSat data.

### Part 4 — Satellite assembly animation (connective tissue)
- Reuse/extend `SatelliteAssembly.jsx` as the single satellite metaphor. As
  hardware is added in the Hardware phase, the illustration gains matching
  exterior elements (GPS→antenna, radio→RF), flat-illustration style.
- **Phase transition animation** (Mission → Hardware): the corner satellite
  expands full-screen to the assembled exterior, then the camera zooms through
  the shell into the interior board view that *becomes* the Hardware screen.
  ~2–3s, **not skippable on first view**, skippable on repeat (persist a
  `localStorage` seen-flag). Tonal reference: KSP / Monument Valley scene
  transitions.
- Store: a small `transition` slice ({ phase, playing }) so the animation is
  driven by state and can be skipped/instant in user-test/deep-link modes.
- *No breakage:* the animation is an overlay between section switches; if it is
  disabled the underlying navigation still works.

### Part 5 — Expandable left sidebar navigation
- Replace the icon-only rail with a structured, **expandable** sidebar showing
  the full phase sequence (Mission, Hardware, Firmware, Testing, Telemetry),
  each expandable to its sub-items (e.g. Mission → context, format, objective,
  team, constraints, components; Hardware → schematic, PCB, 3D; etc.).
- Current phase + sub-item highlighted; completed sub-items show a check and
  are clickable to revisit/edit; locked future items visible but inert.
- Collapsible to icons-only with a toggle; tooltips with completion summary in
  collapsed mode. Persist collapsed/width state (reuse `usePanelWidth` /
  `navWidth` pattern).
- Sub-item completion comes from **one shared predicate module**
  `src/mission/phases.js` (derived from store) reused by Parts 5, 6, 9 — no
  duplicated progress logic. The budget meters (Part 3) dock here.
- *No breakage:* keep `setSection`; map sub-items onto sections + an in-section
  focus target.

### Part 6 — Phase transition review screens
- When advancing a phase, show a **mission-readiness review** (not a confirm
  dialog): what was decided/built, unresolved warnings/violations, all four
  budget meters, and two actions — *go back* or *confirm and advance*.
- Visually distinct, satellite illustration at larger scale with annotations;
  language reinforces the narrative ("mission phase complete, systems nominal,
  ready to proceed to hardware integration").
- Pure `src/mission/phaseReview.js` builds the summary from store state
  (reusing validation + budgets + the Part 5 predicate). Component
  `PhaseReview.jsx` rendered on advance; integrates with the Part 4 animation
  (review → animation → next phase).

### Part 7 — OBSat schedule + requirements checklist
- **Schedule view** (sidebar-accessible): OBSat timeline (phases + deadlines
  from Part 1) on a simple visual timeline, with the team's current phase
  marked relative to deadlines. New `SchedulePanel.jsx`; section id `schedule`.
- **Requirements checklist**: a persistent, collapsible panel reachable from
  any screen. Auto-checks satisfied requirements, leaves unmet unchecked,
  flags actively-violated ones amber/red; click a requirement → explanation +
  fix suggestion. Driven by `validateLive` issues already keyed by `source`/
  `ruleId` — map each OBSat requirement to satisfied/unmet/violated. Updates in
  real time (it already recomputes on every change). Visually clean, secondary
  to the work area.

### Part 8 — Hardware screen restructure
- **Separate component selection from PCB routing.** Selection moves into the
  Part 2 consultant flow; Hardware *receives a pre-populated component list*.
  Strip the mission-definition + hardware-selection stages out of
  `HardwareSection.jsx`; its job becomes **physical layout**: place, route,
  view 2D/3D.
- **Default view = 2D schematic** (change store `hardwareView` default to `2d`,
  or set it on entering Hardware). Make 2D/3D toggles **large, labeled,
  center-top** buttons (KiCad-style), not small secondary controls.
- "Edit mission" link here is **scoped to hardware-relevant params only**
  (format dimensions, budget, component list) — not the full mission flow.
- *No breakage:* wiring/auto-wire/validation stay; only the left config column
  and view defaults change.

### Part 9 — Persistent top pipeline bar
- A compact horizontal bar under the main nav, on every screen: five phase
  nodes connected by a line; completed filled, current accent, future dimmed;
  clicking a completed node navigates. ≤40px tall, must not crowd content.
- Driven by the same `src/mission/phases.js` predicate (Part 5). Rendered in
  `App.jsx` between `Topbar` and the content area (or merged into `Topbar`).
- Replaces the need to remember location; complements (does not duplicate) the
  sidebar.

---

## Part C — Delivery order & commits

REDESIGN_PLAN.md is committed first (this commit), before any code. Then,
**each part is its own commit** with a clear message:

1. `feat(obsat): research-backed OBSat competition profile + requirements`
2. `feat(budgets): live four-meter constraint visualization`  *(before flow —
   everything depends on it)*
3. `feat(mission): consultant-driven mission definition (+ Anthropic seam)`
4. `feat(transition): full-screen satellite assembly animation`
5. `feat(nav): expandable phase sidebar with budget meters`
6. `feat(review): phase-transition mission-readiness screens`
7. `feat(obsat): schedule view + live requirements checklist`
8. `refactor(hardware): layout-only screen, 2D default, large view toggle`
9. `feat(nav): persistent top pipeline bar`

(Order matches the prompt; Part 3 lands right after Part 1's data because Parts
2/5/6 consume the budget meters.) No "big bang" commit.

## Part D — Cross-cutting safeguards
- **One source of truth for phase/sub-item state:** `src/mission/phases.js`,
  reused by sidebar, pipeline bar, and review screens.
- **Thread `missionPlan` additions through `recomputeLive`** with safe
  defaults so existing flows and saved drafts keep loading.
- **AI stays behind the provider seam**, key server-side only, local heuristics
  as the always-available fallback. Model `claude-opus-4-8`.
- **Run `npm run lint`, `npm run build`, and the legibility audit** before each
  commit; keep body text ≥14px and mono labels ≥10px.
- **Honesty rule preserved:** simulated hardware/serial/telemetry stay labelled
  "simulação"; never fake-positive hardware state.

## Part E — Open questions (resolve during implementation, not blocking)
- Exact OBSat edition/edital to cite (use most recent; flag `asOf`).
- Whether `architecture`/`breadboard` views remain reachable in the new sidebar
  or fold under Hardware sub-items.
- CanSat vs CubeSat 1U/2U/3U volume/mass/power limit numbers (sourced in Part
  2/3 from OBSat + standard CubeSat specs, flagged where assumed).
