import { nextTestSetup } from 'e2e-utils'

describe('documented route selection boundaries', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      images: {
        qualities: [75],
        localPatterns: [{ pathname: '/allowed/**', search: '' }],
      },
    },
  })

  it.each([
    ['/api/priority/fixed', { kind: 'static', value: 'fixed' }],
    ['/api/priority/one', { kind: 'dynamic', value: 'one' }],
    ['/api/priority/one/two', { kind: 'catch-all', value: ['one', 'two'] }],
  ])(
    'selects the documented Pages API priority for %s',
    async (path, expected) => {
      const response = await next.fetch(path)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(expected)
    }
  )

  it.each([
    ['/optional', {}],
    ['/optional/one', { segments: ['one'] }],
    ['/optional/one/two', { segments: ['one', 'two'] }],
  ])('preserves optional catch-all params for %s', async (path, expected) => {
    const $ = await next.render$(path)
    expect(JSON.parse($('#params').text())).toEqual(expected)
  })

  it.each([
    '/_private',
    '/_private/nested',
    '/colocated/helper.ts',
    '/layout-only',
    '/(marketing)/about',
  ])('does not expose non-routable App files at %s', async (path) => {
    const response = await next.fetch(path)
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('PRIVATE_SOURCE_MARKER')
  })

  it('serves a route group without including the group in the URL', async () => {
    const $ = await next.render$('/about')
    expect($('#group').text()).toBe('marketing page')
  })

  // Generated path admission is a production prerendering contract.
  // @force-gate !dev
  it('keeps getStaticPaths parameter matching case-sensitive', async () => {
    const exact = await next.fetch('/case/WoRk')
    expect(exact.status).toBe(200)
    expect((await next.render$('/case/WoRk'))('p').text()).toBe('case:WoRk')
    expect((await next.fetch('/case/work')).status).toBe(404)
  })

  it('fetches the image URL advertised for the default optimization path', async () => {
    const $ = await next.render$('/')
    const source = $('img[alt="allowed image"]').attr('src')
    expect(source).toMatch(/^\/_next\/image\?/)
    const response = await next.fetch(source!)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/^image\//)
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })

  it('keeps the reserved Pages error route inaccessible', async () => {
    const response = await next.fetch('/_error')
    expect(response.status).toBe(404)
  })

  it.each([
    ['/blocked/test.jpg', 75],
    ['/allowed/test.jpg', 26],
  ])('rejects disallowed image source/quality %s %s', async (url, quality) => {
    const response = await next.fetch(
      `/_next/image?${new URLSearchParams({ url, w: '640', q: String(quality) })}`
    )
    expect(response.status).toBe(400)
  })
})

describe('configured image optimization routing path', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    nextConfig: { images: { path: '/media/image' } },
  })

  it('serves the advertised image through images.path', async () => {
    const $ = await next.render$('/')
    const source = $('img[alt="allowed image"]').attr('src')
    expect(source).toMatch(/^\/media\/image\?/)
    const response = await next.fetch(source!)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/^image\//)
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0)
  })
})
