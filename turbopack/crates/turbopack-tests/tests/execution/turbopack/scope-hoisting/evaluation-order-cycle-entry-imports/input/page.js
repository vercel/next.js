import { shared1 } from './shared1.js'
import { shared2 } from './shared2.js'
import { peer } from './peer.js'

globalThis.evaluationOrder.push('page')

export const name = 'page'

export const page = { v: () => `${shared1} ${shared2} ${peer()}` }
