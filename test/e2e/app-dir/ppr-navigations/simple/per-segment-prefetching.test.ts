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

  function prefetch(pageUrl, segmentPath) {
    return next.fetch(pageUrl, {
      headers: {
        RSC: '1',
        'Next-Router-Prefetch': '1',
        'Next-Router-Segment-Prefetch': segmentPath,
      },
    })
  }

  function extractPseudoJSONFromFlightResponse(flightText: string) {
    // This is a cheat that takes advantage of the fact that the roots of the
    // Flight responses in this test are JSON. Again, this is just a temporary
    // smoke test until the client part is implemented; we shouldn't rely on
    // this as a general testing strategy.
    const match = flightText.match(/^0:(.*)$/m)
    if (match) {
      return JSON.parse(match[1])
    }
    return null
  }

  it('basic route tree prefetch', async () => {
    // To perform a prefetch a page, the client first fetches the route tree.
    // The response is used to construct prefetches of individual segments.
    const routeTreeResponse = await prefetch('/en', '/_tree')
    const routeTreeResponseText = await routeTreeResponse.text()
    const routeTree = extractPseudoJSONFromFlightResponse(routeTreeResponseText)

    // Confirm that the prefetch was successful. This is a basic check to ensure
    // that the name of an expected field is present in the response.
    expect(typeof routeTree.staleTime).toBe('number')

    // The root segment is a shared segment. Demonstrate that fetching the root
    // segment for two different pages results in the same response.
    const enResponse = await prefetch('/en', '/')
    const enResponseText = await enResponse.text()
    const frResponse = await prefetch('/fr', '/')
    const frResponseText = await frResponse.text()
    expect(enResponseText).toEqual(frResponseText)
  })

  it('respond with 204 if the segment does not have prefetch data', async () => {
    const response = await prefetch('/en', '/does-not-exist')
    expect(response.status).toBe(204)
    const responseText = await response.text()
    expect(responseText.trim()).toBe('')
  })
})
