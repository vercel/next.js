globalThis.deferEvents.push('emitter')

// Calls what other modules registered, as a module does that logs or reports while it is
// evaluated.
export const heardAtEvaluation = globalThis.deferListeners.map((listener) =>
  listener()
)

export const settings = { level: 'info' }

export function prefix() {
  return 'emitter: '
}
