import { nextTestSetup } from 'e2e-utils'

// cdn-caching.mdx#cache-keys: inspect the initial response, including redirects.
// Platforms may supply the discriminator upstream and return the RSC payload
// directly. Local servers must expose the configured validation policy.
for (const validateRSCRequestHeaders of [true, false]) {
  describe(`RSC cache discriminator validation=${validateRSCRequestHeaders}`, () => {
    const { next, isNextDeploy } = nextTestSetup({
      files: __dirname,
      nextConfig: {
        cacheComponents: false,
        experimental: { validateRSCRequestHeaders, cachedNavigations: false },
      },
    })

    it('serves HTML for documents and invalid RSC header values', async () => {
      for (const headers of [{}, { rsc: '0' }]) {
        const response = await next.fetch('/?document=preserved', {
          headers,
          redirect: 'manual',
        })
        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toContain('text/html')
        expect(response.headers.get('location')).toBeNull()
        expect(await response.text()).toContain('RSC destination')
      }
    })

    for (const search of ['', '&_rsc=incorrect-discriminator']) {
      it(`handles a ${search ? 'wrong' : 'missing'} discriminator according to the configured policy`, async () => {
        const headers = { rsc: '1' }
        const response = await next.fetch(`/?example=preserved${search}`, {
          headers,
          redirect: 'manual',
        })
        if (
          validateRSCRequestHeaders &&
          (!isNextDeploy || response.status !== 200)
        ) {
          expect(response.status).toBe(307)
          const location = new URL(response.headers.get('location')!, next.url)
          expect(location.pathname).toBe('/')
          expect(location.searchParams.get('example')).toBe('preserved')
          expect(location.searchParams.has('_rsc')).toBe(true)
          expect(location.searchParams.get('_rsc')).not.toBe(
            'incorrect-discriminator'
          )
          // Use the server-advertised discriminator; its hash algorithm is not
          // the public behavior this suite is testing.
          const corrected = await next.fetch(
            location.pathname + location.search,
            {
              headers,
              redirect: 'manual',
            }
          )
          expect(corrected.status).toBe(200)
          expect(corrected.headers.get('location')).toBeNull()
          expect(corrected.headers.get('content-type')).toContain(
            'text/x-component'
          )
          expect(await corrected.text()).toContain('RSC destination')
        } else {
          expect(response.status).toBe(200)
          expect(response.headers.get('location')).toBeNull()
          expect(response.headers.get('content-type')).toContain(
            'text/x-component'
          )
          expect(await response.text()).toContain('RSC destination')
        }
      })
    }

    it('advertises HTML versus RSC variability to caches', async () => {
      const response = await next.fetch('/')
      const vary = response.headers
        .get('vary')!
        .toLowerCase()
        .split(',')
        .map((name) => name.trim())
      expect(vary).toContain('rsc')
      expect(vary).toContain('next-router-state-tree')
      expect(vary).toContain('next-router-prefetch')
    })

    for (const [path, type, content] of [
      ['/', 'text/html', 'RSC destination'],
      ['/api/ping', 'application/json', 'Pages API'],
      ['/handler', 'application/json', 'App handler'],
      ['/marker.txt', 'text/plain', 'Public destination'],
    ]) {
      it(`[R15] runs Proxy without a matcher on ${path}`, async () => {
        const response = await next.fetch(path)
        expect(response.status).toBe(200)
        expect(response.headers.get('x-contract-proxy-path')).toBe(path)
        expect(response.headers.get('content-type')).toContain(type)
        expect(await response.text()).toContain(content)
      })
    }

    it('[R15] runs Proxy without a matcher on an advertised framework chunk', async () => {
      const $ = await next.render$('/')
      const chunks = $('script[src]')
        .toArray()
        .map((element) => $(element).attr('src')!)
        .filter(
          (src) => src.includes('/_next/static/') && src.includes('/chunks/')
        )
      expect(chunks.length).toBeGreaterThan(0)
      const url = new URL(chunks[0], next.url)
      const response = await next.fetch(url.pathname + url.search)
      expect(response.status).toBe(200)
      expect(response.headers.get('x-contract-proxy-path')).toBe(url.pathname)
      expect(response.headers.get('content-type')).toContain('javascript')
    })

    it('[R15] runs Proxy without a matcher on image optimization', async () => {
      const response = await next.fetch(
        '/_next/image?url=%2Fphoto.jpg&w=64&q=75'
      )
      expect(response.status).toBe(200)
      expect(response.headers.get('x-contract-proxy-path')).toBe('/_next/image')
      expect(response.headers.get('content-type')).toMatch(/^image\//)
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0)
    })

    // Prefetching is a production capability; dev intentionally fetches on navigation.
    // @force-gate prefetching
    it('corrects a missing segment-prefetch discriminator without losing request context', async () => {
      const headers = {
        rsc: '1',
        'next-router-prefetch': '1',
        'next-router-segment-prefetch': '/_tree',
      }
      const response = await next.fetch('/?example=prefetch', {
        headers,
        redirect: 'manual',
      })
      if (
        validateRSCRequestHeaders &&
        (!isNextDeploy || response.status !== 200)
      ) {
        expect(response.status).toBe(307)
        const location = new URL(response.headers.get('location')!, next.url)
        expect(location.pathname).toBe('/')
        expect(location.searchParams.get('example')).toBe('prefetch')
        expect(location.searchParams.get('_rsc')).toBeTruthy()
        const corrected = await next.fetch(
          location.pathname + location.search,
          {
            headers,
            redirect: 'manual',
          }
        )
        expect(corrected.status).toBe(200)
        expect(corrected.headers.get('content-type')).toContain(
          'text/x-component'
        )
      } else {
        expect(response.status).toBe(200)
        expect(response.headers.get('location')).toBeNull()
        expect(response.headers.get('content-type')).toContain(
          'text/x-component'
        )
      }
    })
  })
}
