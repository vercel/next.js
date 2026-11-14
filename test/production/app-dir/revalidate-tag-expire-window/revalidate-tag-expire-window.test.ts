import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

// Lives under `test/production` because the stale-while-revalidate window of
// `revalidateTag` is enforced by the `next start` caches.
describe('revalidate-tag-expire-window', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const expire = 3

  async function readValue(pathname: string) {
    const $ = await next.render$(pathname)
    return $('#value').text()
  }

  async function revalidateAndRegenerate(pathname: string) {
    const initial = await readValue(pathname)
    await next.fetch('/api/revalidate', {
      method: 'POST',
      body: JSON.stringify({ expire }),
    })
    const revalidatedAt = Date.now()

    // The first request after the revalidation is served the stale value and
    // regenerates it in the background.
    let regenerated = initial
    await retry(async () => {
      regenerated = await readValue(pathname)
      expect(regenerated).not.toBe(initial)
    })

    // The window has to actually elapse, there is no condition to poll for.
    await waitFor(revalidatedAt + (expire + 1) * 1000 - Date.now())

    return regenerated
  }

  it('keeps a page regenerated after revalidateTag once the expire window has passed', async () => {
    const regenerated = await revalidateAndRegenerate('/')

    const res = await next.fetch('/')
    expect(res.headers.get('x-nextjs-cache')).toBe('HIT')
    expect(await readValue('/')).toBe(regenerated)
  })

  it('keeps a "use cache" entry regenerated after revalidateTag once the expire window has passed', async () => {
    const regenerated = await revalidateAndRegenerate('/dynamic')

    expect(await readValue('/dynamic')).toBe(regenerated)
  })
})
