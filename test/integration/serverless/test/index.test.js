/* eslint-env jest */
/* global jasmine, test */
import { join } from 'path'
import { existsSync } from 'fs'
import {
  nextBuild,
  stopApp,
  renderViaHTTP
} from 'next-test-utils'
import startServer from '../server'
import webdriver from 'next-webdriver'
import fetch from 'node-fetch'

const appDir = join(__dirname, '../')
let appPort
let server
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Serverless', () => {
  beforeAll(async () => {
    await nextBuild(appDir)
    server = await startServer()
    appPort = server.address().port
  })
  afterAll(() => stopApp(server))

  it('should render the page', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/Hello World/)
  })

  it('should render the page with dynamic import', async () => {
    const html = await renderViaHTTP(appPort, '/dynamic')
    expect(html).toMatch(/Hello!/)
  })

  it('should render the page with same dynamic import', async () => {
    const html = await renderViaHTTP(appPort, '/dynamic-two')
    expect(html).toMatch(/Hello!/)
  })

  it('should render 404', async () => {
    const html = await renderViaHTTP(appPort, '/404')
    expect(html).toMatch(/This page could not be found/)
  })

  it('should render correctly when importing isomorphic-unfetch', async () => {
    const url = `http://localhost:${appPort}/fetch`
    const res = await fetch(url)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text.includes('failed')).toBe(false)
  })

  it('should render correctly when importing isomorphic-unfetch on the client side', async () => {
    const browser = await webdriver(appPort, '/')
    try {
      const text = await browser
        .elementByCss('a').click()
        .waitForElementByCss('.fetch-page')
        .elementByCss('#text').text()

      expect(text).toMatch(/fetch page/)
    } finally {
      browser.close()
    }
  })

  it('should not output _app.js and _document.js to serverless build', () => {
    const serverlessDir = join(appDir, '.next/serverless/pages')
    expect(existsSync(join(serverlessDir, '_app.js'))).toBeFalsy()
    expect(existsSync(join(serverlessDir, '_document.js'))).toBeFalsy()
  })

  describe('With basic usage', () => {
    it('should allow etag header support', async () => {
      const url = `http://localhost:${appPort}/`
      const etag = (await fetch(url)).headers.get('ETag')

      const headers = { 'If-None-Match': etag }
      const res2 = await fetch(url, { headers })
      expect(res2.status).toBe(304)
    })

    it('should set Content-Length header', async () => {
      const url = `http://localhost:${appPort}`
      const res = await fetch(url)
      expect(res.headers.get('Content-Length')).toBeDefined()
    })
  })
})
