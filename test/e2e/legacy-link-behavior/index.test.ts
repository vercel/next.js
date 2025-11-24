import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Link with legacyBehavior', () => {
  if (process.env.__NEXT_EXPERIMENTAL_DEBUG_CHANNEL) {
    it('should skip debug mode test', () => {})
    return
  }

  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return it('should skip', () => {})
  }

  describe('if the child is an <a> tag', () => {
    it('forwards the href attribute', async () => {
      const $ = await next.render$('/')
      const $a = $('a')

      expect($a.text()).toBe('About')
      expect($a.attr('href')).toBe('/about')
    })

    it('navigates correctly', async () => {
      const browser = await next.browser('/')
      await browser.elementByCss('a').click()
      const title = await browser.elementByCss('#about-page').text()

      expect(title).toBe('About Page')
    })
  })

  it('works if the child is a number', async () => {
    const browser = await next.browser('/child-is-a-number')
    await browser.elementByCss('a').click()
    const title = await browser.elementByCss('h1').text()

    expect(title).toBe('About Page')
  })

  it('works if the child is a string', async () => {
    const browser = await next.browser('/child-is-a-string')
    await browser.elementByCss('a').click()
    const title = await browser.elementByCss('h1').text()

    expect(title).toBe('About Page')
  })

  it('errors when calling onClick without the event', async () => {
    const browser = await next.browser('/invalid-onclick')
    expect(await browser.elementByCss('#errors').text()).toBe('0')
    await browser.elementByCss('#custom-button').click()
    expect(await browser.elementByCss('#errors').text()).toBe('1')
  })

  it('should show a deprecation warning', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      const logs = await browser.log()
      const errors = logs.filter((log) => log.source === 'error')

      if (isNextDev) {
        expect(errors).toEqual([
          {
            message:
              '`legacyBehavior` is deprecated and will be removed in a future release. A codemod is available to upgrade your components:\n\n' +
              'npx @next/codemod@latest new-link .\n\n' +
              'Learn more: https://nextjs.org/docs/app/building-your-application/upgrading/codemods#remove-a-tags-from-link-components',
            source: 'error',
          },
        ])
      } else {
        expect(errors).toEqual([])
      }
    })
  })

  describe('passHref', () => {
    it('forwards the href attribute', async () => {
      const $ = await next.render$('/passHref')
      const $a = $('a')

      expect($a.text()).toBe('About')
      expect($a.attr('href')).toBe('/about')
    })

    it('navigates correctly', async () => {
      const browser = await next.browser('/passHref')
      await browser.elementByCss('a').click()
      const title = await browser.elementByCss('h1').text()

      expect(title).toBe('About Page')
    })
  })
})
