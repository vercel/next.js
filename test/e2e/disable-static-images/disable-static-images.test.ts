import { nextTestSetup } from 'e2e-utils'
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'images.disableStaticImages',
  () => {
    const { next } = nextTestSetup({
      nextConfig: { images: { disableStaticImages: true } },
      files: {
        'icon.svg':
          '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>',
        'pages/index.js': `
          import { useEffect, useState } from 'react'
          import image from '../icon.svg'

          export function getServerSideProps() {
            return { props: { serverImage: image } }
          }

          export default function Page({ serverImage }) {
            const [clientImage, setClientImage] = useState(null)
            useEffect(() => setClientImage(image), [])
            return (
              <>
                <pre id="server">{JSON.stringify(serverImage)}</pre>
                {clientImage !== null && (
                  <pre id="client">{JSON.stringify(clientImage)}</pre>
                )}
              </>
            )
          }
        `,
      },
    })

    it('imports an image as a URL on the server and in the browser', async () => {
      const browser = await next.browser('/')
      const serverImage = JSON.parse(
        await browser.elementByCss('#server').text()
      )
      const clientImage = JSON.parse(
        await browser.waitForElementByCss('#client').text()
      )

      expect(serverImage).toMatch(
        /\/_next\/static\/(?:immutable\/)?media\/.*\.svg$/
      )
      expect(clientImage).toBe(serverImage)
    })
  }
)
