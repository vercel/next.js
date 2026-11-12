import type { createAssertionRuntime } from '../assertions'
import { assertScopeActive } from './async-context'
import { assertAssertionRuntimeAccess } from '../assertions/assertion-platform'

let assertions: Awaited<ReturnType<typeof createAssertionRuntime>> | undefined

export function getAssertionRuntime() {
  assertScopeActive()
  if (!assertions)
    throw new Error('Assertion APIs require an initialized Next test file.')
  return assertions
}

export function getAssertionRuntimeForAssertions() {
  assertAssertionRuntimeAccess()
  if (!assertions)
    throw new Error('Assertion APIs require an initialized Next test file.')
  return assertions
}
