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
  waitFor,
  nextBuild,
  nextStart,
  normalizeRegEx,
} from 'next-test-utils'
import cheerio from 'cheerio'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

let app
let appPort
let buildId
const appDir = join(__dirname, '../')
const buildIdPath = join(appDir, '.next/BUILD_ID')

function runTests(dev) {
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

  it('[catch all] should not match root on SSR', async () => {
    const res = await fetchViaHTTP(appPort, '/p1/p2/all-ssr')
    expect(res.status).toBe(404)
  })

  it('[catch all] should pass param in getInitialProps during SSR', async () => {
    const html = await renderViaHTTP(appPort, '/p1/p2/all-ssr/test1')
    const $ = cheerio.load(html)
    expect($('#all-ssr-content').text()).toBe('{"rest":["test1"]}')
  })

  it('[catch all] should pass params in getInitialProps during SSR', async () => {
    const html = await renderViaHTTP(appPort, '/p1/p2/all-ssr/test1/test2')
    const $ = cheerio.load(html)
    expect($('#all-ssr-content').text()).toBe('{"rest":["test1","test2"]}')
  })

  it('[catch all] should strip trailing slash', async () => {
    const html = await renderViaHTTP(appPort, '/p1/p2/all-ssr/test1/test2/')
    const $ = cheerio.load(html)
    expect($('#all-ssr-content').text()).toBe('{"rest":["test1","test2"]}')
  })

  it('[catch all] should not decode slashes (start)', async () => {
    const html = await renderViaHTTP(appPort, '/p1/p2/all-ssr/test1/%2Ftest2')
    const $ = cheerio.load(html)
    expect($('#all-ssr-content').text()).toBe('{"rest":["test1","/test2"]}')
  })

  it('[catch all] should not decode slashes (end)', async () => {
    const html = await renderViaHTTP(appPort, '/p1/p2/all-ssr/test1%2F/test2')
    const $ = cheerio.load(html)
    expect($('#all-ssr-content').text()).toBe('{"rest":["test1/","test2"]}')
  })

  it('[catch all] should not decode slashes (middle)', async () => {
    const html = await renderViaHTTP(appPort, '/p1/p2/all-ssr/test1/te%2Fst2')
    const $ = cheerio.load(html)
    expect($('#all-ssr-content').text()).toBe('{"rest":["test1","te/st2"]}')
  })

  it('[catch-all] should pass params in getInitialProps during client navigation (single)', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#catch-all-single').click()
      await browser.waitForElementByCss('#all-ssr-content')

      const text = await browser.elementByCss('#all-ssr-content').text()
      expect(text).toBe('{"rest":["hello"]}')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('[catch-all] should pass params in getInitialProps during client navigation (multi)', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#catch-all-multi').click()
      await browser.waitForElementByCss('#all-ssr-content')

      const text = await browser.elementByCss('#all-ssr-content').text()
      expect(text).toBe('{"rest":["hello1","hello2"]}')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('[catch-all] should pass params in getInitialProps during client navigation (encoded)', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#catch-all-enc').click()
      await browser.waitForElementByCss('#all-ssr-content')

      const text = await browser.elementByCss('#all-ssr-content').text()
      expect(text).toBe('{"rest":["hello1/","he/llo2"]}')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('[ssg: catch all] should pass param in getInitialProps during SSR', async () => {
    const html = await renderViaHTTP(appPort, '/p1/p2/all-ssg/test1')
    const $ = cheerio.load(html)
    expect($('#all-ssg-content').text()).toBe('{"rest":["test1"]}')
  })

  it('[ssg: catch all] should pass params in getInitialProps during SSR', async () => {
    const html = await renderViaHTTP(appPort, '/p1/p2/all-ssg/test1/test2')
    const $ = cheerio.load(html)
    expect($('#all-ssg-content').text()).toBe('{"rest":["test1","test2"]}')
  })

  it('[predefined ssg: catch all] should pass param in getInitialProps during SSR', async () => {
    const html = await renderViaHTTP(appPort, '/p1/p2/predefined-ssg/test1')
    const $ = cheerio.load(html)
    expect($('#all-ssg-content').text()).toBe('{"rest":["test1"]}')
  })

  it('[predefined ssg: catch all] should pass params in getInitialProps during SSR', async () => {
    const html = await renderViaHTTP(
      appPort,
      '/p1/p2/predefined-ssg/test1/test2'
    )
    const $ = cheerio.load(html)
    expect($('#all-ssg-content').text()).toBe('{"rest":["test1","test2"]}')
  })

  it('[predefined ssg: prerendered catch all] should pass param in getInitialProps during SSR', async () => {
    const html = await renderViaHTTP(appPort, '/p1/p2/predefined-ssg/one-level')
    const $ = cheerio.load(html)
    expect($('#all-ssg-content').text()).toBe('{"rest":["one-level"]}')
  })

  it('[predefined ssg: prerendered catch all] should pass params in getInitialProps during SSR', async () => {
    const html = await renderViaHTTP(
      appPort,
      '/p1/p2/predefined-ssg/1st-level/2nd-level'
    )
    const $ = cheerio.load(html)
    expect($('#all-ssg-content').text()).toBe(
      '{"rest":["1st-level","2nd-level"]}'
    )
  })

  it('[ssg: catch-all] should pass params in getStaticProps during client navigation (single)', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#ssg-catch-all-single').click()
      await browser.waitForElementByCss('#all-ssg-content')

      const text = await browser.elementByCss('#all-ssg-content').text()
      expect(text).toBe('{"rest":["hello"]}')
    } finally {
      if (browser) await browser.close()
    }
  })

  it('[ssg: catch-all] should pass params in getStaticProps during client navigation (multi)', async () => {
    let browser
    try {
      browser = await webdriver(appPort, '/')
      await browser.elementByCss('#ssg-catch-all-multi').click()
      await browser.waitForElementByCss('#all-ssg-content')

      const text = await browser.elementByCss('#all-ssg-content').text()
      expect(text).toBe('{"rest":["hello1","hello2"]}')
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

  it('should prioritize public files over dynamic route', async () => {
    const data = await renderViaHTTP(appPort, '/hello.txt')
    expect(data).toMatch(/hello world/)
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

    it('should output a routes-manifest correctly', async () => {
      const manifest = await fs.readJson(
        join(appDir, '.next/routes-manifest.json')
      )

      expect(manifest).toEqual({
        version: 1,
        rewrites: [],
        redirects: [],
        dynamicRoutes: [
          {
            page: '/blog/[name]/comment/[id]',
            regex: normalizeRegEx(
              '^\\/blog\\/([^\\/]+?)\\/comment\\/([^\\/]+?)(?:\\/)?$'
            ),
          },
          {
            page: '/on-mount/[post]',
            regex: normalizeRegEx('^\\/on\\-mount\\/([^\\/]+?)(?:\\/)?$'),
          },
          {
            page: '/p1/p2/all-ssg/[...rest]',
            regex: normalizeRegEx('^\\/p1\\/p2\\/all\\-ssg\\/(.+?)(?:\\/)?$'),
          },
          {
            page: '/p1/p2/all-ssr/[...rest]',
            regex: normalizeRegEx('^\\/p1\\/p2\\/all\\-ssr\\/(.+?)(?:\\/)?$'),
          },
          {
            page: '/p1/p2/predefined-ssg/[...rest]',
            regex: normalizeRegEx(
              '^\\/p1\\/p2\\/predefined\\-ssg\\/(.+?)(?:\\/)?$'
            ),
          },
          {
            page: '/[name]',
            regex: normalizeRegEx('^\\/([^\\/]+?)(?:\\/)?$'),
          },
          {
            page: '/[name]/comments',
            regex: normalizeRegEx('^\\/([^\\/]+?)\\/comments(?:\\/)?$'),
          },
          {
            page: '/[name]/[comment]',
            regex: normalizeRegEx('^\\/([^\\/]+?)\\/([^\\/]+?)(?:\\/)?$'),
          },
        ],
      })
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
            experimental: {
              modern: true,
              catchAllRouting: true
            }
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

  describe('serverless mode', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `
        module.exports = {
          target: 'serverless',
          experimental: {
            modern: true,
            catchAllRouting: true
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
