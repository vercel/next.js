/* eslint-env jest */
/* global jasmine, test */
import webdriver from 'next-webdriver'
import { join } from 'path'
import { existsSync } from 'fs'
import { nextBuild, stopApp, renderViaHTTP } from 'next-test-utils'
import startServer from '../server'
import fetch from 'node-fetch'

const appDir = join(__dirname, '../')
let appPort
let server
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Serverless', () => {
  beforeAll(async () => {
    await nextBuild(appDir, [
      '--experimental-page',
      '/',
      '--experimental-page',
      '/fetch'
    ])
    server = await startServer()
    appPort = server.address().port
  })
  afterAll(() => stopApp(server))

  it('should render the page', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/Hello World/)
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
        .elementByCss('a')
        .click()
        .waitForElementByCss('.fetch-page')
        .elementByCss('#text')
        .text()

      expect(text).toMatch(/fetch page/)
    } finally {
      await browser.close()
    }
  })

  it('should not output abc.js to serverless build', () => {
    const serverlessDir = join(appDir, '.next/serverless/pages')
    expect(existsSync(join(serverlessDir, 'abc.js'))).toBeFalsy()
  })
})
