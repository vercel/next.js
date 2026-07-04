import { nextTestSetup } from 'e2e-utils'

const isoDateRegExp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe('use-cache-infinity-profile', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
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
})
