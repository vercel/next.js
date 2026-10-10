import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('activity-layout-effect-cleanup-on-reveal', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  // The "Preserving UI state" guide resets transient state in a
  // `useLayoutEffect` cleanup, documented to run when Activity hides the page.
  // In development the cleanup additionally runs when the kept page is
  // revealed again, so state written while the page was hidden is wiped as the
  // page becomes visible. This test documents that current behavior.
  it('runs the useLayoutEffect cleanup when a kept page is revealed in development', async () => {
    const browser = await next.browser('/kept')

    await retry(async () => {
      expect(await browser.elementById('message').text()).toBe('(no message)')
    })

    // Unrelated state that the guide's reset pattern does not touch. It proves
    // the page is kept (not remounted) across the navigation.
    await browser.elementById('increment').click()
    await retry(async () => {
      expect(await browser.elementById('count').text()).toBe('1')
    })

    // Hide the kept page. The documented cleanup runs here.
    await browser.elementById('to-other').click()
    await retry(async () => {
      expect(await browser.elementById('other-heading').text()).toBe('other')
    })

    // Write state into the kept page while it is hidden.
    await browser.elementById('set-message').click()

    const logsBeforeReveal = (await browser.log()).length

    // Reveal the kept page again.
    await browser.elementById('to-kept').click()
    await retry(async () => {
      expect(await browser.elementById('count').text()).toBe('1')
    })

    if (isNextDev) {
      // Observed behavior: the cleanup also runs on reveal and resets the
      // message, so the state set while hidden is lost.
      await retry(async () => {
        expect(await browser.elementById('message').text()).toBe('(no message)')
      })
    } else {
      expect(await browser.elementById('message').text()).toBe(
        'set-while-hidden'
      )
    }

    const revealLogs = (await browser.log())
      .slice(logsBeforeReveal)
      .map((log) => log.message)
      .filter((message) => message.startsWith('kept-effect:'))

    if (isNextDev) {
      expect(revealLogs).toEqual([
        'kept-effect:setup',
        'kept-effect:cleanup',
        'kept-effect:setup',
      ])
    } else {
      expect(revealLogs).toEqual(['kept-effect:setup'])
    }
  })
})
