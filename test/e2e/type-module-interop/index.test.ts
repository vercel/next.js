import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { hasRedbox, renderViaHTTP } from 'next-test-utils'
import webdriver from 'next-webdriver'

describe('Type module interop', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() { 
            return <p>hello world</p>
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
})
