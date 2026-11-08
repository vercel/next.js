// `part.js` is read while this module is evaluated, so the two are merged.
import { part } from './part.js'

globalThis.deferEvents.push('root')

export const root = part + ' of root'
