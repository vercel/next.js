/* eslint-env jest */

import { join } from 'path'
import { nextBuild, findPort, nextStart, killApp } from 'next-test-utils'
import webdriver from 'next-webdriver'

jest.setTimeout(1000 * 60 * 1)

const appDir = join(__dirname, '../')

let appPort
let app

describe('Polyfills', () => {
  let output = ''

  beforeAll(async () => {
    const { stdout, stderr } = await nextBuild(appDir, [], {
      stdout: true,
      stderr: true,
    })
    output = (stderr || '') + (stdout + '')
    console.log(stdout)
    console.error(stderr)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  it('should alias fetch', async () => {
    const browser = await webdriver(appPort, '/fetch')
    const text = await browser.elementByCss('#test-status').text()

    expect(text).toBe('pass')

    await browser.close()
  })

  it('should contain generated page count in output', async () => {
    expect(output).toContain('Generating static pages (0/3)')
    expect(output).toContain('Generating static pages (3/3)')
    // we should only have 1 segment and the initial message logged out
    expect(output.match(/Generating static pages/g).length).toBe(2)
  })
})
