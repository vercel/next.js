import { nextTestSetup } from '../../../lib/e2e-utils'
import { retry } from '../../../lib/next-test-utils'
import { createRouterAct } from '../segment-cache/router-act'

describe('async server references', () => {
  const { next, isNextDev } = nextTestSetup({
    files: __dirname,
  })

  // There's no prefetching in dev.
  if (!isNextDev) {
    it('does not crash when navigating with a prefetch', async () => {
      // This is reproducing a production error that happened with `clientSegmentCache`.
      // When building the segments used by clientSegmentCache,
      // we'd decode the action incorrectly, which resulted in an error being thrown inside the render.
      // The error would be encoded in the RSC payload, and then thrown on the client
      // when the prefetched segment was rendered during a navigation.
      let act: ReturnType<typeof createRouterAct>
      const browser = await next.browser('/prefetch', {
        beforePageLoad(page) {
          act = createRouterAct(page)
        },
      })

      // Reveal the link to trigger a prefetch.
      await act(async () => {
        await browser
          .elementByCss('[data-link-accordion="/prefetch/target-page"]')
          .click()
      }, [{ includes: 'A page that uses an async server reference' }])

      // Navigate to the prefetched page.
      await browser.elementByCss('a[href="/prefetch/target-page"]').click()

      // We expect the navigation to not crash with "Application error: a client-side exception has occurred"
      // (like it did when the bug was observed) to and display the target content.
      await retry(async () => {
        expect(await browser.elementByCss('main#target-page').text()).toContain(
          'A page that uses an async server reference'
        )
      })
    })
  }

  it('decodes async server references from a action reply correctly', async () => {
    const browser = await next.browser('/reply')
    await browser.elementByCss('button[type="submit"]').click()
    await retry(async () => {
      // If the action crashes during execution (due to incorrect argument decoding)
      // Or returns the wrong value (indicating that it was resolved incorrectly),
      // the form status will be "error".
      // If everything works correctly, it'll be "ok".
      expect(await browser.elementByCss('#action-result').text()).toBe('ok')
    })
  })

  it('correctly serializes and decodes async server references in cache functions', async () => {
    // 'use cache' decodes and re-encodes RSC data on the server,
    // so it can break if async references are not resolved correctly.
    // Incorrect decoding of async server references was causing it to crash during build,
    // so if we built successfully, we know that it works at least partially.
    // We should still verify that the server action works as expected.
    const browser = await next.browser('/use-cache')

    // The page should display, and the action used in the cached component should work,
    // triggering a redirect when executed.
    await browser.elementByCss('button[type="submit"]').click()
    await retry(async () => {
      expect(
        await browser.elementByCss('main#redirect-target').text()
      ).toBeTruthy()
    })
  })
})
