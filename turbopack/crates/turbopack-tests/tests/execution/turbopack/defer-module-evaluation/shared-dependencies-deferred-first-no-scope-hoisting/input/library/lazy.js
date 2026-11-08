import { first } from '../first.js'
import { second } from '../second.js'

globalThis.deferEvents.push('lazy')

export const lazy = { name: first.name + second.name }
