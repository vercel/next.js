// Opt in only in a test-specific tsconfig. This does not redirect runtime imports.
declare module 'vitest' {
  export * from 'next/experimental/testing/vitest'
}

declare module 'vitest/config' {
  export * from 'next/dist/experimental/testing/config-api'
}
