/* global jasmine, describe, it, expect, beforeAll, afterAll */

import { join } from 'path'
import { existsSync } from 'fs'
import {
  nextServer,
  nextBuild,
  startApp,
  stopApp,
  renderViaHTTP
} from 'next-test-utils'

const appDir = join(__dirname, '../')
let appPort
let server
let app
jasmine.DEFAULT_TIMEOUT_INTERVAL = 40000

describe('Production Usage', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    app = nextServer({
      dir: join(__dirname, '../'),
      dev: false,
      quiet: true
    })

    server = await startApp(app)
    appPort = server.address().port
  })
  afterAll(() => stopApp(server))

  describe('With basic usage', () => {
    it('should render the page', async () => {
      const html = await renderViaHTTP(appPort, '/')
      expect(html).toMatch(/Hello.*<div.*>World<\/div>/)
    })
  })

  describe('File locations', () => {
    it('should build the app within the given `dist` directory', () => {
      expect(existsSync(join(__dirname, '/../dist/app.js'))).toBeTruthy()
    })

    it('should not build the app within the default `.next` directory', () => {
      expect(existsSync(join(__dirname, '/../.next/app.js'))).toBeFalsy()
    })
  })
})
