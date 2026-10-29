import { markInjected } from './setup'

// Top-level await makes this an async module, so require() returns a promise.
await Promise.resolve()

export async function register() {
  markInjected('second')
}
