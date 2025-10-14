import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const isoDateRegExp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe('use-cache-custom-handler', () => {
  const { next, skipped, isNextStart } = nextTestSetup({
    files: __dirname,
    // Skip deployment so we can test the custom cache handlers log output
    skipDeployment: true,
  })

  if (skipped) return

  let outputIndex: number

  beforeEach(() => {
    outputIndex = next.cliOutput.length
  })

  it('should use a modern custom cache handler if provided', async () => {
    const browser = await next.browser(`/`)
    const initialData = await browser.elementById('data').text()
    expect(initialData).toMatch(isoDateRegExp)

    const cliOutput = next.cliOutput.slice(outputIndex)

    expect(cliOutput).toContain('ModernCustomCacheHandler::refreshTags')

    expect(next.cliOutput.slice(outputIndex)).toMatch(
      /ModernCustomCacheHandler::get \["(development|[A-Za-z0-9_-]{21})","([0-9a-f]{2})+",\[\]\] \[ '_N_T_\/layout', '_N_T_\/page', '_N_T_\/', '_N_T_\/index' \]/
    )

    expect(next.cliOutput.slice(outputIndex)).toMatch(
      /ModernCustomCacheHandler::set \["(development|[A-Za-z0-9_-]{21})","([0-9a-f]{2})+",\[\]\]/
    )

    // Since no existing cache entry was retrieved, we don't need to call
    // getExpiration() to compare the cache entries timestamp with the
    // expiration of the implicit tags.
    expect(cliOutput).not.toContain(`ModernCustomCacheHandler::getExpiration`)

    // The data should be cached initially.

    outputIndex = next.cliOutput.length
    await browser.refresh()
    let data = await browser.elementById('data').text()
    expect(data).toMatch(isoDateRegExp)
    expect(data).toEqual(initialData)

    // Now that a cache entry exists, we expect that getExpiration() is called
    // to compare the cache entries timestamp with the expiration of the
    // implicit tags.
    expect(next.cliOutput.slice(outputIndex)).toContain(
      `ModernCustomCacheHandler::getExpiration ["_N_T_/layout","_N_T_/page","_N_T_/","_N_T_/index"]`
    )

    // Because we use a low `revalidate` value for the "use cache" function, new
    // data should be returned eventually.

    await retry(async () => {
      await browser.refresh()
      data = await browser.elementById('data').text()
      expect(data).toMatch(isoDateRegExp)
      expect(data).not.toEqual(initialData)
    }, 5000)
  })

  it('calls neither refreshTags nor getExpiration if "use cache" is not used', async () => {
    await next.fetch(`/no-cache`)
    const cliOutput = next.cliOutput.slice(outputIndex)

    expect(cliOutput).not.toContain('ModernCustomCacheHandler::refreshTags')
    expect(cliOutput).not.toContain(`ModernCustomCacheHandler::getExpiration`)
  })

  it('should revalidate after redirect using a modern custom cache handler', async () => {
    const browser = await next.browser(`/`)
    const initialData = await browser.elementById('data').text()
    expect(initialData).toMatch(isoDateRegExp)

    await browser.elementById('revalidate-redirect').click()

    await retry(async () => {
      expect(next.cliOutput.slice(outputIndex)).toContain(
        'ModernCustomCacheHandler::updateTags ["modern"]'
      )

      const data = await browser.elementById('data').text()
      expect(data).toMatch(isoDateRegExp)
      expect(data).not.toEqual(initialData)
    }, 5000)
  })

  it('should not call updateTags for a normal invocation', async () => {
    await next.fetch(`/`)

    await retry(async () => {
      const cliOutput = next.cliOutput.slice(outputIndex)
      expect(cliOutput).toInclude('ModernCustomCacheHandler::refreshTags')
      expect(cliOutput).not.toInclude('ModernCustomCacheHandler::updateTags')
    })
  })

  it('should not call getExpiration after an action', async () => {
    const browser = await next.browser(`/`)

    outputIndex = next.cliOutput.length

    await browser.elementById('revalidate-tag').click()

    await retry(async () => {
      const cliOutput = next.cliOutput.slice(outputIndex)
      expect(cliOutput).not.toInclude('ModernCustomCacheHandler::getExpiration')
      expect(cliOutput).toIncludeRepeated(
        `ModernCustomCacheHandler::updateTags`,
        1
      )
    })
  })

  if (isNextStart) {
    it('should save a short-lived cache during prerendering at buildtime', async () => {
      expect(next.cliOutput).toMatch(
        /ModernCustomCacheHandler::set \["[A-Za-z0-9_-]{21}","([0-9a-f]{2})+",\[{"id":"dynamic-cache"},"\$undefined"\]\]/
      )
    })
  }
})
