import { nextTestSetup } from 'e2e-utils'
import { load } from 'cheerio'

describe('data-cache-revalidation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function renderValue(
    pathname: string,
    headers?: Record<string, string>
  ) {
    const response = await next.fetch(pathname, { headers })
    expect(response.status).toBe(200)
    const value = load(await response.text())('#value').text()
    expect(value).toBeTruthy()
    return value
  }

  async function expectDataRevalidation(pathname: string, mode: string) {
    const initial = await renderValue(pathname)
    let fresh: string

    if (mode === 'past expire') {
      fresh = await renderValue(pathname, {
        'x-test-cache-age-offset-ms': String(301 * 1000),
      })
    } else {
      const response = await next.fetch(
        `/api/revalidate?path=${encodeURIComponent(pathname)}`
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ revalidated: true })
      fresh = await renderValue(pathname)
    }

    expect(fresh).not.toBe(initial)
    expect(await renderValue(pathname)).toBe(fresh)
  }

  describe.each(['past expire', 'on demand'])('%s', (mode) => {
    it.each(['/unstable-cache', '/fetch/get', '/fetch/post'])(
      'should regenerate %s with fresh cached data',
      async (pathname) => {
        await expectDataRevalidation(pathname, mode)
      }
    )
  })

  it('should refresh Pages Router unstable_cache data on demand', async () => {
    await expectDataRevalidation('/pages-unstable-cache', 'on demand')
  })
})
