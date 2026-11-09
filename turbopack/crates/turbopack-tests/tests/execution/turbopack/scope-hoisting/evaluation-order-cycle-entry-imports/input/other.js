import { peer } from './peer.js'
import { shared1 } from './shared1.js'
import { shared2 } from './shared2.js'

globalThis.evaluationOrder.push('other')

export const other = { v: () => `${shared1} ${shared2} ${peer()}` }
