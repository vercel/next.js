import { expect } from 'vitest'

export const helperExpect = expect
export const shared = { setupCalls: 0, beforeEachCalls: 0 }

export function installMatchers() {
  expect.extend({
    /** @param {number} received @param {number} original */
    toBeDoubleOf(received, original) {
      return {
        pass: received === original * 2,
        message: () => `expected ${received} to be double ${original}`,
      }
    },
  })
}
