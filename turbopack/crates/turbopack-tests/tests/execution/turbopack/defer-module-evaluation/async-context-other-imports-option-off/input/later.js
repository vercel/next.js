import { atEvaluation, dependencyAtEvaluation } from './library/shared.js'

globalThis.deferEvents.push('later')

export const sharedAtEvaluation = [atEvaluation, dependencyAtEvaluation]
