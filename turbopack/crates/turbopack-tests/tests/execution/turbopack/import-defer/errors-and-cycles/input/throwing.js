import { log } from './log.js'

log.push('throwing')

throw new Error('evaluation failed')

export const value = 'unreachable'
