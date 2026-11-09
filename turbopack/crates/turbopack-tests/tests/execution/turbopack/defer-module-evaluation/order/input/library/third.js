import { prefix } from './third-dependency.js'

globalThis.deferEvents.push('third')

export const third = prefix + 'rd'
