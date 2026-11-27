// Importing this module with `import defer` must not evaluate it as long as
// the namespace is not accessed.
throw new Error('throws-on-evaluation.ts must not be evaluated')

export const value = 'unreachable'
