# SEED_ACCOUNTS.md

Test/demo accounts for GuiaSat.

> **Status:** these accounts are **provisioned automatically on first run by the
> auth backend**, which lands in the deferred backend pass (see
> `IMPLEMENTATION_PLAN.md` §4, items 9–13). This file documents the intended
> credentials up front so the seeding logic and the demo script agree. Until the
> backend ships, the platform runs single-user with no login and these accounts
> are not yet active.

All passwords are intentionally simple **for testing only** — never reuse them
in any real deployment. Passwords are stored as bcrypt hashes (cost ≥ 10), never
in plaintext.

## Core test accounts (Part 1)

| Username          | Password    | Role          | Subsystem |
| ----------------- | ----------- | ------------- | --------- |
| `manager_forge`   | `forge2024` | team manager  | —         |
| `membro_hardware` | `forge2024` | team member   | Hardware  |
| `membro_firmware` | `forge2024` | team member   | Firmware  |
| `membro_testes`   | `forge2024` | team member   | Testing   |

## Demo team (expanded, for live demos — Part 3 of the validation prompt)

A complete example OBSat 1U environmental-monitoring team, pre-seeded with a
mission (OBSat, 1U CubeSat, environmental monitoring objectives, budget R$800),
realistic early-stage tasks, and sample telemetry. All demo data is labelled
**"dados de demonstração"** in the UI.

| Username             | Password    | Role         | Subsystem                  |
| -------------------- | ----------- | ------------ | -------------------------- |
| `lider_obsat`        | `forge2024` | team manager | team lead                  |
| `aluno_hardware`     | `forge2024` | team member  | Hardware                   |
| `aluno_firmware`     | `forge2024` | team member  | Firmware                   |
| `aluno_testes`       | `forge2024` | team member  | Testing                    |
| `aluno_requisitos`   | `forge2024` | team member  | Documentation & requirements |

## Seeding behaviour

- Accounts are created idempotently on backend boot (only if absent).
- The manager account owns the demo team and its mission; members are
  pre-assigned to their subsystems with a few realistic tasks each.
- Exiting demo mode restores the signed-in user's real data.
