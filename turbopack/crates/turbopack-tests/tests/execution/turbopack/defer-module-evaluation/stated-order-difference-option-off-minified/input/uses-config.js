import { config } from './config.js'

globalThis.deferEvents.push('uses-config')

export const usesConfig = { mode: config.mode }
