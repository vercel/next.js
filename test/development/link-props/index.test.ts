import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { check, hasRedbox } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { BrowserInterface } from 'test/lib/browsers/base'

describe('Link props', () => {
  let next: NextInstance
  let browser: BrowserInterface
  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
        import Link from 'next/link'
        export default function Page() {
          return <Link>Link</Link>
        }
        `,
      },
      dependencies: {},
    })
  })

  beforeEach(async () => {
    browser = await webdriver(next.url, '/')
  })

  afterAll(async () => {
    await Promise.all([next.destroy(), browser.close()])
  })

  it('should show error in console when required `href` is missing', async () => {
    expect(await hasRedbox(browser)).toBe(false)
    await check(async () => {
      return (await browser.log()).map((log) => log.message).join('\n')
    }, /Link is missing required "href" property\. \(Its type was `undefined`\):/gm)
  })

  it('should show error in console when optional prop types are incorrect', async () => {
    await next.patchFile(
      'pages/index.js',
      `import Link from 'next/link'
      export default function Page() {
        return <Link href='/' as={true} onTouchStart={true} locale={{}}>Link</Link>
      }`
    )
    await browser.refresh()
    expect(await hasRedbox(browser)).toBe(false)

    await check(
      async () => (await browser.log()).map((log) => log.message).join('\n'),
      /Failed prop type on `next\/link`: The prop `as` expects a `string` or `object` in `Link`, but got `boolean` instead\./gm
    )
    await check(
      async () => (await browser.log()).map((log) => log.message).join('\n'),
      /Failed prop type on `next\/link`: The prop `onTouchStart` expects a `function` in `Link`, but got `boolean` instead\./gm
    )
    await check(
      async () => (await browser.log()).map((log) => log.message).join('\n'),
      /Failed prop type on `next\/link`: The prop `locale` expects a `string` in `Link`, but got `object` instead\./gm
    )
  })
})
