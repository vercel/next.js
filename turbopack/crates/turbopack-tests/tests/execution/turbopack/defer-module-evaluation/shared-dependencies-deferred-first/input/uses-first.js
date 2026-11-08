import { first } from './first.js'

globalThis.deferEvents.push('uses-first')

export const usesFirst = { name: first.name }
