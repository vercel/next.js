/* eslint-env jest */

import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  nextStart,
  nextBuild,
  check,
  hasRedbox,
  getRedboxHeader,
} from 'next-test-utils'
import webdriver from 'next-webdriver'
import fs from 'fs-extra'

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

function runTests(mode) {
  it('should load the images', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await check(async () => {
        const result = await browser.eval(
          `document.getElementById('basic-image').naturalWidth`
        )

        if (result === 0) {
          throw new Error('Incorrectly loaded image')
        }

        return 'result-correct'
      }, /result-correct/)

      await browser.eval(
        'document.getElementById("unsized-image").scrollIntoView()'
      )

      await check(async () => {
        const result = await browser.eval(
          `document.getElementById('unsized-image').naturalWidth`
        )

        if (result === 0) {
          throw new Error('Incorrectly loaded image')
        }

        return 'result-correct'
      }, /result-correct/)

      expect(
        await hasImageMatchingUrl(
          browser,
          `http://localhost:${appPort}/_next/image?url=%2Ftest.jpg&w=420&q=75`
        )
      ).toBe(true)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it('should work when using flexbox', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/flex')
      await check(async () => {
        const result = await browser.eval(
          `document.getElementById('basic-image').width`
        )
        if (result === 0) {
          throw new Error('Incorrectly loaded image')
        }

        return 'result-correct'
      }, /result-correct/)
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  if (mode === 'dev') {
    it('should show missing src error', async () => {
      const browser = await webdriver(appPort, '/missing-src')

      await hasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        'Image is missing required "src" property. Make sure you pass "src" in props to the `next/image` component. Received: {"width":200}'
      )
    })

    it('should show invalid src error', async () => {
      const browser = await webdriver(appPort, '/invalid-src')

      await hasRedbox(browser)
      expect(await getRedboxHeader(browser)).toContain(
        'Invalid src prop (https://google.com/test.png) on `next/image`, hostname is not configured under images in your `next.config.js`'
      )
    })
  }
}

describe('Image Component Tests', () => {
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
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `
        module.exports = {
          target: 'serverless'
        }
      `
      )
      await nextBuild(appDir)
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await fs.unlink(nextConfig)
      await killApp(app)
    })

    runTests('serverless')
  })
})
