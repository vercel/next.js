import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { check, getRedboxHeader } from 'next-test-utils'
import webdriver from 'next-webdriver'

describe('show a warning in CLI and browser when doing a full reload', () => {
  let next: NextInstance

  beforeEach(async () => {
    next = await createNext({
      files: {
        'pages/anonymous-page-function.js': `
          export default function() { 
            return <p>hello world</p>
          } 
        `,
        'pages/runtime-error.js': `
        export default function() { 
          return whoops
        } 
      `,
      },
      dependencies: {},
    })
  })
  afterEach(() => next.destroy())

  test('error', async () => {
    const browser = await webdriver(next.url, `/anonymous-page-function`)
    expect(await browser.elementByCss('p').text()).toBe('hello world')
    expect(next.cliOutput).not.toContain(
      'Fast Refresh had to perform a full reload. Read more: https://nextjs.org/docs/basic-features/fast-refresh#how-it-works'
    )

    const currentFileContent = await next.readFile(
      './pages/anonymous-page-function.js'
    )
    const newFileContent = currentFileContent.replace(
      '<p>hello world</p>',
      '<p>hello world!!!</p>'
    )
    await next.patchFile('./pages/anonymous-page-function.js', newFileContent)
    await check(() => browser.elementByCss('p').text(), 'hello world!!!')

    // CLI warning and stacktrace
    expect(next.cliOutput).toContain(
      'Fast Refresh had to perform a full reload. Read more: https://nextjs.org/docs/basic-features/fast-refresh#how-it-works'
    )
    expect(next.cliOutput).toContain(
      'Error: Aborted because ./pages/anonymous-page-function.js is not accepted'
    )

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

  test('runtime-error', async () => {
    const browser = await webdriver(next.url, `/runtime-error`)
    await check(
      () => getRedboxHeader(browser),
      /ReferenceError: whoops is not defined/
    )
    expect(next.cliOutput).not.toContain(
      'Fast Refresh had to perform a full reload. Read more: https://nextjs.org/docs/basic-features/fast-refresh#how-it-works'
    )

    const currentFileContent = await next.readFile('./pages/runtime-error.js')
    const newFileContent = currentFileContent.replace('whoops', '"whoops"')
    await next.patchFile('./pages/runtime-error.js', newFileContent)
    await check(() => browser.elementByCss('body').text(), 'whoops')

    // CLI warning and stacktrace
    expect(next.cliOutput).toContain(
      'Fast Refresh had to perform a full reload. Read more: https://nextjs.org/docs/basic-features/fast-refresh#how-it-works'
    )
    expect(next.cliOutput).not.toContain(
      'Error: Aborted because ./pages/runtime-error.js is not accepted'
    )

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
