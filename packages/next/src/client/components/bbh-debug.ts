// DEBUG BRANCH ONLY — DO NOT MERGE.
// The back-before-hydration fixture sets `window.__BBH_DEBUG` from an inline
// script in its root layout, so the probes below only run for that fixture and
// every other suite is unaffected.
export function bbhDebug(): boolean {
  return typeof window !== 'undefined' && (window as any).__BBH_DEBUG === true
}
