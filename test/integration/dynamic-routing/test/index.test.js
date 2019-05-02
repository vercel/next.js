/* eslint-env jest */
/* global jasmine */
import webdriver from 'next-webdriver'
import { join } from 'path'
import fs from 'fs-extra'
import {
  renderViaHTTP,
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp,
  runNextCommand,
  nextServer,
  startApp,
  stopApp,
  waitFor
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

let app
let appPort
let server
const appDir = join(__dirname, '../')

function runTests (dev = false) {
  it('should render normal route', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/my blog/i)
  })

  it('should render dynamic page', async () => {
    const html = await renderViaHTTP(appPort, '/post-1')
    expect(html).toMatch(/this is.*?post-1/i)
  })

  it('should render nested dynamic page', async () => {
    const html = await renderViaHTTP(appPort, '/post-1/cmnt-1')
    expect(html).toMatch(/i am.*cmnt-1.*on.*post-1/i)
  })

  it('should prioritize a non-dynamic page', async () => {
    const html = await renderViaHTTP(appPort, '/post-1/comments')
    expect(html).toMatch(/show comments for.*post-1.*here/i)
  })

  it('should navigate to a dynamic page successfully', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#view-post-1').click()
      await browser.waitForElementByCss('p')

      const text = await browser.elementByCss('p').text()
      expect(text).toMatch(/this is.*?post-1/i)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should navigate to a nested dynamic page successfully', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#view-post-1-comment-1').click()
      await browser.waitForElementByCss('p')

      const text = await browser.elementByCss('p').text()
      expect(text).toMatch(/i am.*comment-1.*on.*post-1/i)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should navigate to prioritized non-dynamic page', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#view-post-1-comments').click()
      await browser.waitForElementByCss('p')

      const text = await browser.elementByCss('p').text()
      expect(text).toMatch(/show comments for.*post-1.*here/i)
    } finally {
      if (browser) await browser.close()
    }
  })

  if (dev) {
    it('should update routes in dev mode when dynamic page is added/removed', async () => {
      const origFile = join(appDir, 'pages/$post/$comment.js')
      const newFile = join(appDir, 'pages/$post/replies/$reply.js')
      const origContent = await fs.readFile(origFile, 'utf8')
      const newContent = origContent.replace(/params\.comment/g, 'params.reply')

      await fs.outputFile(newFile, newContent)
      await waitFor(2 * 1000)

      const html = await renderViaHTTP(appPort, '/post-1/replies/reply-1')
      expect(html).toMatch(/i am.*reply-1.*on.*post-1/i)

      await fs.remove(join(appDir, 'pages/$post/replies'))
      await waitFor(2 * 1000)

      const res = await fetchViaHTTP(appPort, '/post-1/replies/reply-1')
      expect(res.status).toBe(404)
    })
  }
}

describe('Dynamic Routing', () => {
  describe('dev mode', async () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests(true)
  })

  describe('production mode', async () => {
    beforeAll(async () => {
      await runNextCommand(['build', appDir])

      app = nextServer({
        dir: appDir,
        dev: false,
        quiet: true
      })

      server = await startApp(app)
      appPort = server.address().port
    })
    afterAll(() => stopApp(server))

    runTests()
  })
})
