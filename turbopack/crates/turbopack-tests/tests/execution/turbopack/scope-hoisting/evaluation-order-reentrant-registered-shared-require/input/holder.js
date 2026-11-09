import { register } from './registry.js'

globalThis.evaluationOrder.push('holder')

register('above', () =>
  require(/* turbopackChunkingType: shared */ './above.js')
)
