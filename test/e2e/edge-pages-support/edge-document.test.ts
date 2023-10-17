import { createNextDescribe } from 'e2e-utils'
import { join } from 'path'

// x-ref: https://github.com/vercel/next.js/issues/45189
createNextDescribe(
  'edge render - custom _document with edge runtime',
  {
    files: join(__dirname, 'app'),
  },
  ({ next }) => {
    beforeAll(async () => {
      await next.stop()
      await next.patchFile(
        'pages/_document.js',
        `import Document, { Html, Head, Main, NextScript } from 'next/document'

      export default class MyDocument extends Document {
        render() {
          return (
            <Html>
              <Head />
              <body>
                <Main />
                <NextScript />
              </body>
            </Html>
          )
        }
      }

      export const config = {
        runtime: 'experimental-edge',
      }
      `
      )
      await next.start()
    })
    afterAll(async () => {
      await next.deleteFile('pages/_document.js')
    })

    it('should render page properly', async () => {
      const $ = await next.render$('/')
      expect($('#page').text()).toBe('/index')
    })
  }
)
