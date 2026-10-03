'use client'

// Stand-in for a singleton-intended package: every module that imports it
// must see the same instance, or module-level state silently diverges.
export const singleton = {
  // Unique per module evaluation: identical iff two readers share an instance.
  instanceId: Math.random().toString(36).slice(2),
  marker: 'unmodified',
}
