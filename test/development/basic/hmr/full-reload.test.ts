import type { NextConfig } from 'next'
import { getRedboxHeader, retry } from 'next-test-utils'
import { nextTestSetup } from 'e2e-utils'

describe.each([
  { basePath: '', assetPrefix: '' },
  { basePath: '', assetPrefix: '/asset-prefix' },
  { basePath: '/docs', assetPrefix: '' },
  { basePath: '/docs', assetPrefix: '/asset-prefix' },
])('HMR - Full Reload, nextConfig: %o', (nextConfig: Partial<NextConfig>) => {
  const { next } = nextTestSetup({
    files: __dirname,
    nextConfig,
    patchFileDelay: 500,
  })
  const { basePath } = nextConfig

  it('should warn about full reload in cli output - anonymous page function', async () => {
    const start = next.cliOutput.length
    const browser = await next.browser(
      basePath + '/hmr/anonymous-page-function'
    )
    const cliWarning =
      'Fast Refresh had to perform a full reload when ./pages/hmr/anonymous-page-function.js changed. Read more: https://nextjs.org/docs/messages/fast-refresh-reload'

    expect(await browser.elementByCss('p').text()).toBe('hello world')
    expect(next.cliOutput.slice(start)).not.toContain(cliWarning)

    const currentFileContent = await next.readFile(
      './pages/hmr/anonymous-page-function.js'
    )
    const newFileContent = currentFileContent.replace(
      '<p>hello world</p>',
      '<p id="updated">hello world!!!</p>'
    )
    await next.patchFile(
      './pages/hmr/anonymous-page-function.js',
      newFileContent
    )

    expect(await browser.waitForElementByCss('#updated').text()).toBe(
      'hello world!!!'
    )

    // CLI warning
    expect(next.cliOutput.slice(start)).toContain(cliWarning)

    // Browser warning
    const browserLogs = await browser.log()
    expect(
      browserLogs.some(({ message }) =>
        message.includes(
          "Fast Refresh will perform a full reload when you edit a file that's imported by modules outside of the React rendering tree."
        )
      )
    ).toBeTruthy()
  })

  it('should warn about full reload in cli output - runtime-error', async () => {
    const start = next.cliOutput.length
    const browser = await next.browser(basePath + '/hmr/runtime-error')
    const cliWarning =
      'Fast Refresh had to perform a full reload due to a runtime error.'

    await retry(async () => {
      expect(await getRedboxHeader(browser)).toMatch(
        /ReferenceError: whoops is not defined/
      )
    })
    expect(next.cliOutput.slice(start)).not.toContain(cliWarning)

    const currentFileContent = await next.readFile(
      './pages/hmr/runtime-error.js'
    )
    const newFileContent = currentFileContent.replace(
      'whoops',
      '<p id="updated">whoops</p>'
    )
    await next.patchFile('./pages/hmr/runtime-error.js', newFileContent)

    expect(await browser.waitForElementByCss('#updated').text()).toBe('whoops')

    // CLI warning
    expect(next.cliOutput.slice(start)).toContain(cliWarning)

    // Browser warning
    const browserLogs = await browser.log()
    expect(
      browserLogs.some(({ message }) =>
        message.includes(
          '[Fast Refresh] performing full reload because your application had an unrecoverable error'
        )
      )
    ).toBeTruthy()
  })
})
