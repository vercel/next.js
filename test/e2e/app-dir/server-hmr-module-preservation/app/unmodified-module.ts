// This module's evaluation timestamp is used to verify it's not re-evaluated on HMR
// unless the module itself changes

// Log when this module is evaluated - this is what we test
console.log('[Module] evaluated')

// Timestamp showing when this module was last evaluated
// This value only changes if this module is re-evaluated
export const evaluatedAt = Date.now()
