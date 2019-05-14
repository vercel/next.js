/* eslint-env jest */
/* global jasmine */
import webdriver from 'next-webdriver'
import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  runNextCommand,
  nextServer,
  startApp,
  stopApp
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

  it('should render another normal route', async () => {
    const html = await renderViaHTTP(appPort, '/another')
    expect(html).toMatch(/hello from another/)
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

  it('should render part dynamic page', async () => {
    const html = await renderViaHTTP(appPort, '/cmnt-123')
    expect(html).toMatch(/Comment.*123/)
  })

  it('should render nested part dynamic page', async () => {
    const html = await renderViaHTTP(appPort, '/blog/321/cmnt-cmnt-123')
    expect(html).toMatch(/Blog post.*321.*comment.*cmnt-123/)
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

  it('should navigate to a part dynamic page', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#view-cmnt-part').click()
      await browser.waitForElementByCss('p')

      const text = await browser.elementByCss('p').text()
      expect(text).toMatch(/Comment.*123/)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should navigate to a nested part dynamic page', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#view-nested-cmnt-part').click()
      await browser.waitForElementByCss('p')

      const text = await browser.elementByCss('p').text()
      expect(text).toMatch(/Blog post.*321.*comment.*cmnt-123/)
    } finally {
      if (browser) await browser.close()
    }
  })

  it('should pass params in getInitialProps during SSR', async () => {
    const html = await renderViaHTTP(appPort, '/post-1/cmnt-1')
    expect(html).toMatch(/gip.*post-1/i)
  })

  it('should pass params in getInitialProps during client navigation', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#view-post-1-comment-1').click()
      await browser.waitForElementByCss('span')

      const text = await browser.elementByCss('span').text()
      expect(text).toMatch(/gip.*post-1/i)
    } finally {
      if (browser) await browser.close()
    }
  })
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
