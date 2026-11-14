globalThis.evaluationOrder.push('b before await')

await Promise.resolve()

globalThis.evaluationOrder.push('b after await')

export const b = { v: 'b' }
