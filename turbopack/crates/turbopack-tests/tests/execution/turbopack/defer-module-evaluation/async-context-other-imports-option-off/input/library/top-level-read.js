globalThis.deferEvents.push('top-level-read')

export const atEvaluation = globalThis.deferRequest.getStore()
export const inFunction = { atEvaluation }
