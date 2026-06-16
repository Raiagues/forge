// ──────────────────────────────────────────────────────────────────
// Shared "lego brick clicking into place" micro-animation language
// (north-star: every decision should feel like assembling a real object).
//
// SINGLE SOURCE OF TRUTH for the building micro-animations used across the
// mission (satellite), hardware (PCB) and firmware (microcontroller)
// illustrations. The canonical values also live as CSS custom properties
// (--lego-dur / --lego-ease) + the `.lego-pop` keyframe in src/index.css;
// keep the two in sync. Tune here to change the feel everywhere.
//
//   duration : ≤300ms so it never blocks interaction
//   easing   : a slight overshoot ("click") then settle
//   scale    : peak overshoot before settling to 1
// ──────────────────────────────────────────────────────────────────

export const LEGO = {
  durationMs: 280,
  easing: 'cubic-bezier(.34, 1.56, .64, 1)',
  scale: 1.16,
  className: 'lego-pop',
}

// Apply on an element whose `key` changes when something is "added" so the
// CSS animation re-fires (e.g. key={legoKey(count)}). Returns the class to
// spread onto the element's className.
export const legoClass = LEGO.className
export function legoKey(token) { return `lego-${token}` }
