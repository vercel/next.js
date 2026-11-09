import './p.js'

await Promise.resolve()

globalThis.evaluationOrder.push('n')

export const n = 1
