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

function runTests(getOutput: () => string) {
  it('should apply image config for node_modules', async () => {
    const browser = await webdriver(appPort, '/')
    const src = await browser
      .elementById('image-from-node-modules')
      .getAttribute('src')
    expect(src).toMatch('i.imgur.com')

    const srcset = await browser
      .elementById('image-from-node-modules')
      .getAttribute('srcset')
    expect(srcset).toMatch('1234')
  })

  it('should warn when using images.domains config', async () => {
    expect(getOutput()).toContain(
      '`images.domains` is deprecated in favor of `images.remotePatterns`. Please update next.config.js to protect your application from malicious users.'
    )
  })
}

describe('Image Component from node_modules prod mode', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      let output = ''
      beforeAll(async () => {
        const result = await nextBuild(appDir, [], {
          stderr: true,
          stdout: true,
        })
        output = (result.stderr ?? '') + (result.stdout ?? '')
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(async () => {
        await killApp(app)
      })

      runTests(() => output)
    }
  )
})

describe('Image Component from node_modules development mode', () => {
  let output = ''
  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort, {
      onStderr: (msg) => (output += msg),
      onStdout: (msg) => (output += msg),
    })
  })
  afterAll(async () => {
    await killApp(app)
  })

  runTests(() => output)
})
