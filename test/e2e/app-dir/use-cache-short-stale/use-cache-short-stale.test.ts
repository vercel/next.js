import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Production requests resume the RDC serialized during prerendering.
// @force-gate !dev
describe('use-cache-short-stale', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function readValue(path: string) {
    const $ = await next.render$(path)
    const value = $('#value').text()
    expect(value).toMatch(/^[a-f0-9-]{36}$/)
    return value
  }

  async function readCachedValue(path: string, previousValue?: string) {
    return retry(async () => {
      const value = await readValue(path)
      if (previousValue !== undefined) {
        expect(value).not.toBe(previousValue)
      }
      expect(await readValue(path)).toBe(value)
      return value
    }, 15000)
  }

  async function revalidate(parameters: Record<string, string>) {
    const response = await next.fetch(
      `/revalidate?${new URLSearchParams(parameters)}`,
      { method: 'POST' }
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ revalidated: true })
  }

  it('revalidates by tag before and after path revalidation', async () => {
    const path = '/short-stale/tag'
    const tag = 'use-cache-short-stale:tag'
    const initialValue = await readCachedValue(path)

    await revalidate({ tag })
    const tagRevalidatedValue = await readCachedValue(path, initialValue)

    await revalidate({ path })

    const pathRevalidatedValue = await readCachedValue(
      path,
      tagRevalidatedValue
    )

    await revalidate({ tag })

    await readCachedValue(path, pathRevalidatedValue)
  })

  it('revalidates repeatedly after the time interval', async () => {
    const path = '/short-stale/time'
    const initialValue = await readCachedValue(path)
    const revalidatedValue = await readCachedValue(path, initialValue)
    await readCachedValue(path, revalidatedValue)
  })
})
