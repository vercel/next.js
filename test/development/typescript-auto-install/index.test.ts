import { createNext } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { renderViaHTTP, retry } from 'next-test-utils'
import webdriver from 'next-webdriver'
import stripAnsi from 'strip-ansi'

describe('typescript-auto-install', () => {
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
      env: {
        // unset CI env as this skips the auto-install behavior
        // being tested
        CI: '',
        CIRCLECI: '',
        GITHUB_ACTIONS: '',
        CONTINUOUS_INTEGRATION: '',
        RUN_ID: '',
        BUILD_NUMBER: '',
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should work', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })

  it('should detect TypeScript being added and auto setup', async () => {
    const browser = await webdriver(next.url, '/')
    const pageContent = await next.readFile('pages/index.js')

    await retry(async () => {
      expect(await browser.eval('document.documentElement.innerHTML')).toMatch(
        /hello world/
      )
    })
    await next.renameFile('pages/index.js', 'pages/index.tsx')

    await retry(async () => {
      expect(await stripAnsi(next.cliOutput)).toMatch(
        /We detected TypeScript in your project and created a tsconfig\.json file for you/i
      )
    })

    await retry(async () => {
      expect(await browser.eval('document.documentElement.innerHTML')).toMatch(
        /hello world/
      )
    })
    await next.patchFile(
      'pages/index.tsx',
      pageContent.replace('hello world', 'hello again')
    )

    await retry(async () => {
      expect(await browser.eval('document.documentElement.innerHTML')).toMatch(
        /hello again/
      )
    })
  })
})
