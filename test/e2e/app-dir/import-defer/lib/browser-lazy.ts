// Records its evaluation, so tests can check when it happened.
const g = globalThis as typeof globalThis & { __importDeferLog?: string[] }
;(g.__importDeferLog ??= []).push('browser-lazy')

export const value = 'browser-lazy-value'
