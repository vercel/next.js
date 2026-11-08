import { base } from './library/base.js'

globalThis.deferEvents.push('uses-base')

export const usesBase = { name: base.name }
