import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import { INFINITE_CACHE } from 'next/dist/lib/constants'

const isoDateRegExp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe('use-cache-infinity-profile', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    // Skip deployment so we can check the cache handler's log output.
    skipDeployment: true,
  })

  it('caches forever with a profile using Infinity revalidate and expire', async () => {
    const $ = await next.render$('/')
    const initialValue = $('#value').text()
    expect(initialValue).toMatch(isoDateRegExp)

    // An infinite cache life must not degrade into a dynamic cache life, so
    // the value stays the same across requests instead of regenerating.
    const $second = await next.render$('/')
    expect($second('#value').text()).toBe(initialValue)

    if (isNextStart) {
      // The page must be fully prerendered at build time.
      const prerendered = await next.readFile('.next/server/app/index.html')
      expect(prerendered).toContain(initialValue)
    }
  })

  it('hands serializable cache life values to cache handlers for an inline Infinity profile', async () => {
    const $ = await next.render$('/inline')
    expect($('#value').text()).toMatch(isoDateRegExp)

    // The entry metadata must contain INFINITE_CACHE, not Infinity: cache
    // handler backing stores commonly serialize entries as JSON, where
    // Infinity turns into null.
    await retry(async () => {
      expect(next.cliOutput).toContain(
        `LoggingCacheHandler::set-resolved-entry revalidate: ${INFINITE_CACHE}, expire: ${INFINITE_CACHE}, stale: 300, tags: inline-frozen`
      )
    })
    expect(next.cliOutput).not.toContain('revalidate: Infinity')
  })
})
