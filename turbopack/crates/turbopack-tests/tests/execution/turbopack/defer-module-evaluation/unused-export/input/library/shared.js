globalThis.deferEvents.push('shared')

export const shared = { atEvaluation: globalThis.deferRequest.getStore() }
