/* eslint-disable jest/no-identical-title */
import { nextTestSetup, isNextDev } from 'e2e-utils'
import { waitForRedbox, getRedboxHeader, retry } from 'next-test-utils'

jest.retryTimes(0)

describe('Invalid hrefs', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  const showsError = async (
    pathname: string,
    regex: RegExp,
    click = false,
    isWarn = false
  ) => {
    const browser = await next.browser(pathname)
    try {
      await browser.waitForElementByCss('#click-me')
      if (isWarn) {
        await browser.eval(`(function() {
          window.warnLogs = []
          var origWarn = window.console.warn
          window.console.warn = (...args) => {
            window.warnLogs.push(args.join(' '))
            origWarn.apply(window.console, args)
          }
        })()`)
      }
      if (click) {
        await browser.elementByCss('#click-me').click()
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      if (isWarn) {
        await retry(async () => {
          const warnLogs = await browser.eval('window.warnLogs')
          expect(warnLogs.join('\n')).toMatch(regex)
        })
      } else {
        await waitForRedbox(browser)
        const errorContent = await getRedboxHeader(browser)
        expect(errorContent).toMatch(regex)
      }
    } finally {
      await browser.close()
    }
  }

  const noError = async (pathname: string, click = false) => {
    const browser = await next.browser('/')
    try {
      await browser.eval(`(function() {
        window.caughtErrors = []
        window.addEventListener('error', function (error) {
          window.caughtErrors.push(error.message || 1)
        })
        window.addEventListener('unhandledrejection', function (error) {
          window.caughtErrors.push(error.message || 1)
        })
        window.next.router.replace('${pathname}')
      })()`)
      await browser.waitForElementByCss('#click-me')
      if (click) {
        await browser.elementByCss('#click-me').click()
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      const caughtErrors = await browser.eval(`window.caughtErrors`)
      expect(caughtErrors).toHaveLength(0)
    } finally {
      await browser.close()
    }
  }

  if (!isNextDev) {
    it('does not show error in production when mailto: is used as href on Link', async () => {
      await noError('/first')
    })

    it('does not show error in production when https:// is used in href on Link', async () => {
      await noError('/second')
    })

    it('does not show error in production when exotic protocols are used in href in Link', async () => {
      const browser = await next.browser('/exotic-href')
      expect((await browser.log()).filter((x) => x.source === 'error')).toEqual(
        []
      )
    })

    it('does not show error when internal href is used with external as', async () => {
      await noError('/invalid-relative', true)
    })

    it('shows error when dynamic route mismatch is used on Link', async () => {
      const browser = await next.browser('/dynamic-route-mismatch')
      try {
        await browser.eval(`(function() {
          window.caughtErrors = []
          window.addEventListener('unhandledrejection', (error) => {
            window.caughtErrors.push(error.reason.message)
          })
        })()`)
        await browser.elementByCss('a').click()
        await new Promise((resolve) => setTimeout(resolve, 500))
        const errors = await browser.eval('window.caughtErrors')
        expect(
          errors.find((err: string) =>
            err.includes(
              'The provided `as` value (/blog/post-1) is incompatible with the `href` value (/[post]). Read more: https://nextjs.org/docs/messages/incompatible-href-as'
            )
          )
        ).toBeTruthy()
      } finally {
        await browser.close()
      }
    })

    it("doesn't fail on invalid url", async () => {
      await noError('/third')
    })

    it('renders a link with invalid href', async () => {
      const $ = await next.render$('/third')
      expect($('#click-me').attr('href')).toBe('https://')
    })

    it('renders a link with mailto: href', async () => {
      const $ = await next.render$('/first')
      expect($('#click-me').attr('href')).toBe('mailto:idk@idk.com')
    })
  }

  if (isNextDev) {
    it('does not show error when mailto: is used as href on Link', async () => {
      await noError('/first')
    })

    it('does not show error when https:// is used as href in Link', async () => {
      await noError('/second')
    })

    it('does not show error when exotic protocols are used in href in Link', async () => {
      const browser = await next.browser('/exotic-href')
      expect((await browser.log()).filter((x) => x.source === 'error')).toEqual(
        []
      )
    })

    it('shows error when dynamic route mismatch is used on Link', async () => {
      await showsError(
        '/dynamic-route-mismatch',
        /The provided `as` value \(\/blog\/post-1\) is incompatible with the `href` value \(\/\[post\]\)/,
        true
      )
    })

    it('shows error when internal href is used with external as', async () => {
      await showsError(
        '/invalid-relative',
        /Invalid href: "\/second" and as: "mailto:hello@example\.com", received relative href and external as/,
        true
      )
    })

    it('does not throw error when dynamic route mismatch is used on Link and params are manually provided', async () => {
      await noError('/dynamic-route-mismatch-manual', true)
    })

    it("doesn't fail on invalid url", async () => {
      await noError('/third')
    })

    it('shows warning when dynamic route mismatch is used on Link', async () => {
      await showsError(
        '/dynamic-route-mismatch',
        /Mismatching `as` and `href` failed to manually provide the params: post in the `href`'s `query`/,
        true,
        true
      )
    })
  }
})
