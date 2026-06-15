# UX_AUDIT.md

A UX-researcher / systems-architect read of GuiaSat as it exists in the
code today (not as intended). Written before implementing the flow
restructure (Prompt B). Findings are grounded in specific files/functions.

---

## 1. Current user flow: first login → telemetry

There is **no login today** (auth is in the deferred backend pass). The
real first-run flow is:

1. **Onboarding landing** (`Onboarding.jsx`, store `onboarding: 'landing'`,
   gated by `localStorage.forge_onboarded`). Two paths:
   - *Configuração guiada* → `startGuided()` → `activeSection: 'mission'`.
   - *Pular* → `skipOnboarding()` → `activeSection: 'hardware'` (drops the
     user straight into an empty hardware view).
2. **Mission** (`MissionWindow.jsx` / `MissionSection`): a stepped flow —
   `team → format → objective → restrictions` (`missionStep` in store) — with
   the live satellite illustration on the right. Writes directly to
   `missionPlan`.
3. **Mission → Hardware transition** (`AssemblyTransition.jsx`): plays when
   the mission is considered ready; zooms the satellite and lands on Hardware.
4. **Hardware** (`HardwareSection` → `HardwareViews` → 2D `SchematicView` /
   3D `ForgeCanvas`): place components, wire pins.
5. **Firmware** (`SerialTest.jsx`, section id `serialtest`): generated
   modular firmware, detect/flash an ESP32, bring-up pipeline + diagnostics.
6. **Testing** (`HardwareTestPanel.jsx`): the 5-stage AIT pipeline.
7. **Telemetry** (`TelemetryPanel.jsx`): the ground station.

Navigation is the phase sidebar (`IconSidebar.jsx` + `phases.js`) and the
top `PipelineBar.jsx`.

---

## 2. Dead ends, confusing transitions, self-completing steps

- **`Pular` drops the user into an empty Hardware view** with no mission and
  no components — an `EmptyState`, which is a soft dead end: the next action
  ("go define a mission") is not obvious from there.
- **Phases complete themselves with no user action.** `derivePhases()` in
  `src/mission/phases.js` derives `phaseDone` purely from state predicates:
  - `hardware: nEnts >= gateAt` — completes as soon as 2 parts are placed.
  - `firmware: wiredAll && nEnts >= 1` — completes on wiring alone; the user
    never has to generate/flash firmware for the sidebar to show it "done".
  - `telemetry: telemetry.length > 0` — **completes automatically**: the 3 s
    `simulateTick` interval in `App.jsx` appends a telemetry sample on every
    tick whenever ≥1 entity exists, so the Telemetry phase flips to "done"
    before the user ever opens the ground station. This is the clearest
    premature-completion bug.
  - `mission`: completes when the plan fields are filled — reasonable, but
    still implicit (no explicit "mission defined" confirmation).
  Only `testing` requires real work (`allPassed`), and even that is a derived
  predicate, not an explicit user confirmation.
- **The phase-review screen exists but is not the gate.** `PhaseReview` /
  `openPhaseReview()` runs at transitions, but completion is decided by the
  predicates above, not by the review — so the review is advisory, not
  authoritative.
- **Firmware vs Testing handoff** is a fork inside `SerialTest` ("bancada de
  testes" / "estação terrestre"); fine, but completion of firmware isn't tied
  to actually flashing.

## 3. Pipeline stages that mark complete incorrectly / prematurely

| Phase | Current rule (`phases.js`) | Problem |
|---|---|---|
| Telemetry | `telemetry.length > 0` | Auto-completes via `simulateTick`; no user visit required. |
| Firmware | `wiredAll && nEnts>=1` | Completes on wiring; no generate/flash/validate step required. |
| Hardware | `nEnts >= 2` | Completes on part count alone; no wiring/DRC confirmation. |
| Mission | plan fields filled | Implicit; no explicit confirmation; brainstorming/constraints not required. |
| Testing | `allPassed` (5 stages) | Closest to correct, but still derived, not confirmed. |

**Fix (Prompt B Part 2, owner-confirmed):** remove auto-completion. A phase
is `done` only when the user explicitly confirms it in the phase-review
screen AND all required sub-criteria are met. Encode explicit completion
criteria per phase (below).

## 4. Phase dependencies not enforced today

The sidebar gating is coarse: `phases.js` locks everything after Hardware
behind `hwReady = nEnts >= gateAt` only. It does **not** enforce the real
engineering dependencies:

- Schematic/PCB layout depends on Hardware selection being settled.
- **Firmware depends on a finalized hardware/pin configuration** (the codegen
  reads wired GPIOs); today firmware is reachable with partial wiring.
- **Hardware testing depends on firmware being generated/flashed** ("you
  can't test what isn't flashed"); today testing is reachable without flashing.
- **Integration testing depends on all individual sensor tests passing.**
- **Telemetry validation depends on testing**; today it's reachable (and
  auto-completes) independently.

There is no notion of **downstream invalidation**: changing hardware after
firmware was generated does not mark firmware/testing "stale".

## 5. Proposed explicit completion criteria (CubeSat-practice-aligned)

- **Mission Definition:** team named · format chosen · ≥1 objective ·
  constraints/budget set · brainstorming reviewed → user confirms.
- **Hardware Selection:** ≥1 MCU + ≥1 payload/sensor placed · power accounted
  · no unresolved DRC errors → confirm.
- **Schematic & PCB Layout:** every placed part wired · no electrical-rule
  errors · routing clean → confirm.
- **Firmware Generation:** modules generated for the current hardware set ·
  pins match wiring · (real or simulated) build succeeds → confirm.
- **Hardware Testing:** comm link + interface scan + each sensor test passed.
- **Integration Testing:** combined read + full-system run passed (no skipped
  failed gates, or skips explicitly acknowledged).
- **Telemetry Validation:** ground station opened · live/simulated downlink
  observed · nominal frame received → confirm.

## 6. Missing vs standard spacecraft engineering process

- No **requirements derivation / trade study** step (NASA SE Handbook) — the
  mission jumps from objective to hardware without an explicit requirements or
  brainstorming/FMEA artifact. (Prompt A Part 3 brainstorming canvas + Prompt
  A Part 7 phase reports begin to fill this.)
- No **dependency graph / update-required propagation** (Prompt B Part 2).
- No **schedule / critical path** tied to the pipeline (Prompt B Part 3/5).
- No **explicit verification & validation gating** between phases (partially
  addressed by the testing V&V log already shipped).
- No **per-project scoping** — everything is one global workspace (handled by
  the deferred backend multi-project pass).

---

## 7. UX questions raised by user testing — proposed solutions

**Q: Why don't students know where to go after completing a step, and how to
make the next action obvious without more text?**
→ Surface a single, prominent "próximo: <phase>" affordance on each screen
driven by the dependency graph (the first incomplete, unlocked phase). The
pipeline bar should highlight exactly one "next" block. *Implement now
(no backend).* 

**Q: Why don't students notice error states until late, and how to surface
them earlier and more visually?**
→ Errors already compute live in `live.validation`; promote them to a
persistent, color-coded status on the pipeline block (red dot + count) and on
the sidebar phase, not just inline on the canvas. *Implement now.*

**Q: Why do students feel uncertain their work is saved, and what feedback
would make persistence trustworthy?**
→ Today state is in-memory/localStorage with no save signal. Add a subtle
"salvo" indicator in the top bar that flashes when state changes persist
(and, once the backend lands, reflects server sync). *Implement a local
version now; wire to backend sync later.*

**Q: Why don't students understand the link between mission choices and the
hardware that appears next, and what bridge makes it clear?**
→ Add a "da sua missão" bridge: when Hardware opens, briefly annotate which
components came from which mission objective (e.g. "BMP280 ← monitoramento
ambiental"), and keep the reactive satellite illustration consistent across
the transition. *Implement now (Prompt A Part 4 reactive illustration +
a mission→hardware provenance note).*

---

## 8. Structured questions for the project owner

Specific to what the code shows; best answered by observing a test session or
by the owner directly:

1. The `Pular` path lands users on an **empty Hardware screen** — do you
   observe users getting stuck there, or do they reliably go back to Mission?
2. Because Telemetry **auto-completes**, the sidebar shows the project as
   nearly done before the student has done telemetry — has this misled anyone
   in a demo about how far along they are?
3. In the mission flow, which **single step** do you see users hesitate on
   most (team / format / objective / restrictions)?
4. When you demo the platform, what is the **first feature a partner asks for**
   that isn't implemented yet (multi-project? real collaboration? login?)?
5. Do teams expect to **flash a real ESP32** during the session, or is the
   simulated bring-up acceptable for first contact?
6. Should **Firmware** be reachable before hardware wiring is complete, or
   must wiring be finalized first (this decides how hard we gate it)?
7. For the schedule, do teams already track **OBSat deadlines** elsewhere, and
   would they want those as fixed milestones imported automatically?
8. Is the **brainstorming/FMEA** step something teams currently do on paper or
   in Miro, and would they actually use an in-platform canvas?
9. How many concurrent projects does a typical team run (this sizes the
   multi-project UI — 1, 2–3, more)?
10. What do users currently click that **does nothing**? (We removed dead
    controls, but field observation would catch any remaining ones.)

---

## 9. Implementation priority (from this audit)

Per Prompt B's framework (stuck/lost-work first, wrong-state-feedback second,
confusing-but-recoverable third):

1. **Remove auto-completion + add explicit confirmation** (wrong-state
   feedback — the telemetry/firmware/hardware auto-done bugs). → Prompt B Part 2.
2. **Dependency-aware pipeline + downstream "atualização necessária"** so
   users see what their change invalidated. → Prompt B Part 2.
3. **Next-action clarity + earlier error surfacing + save indicator +
   mission→hardware bridge** (Part 7 of this doc). → Prompt B Part 4.
4. Schedule integration (Prompt B Part 3/5), mission-page restructure
   (Prompt A Part 4), brainstorming (Prompt A Part 3), phase reports
   (Prompt A Part 7), wire editing/autorouter (Prompt A Part 5).

> Note: AI features (brainstorming suggestions, test diagnosis) run on the
> free in-browser WebLLM + local heuristics — no paid Anthropic key — per the
> product owner's cost constraint. The seam stays ready for a server-side key.
