import { a } from './below-cycle-a.js'

globalThis.deferEvents.push('imports-cycle')

export const belowCycle = a()
