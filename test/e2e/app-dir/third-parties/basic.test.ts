import { createNextDescribe } from 'e2e-utils'
import { waitFor } from 'next-test-utils'

createNextDescribe(
  '@next/third-parties basic usage',
  {
    files: __dirname,
    dependencies: {
      '@next/third-parties': 'canary',
    },
  },
  ({ next }) => {
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

      await browser.waitForElementByCss('#_next-gtm')
      await waitFor(1000)

      const gtmInlineScript = await browser.elementsByCss('#_next-gtm-init')
      expect(gtmInlineScript.length).toBe(1)

      const gtmScript = await browser.elementsByCss(
        '[src^="https://www.googletagmanager.com/gtm.js?id=GTM-XYZ"]'
      )

      expect(gtmScript.length).toBe(1)

      const dataLayer = await browser.eval('window.dataLayer')
      expect(dataLayer.length).toBe(1)

      await browser.elementByCss('#gtm-send').click()

      const dataLayer2 = await browser.eval('window.dataLayer')
      expect(dataLayer2.length).toBe(2)
    })

    it('renders GA', async () => {
      const browser = await next.browser('/ga')

      await browser.waitForElementByCss('#_next-ga')
      await waitFor(1000)

      const gaInlineScript = await browser.elementsByCss('#_next-ga-init')
      expect(gaInlineScript.length).toBe(1)

      const gaScript = await browser.elementsByCss(
        '[src^="https://www.googletagmanager.com/gtag/js?id=GA-XYZ"]'
      )

      expect(gaScript.length).toBe(1)
      const dataLayer = await browser.eval('window.dataLayer')
      expect(dataLayer.length).toBe(4)

      await browser.elementByCss('#ga-send').click()

      const dataLayer2 = await browser.eval('window.dataLayer')
      expect(dataLayer2.length).toBe(5)
    })
  }
)
