import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  '@next/third-parties basic usage',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('renders YoutubeEmbed', async () => {
      const $ = await next.render$('/youtube-embed')

      const baseContainer = $('[data-ntpc="YoutubeEmbed"]')
      const youtubeContainer = $('lite-youtube')
      expect(baseContainer.length).toBe(1)
      expect(youtubeContainer.length).toBe(1)
    })

    it('renders GoogleMapsEmbed', async () => {
      const $ = await next.render$('/google-maps-embed')

      const baseContainer = $('[data-ntpc="GoogleMapsEmbed"]')
      const mapContainer = $(
        '[src="https://www.google.com/maps/embed/v1/place?key=XYZ&q=Brooklyn+Bridge,New+York,NY"]'
      )
      expect(baseContainer.length).toBe(1)
      expect(mapContainer.length).toBe(1)
    })
  }
)
