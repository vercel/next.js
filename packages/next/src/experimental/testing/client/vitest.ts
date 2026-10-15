// This facade adds platform admission; declaration, execution and assertions still
// belong to the same compiler-bundled Next runner and pinned primitives.
import * as common from '../vitest'
import { guardedDeclaration, guardedExpect } from './api-scope'
import { assertBrowserApiScope } from './async-context'

export const test = guardedDeclaration(common.test)
export const it = test
export const describe = guardedDeclaration(common.describe)
export const suite = describe
export const expect = guardedExpect(common.expect)
export const assert = guardedExpect(common.assert)
export const createExpect = (
  ...args: Parameters<typeof common.createExpect>
) => {
  assertBrowserApiScope('assertion')
  return guardedExpect(common.createExpect(...args))
}
function unsupported(): never {
  assertBrowserApiScope('utility')
  throw new Error(
    'This API is not yet supported by the synchronous single-case Browser Mode profile.'
  )
}
export const beforeAll = unsupported
export const afterAll = unsupported
export const beforeEach = unsupported
export const afterEach = unsupported
export const aroundAll = unsupported
export const aroundEach = unsupported
export const onTestFinished = unsupported
export const onTestFailed = unsupported
export const should = unsupported
export const vi = new Proxy({} as typeof common.vi, {
  get(_target, key) {
    if (key === 'then') return undefined
    assertBrowserApiScope('utility')
    return unsupported()
  },
})
export const vitest = vi
export const inject = unsupported
export const assertType = common.assertType
export const expectTypeOf = common.expectTypeOf
export type * from '../vitest'
