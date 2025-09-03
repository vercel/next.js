import { nextTestSetup } from 'e2e-utils'

describe('@next/third-parties basic usage', () => {
  const { next } = nextTestSetup({
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
    await browser.elementByCss('script#_next-gtm-init')
    await browser.elementByCss(
      'script[src^="https://www.googletagmanager.com/gtm.js?id=GTM-XYZ"]'
    )

    const dataLayer = await browser.eval('window.dataLayer')
    expect(dataLayer.length).toBe(1)

    await browser.elementByCss('#gtm-send').click()

    const dataLayer2 = await browser.eval('window.dataLayer')
    expect(dataLayer2.length).toBe(2)
  })

  it('renders GA', async () => {
    const browser = await next.browser('/ga')

    await browser.waitForElementByCss('script#_next-ga')
    await browser.elementByCss('script#_next-ga-init')
    await browser.elementByCss(
      'script[src^="https://www.googletagmanager.com/gtag/js?id=GA-XYZ"]'
    )

    const dataLayer = await browser.eval('window.dataLayer')
    expect(dataLayer.length).toBe(4)

    await browser.elementByCss('#ga-send').click()

    const dataLayer2 = await browser.eval('window.dataLayer')
    expect(dataLayer2.length).toBe(5)
  })
})
