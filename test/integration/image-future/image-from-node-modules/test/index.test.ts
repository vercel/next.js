/* eslint-env jest */
import {
  killApp,
  findPort,
  nextStart,
  nextBuild,
  launchApp,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

const appDir = join(__dirname, '../')
let appPort
let app

function runTests() {
  // This feature was added in PR #31065.
  // Skip this test until we promote `next/future/image` from
  // experimental to stable status.
  it.skip('should apply image config for node_modules', async () => {
    const browser = await webdriver(appPort, '/')
    const src = await browser
      .elementById('image-from-node-modules')
      .getAttribute('src')
    expect(src).toMatch('i.imgur.com')
  })
}

describe('Future Image from node_modules prod mode', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    appPort = await findPort()
    app = await nextStart(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  runTests()
})

describe('Future Image from node_modules dev mode', () => {
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  runTests()
})
