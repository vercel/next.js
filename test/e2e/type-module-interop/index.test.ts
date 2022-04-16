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

          export default function Page() { 
            return (
              <>
                <p>hello world</p>
                <Link href="/modules">
                  <a id="link-to-module">link to module</a>
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
                <Link href="/">
                  <a id="link-to-home">link to home</a>
                </Link>
                <Image src="/static/image.png" width="100" height="100" />
              </>
            )
          }
        `,
      },
      dependencies: {},
    })
    const contents = await next.readFile('package.json')
    const pkg = JSON.parse(contents)
    await next.patchFile(
      'package.json',
      JSON.stringify({
        ...pkg,
        type: 'module',
      })
    )
  })
  afterAll(() => next.destroy())

  it('should render server-side', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
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
