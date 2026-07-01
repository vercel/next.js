import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'
;(process.env.__NEXT_CACHE_COMPONENTS ? describe.skip : describe)(
  'segment-drop on a boundary-gated nested navigation (#86151)',
  () => {
    const { next } = nextTestSetup({ files: __dirname })

    // Each navigation discards a Server Action that is still in flight. A
    // discarded action's settlement must not advance the action queue while
    // another action is pending: queued actions would run against stale router
    // state, and their responses revert the /mid/leaf navigation back to /mid
    // shortly after the leaf renders.
    async function navigateAndAssertLeafSticks(startPath: string) {
      const browser = await next.browser(startPath)
      await browser.elementByCss('[data-testid="start"]')

      await browser.elementByCss('[data-testid="to-mid"]').click()
      await browser.elementByCss('[data-testid="mid"]')

      // The root layout stamp only changes when the router refreshes.
      const stamp = await browser.elementByCss('[data-testid="stamp"]').text()

      await browser.elementByCss('[data-testid="to-leaf"]').click()
      await browser.waitForElementByCss('[data-testid="leaf"]', 10_000)

      // The broken behavior is a revert ~200ms after the leaf renders, so the
      // assertion above can false-pass on that flash. Wait through the window
      // in which the discarded action settles and assert the state stuck.
      await waitFor(2000)
      expect(await browser.url()).toContain('/mid/leaf')
      expect(
        await browser.hasElementByCssSelector('[data-testid="leaf"]')
      ).toBe(true)

      return { browser, stamp }
    }

    it('keeps the destination segment when a discarded action settles mid-navigation', async () => {
      const { browser, stamp } = await navigateAndAssertLeafSticks('/')

      // The discarded action didn't revalidate, so there must be no refresh.
      expect(await browser.elementByCss('[data-testid="stamp"]').text()).toBe(
        stamp
      )
    })

    // Rejection of a discarded action goes through a separate code path.
    it('keeps the destination segment when a discarded action rejects mid-navigation', async () => {
      const { browser, stamp } = await navigateAndAssertLeafSticks('/reject')

      expect(await browser.elementByCss('[data-testid="stamp"]').text()).toBe(
        stamp
      )
    })

    it('still refreshes after a discarded action that revalidated settles mid-navigation', async () => {
      const { browser, stamp } =
        await navigateAndAssertLeafSticks('/revalidate')

      // The refresh is deferred while the queue is busy; it must still be
      // delivered once the queue is idle, without disturbing the navigation.
      await retry(async () => {
        expect(
          await browser.elementByCss('[data-testid="stamp"]').text()
        ).not.toBe(stamp)
      }, 10_000)
      expect(await browser.url()).toContain('/mid/leaf')
      expect(
        await browser.hasElementByCssSelector('[data-testid="leaf"]')
      ).toBe(true)
    })
  }
)
