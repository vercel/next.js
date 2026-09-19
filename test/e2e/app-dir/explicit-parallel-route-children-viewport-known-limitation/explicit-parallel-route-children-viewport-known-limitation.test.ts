import { nextTestSetup } from 'e2e-utils'
import { createRouterAct } from 'router-act'

const isCacheComponentsEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('explicit parallel route children viewport limitation', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    // Cache Components requires this route to declare `instant = false`, but
    // that declaration is invalid when Cache Components is disabled. Delay
    // startup only in that mode so we can add the declaration to the isolated
    // fixture first.
    skipStart: isCacheComponentsEnabled,
    // A deployed fixture cannot be patched before startup. The ordinary deploy
    // run remains covered; Cache Components behavior is exercised in the local
    // dev and production test runs.
    skipDeployment: isCacheComponentsEnabled,
  })

  if (skipped) return

  beforeAll(async () => {
    if (!isCacheComponentsEnabled) return

    // generateViewport uses connection() so its failure happens at request
    // time. A viewport cannot be deferred behind Suspense, so Cache Components
    // otherwise rejects the route during instant validation before this test
    // can reach the MetadataOutlet behavior it is meant to cover. Opting this
    // isolated copy into a blocking response makes the fixture valid without
    // changing the behavior under test.
    await next.patchFile('app/@slot/viewport-error/page.tsx', (contents) =>
      contents.replace(
        "import { connection } from 'next/server'",
        "import { connection } from 'next/server'\n\nexport const instant = false"
      )
    )
    await next.start()
  })

  it('delivers a named-only route viewport error', async () => {
    const response = await next.fetch('/viewport-error')

    // The viewport error is streamed after the response has committed.
    expect(response.status).toBe(200)

    const browser = await next.browser('/viewport-error')
    expect(await browser.elementByCss('#root-error').text()).toBe('Root error')

    let act: ReturnType<typeof createRouterAct>
    const navigationBrowser = await next.browser('/success', {
      beforePageLoad(page) {
        act = createRouterAct(page, { allowErrorStatusCodes: [500] })
      },
    })

    await act!(async () => {
      await navigationBrowser
        .elementByCss('input[data-link-accordion="/viewport-error"]')
        .click()
      await navigationBrowser.elementByCss('a[href="/viewport-error"]').click()
    })

    expect(await navigationBrowser.elementByCss('#root-error').text()).toBe(
      'Root error'
    )
  })
})
