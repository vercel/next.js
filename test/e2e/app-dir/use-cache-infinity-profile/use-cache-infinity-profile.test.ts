import { nextTestSetup } from 'e2e-utils'

const uuidRegExp =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/

describe('use-cache-infinity-profile', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    // Deployment platforms provide their own cache handlers.
    skipDeployment: true,
  })

  it('caches forever with a configured profile using Infinity revalidate and expire', async () => {
    const $ = await next.render$('/')
    const initialValue = $('#value').text()
    expect(initialValue).toMatch(uuidRegExp)

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

  it('serves an inline Infinity cache life from a JSON-backed cache handler across requests', async () => {
    const $ = await next.render$('/inline?key=a')
    const initialValue = $('#value').text()
    expect(initialValue).toMatch(uuidRegExp)

    // The second request reads the entry back from the cache handler. If the
    // infinite cache life doesn't survive the handler's JSON round trip, the
    // entry is treated as immediately expired and the value regenerates.
    const $second = await next.render$('/inline?key=a')
    expect($second('#value').text()).toBe(initialValue)
  })
})
