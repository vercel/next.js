import { effect } from '../effect.js'
import { base } from './base.js'

globalThis.deferEvents.push('lazy')

export const lazy = { name: effect.name + base.name }
