globalThis.deferEvents.push('nested')

export const atEvaluation = globalThis.deferRequest.getStore()
