import { nextTestSetup } from 'e2e-utils'

describe('segment cache (basic tests)', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (isNextDev || skipped) {
    test('ppr is disabled', () => {})
    return
  }

  it('basic navigation', async () => {
    const browser = await next.browser('/')

    // Navigate to the test page
    const link = await browser.elementByCss('a')
    await link.click()

    // Confirm that the content has streamed in and the URL has updated
    // as expected
    const nav = await browser.elementById('nav')
    expect(await nav.innerHTML()).toMatchInlineSnapshot(
      `"<div data-streaming-text="true"><div>Static in nav</div><div>Dynamic in nav</div></div>"`
    )
    expect(new URL(await browser.url()).pathname).toBe('/test')
  })
})
