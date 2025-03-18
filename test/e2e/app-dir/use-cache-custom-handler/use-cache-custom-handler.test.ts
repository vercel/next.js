import { isNextStart, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const isoDateRegExp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

describe('use-cache-custom-handler', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // Skip deployment so we can test the custom cache handlers log output
    skipDeployment: true,
  })

  if (skipped) return

  it('should use a modern custom cache handler if provided', async () => {
    const outputIndex = next.cliOutput.length
    const browser = await next.browser(`/`)

    if (isNextStart) {
      // Refresh once to let it revalidate the prerendered page.
      await browser.refresh()
    }

    const initialData = await browser.elementById('data').text()
    expect(initialData).toMatch(isoDateRegExp)

    expect(next.cliOutput.slice(outputIndex)).toContain(
      'CustomCacheHandler::refreshTags'
    )

    expect(next.cliOutput.slice(outputIndex)).toContain(
      `CustomCacheHandler::getExpiration ["_N_T_/layout","_N_T_/page","_N_T_/"]`
    )

    expect(next.cliOutput.slice(outputIndex)).toMatch(
      /CustomCacheHandler::get \["(development|[A-Za-z0-9_-]{21})","\$undefined","([0-9a-f]{2})+",\[\]\]/
    )

    expect(next.cliOutput.slice(outputIndex)).toMatch(
      /CustomCacheHandler::set \["(development|[A-Za-z0-9_-]{21})","\$undefined","([0-9a-f]{2})+",\[\]\]/
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
    const outputIndex = next.cliOutput.length
    const browser = await next.browser(`/legacy`)

    if (isNextStart) {
      // Refresh once to let it revalidate the prerendered page.
      await browser.refresh()
    }

    const initialData = await browser.elementById('data').text()
    expect(initialData).toMatch(isoDateRegExp)

    expect(next.cliOutput.slice(outputIndex)).toContain(
      'LegacyCustomCacheHandler::receiveExpiredTags []'
    )

    expect(next.cliOutput.slice(outputIndex)).toMatch(
      /LegacyCustomCacheHandler::get \["(development|[A-Za-z0-9_-]{21})","\$undefined","([0-9a-f]{2})+",\[\]\] \["_N_T_\/layout","_N_T_\/legacy\/layout","_N_T_\/legacy\/page","_N_T_\/legacy"\]/
    )

    expect(next.cliOutput.slice(outputIndex)).toMatch(
      /LegacyCustomCacheHandler::set \["(development|[A-Za-z0-9_-]{21})","\$undefined","([0-9a-f]{2})+",\[\]\]/
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

  it('should revalidate using a modern custom cache handler', async () => {
    const outputIndex = next.cliOutput.length
    const browser = await next.browser(`/`)
    const initialData = await browser.elementById('data').text()
    expect(initialData).toMatch(isoDateRegExp)

    await browser.elementById('revalidate').click()

    await retry(async () => {
      expect(next.cliOutput.slice(outputIndex)).toContain(
        'CustomCacheHandler::expireTags ["modern"]'
      )

      const data = await browser.elementById('data').text()
      expect(data).toMatch(isoDateRegExp)
      expect(data).not.toEqual(initialData)
    }, 5000)
  })

  it('should revalidate using a legacy custom cache handler', async () => {
    const outputIndex = next.cliOutput.length
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
})
