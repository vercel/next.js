import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { hasRedbox, renderViaHTTP } from 'next-test-utils'
import webdriver from 'next-webdriver'
import cheerio from 'cheerio'

describe('Type module interop', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          import Link from 'next/link'
          import Head from 'next/head'
          import Script from 'next/script'
          import dynamic from 'next/dynamic'
          import { useAmp } from 'next/amp'

          const Dynamic = dynamic(() => import('../components/example'))

          export default function Page() {
            const isAmp = useAmp()
            return (
              <>
                <Head>
                  <title>This page has a title 🤔</title>
                  <meta charSet="utf-8" />
                  <meta name="viewport" content="initial-scale=1.0, width=device-width" />
                </Head>
                <Script
                  strategy="afterInteractive"
                  dangerouslySetInnerHTML={{
                    __html: 'console.log("hello world")',
                  }}
                />
                <p>hello world</p>
                <Dynamic />
                <p id="isAmp">isAmp: {isAmp ? 'yes' : 'false'}</p>
                <Link href="/modules" id="link-to-module">
                  link to module
                </Link>
              </>
            )
          } 
        `,
        'pages/modules.jsx': `
          import Link from 'next/link'
          import Image from 'next/image'

          export default function Modules() {
            return (
              <>
                <Link href="/" id="link-to-home">
                  link to home
                </Link>
                <Image src="/static/image.png" width="100" height="100" />
              </>
            )
          }
        `,
        'components/example.jsx': `
          export default function Example() {
            return <p>An example components load via next/dynamic</p>
          }
        `,
      },
      dependencies: {},
    })

    // can't modify build output after deploy
    if (!(global as any).isNextDeploy) {
      const contents = await next.readFile('package.json')
      const pkg = JSON.parse(contents)
      await next.patchFile(
        'package.json',
        JSON.stringify({
          ...pkg,
          type: 'module',
        })
      )
    }
  })
  afterAll(() => next.destroy())

  it('should render server-side', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
    // component load via next/dynamic should rendered on the server side
    expect(html).toContain('An example components load via next/dynamic')
    // imported next/amp should work on the server side
    const $ = cheerio.load(html)
    expect($('#isAmp').text()).toContain('false')
  })

  it('should render client-side', async () => {
    const browser = await webdriver(next.url, '/')
    expect(await hasRedbox(browser)).toBe(false)
    await browser.close()
  })

  it('should render server-side with modules', async () => {
    const html = await renderViaHTTP(next.url, '/modules')
    const $ = cheerio.load(html)
    expect($('#link-to-home').text()).toBe('link to home')
  })

  it('should render client-side with modules', async () => {
    const browser = await webdriver(next.url, '/modules')
    expect(await hasRedbox(browser)).toBe(false)
    await browser.close()
  })
})
