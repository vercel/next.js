/* eslint-env jest */

import {
  File,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

jest.setTimeout(1000 * 30)

const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')

let appPort
let app

async function hasImageMatchingUrl(browser, url) {
  const links = await browser.elementsByCss('img')
  let foundMatch = false
  for (const link of links) {
    const src = await link.getAttribute('src')
    if (src === url) {
      foundMatch = true
      break
    }
  }
  return foundMatch
}

function runTests() {
  it('should load the images', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')

      expect(
        await hasImageMatchingUrl(
          browser,
          `https://example.com/fastly/test.jpg?auto=webp&optimize=medium&width=1200`
        )
      ).toBe(true)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
}

describe('Image Component Fastly Loader', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests('dev')
  })

  describe('server mode', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests('server')
  })

  describe('serverless mode', () => {
    const f = new File(nextConfig)
    beforeAll(async () => {
      f.replace(`// target: 'serverless'`, `target: 'serverless'`)
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      f.restore()
      await killApp(app)
    })

    runTests('serverless')
  })
})
