import { nextTestSetup } from 'e2e-utils'

describe('per segment prefetching', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  if (isNextDev || isNextDeploy) {
    test('ppr is disabled', () => {})
    return
  }

  // This feature is only partially implemented; the client does not yet issue
  // these types of requests. This tests that the server responds correctly.
  // TODO: Replace with e2e tests once more is implemented.

  it('prefetch an individual segment', async () => {
    const response = await next.fetch('/en', {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
        'Next-Router-Segment-Prefetch': '/',
      },
    })
    expect(response.status).toBe(200)
    const responseText = await response.text()
    expect(responseText.trim()).toBe(
      // The actual data is not yet generated, but this indicates that the
      // request was handled correctly.
      'TODO (Per Segment Prefetching): Not yet implemented'
    )
  })

  it('respond with 404 if the segment does not have prefetch data', async () => {
    const response = await next.fetch('/en', {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
        'Next-Router-Segment-Prefetch': '/does-not-exist',
      },
    })
    expect(response.status).toBe(404)
    const responseText = await response.text()
    expect(responseText.trim()).toBe('')
  })
})
