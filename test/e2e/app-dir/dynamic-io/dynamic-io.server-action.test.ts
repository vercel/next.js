import { nextTestSetup } from 'e2e-utils'
import { assertNoRedbox, retry } from 'next-test-utils'

describe('dynamic-io', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  it('should not fail decoding server action arguments', async () => {
    const browser = await next.browser('/server-action')
    expect(await browser.elementByCss('p').text()).toBe('initial')
    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('result')
    })
  })

  it('should not have dynamic IO errors when encoding bound args for inline server actions', async () => {
    const browser = await next.browser('/server-action-inline')
    expect(await browser.elementByCss('p').text()).toBe('initial')
    await browser.elementByCss('button').click()

    await retry(async () => {
      expect(await browser.elementByCss('p').text()).toBe('result')
    })

    const isExperimentalReact = Boolean(process.env.__NEXT_EXPERIMENTAL_PPR)
    if (isExperimentalReact && isNextDev) {
      // TODO(react-time-info): Remove this branch for experimental React in dev mode when the
      // issue is resolved where the inclusion of server timings in the RSC
      // payload makes the serialized bound args not suitable to be used as a
      // cache key.
      expect(next.cliOutput).toMatch('Error: Route "/server-action-inline"')
    } else {
      expect(next.cliOutput).not.toMatch('Error: Route "/server-action-inline"')
    }

    if (isNextDev) {
      await assertNoRedbox(browser)
    }
  })
  /* eslint-enable jest/no-standalone-expect */

  it('should prerender pages with inline server actions', async () => {
    let $ = await next.render$('/server-action-inline', {})

    if (isNextDev) {
      expect($('#layout').text()).toBe('at runtime')
      expect($('#page').text()).toBe('at runtime')
    } else {
      expect($('#layout').text()).toBe('at buildtime')
      expect($('#page').text()).toBe('at buildtime')
    }
  })
})
