import { nextTestSetup } from 'e2e-utils'

// Explicitly don't mix route handlers with pages in this test app, to make sure
// that this also works in isolation.
describe('use-cache-route-handler-only', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should cache results in node route handlers', async () => {
    const response = await next.fetch('/node')
    const { rand1, rand2 } = await response.json()

    expect(rand1).toEqual(rand2)
  })
})
