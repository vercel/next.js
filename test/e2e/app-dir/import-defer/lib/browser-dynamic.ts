// Records its evaluation, so tests can check when it happened.
const g = globalThis as typeof globalThis & { __importDeferLog?: string[] }
;(g.__importDeferLog ??= []).push('browser-dynamic')

export const value = 'browser-dynamic-value'
