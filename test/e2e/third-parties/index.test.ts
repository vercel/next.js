import { nextTestSetup } from 'e2e-utils'
import { waitFor } from 'next-test-utils'
import type { NextInstance } from 'e2e-utils'

describe('@next/third-parties basic usage', () => {
  const { next }: { next: NextInstance } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@next/third-parties': 'canary',
    },
  })

  it('renders YoutubeEmbed', async () => {
    const $ = await next.render$('/youtube-embed')

    const baseContainer = $('[data-ntpc="YouTubeEmbed"]')
    const youtubeContainer = $('lite-youtube')
    expect(baseContainer.length).toBe(1)
    expect(youtubeContainer.length).toBe(1)
  })

  it('renders GoogleMapsEmbed', async () => {
    const $ = await next.render$('/google-maps-embed')

    const baseContainer = $('[data-ntpc="GoogleMapsEmbed"]')
    const mapContainer = $(
      '[src^="https://www.google.com/maps/embed/v1/place?key=XYZ"]'
    )
    expect(baseContainer.length).toBe(1)
    expect(mapContainer.length).toBe(1)
  })

  it('renders GTM', async () => {
    const browser = await next.browser('/gtm')

    await browser.waitForElementByCss('script#_next-gtm')
    await waitFor(1000)

    const gtmInlineScript = await browser.elementsByCss('#_next-gtm-init')
    expect(gtmInlineScript.length).toBe(1)

    const gtmScript = await browser.elementsByCss(
      '[src^="https://www.googletagmanager.com/gtm.js?id=GTM-XYZ"]'
    )

    expect(gtmScript.length).toBe(1)

    const dataLayer: unknown[] = await browser.eval('window.dataLayer')
    expect(dataLayer.length).toBe(1)

    await browser.elementByCss('#gtm-send').click()

    const dataLayer2: unknown[] = await browser.eval('window.dataLayer')
    expect(dataLayer2.length).toBe(2)
  })

  it('renders GTM with consent management support', async () => {
    const browser = await next.browser('/gtm-consent')
    await waitFor(1000)

    // Test consent-managed GTM script has correct type and data attributes
    const consentScript = await browser.elementsByCss(
      'script[src*="GTM-USERCENTRICS"][type="text/plain"]'
    )
    expect(consentScript.length).toBe(1)

    // Verify data attributes are applied to both init and external scripts
    const scriptsWithDataAttr = await browser.elementsByCss(
      'script[data-usercentrics="Google Tag Manager"]'
    )
    expect(scriptsWithDataAttr.length).toBe(2) // init + external script

    // Verify consent-managed scripts don't execute (dataLayer should be empty)
    const dataLayer: unknown[] = await browser.eval('window.dataLayer || []')
    expect(dataLayer.length).toBe(0) // No execution due to type="text/plain"
  })

  it('renders GA', async () => {
    const browser = await next.browser('/ga')

    await browser.waitForElementByCss('script#_next-ga')
    await waitFor(1000)

    const gaInlineScript = await browser.elementsByCss('#_next-ga-init')
    expect(gaInlineScript.length).toBe(1)

    const gaScript = await browser.elementsByCss(
      '[src^="https://www.googletagmanager.com/gtag/js?id=GA-XYZ"]'
    )

    expect(gaScript.length).toBe(1)
    const dataLayer: unknown[] = await browser.eval('window.dataLayer')
    expect(dataLayer.length).toBe(4)

    await browser.elementByCss('#ga-send').click()

    const dataLayer2: unknown[] = await browser.eval('window.dataLayer')
    expect(dataLayer2.length).toBe(5)
  })
})
