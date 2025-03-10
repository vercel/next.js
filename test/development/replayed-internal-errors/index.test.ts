/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import { retry } from '../../lib/next-test-utils'

describe('Replaying internal errors', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('should not log the internal error thrown by redirect()', async () => {
    const EXPECTED_REPLAYED_MESSAGE = 'This error should get replayed'
    const OMITTED_ERROR_MESSAGE = 'NEXT_REDIRECT'

    const browser = await next.browser('/')

    await browser.elementByCss('a[href="/will-redirect"]').click()
    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('Redirected')
    })

    expect(next.cliOutput).toContain(EXPECTED_REPLAYED_MESSAGE)
    expect(next.cliOutput).not.toContain(OMITTED_ERROR_MESSAGE)

    // It'd be good to check for redbox here,
    // but it seems to disappear the first time we navigate to /target.
    // But checking console errors should be enough because they're closely tied

    const logs = await browser.log()

    expect(logs).toContainEqual(
      expect.objectContaining({
        source: 'error',
        message: expect.stringContaining(EXPECTED_REPLAYED_MESSAGE),
      })
    )

    expect(logs).not.toContainEqual(
      expect.objectContaining({
        source: 'error',
        message: expect.stringContaining(OMITTED_ERROR_MESSAGE),
      })
    )
  })

  it('should not log the internal error thrown by notFound()', async () => {
    const EXPECTED_REPLAYED_MESSAGE = 'This error should get replayed'
    const OMITTED_ERROR_MESSAGE = 'NEXT_NOT_FOUND'

    const browser = await next.browser('/')

    await browser.elementByCss('a[href="/will-notfound"]').click()
    await retry(async () => {
      expect(await browser.elementByCss('h1').text()).toBe('Not found')
    })

    expect(next.cliOutput).toContain(EXPECTED_REPLAYED_MESSAGE)
    expect(next.cliOutput).not.toContain(OMITTED_ERROR_MESSAGE)

    // It'd be good to check for redbox here,
    // but it seems to disappear the first time we navigate to /target.
    // But checking console errors should be enough because they're closely tied

    const logs = await browser.log()

    expect(logs).toContainEqual(
      expect.objectContaining({
        source: 'error',
        message: expect.stringContaining(EXPECTED_REPLAYED_MESSAGE),
      })
    )

    expect(logs).not.toContainEqual(
      expect.objectContaining({
        source: 'error',
        message: expect.stringContaining(OMITTED_ERROR_MESSAGE),
      })
    )
  })
})
