import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { load } from 'cheerio'

describe('cache-components-disk-readback', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function read(slug: string) {
    const response = await next.fetch(`/p/${slug}`)
    expect(response.status).toBe(200)
    const $ = load(await response.text())
    const renderId = $('#render-id').text()
    expect(renderId).toMatch(new RegExp(`^${slug}:\\d+$`))
    return {
      renderId,
      cacheStatus: response.headers.get('x-nextjs-cache'),
    }
  }

  async function waitForCachedPage(slug: string) {
    return retry(async () => {
      const result = await read(slug)
      expect(result.cacheStatus).toBe('HIT')
      return result
    })
  }

  it('reads a runtime-created page from disk with memory caching disabled', async () => {
    await read('repeat')
    const cached = await waitForCachedPage('repeat')
    const repeated = await read('repeat')

    expect(repeated.cacheStatus).toBe('HIT')
    expect(repeated.renderId).toBe(cached.renderId)
  })

  it('reads a runtime-created page from disk after a server restart', async () => {
    await read('restart')
    const cached = await waitForCachedPage('restart')

    await next.stop()
    await next.start({ skipBuild: true })

    const restarted = await read('restart')
    expect(restarted.cacheStatus).toBe('HIT')
    expect(restarted.renderId).toBe(cached.renderId)
  })
})
