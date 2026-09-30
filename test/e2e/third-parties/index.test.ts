import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('@next/third-parties basic usage', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@next/third-parties': 'workspace:*',
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

    const gtmInlineScript = await browser.elementsByCss('#_next-gtm-init')
    expect(gtmInlineScript.length).toBe(1)

    const gtmScript = await browser.elementsByCss(
      '[src^="https://www.googletagmanager.com/gtm.js?id=GTM-XYZ"]'
    )

    expect(gtmScript.length).toBe(1)

    // The remote GTM script may append its own events to dataLayer. Verify
    // that the inline initializer ran once, rather than counting all entries.
    await retry(async () => {
      const initEvents = await browser.eval(
        'window.dataLayer.filter((entry) => entry.event === "gtm.js")'
      )
      expect(initEvents).toHaveLength(1)
      expect(initEvents[0]['gtm.start']).toEqual(expect.any(Number))
    })

    await browser.elementByCss('#gtm-send').click()

    await retry(async () => {
      const clickEvents = await browser.eval(
        'window.dataLayer.filter((entry) => entry.event === "buttonClicked")'
      )
      expect(clickEvents).toEqual([{ event: 'buttonClicked', value: 'xyz' }])
    })
  })

  it('renders GA', async () => {
    const browser = await next.browser('/ga')

    await browser.waitForElementByCss('script#_next-ga')

    const gaInlineScript = await browser.elementsByCss('#_next-ga-init')
    expect(gaInlineScript.length).toBe(1)

    const gaScript = await browser.elementsByCss(
      '[src^="https://www.googletagmanager.com/gtag/js?id=GA-XYZ"]'
    )

    expect(gaScript.length).toBe(1)
    // Only the inline GA setup and our click event are under test. Network
    // responses may append extra entries to dataLayer in either order.
    await retry(async () => {
      const configCalls = await browser.eval(
        'window.dataLayer.filter((entry) => entry[0] === "config" && entry[1] === "GA-XYZ").length'
      )
      expect(configCalls).toBeGreaterThan(0)
    })

    await browser.elementByCss('#ga-send').click()

    await retry(async () => {
      const clickEvents = await browser.eval(
        'window.dataLayer.filter((entry) => entry[0]?.event === "buttonClicked").map((entry) => entry[0])'
      )
      expect(clickEvents).toEqual([{ event: 'buttonClicked', value: 'xyz' }])
    })
  })
})
