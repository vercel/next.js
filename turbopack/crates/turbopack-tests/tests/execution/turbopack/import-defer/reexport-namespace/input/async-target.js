import { log } from './log.js'

await Promise.resolve()
log.push('async-target')

export const value = 'async-target-value'
