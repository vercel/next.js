import { atEvaluation as dependency } from './shared-dependency.js'

globalThis.deferEvents.push('shared')

export const atEvaluation = globalThis.deferRequest.getStore()
// Evaluated with this module: nothing else imports it.
export const dependencyAtEvaluation = dependency
