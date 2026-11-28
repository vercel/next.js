import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('next/dynamic', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('should render server value', async () => {
    const html = await next.render('/')
    expect(html).toMatch(/the-server-value/i)
  })

  it('should render dynamic server rendered values on client mount', async () => {
    const browser = await next.browser('/')
    const text = await browser.elementByCss('#first-render').text()

    // Failure case is 'Index<!-- -->3<!-- --><!-- -->'
    expect(text).toMatch(
      /^Index<!--\/?(\$|\s)-->1(<!--\/?(\$|\s)-->)+2(<!--\/?(\$|\s)-->)+3(<!--\/?(\$|\s)-->)+4(<!--\/?(\$|\s)-->)+4$/
    )
    expect(await browser.eval('window.caughtErrors')).toBe('')

    // should not print "invalid-dynamic-suspense" warning in browser's console
    const logs = (await browser.log()).map((log) => log.message).join('\n')
    expect(logs).not.toContain(
      'https://nextjs.org/docs/messages/invalid-dynamic-suspense'
    )
  })

  it.each(['retry', 'retry-no-boundary', 'plain', 'ssr-retry'])(
    'preserves server content when a dynamic import resolves during hydration (%s)',
    async (mode) => {
      const errors: string[] = []
      const browser = await next.browser(`/hydration?mode=${mode}`, {
        // The test releases the suspended render after the import resolves.
        waitHydration: false,
        beforePageLoad(page) {
          page.on('pageerror', (error) => errors.push(error.message))
        },
      })

      await retry(async () => {
        expect(
          await browser.eval('window.dynamicHydration.originalRoom !== null')
        ).toBe(true)
        expect(await browser.eval('window.dynamicHydration.loaded')).toBe(true)
        if (mode !== 'plain') {
          expect(await browser.eval('window.dynamicHydration.suspended')).toBe(
            true
          )
        }
      })

      if (mode !== 'plain') {
        await browser.eval('window.dynamicHydration.release()')
      }

      await retry(async () => {
        expect(await browser.elementByCss('#dynamic-header').text()).toBe(
          'Header: 0'
        )
      })

      // Working buttons alone would also pass after React discards the SSR DOM.
      expect(
        await browser.eval(
          'window.dynamicHydration.originalRoom === document.getElementById("hydration-room")'
        )
      ).toBe(true)
      expect(errors).toEqual([])

      await browser.elementByCss('#dynamic-header').click()
      await browser.elementByCss('#hydration-room').click()
      await retry(async () => {
        expect(await browser.elementByCss('#dynamic-header').text()).toBe(
          'Header: 1'
        )
        expect(await browser.elementByCss('#hydration-room').text()).toBe(
          'Room: 1'
        )
      })
      expect(
        await browser.eval(
          'window.dynamicHydration.originalRoom === document.getElementById("hydration-room")'
        )
      ).toBe(true)
      expect(errors).toEqual([])
    }
  )
})
