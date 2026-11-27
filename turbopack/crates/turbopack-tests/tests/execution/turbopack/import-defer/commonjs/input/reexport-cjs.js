import { log } from './log.js'
export * from './reexported-cjs.js'

log.push('reexport-cjs')

export const own = 'own'
