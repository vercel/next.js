/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import {
  renderViaHTTP,
  launchApp,
  findPort,
  killApp,
  waitFor,
} from 'next-test-utils'

jest.setTimeout(1000 * 30 * 2)

let app
let appPort
let stderr = ''

const appDir = join(__dirname, '../')
const pageFile = join(appDir, 'pages/[pid].js')
const pageFileAlt = join(appDir, 'pages/[PiD].js')

describe('Dynamic route rename casing', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort, {
      onStderr(msg) {
        stderr += msg || ''
      },
    })
  })
  afterAll(() => killApp(app))

  it('should not throw error when changing casing of dynamic route file', async () => {
    // make sure route is loaded in webpack
    const html = await renderViaHTTP(appPort, '/abc')
    expect(html).toContain('hi')

    await fs.rename(pageFile, pageFileAlt)
    await waitFor(2000)

    expect(stderr).not.toContain(
      `You cannot use different slug names for the same dynamic path`
    )

    await fs.rename(pageFileAlt, pageFile)
    await waitFor(2000)

    expect(stderr).not.toContain(
      `You cannot use different slug names for the same dynamic path`
    )
  })
})
