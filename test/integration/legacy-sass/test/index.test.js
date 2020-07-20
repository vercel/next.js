/* eslint-env jest */

import { remove } from 'fs-extra'
import { findPort, killApp, launchApp, nextBuild } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { recursiveReadDir } from 'next/dist/lib/recursive-readdir'
import { join } from 'path'
import { version } from 'webpack'

const isWebpack5 = parseInt(version) === 5

jest.setTimeout(1000 * 60 * 1)

const appDir = join(__dirname, '../')

// TODO: Make legacy Sass support work with webpack 5
const describeFn = isWebpack5 ? describe.skip : describe

// TODO: Make legacy Sass support work with webpack 5
describeFn('Legacy Sass Support Should Disable New CSS', () => {
  beforeAll(async () => {
    await remove(join(appDir, '.next'))
    await nextBuild(appDir)
  })

  it(`should've emitted a single CSS file`, async () => {
    const cssFiles = await recursiveReadDir(
      join(appDir, '.next', 'static'),
      /\.css$/
    )

    expect(cssFiles.length).toBe(1)
  })
})

describeFn('Legacy Sass Support should work in development', () => {
  beforeAll(async () => {
    await remove(join(appDir, '.next'))
  })

  let appPort
  let app
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })
  afterAll(async () => {
    await killApp(app)
  })

  it('should render the page', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      const exampleElText = await browser.elementByCss('.example').text()
      expect(exampleElText).toBe('Hello World!')
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
