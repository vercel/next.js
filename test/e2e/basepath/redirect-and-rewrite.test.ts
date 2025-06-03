import url from 'url'
import { nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP, renderViaHTTP } from 'next-test-utils'

describe('basePath', () => {
  const basePath = '/docs'

  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      basePath,
      onDemandEntries: {
        // Make sure entries are not getting disposed.
        maxInactiveAge: 1000 * 60 * 60,
      },
      async rewrites() {
        return [
          {
            source: '/rewrite-1',
            destination: '/gssp',
          },
          {
            source: '/rewrite-no-basepath',
            destination: 'https://example.vercel.sh',
            basePath: false,
          },
          {
            source: '/rewrite/chain-1',
            destination: '/rewrite/chain-2',
          },
          {
            source: '/rewrite/chain-2',
            destination: '/gssp',
          },
        ]
      },

      async redirects() {
        return [
          {
            source: '/redirect-1',
            destination: '/somewhere-else',
            permanent: false,
          },
          {
            source: '/redirect-no-basepath',
            destination: '/another-destination',
            permanent: false,
            basePath: false,
          },
        ]
      },

      async headers() {
        return [
          {
            source: '/add-header',
            headers: [
              {
                key: 'x-hello',
                value: 'world',
              },
            ],
          },
          {
            source: '/add-header-no-basepath',
            basePath: false,
            headers: [
              {
                key: 'x-hello',
                value: 'world',
              },
            ],
          },
        ]
      },
    },
  })

  it('should rewrite with basePath by default', async () => {
    const html = await renderViaHTTP(next.url, `${basePath}/rewrite-1`)
    expect(html).toContain('getServerSideProps')
  })

  it('should not rewrite without basePath without disabling', async () => {
    const res = await fetchViaHTTP(next.url, '/rewrite-1')
    expect(res.status).toBe(404)
  })

  it('should not rewrite with basePath when set to false', async () => {
    // won't 404 as it matches the dynamic [slug] route
    const html = await renderViaHTTP(
      next.url,
      `${basePath}/rewrite-no-basePath`
    )
    expect(html).toContain('slug')
  })

  it('should rewrite without basePath when set to false', async () => {
    const html = await renderViaHTTP(next.url, '/rewrite-no-basePath')
    expect(html).toContain('Example Domain')
  })

  it('should redirect with basePath by default', async () => {
    const res = await fetchViaHTTP(
      next.url,
      `${basePath}/redirect-1`,
      undefined,
      {
        redirect: 'manual',
      }
    )
    const { pathname } = url.parse(res.headers.get('location') || '')
    expect(pathname).toBe(`${basePath}/somewhere-else`)
    expect(res.status).toBe(307)
    const text = await res.text()
    if (!isNextDeploy) {
      expect(text).toContain(`${basePath}/somewhere-else`)
    }
  })

  it('should not redirect without basePath without disabling', async () => {
    const res = await fetchViaHTTP(next.url, '/redirect-1', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(404)
  })

  it('should not redirect with basePath when set to false', async () => {
    // won't 404 as it matches the dynamic [slug] route
    const html = await renderViaHTTP(
      next.url,
      `${basePath}/rewrite-no-basePath`
    )
    expect(html).toContain('slug')
  })

  it('should redirect without basePath when set to false', async () => {
    const res = await fetchViaHTTP(
      next.url,
      '/redirect-no-basepath',
      undefined,
      {
        redirect: 'manual',
      }
    )
    const { pathname } = url.parse(res.headers.get('location') || '')
    expect(pathname).toBe('/another-destination')
    expect(res.status).toBe(307)
    const text = await res.text()
    if (!isNextDeploy) {
      expect(text).toContain('/another-destination')
    }
  })
})
