globalThis.deferEvents.push('config')

// Copies global state when it is evaluated.
export const config = { mode: globalThis.deferMode || 'default' }
