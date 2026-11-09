import { second } from './second.js'

globalThis.deferEvents.push('uses-second')

export const usesSecond = { name: second.name }
