globalThis.deferEvents.push('nested-inner')

export const inner = { request: globalThis.deferRequest.getStore() }
