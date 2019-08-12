/* eslint-env jest */
/* global jasmine */
import webdriver from 'next-webdriver'
import { join } from 'path'
import fs from 'fs-extra'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  waitFor,
  nextBuild,
  nextStart
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

let app
let appPort
let buildId
const appDir = join(__dirname, '../')
const buildIdPath = join(appDir, '.next/BUILD_ID')

function runTests (dev) {
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

  it('should prioritize a non-dynamic page', async () => {
    const html = await renderViaHTTP(appPort, '/post-1/comments')
    expect(html).toMatch(/show comments for.*post-1.*here/i)
  })

  it('should render nested dynamic page', async () => {
    const html = await renderViaHTTP(appPort, '/post-1/comment-1')
    expect(html).toMatch(/i am.*comment-1.*on.*post-1/i)
  })

  it('should render optional dynamic page', async () => {
    const html = await renderViaHTTP(appPort, '/blog/543/comment')
    // expect(html).toMatch(/blog post.*543.*comment.*all/i)
    expect(html).toMatch(/404/i)
  })

  it('should render nested optional dynamic page', async () => {
    const html = await renderViaHTTP(appPort, '/blog/321/comment/123')
    expect(html).toMatch(/blog post.*321.*comment.*123/i)
  })

  it('should render dynamic route with query', async () => {
    const browser = await webdriver(appPort, '/')
    await browser.elementByCss('#view-post-1-with-query').click()
    await waitFor(1000)
    const url = await browser.eval('window.location.search')
    expect(url).toBe('?fromHome=true')
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

  // it('should navigate optional dynamic page', async () => {
  //   let browser
  //   try {
  //     browser = await webdriver(appPort, '/')
  //     await browser.elementByCss('#view-blog-post-1-comments').click()
  //     await browser.waitForElementByCss('p')

  //     const text = await browser.elementByCss('p').text()
  //     expect(text).toMatch(/blog post.*543.*comment.*\(all\)/i)
  //   } finally {
  //     if (browser) await browser.close()
  //   }
  // })

  it('should navigate optional dynamic page with value', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#view-nested-dynamic-cmnt').click()
      await browser.waitForElementByCss('p')

      const text = await browser.elementByCss('p').text()
      expect(text).toMatch(/blog post.*321.*comment.*123/i)
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

  it('should update dynamic values on mount', async () => {
    const html = await renderViaHTTP(appPort, '/on-mount/post-1')
    expect(html).toMatch(/onmpost:.*pending/)

    const browser = await webdriver(appPort, '/on-mount/post-1')
    await waitFor(1000)
    const text = await browser.eval(`document.body.innerHTML`)
    expect(text).toMatch(/onmpost:.*post-1/)
  })

  it('should not have placeholder query values for SSS', async () => {
    const html = await renderViaHTTP(appPort, '/on-mount/post-1')
    expect(html).not.toMatch(/post:.*?\[post\].*?<\/p>/)
  })

  it('should update with a hash in the URL', async () => {
    const browser = await webdriver(appPort, '/on-mount/post-1#abc')
    await waitFor(1000)
    const text = await browser.eval(`document.body.innerHTML`)
    expect(text).toMatch(/onmpost:.*post-1/)
  })

  it('should scroll to a hash on mount', async () => {
    const browser = await webdriver(appPort, '/on-mount/post-1#item-400')
    await waitFor(1000)

    const text = await browser.eval(`document.body.innerHTML`)
    expect(text).toMatch(/onmpost:.*post-1/)

    const scrollPosition = await browser.eval('window.pageYOffset')
    expect(scrollPosition).toBe(7232)
  })

  it('should scroll to a hash on client-side navigation', async () => {
    const browser = await webdriver(appPort, '/')
    await waitFor(1000)
    await browser.elementByCss('#view-dynamic-with-hash').click()
    await browser.waitForElementByCss('p')

    const text = await browser.elementByCss('p').text()
    expect(text).toMatch(/onmpost:.*test-w-hash/)

    const scrollPosition = await browser.eval('window.pageYOffset')
    expect(scrollPosition).toBe(7232)
  })

  if (dev) {
    it('should work with HMR correctly', async () => {
      const browser = await webdriver(appPort, '/post-1/comments')
      let text = await browser.eval(`document.documentElement.innerHTML`)
      expect(text).toMatch(/comments for.*post-1/)

      const page = join(appDir, 'pages/[name]/comments.js')
      const origContent = await fs.readFile(page, 'utf8')
      const newContent = origContent.replace(/comments/, 'commentss')

      try {
        await fs.writeFile(page, newContent, 'utf8')
        await waitFor(3 * 1000)

        let text = await browser.eval(`document.documentElement.innerHTML`)
        expect(text).toMatch(/commentss for.*post-1/)
      } finally {
        await fs.writeFile(page, origContent, 'utf8')
        if (browser) await browser.close()
      }
    })
  } else {
    it('should output modern bundles with dynamic route correctly', async () => {
      const bundlePath = join(
        appDir,
        '.next/static/',
        buildId,
        'pages/blog/[name]/comment/[id]'
      )

      await fs.access(bundlePath + '.js', fs.constants.F_OK)
      await fs.access(bundlePath + '.module.js', fs.constants.F_OK)
    })
  }
}

const nextConfig = join(appDir, 'next.config.js')

describe('Dynamic Routing', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests(true)
  })

  describe('production mode', () => {
    beforeAll(async () => {
      const curConfig = await fs.readFile(nextConfig, 'utf8')

      if (curConfig.includes('target')) {
        await fs.writeFile(
          nextConfig,
          `
          module.exports = {
            experimental: { modern: true }
          }
        `
        )
      }
      await nextBuild(appDir)
      buildId = await fs.readFile(buildIdPath, 'utf8')

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('SSR production mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `
        module.exports = {
          target: 'serverless',
          experimental: {
            modern: true
          }
        }
      `
      )

      await nextBuild(appDir)
      buildId = await fs.readFile(buildIdPath, 'utf8')

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))
    runTests()
  })
})
