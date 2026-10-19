import { nextTestSetup, type Playwright } from 'e2e-utils'
import { getDevCliValidationOutput } from 'e2e-utils/instant-validation'
import { waitForNoRedbox } from 'next-test-utils'

describe('Cache Components Fallback Validation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: { NEXT_TEST_LOG_VALIDATION: '1' },
  })

  async function expectNoValidationErrors(browser: Playwright) {
    expect(
      await getDevCliValidationOutput(await browser.url(), () => next.cliOutput)
    ).not.toContain('Error: Route')
    await waitForNoRedbox(browser)
  }

  it('should not warn about missing Suspense when accessing params if static params are completely known at build time', async () => {
    // when the params are complete we don't expect to see any errors await params regarless of where there
    // are Suspense boundaries.
    const browser = await next.browser(
      '/complete/prerendered/wrapped/prerendered'
    )
    await expectNoValidationErrors(browser)

    await browser.loadPage(`${next.url}/complete/prerendered/wrapped/novel`)
    await expectNoValidationErrors(browser)

    await browser.loadPage(`${next.url}/complete/novel/wrapped/novel`)
    await expectNoValidationErrors(browser)

    await browser.loadPage(
      `${next.url}/complete/prerendered/unwrapped/prerendered`
    )
    await expectNoValidationErrors(browser)

    await browser.loadPage(`${next.url}/complete/prerendered/unwrapped/novel`)
    await expectNoValidationErrors(browser)

    await browser.loadPage(`${next.url}/complete/novel/unwrapped/novel`)
    await expectNoValidationErrors(browser)
  })

  it('should warn about missing Suspense when accessing params if static params are partially known at build time', async () => {
    // when the params are partially complete we don't expect to see any errors awaiting the params that are known
    // but do expect errors awaiting the params that are not known if not inside a Suspense boundary.
    const browser = await next.browser(
      '/partial/prerendered/wrapped/prerendered'
    )
    await expectNoValidationErrors(browser)

    await browser.loadPage(`${next.url}/partial/prerendered/wrapped/novel`)
    await expectNoValidationErrors(browser)

    await browser.loadPage(`${next.url}/partial/novel/wrapped/novel`)
    await expectNoValidationErrors(browser)

    await browser.loadPage(
      `${next.url}/partial/prerendered/unwrapped/prerendered`
    )
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "description": "Next.js encountered runtime data during prerendering.",
       "environmentLabel": "Server",
       "label": "Blocking Route",
       "source": "app/partial/[top]/unwrapped/[bottom]/page.tsx (6:26) @ Page
     > 6 |       Top: {(await props.params).top}, Bottom: {(await props.params).bottom}
         |                          ^",
       "stack": [
         "Page app/partial/[top]/unwrapped/[bottom]/page.tsx (6:26)",
       ],
     }
    `)

    await browser.loadPage(`${next.url}/partial/prerendered/unwrapped/novel`)
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "description": "Next.js encountered runtime data during prerendering.",
       "environmentLabel": "Server",
       "label": "Blocking Route",
       "source": "app/partial/[top]/unwrapped/[bottom]/page.tsx (6:26) @ Page
     > 6 |       Top: {(await props.params).top}, Bottom: {(await props.params).bottom}
         |                          ^",
       "stack": [
         "Page app/partial/[top]/unwrapped/[bottom]/page.tsx (6:26)",
       ],
     }
    `)

    await browser.loadPage(`${next.url}/partial/novel/unwrapped/novel`)
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "description": "Next.js encountered runtime data during prerendering.",
       "environmentLabel": "Server",
       "label": "Blocking Route",
       "source": "app/partial/[top]/unwrapped/[bottom]/page.tsx (6:26) @ Page
     > 6 |       Top: {(await props.params).top}, Bottom: {(await props.params).bottom}
         |                          ^",
       "stack": [
         "Page app/partial/[top]/unwrapped/[bottom]/page.tsx (6:26)",
       ],
     }
    `)
  })

  it('validates a required partial shell even when another branch can complete', async () => {
    const browser = await next.browser('/mixed/short/novel')
    const output = await getDevCliValidationOutput(
      await browser.url(),
      () => next.cliOutput
    )

    expect(output).toContain('Error: Route "/mixed/[top]/[bottom]"')
    expect(output).toContain('app/mixed/[top]/[bottom]/page.tsx')
  })

  it('uses the complete shape for a branch with a more-specific example', async () => {
    const browser = await next.browser('/mixed/long/novel')
    await expectNoValidationErrors(browser)

    await browser.loadPage(`${next.url}/mixed/novel/novel`)
    await expectNoValidationErrors(browser)
  })

  it('preserves concrete catch-all values during validation', async () => {
    const outputIndex = next.cliOutput.length
    const browser = await next.browser('/catchall/one/two')

    expect(await browser.elementById('catchall').text()).toBe('one/two')
    await expectNoValidationErrors(browser)
    expect(next.cliOutput.slice(outputIndex)).not.toContain('TypeError')
  })

  it('should warn about missing Suspense when accessing params if static params are entirely missing at build time', async () => {
    // when the params are partially complete we don't expect to see any errors awaiting the params that are known
    // but do expect errors awaiting the params that are not known if not inside a Suspense boundary.
    const browser = await next.browser('/none/prerendered/wrapped/prerendered')
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "description": "Next.js encountered runtime data during prerendering.",
       "environmentLabel": "Server",
       "label": "Blocking Route",
       "source": "app/none/[top]/wrapped/layout.tsx (10:3) @ Layout
     > 10 |   await params
          |   ^",
       "stack": [
         "Layout app/none/[top]/wrapped/layout.tsx (10:3)",
       ],
     }
    `)

    await browser.loadPage(`${next.url}/none/prerendered/wrapped/novel`)
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "description": "Next.js encountered runtime data during prerendering.",
       "environmentLabel": "Server",
       "label": "Blocking Route",
       "source": "app/none/[top]/wrapped/layout.tsx (10:3) @ Layout
     > 10 |   await params
          |   ^",
       "stack": [
         "Layout app/none/[top]/wrapped/layout.tsx (10:3)",
       ],
     }
    `)

    await browser.loadPage(`${next.url}/none/novel/wrapped/novel`)
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "description": "Next.js encountered runtime data during prerendering.",
       "environmentLabel": "Server",
       "label": "Blocking Route",
       "source": "app/none/[top]/wrapped/layout.tsx (10:3) @ Layout
     > 10 |   await params
          |   ^",
       "stack": [
         "Layout app/none/[top]/wrapped/layout.tsx (10:3)",
       ],
     }
    `)

    await browser.loadPage(`${next.url}/none/prerendered/unwrapped/prerendered`)
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "description": "Next.js encountered runtime data during prerendering.",
       "environmentLabel": "Server",
       "label": "Blocking Route",
       "source": "app/none/[top]/unwrapped/layout.tsx (8:3) @ Layout
     >  8 |   await params
          |   ^",
       "stack": [
         "Layout app/none/[top]/unwrapped/layout.tsx (8:3)",
       ],
     }
    `)

    await browser.loadPage(`${next.url}/none/prerendered/unwrapped/novel`)
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "description": "Next.js encountered runtime data during prerendering.",
       "environmentLabel": "Server",
       "label": "Blocking Route",
       "source": "app/none/[top]/unwrapped/layout.tsx (8:3) @ Layout
     >  8 |   await params
          |   ^",
       "stack": [
         "Layout app/none/[top]/unwrapped/layout.tsx (8:3)",
       ],
     }
    `)

    await browser.loadPage(`${next.url}/none/novel/unwrapped/novel`)
    await expect(browser).toDisplayCollapsedRedbox(`
     {
       "description": "Next.js encountered runtime data during prerendering.",
       "environmentLabel": "Server",
       "label": "Blocking Route",
       "source": "app/none/[top]/unwrapped/layout.tsx (8:3) @ Layout
     >  8 |   await params
          |   ^",
       "stack": [
         "Layout app/none/[top]/unwrapped/layout.tsx (8:3)",
       ],
     }
    `)
  })
})
