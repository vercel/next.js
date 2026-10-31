import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const isoDateRegExp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe('use-cache-default-profile-expire-zero', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Reads the rendered cache value over HTTP instead of through the browser. A
  // dev page reload costs seconds on a CI runner, almost all of it downloading
  // and evaluating the dev bundle, which keeps a retried read from fitting in
  // its budget. The value is server-rendered, so a plain request observes the
  // same cache state for a fraction of the cost.
  async function readCachedValue(pathname: string): Promise<string> {
    const $ = await next.render$(pathname)
    const value = $('#value')

    // Without this the caller asserting that the value changed would accept the
    // empty string that a missing element yields.
    if (value.length === 0) {
      throw new Error(`Found no cached value in the HTML of ${pathname}.`)
    }

    return value.text()
  }

  it('treats a short default cacheLife profile as a dynamic hole, not a nested-cache error', async () => {
    const initialValue = await readCachedValue('/')
    expect(initialValue).toMatch(isoDateRegExp)

    // The short `expire` comes from the app's configured default profile, and
    // the cache is not nested inside another one, so the nested-cache "no
    // explicit cacheLife" error must never fire (in production it kills the
    // build; in dev it throws on the request).
    expect(next.cliOutput).not.toContain(
      'nested-use-cache-no-explicit-cachelife'
    )

    // An `expire: 0` cache is a dynamic hole. In production it regenerates on
    // every request; in dev it is served warm across reads and re-warmed in the
    // background. Either way, reads converge to a fresh value.
    await retry(async () => {
      const value = await readCachedValue('/')
      expect(value).toMatch(isoDateRegExp)
      expect(value).not.toEqual(initialValue)
    })
  })

  it('does not error when a short-lived cache is nested under a dynamic default profile', async () => {
    // A short-lived inner cache nested inside an outer cache without an
    // explicit `cacheLife` normally errors during prerendering. But because the
    // default profile is itself dynamic, the outer cache is omitted from
    // prerenders by default, so there is no silent degradation to warn about
    // and the nested cache renders as a dynamic hole instead.
    expect(await readCachedValue('/nested')).toMatch(isoDateRegExp)

    expect(next.cliOutput).not.toContain(
      'nested-use-cache-no-explicit-cachelife'
    )
  })
})
