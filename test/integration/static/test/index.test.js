/* global jasmine, describe, it, expect, beforeAll, afterAll */

import { join } from 'path'
import {
  nextBuild,
  nextExport,
  startStaticServer,
  stopApp
} from 'next-test-utils'
import webdriver from 'next-webdriver'

import ssr from './ssr'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 40000
const appDir = join(__dirname, '../')
const context = {}

describe('Static Export', () => {
  beforeAll(async () => {
    const outdir = join(appDir, '.out')
    await nextBuild(appDir)
    await nextExport(appDir, { outdir })

    context.server = await startStaticServer(join(appDir, '.out'))
    context.port = context.server.address().port
  })
  afterAll(() => stopApp(context.server))

  ssr(context)

  describe('Render via browser', () => {
    it('should render the home page', async () => {
      const browser = await webdriver(context.port, '/')
      const text = await browser
          .elementByCss('#home-page p').text()

      expect(text).toBe('This is the home page')
      browser.close()
    })
  })
})
