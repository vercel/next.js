import { createNext } from 'e2e-utils'
import webdriver from 'next-webdriver'
import { NextInstance } from 'test/lib/next-modes/base'

describe('Layout Basic', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() {
            return <p id="page">hello world</p>
          }
        `,
        'pages/_layout.js': `
          function MyLayout({ children }) {
            return <div id="layout"><h1>My Layout</h1><main>{children}</main></div>
          }

          export default MyLayout
        `,
        // Just for testing
        // 'pages/_app.js': `
        //   function MyApp({ Component, pageProps }) {
        //     return <Component {...pageProps} />
        //   }

        //   export default MyApp
        // `
      },
    })
  })
  afterAll(() => next.destroy())

  it('should render layout and page content', async () => {
    const browser = await webdriver(next.url, '/')
    expect(await browser.elementByCss('#page').text()).toBe('hello world')
    // expect(true).toBe(false);
    expect(await browser.elementByCss('#layout').text()).toBe('')
  })
})
