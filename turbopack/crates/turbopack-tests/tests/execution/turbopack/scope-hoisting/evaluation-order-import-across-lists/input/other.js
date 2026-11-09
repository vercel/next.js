import { m0 } from './m0.js'
import { m1 } from './m1.js'
import { m3 } from './m3.js'
import { m4 } from './m4.js'
import { m9 } from './m9.js'
import { m5 } from './m5.js'
import { m6 } from './m6.js'
import { m7 } from './m7.js'

globalThis.evaluationOrder.push('other')

export const other = { v: [m0, m1, m3, m4, m9, m5, m6, m7].map((m) => m.v) }
