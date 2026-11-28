import { promisify } from 'node:util'

// Exclude weird __promisify__ property
type SetImmediate = ((
  ...args: Parameters<typeof setImmediate>
) => ReturnType<typeof setImmediate>) & {
  [promisify.custom]?: (...args: any[]) => any
}

let mockedSetImmediate: SetImmediate | null = null

export function mockSetImmediate(implementation: SetImmediate | null) {
  mockedSetImmediate = implementation
}

const originalSetImmediate = globalThis.setImmediate

export { originalSetImmediate as unmockedSetImmediate }

const wrappedSetImmediate: SetImmediate = (...args) => {
  if (mockedSetImmediate !== null) {
    return mockedSetImmediate(...args)
  } else {
    return originalSetImmediate(...args)
  }
}

// We don't care about promisify for tests, but preserving the original just in case
wrappedSetImmediate[promisify.custom] =
  // @ts-expect-error the types for setImmediate's promisify are strange
  originalSetImmediate[promisify.custom]

// Cast as workaround for missing __promisify__, which is not a real property
globalThis.setImmediate = wrappedSetImmediate as unknown as typeof setImmediate
