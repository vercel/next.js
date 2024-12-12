import { nextTestSetup } from 'e2e-utils'

describe('segment cache (incremental opt in)', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (isNextDev || skipped) {
    test('ppr is disabled', () => {})
    return
  }

  function extractPseudoJSONFromFlightResponse(flightText: string) {
    // This is a cheat that takes advantage of the fact that the roots of the
    // Flight responses in this test are JSON. This is just a temporary smoke test
    // until the client part is implemented; we shouldn't rely on this as a
    // general testing strategy.
    const match = flightText.match(/^0:(.*)$/m)
    if (match) {
      return JSON.parse(match[1])
    }
    return null
  }

  // TODO: Replace with e2e test once the client part is implemented
  it('route tree prefetch falls through to old prefetching implementation if PPR is disabled for a route', async () => {
    await next.browser('/')
    const response = await next.fetch('/ppr-disabled', {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
        'Next-Router-Segment-Prefetch': '/_tree',
      },
    })
    expect(response.status).toBe(200)

    // Smoke test to confirm that this returned a NavigationFlightResponse.
    expect(response.headers.get('x-nextjs-postponed')).toBe(null)
    const flightText = await response.text()
    const result = extractPseudoJSONFromFlightResponse(flightText)
    expect(typeof result.b === 'string').toBe(true)
  })

  // TODO: Replace with e2e test once the client part is implemented
  it('route tree prefetch does not include any component data even if loading.tsx is defined', async () => {
    await next.browser('/')
    const response = await next.fetch('/ppr-disabled-with-loading-boundary', {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
        'Next-Router-Segment-Prefetch': '/_tree',
      },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('x-nextjs-postponed')).toBe(null)

    // Usually when PPR is disabled, a prefetch to a route that has a
    // loading.tsx boundary will include component data in the response, up to
    // the first loading boundary. But since this is specifically a prefetch
    // of the route tree, it should skip all the component data and only return
    // the router state.
    const flightText = await response.text()
    // Confirm that the response does not include any component data by checking
    // for the absence of the loading component.
    expect(flightText).not.toContain('Loading...')
  })
})
