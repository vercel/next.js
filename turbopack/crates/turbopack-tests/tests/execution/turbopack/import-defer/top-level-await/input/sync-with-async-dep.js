import { log } from './log.js'
import { dep } from './async-dep.js'

log.push('sync-with-async-dep')

export const value = 'sync-' + dep
