/* eslint-env jest */

import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  hasRedbox,
} from 'next-test-utils'

let app
let appPort: number
const appDir = join(__dirname, '../')

describe('next/dynamic with suspense', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('should render server-side', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toContain('Next.js Example')
    expect(html).toContain('Thing')
  })

  it('should render client-side', async () => {
    const browser = await webdriver(appPort, '/')
    const warnings = (await browser.log()).map((log) => log.message).join('\n')

    expect(await hasRedbox(browser)).toBe(false)
    expect(warnings).toMatch(
      /"ssr: false" is ignored by next\/dynamic because you can not enable "suspense" while disabling "ssr" at the same time/gim
    )

    await browser.close()
  })
})
