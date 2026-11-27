import { log } from './log.js'
import { dep } from './dep.js'

log.push('lazy')

export const value = 'lazy-' + dep
