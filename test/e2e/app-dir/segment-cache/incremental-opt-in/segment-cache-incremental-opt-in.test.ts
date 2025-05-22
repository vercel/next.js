import { nextTestSetup } from 'e2e-utils'

// Backport Note: This test is skipped as it's only currently usable in the experimental release channel.
describe.skip('segment cache (incremental opt in)', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (isNextDev || skipped) {
    test('ppr is disabled', () => {})
    return
  }

  // TODO: Replace with e2e test once the client part is implemented
  it('prefetch responds with 204 if PPR is disabled for a route', async () => {
    await next.browser('/')
    const response = await next.fetch('/ppr-disabled', {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
        'Next-Router-Segment-Prefetch': '/_tree',
      },
    })
    expect(response.status).toBe(204)
  })
})
