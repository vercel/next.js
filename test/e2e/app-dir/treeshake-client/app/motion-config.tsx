'use client'

// Purely a side-effect-free re-export from an external `sideEffects: false`
// package. The client facade therefore has no local exports, so its `all()`
// locals part reference is the sole edge and gets pruned by binding-usage.
export { MotionConfig } from 'motion-lib'
