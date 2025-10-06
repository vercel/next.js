import { nextTestSetup } from 'e2e-utils'

// Explicitly don't mix route handlers with pages in this test app, to make sure
// that this also works in isolation.
describe('use-cache-route-handler-only', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should cache results in node route handlers', async () => {
    const response = await next.fetch('/node')
    const { date1, date2 } = await response.json()

    expect(date1).toBe(date2)
  })

  it('should be able to revalidate prerendered route handlers', async () => {
    const response1 = await next.fetch('/node')
    const { date1: date1a } = await response1.json()

    // Revalidate the prerendered response.
    await next.fetch('/revalidate', { method: 'POST' })

    // Fetch the response again. This should trigger a blocking revalidation.
    const response2 = await next.fetch('/node')
    expect(response2.status).toBe(200)

    const { date1: date1b } = await response2.json()
    expect(date1a).not.toBe(date1b)
  })
})
