import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const isoDateRegExp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe('use-cache-custom-handler', () => {
  const { next, skipped } = nextTestSetup({
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

    expect(next.cliOutput.slice(outputIndex)).toContain(
      'ModernCustomCacheHandler::refreshTags'
    )

    expect(next.cliOutput.slice(outputIndex)).toContain(
      `ModernCustomCacheHandler::getExpiration ["_N_T_/layout","_N_T_/page","_N_T_/"]`
    )

    expect(next.cliOutput.slice(outputIndex)).toMatch(
      /ModernCustomCacheHandler::get \["(development|[A-Za-z0-9_-]{21})","([0-9a-f]{2})+",\[\]\]/
    )

    expect(next.cliOutput.slice(outputIndex)).toMatch(
      /ModernCustomCacheHandler::set \["(development|[A-Za-z0-9_-]{21})","([0-9a-f]{2})+",\[\]\]/
    )

    // The data should be cached initially.

    await browser.refresh()
    let data = await browser.elementById('data').text()
    expect(data).toMatch(isoDateRegExp)
    expect(data).toEqual(initialData)

    // Because we use a low `revalidate` value for the "use cache" function, new
    // data should be returned eventually.

    await retry(async () => {
      await browser.refresh()
      data = await browser.elementById('data').text()
      expect(data).toMatch(isoDateRegExp)
      expect(data).not.toEqual(initialData)
    }, 5000)
  })

  it('should use a legacy custom cache handler if provided', async () => {
    const browser = await next.browser(`/legacy`)
    const initialData = await browser.elementById('data').text()
    expect(initialData).toMatch(isoDateRegExp)

    expect(next.cliOutput.slice(outputIndex)).toContain(
      'LegacyCustomCacheHandler::receiveExpiredTags []'
    )

    expect(next.cliOutput.slice(outputIndex)).toMatch(
      /LegacyCustomCacheHandler::get \["(development|[A-Za-z0-9_-]{21})","([0-9a-f]{2})+",\[\]\] \["_N_T_\/layout","_N_T_\/legacy\/layout","_N_T_\/legacy\/page","_N_T_\/legacy"\]/
    )

    expect(next.cliOutput.slice(outputIndex)).toMatch(
      /LegacyCustomCacheHandler::set \["(development|[A-Za-z0-9_-]{21})","([0-9a-f]{2})+",\[\]\]/
    )

    // The data should be cached initially.

    await browser.refresh()
    let data = await browser.elementById('data').text()
    expect(data).toMatch(isoDateRegExp)
    expect(data).toEqual(initialData)

    // Because we use a low `revalidate` value for the "use cache" function, new
    // data should be returned eventually.

    await retry(async () => {
      await browser.refresh()
      data = await browser.elementById('data').text()
      expect(data).toMatch(isoDateRegExp)
      expect(data).not.toEqual(initialData)
    }, 5000)
  })

  it('should revalidate after redirect using a modern custom cache handler', async () => {
    const browser = await next.browser(`/`)
    const initialData = await browser.elementById('data').text()
    expect(initialData).toMatch(isoDateRegExp)

    await browser.elementById('revalidate-redirect').click()

    await retry(async () => {
      expect(next.cliOutput.slice(outputIndex)).toContain(
        'ModernCustomCacheHandler::expireTags ["modern"]'
      )

      const data = await browser.elementById('data').text()
      expect(data).toMatch(isoDateRegExp)
      expect(data).not.toEqual(initialData)
    }, 5000)
  })

  it('should revalidate after redirect using a legacy custom cache handler', async () => {
    const browser = await next.browser(`/legacy`)
    const initialData = await browser.elementById('data').text()
    expect(initialData).toMatch(isoDateRegExp)

    expect(next.cliOutput.slice(outputIndex)).toContain(
      'LegacyCustomCacheHandler::receiveExpiredTags []'
    )

    await browser.elementById('revalidate').click()

    await retry(async () => {
      expect(next.cliOutput.slice(outputIndex)).toContain(
        'LegacyCustomCacheHandler::expireTags ["legacy"]'
      )

      expect(next.cliOutput.slice(outputIndex)).toContain(
        'LegacyCustomCacheHandler::receiveExpiredTags ["legacy"]'
      )

      const data = await browser.elementById('data').text()
      expect(data).toMatch(isoDateRegExp)
      expect(data).not.toEqual(initialData)
    }, 5000)
  })

  it('should not call expireTags for a normal invocation', async () => {
    await next.fetch(`/`)

    await retry(async () => {
      const cliOutput = next.cliOutput.slice(outputIndex)
      expect(cliOutput).toInclude('ModernCustomCacheHandler::refreshTags')
      expect(cliOutput).toInclude('ModernCustomCacheHandler::getExpiration')
      expect(cliOutput).not.toInclude('ModernCustomCacheHandler::expireTags')
    })
  })

  it('should not call getExpiration again after an action', async () => {
    const browser = await next.browser(`/`)

    await retry(async () => {
      const cliOutput = next.cliOutput.slice(outputIndex)
      expect(cliOutput).toInclude('ModernCustomCacheHandler::getExpiration')
    })

    outputIndex = next.cliOutput.length

    await browser.elementById('revalidate-tag').click()

    await retry(async () => {
      const cliOutput = next.cliOutput.slice(outputIndex)
      expect(cliOutput).toIncludeRepeated(
        'ModernCustomCacheHandler::getExpiration',
        1
      )
      expect(cliOutput).toIncludeRepeated(
        `ModernCustomCacheHandler::expireTags`,
        1
      )
    })
  })
})
