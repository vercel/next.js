import { config } from '../config.js'

globalThis.deferEvents.push('lazy')

export const lazy = { name: 'lazy:' + config.mode }
