/* eslint-disable jest/no-standalone-expect */
import { nextTestSetup } from 'e2e-utils'

// Explicitly don't mix route handlers with pages in this test app, to make sure
// that this also works in isolation.
describe('use-cache-route-handler-only', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  const itSkipTurbopack = isTurbopack ? it.skip : it

  itSkipTurbopack('should cache results in route handlers', async () => {
    const response = await next.fetch('/')
    const { rand1, rand2 } = await response.json()

    expect(rand1).toEqual(rand2)
  })
})
