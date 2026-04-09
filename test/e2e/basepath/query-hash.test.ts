import webdriver from 'next-webdriver'
import { check } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe('basePath query/hash handling', () => {
  const basePath = '/docs'
  const { next } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      basePath,
      onDemandEntries: {
        // Make sure entries are not getting disposed.
        maxInactiveAge: 1000 * 60 * 60,
      },
    },
  })

  it.each([
    { hash: '#hello?' },
    { hash: '#?' },
    { hash: '##' },
    { hash: '##?' },
    { hash: '##hello?' },
    { hash: '##hello' },
    { hash: '#hello?world' },
    { search: '?hello=world', hash: '#a', query: { hello: 'world' } },
    { search: '?hello', hash: '#a', query: { hello: '' } },
    { search: '?hello=', hash: '#a', query: { hello: '' } },
  ])(
    'is correct during query updating $hash $search',
    async ({ hash, search, query }) => {
      const browser = await webdriver(
        next.url,
        `${basePath}${search || ''}${hash || ''}`
      )

      await check(
        () =>
          browser.eval('window.next.router.isReady ? "ready" : "not ready"'),
        'ready'
      )
      expect(await browser.eval('window.location.pathname')).toBe(basePath)
      expect(await browser.eval('window.location.search')).toBe(search || '')
      expect(await browser.eval('window.location.hash')).toBe(hash || '')
      expect(await browser.eval('next.router.pathname')).toBe('/')
      expect(
        JSON.parse(await browser.eval('JSON.stringify(next.router.query)'))
      ).toEqual(query || {})
    }
  )

  it('should work with hash links', async () => {
    const browser = await webdriver(next.url, `${basePath}/hello`)
    await browser.elementByCss('#hashlink').click()
    const url = new URL(await browser.eval(() => window.location.href))
    expect(url.pathname).toBe(`${basePath}/hello`)
    expect(url.hash).toBe('#hashlink')
  })
})
