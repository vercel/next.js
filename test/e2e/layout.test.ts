import { createNext } from 'e2e-utils'
import webdriver from 'next-webdriver'
import { NextInstance } from 'test/lib/next-modes/base'

describe('Layout', () => {
  let next: NextInstance

  afterEach(() => {
    next.destroy()
    next = undefined
  })

  it('should wrap page content', async () => {
    next = await createNext({
      files: {
        'pages/index.js': /* js */ `
          export default function Page({ title = "home page" }) {
            return <p id="page">{title}</p>
          }
        `,
        'pages/_layout.js': /* js */ `
          function MyLayout({ children, title = 'my layout' }) {
            return <div id="layout"><h1>{title}</h1><main>{children}</main></div>
          }

          export default MyLayout
        `,
      },
    })

    const browser = await webdriver(next.url, '/')
    expect(await browser.elementByCss('#page').text()).toBe('home page')
    expect(await browser.elementByCss('#layout > h1').text()).toBe('my layout')
  })

  it('should support getStaticLayoutProps', async () => {
    next = await createNext({
      files: {
        'pages/index.js': /* js */ `
          export default function Page({ title = "home page" }) {
            return <p id="page">{title}</p>
          }
        `,
        'pages/_layout.js': /* js */ `
          function MyLayout({ children, title = 'my layout' }) {
            return <div id="layout"><h1>{title}</h1><main>{children}</main></div>
          }

          export async function getStaticLayoutProps() {
            return {
              props: {
                title: 'my layout ssg',
              },
            }
          }

          export default MyLayout
        `,
      },
    })

    const browser = await webdriver(next.url, '/')
    expect(await browser.elementByCss('#page').text()).toBe('home page')
    expect(await browser.elementByCss('#layout > h1').text()).toBe(
      'my layout ssg'
    )
  })

  it('should support getStaticLayoutProps with getStaticProps', async () => {
    next = await createNext({
      files: {
        'pages/index.js': /* js */ `
          export default function Page({ title = "home page" }) {
            return <p id="page">{title}</p>
          }

          export async function getStaticProps() {
            return {
              props: {
                title: 'home page ssg',
              },
            }
          }
        `,
        'pages/_layout.js': /* js */ `
          function MyLayout({ children, title = 'my layout' }) {
            return <div id="layout"><h1>{title}</h1><main>{children}</main></div>
          }

          export async function getStaticLayoutProps() {
            return {
              props: {
                title: 'my layout ssg',
              },
            }
          }

          export default MyLayout
        `,
      },
    })

    const browser = await webdriver(next.url, '/')
    expect(await browser.elementByCss('#page').text()).toBe('home page ssg')
    expect(await browser.elementByCss('#layout > h1').text()).toBe(
      'my layout ssg'
    )
  })

  it('should support custom _app', async () => {
    next = await createNext({
      files: {
        'pages/index.js': /* js */ `
          export default function Page({ title = "home page" }) {
            return <p id="page">{title}</p>
          }
        `,
        'pages/_layout.js': /* js */ `
          function MyLayout({ children, title = 'my layout' }) {
            return <div id="layout"><h1>{title}</h1><main>{children}</main></div>
          }

          export default MyLayout
        `,
        'pages/_app.js': /* js */ `
          function MyApp({ pageProps, Component, layoutProps, Layout }) {
            return (
              <Layout {...layoutProps}>
                <Component {...pageProps} />
              </Layout>
            )
          }

          export default MyApp
        `,
      },
    })

    const browser = await webdriver(next.url, '/')
    expect(await browser.elementByCss('#page').text()).toBe('home page')
    expect(await browser.elementByCss('#layout > h1').text()).toBe('my layout')
  })
})
