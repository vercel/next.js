import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import { findPort, hasRedbox, retry } from 'next-test-utils'
import { NextInstance } from 'e2e-utils'
import { createNext } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

// TODO: investigate occasional failure
describe.skip('Project Directory Renaming', () => {
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
      skipStart: true,
      forcedPort: (await findPort()) + '',
    })

    await next.start()
  })
  afterAll(() => next.destroy().catch(() => {}))

  it('should detect project dir rename and restart', async () => {
    const browser = await webdriver(next.url, '/')
    await browser.eval('window.beforeNav = 1')

    let newTestDir = `${next.testDir}-renamed`
    await fs.move(next.testDir, newTestDir)

    next.testDir = newTestDir

    await retry(async () => {
      expect(await stripAnsi(next.cliOutput)).toMatch(
        /Detected project directory rename, restarting in new location/
      )
    })
    await retry(async () => {
      expect((await browser.eval('window.beforeNav')) === 1).toBeFalsy()
    })
    expect(await hasRedbox(browser)).toBe(false)

    try {
      // should still HMR correctly
      await next.patchFile(
        'pages/index.js',
        (await next.readFile('pages/index.js')).replace(
          'hello world',
          'hello again'
        )
      )
      await retry(async () => {
        if (!(await browser.eval('!!window.next'))) {
          await browser.refresh()
        }
        expect(
          await browser.eval('document.documentElement.innerHTML')
        ).toMatch(/hello again/)
      })
    } finally {
      await next.patchFile(
        'pages/index.js',
        (await next.readFile('pages/index.js')).replace(
          'hello again',
          'hello world'
        )
      )
    }
  })
})
