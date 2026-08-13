import { nextTestSetup } from 'e2e-utils'
import { createNowRouteMatches } from 'next-test-utils'

describe('empty resume', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // This test synthesizes an adapter invocation using private runtime
    // switches; it does not exercise the deployed platform proxy.
    skipDeployment: true,
    env: {
      NEXT_PRIVATE_TEST_HEADERS: '1',
      NEXT_PRIVATE_MINIMAL_MODE: '1',
    },
  })

  it('treats an empty Next-Resume body as a dynamic RSC request', async () => {
    const slug = 'cold-rdc'
    const response = await next.fetch(`/dynamic/${slug}.rsc`, {
      method: 'POST',
      headers: {
        rsc: '1',
        'next-resume': '1',
        'next-router-state-tree': JSON.stringify(['', {}, null, 'refetch']),
        // These headers emulate the platform routing a concrete pathname to
        // the generated dynamic route entrypoint.
        'x-matched-path': '/dynamic/[slug]',
        'x-now-route-matches': createNowRouteMatches({ slug }).toString(),
      },
      // An empty postponed state represents a cold RDC lookup. Next.js
      // should perform a full dynamic render instead of attempting a resume.
      body: '',
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/x-component')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(await response.text()).toContain(slug)
  })

  it('treats an empty Next-Resume body as a full dynamic HTML render', async () => {
    const slug = 'cold-html'
    const response = await next.fetch(`/dynamic/${slug}`, {
      method: 'POST',
      headers: {
        'next-resume': '1',
        'x-matched-path': '/dynamic/[slug]',
        'x-now-route-matches': createNowRouteMatches({ slug }).toString(),
      },
      body: '',
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(response.headers.get('cache-control')).toContain('no-store')

    const html = await response.text()
    expect(html).toContain(slug)
    expect(html).toContain('</html>')
  })
})
