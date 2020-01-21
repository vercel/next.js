/* eslint-env jest */
/* global jasmine */
import path from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import { nextBuild, nextStart, findPort, killApp } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 1
const appDir = path.join(__dirname, '..')
let app
let appPort

describe('Hydration', () => {
  beforeAll(async () => {
    await fs.remove(path.join(appDir, '.next'))
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('Hydrates correctly', async () => {
    const browser = await webdriver(appPort, '/')
    expect(await browser.eval('window.didHydrate')).toBe(true)
  })
})
