import { vi } from 'next/experimental/testing/vitest'

// Compile-time probes only: unsupported forms must not enter a runnable spec.
export function unsupportedMockForms() {
  // @ts-expect-error Automocking without an inline factory is unsupported.
  vi.mock('./dependency-js')
  // @ts-expect-error Spy options are not an inline factory.
  vi.mock('./dependency-js', { spy: true })
  // @ts-expect-error Promise targets are outside the supported string form.
  vi.mock(import('./dependency-js.js'), () => ({ value: 'mocked' }))
}
