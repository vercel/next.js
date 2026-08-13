'use client'

// DEBUG BRANCH ONLY — DO NOT MERGE.
// Blocks the main thread during the first client render so the back press
// lands before app-router installs its popstate listener, which is the window
// CI hits on slower runners and this machine is too fast to hit on its own.
// Stalls the first few client renders, not just hydration: the test already
// makes the pre-hydration window deterministic by stalling scripts, so the
// race that CI hits has to be in the recovery renders after they're released.
let rendersLeft = 5

export function SlowHydration() {
  if (typeof window !== 'undefined' && rendersLeft > 0) {
    rendersLeft--
    const ms = (window as any).__BBH_STALL ?? 0
    const end = performance.now() + ms
    while (performance.now() < end) {}
  }
  return null
}
