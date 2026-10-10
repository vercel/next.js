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
    await browser.elementByCss('script#_next-gtm-init')
    await browser.elementByCss(
      'script[src^="https://www.googletagmanager.com/gtm.js?id=GTM-XYZ"]'
    )
    await retry(async () => {
      expect(
        await browser.eval('!!window.google_tag_manager?.["GTM-XYZ"]')
      ).toBe(true)
    })

    // Google's script adds its own events, so only check for ours.
    const dataLayer = await browser.eval('window.dataLayer')
    expect(dataLayer).toContainEqual(
      expect.objectContaining({
        event: 'gtm.js',
        'gtm.start': expect.any(Number),
      })
    )

    await browser.elementByCss('#gtm-send').click()

    const dataLayer2 = await browser.eval('window.dataLayer')
    expect(dataLayer2).toContainEqual(
      expect.objectContaining({ event: 'buttonClicked', value: 'xyz' })
    )
  })

  it('renders GA', async () => {
    const browser = await next.browser('/ga')

    await browser.waitForElementByCss('script#_next-ga')
    await browser.elementByCss('script#_next-ga-init')
    await browser.elementByCss(
      'script[src^="https://www.googletagmanager.com/gtag/js?id=GA-XYZ"]'
    )
    await retry(async () => {
      expect(
        await browser.eval('!!window.google_tag_manager?.["GA-XYZ"]')
      ).toBe(true)
    })

    // Google's script adds its own events, so only check for ours.
    const dataLayer = await browser.eval('window.dataLayer')
    expect(dataLayer).toContainEqual(expect.objectContaining({ 0: 'js' }))
    expect(dataLayer).toContainEqual(
      expect.objectContaining({ 0: 'config', 1: 'GA-XYZ' })
    )

    await browser.elementByCss('#ga-send').click()

    const dataLayer2 = await browser.eval('window.dataLayer')
    expect(dataLayer2).toContainEqual(
      expect.objectContaining({
        0: expect.objectContaining({ event: 'buttonClicked', value: 'xyz' }),
      })
    )
  })
})
