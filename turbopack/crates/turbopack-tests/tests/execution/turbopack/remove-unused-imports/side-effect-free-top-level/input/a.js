// This module has no exports that are used
// It re-exports from a side-effect-free module

// Import with side effects - should be kept
import './library/side-effectful.js'

// Re-export from a side-effect-free module
// This import should be removed when we implement the new analysis because:
// 1. 'a.js' exports are unused (noop is never imported from a.js)
// 2. The target module has no side effects (local analysis)
export { noop } from './library/side-effect-free.js'
