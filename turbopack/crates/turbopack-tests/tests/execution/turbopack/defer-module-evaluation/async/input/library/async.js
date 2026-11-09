globalThis.deferEvents.push('async')

export const value = await Promise.resolve('async')
