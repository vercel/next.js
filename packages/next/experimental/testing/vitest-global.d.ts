// Opt in only for Next-owned tests that use the compiler's bare vitest alias.
declare module 'vitest' {
  export * from 'next/experimental/testing/vitest'
}
