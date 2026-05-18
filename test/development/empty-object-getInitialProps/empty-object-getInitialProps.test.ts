import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('empty-object-getInitialProps', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should show empty object warning on SSR', async () => {
    await next.render('/')
    await retry(() => {
      expect(next.cliOutput).toMatch(
        /returned an empty object from `getInitialProps`/
      )
    })
  })

  it('should not show empty object warning for page without `getInitialProps`', async () => {
    const outputIndex = next.cliOutput.length
    await next.render('/static')
    await retry(() => {
      const newOutput = next.cliOutput.slice(outputIndex)
      expect(newOutput).not.toMatch(
        /returned an empty object from `getInitialProps`/
      )
    })
  })

  it('should show empty object warning during client transition', async () => {
    const browser = await next.browser('/static')
    await browser.eval(`(function() {
      window.gotWarn = false
      const origWarn = console.warn
      window.console.warn = function () {
        if (arguments[0].match(/returned an empty object from \`getInitialProps\`/)) {
          window.gotWarn = true
        }
        origWarn.apply(this, arguments)
      }
      window.next.router.replace('/another')
    })()`)
    await retry(async () => {
      const gotWarn = await browser.eval(`window.gotWarn`)
      expect(gotWarn).toBe(true)
    })
  })
})
