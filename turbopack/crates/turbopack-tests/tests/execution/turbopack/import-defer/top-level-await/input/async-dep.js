import { log } from './log.js'

await Promise.resolve()
log.push('async-dep')

export const dep = 'async-dep'
