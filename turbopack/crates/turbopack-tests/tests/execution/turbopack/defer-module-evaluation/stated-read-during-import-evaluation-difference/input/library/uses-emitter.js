import { settings, prefix } from '../emitter.js'

globalThis.deferEvents.push('uses-emitter')

// Copies an export of its import when it is evaluated.
export const atEvaluation = { settings }

export function format(text) {
  return prefix() + text
}
