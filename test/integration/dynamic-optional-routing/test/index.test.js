/* eslint-env jest */

import cheerio from 'cheerio'
import fs from 'fs-extra'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
  check,
  initNextServerScript,
} from 'next-test-utils'
import { join } from 'path'

jest.setTimeout(1000 * 60 * 2)

let app
let appPort
let stderr
const appDir = join(__dirname, '../')

const DUMMY_PAGE = 'export default () => null'

function runTests() {
  it('should render catch-all top-level route with multiple segments', async () => {
    const html = await renderViaHTTP(appPort, '/hello/world')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('top level route param: [hello|world]')
  })

  it('should render catch-all top-level route with single segment', async () => {
    const html = await renderViaHTTP(appPort, '/hello')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('top level route param: [hello]')
  })

  it('should render catch-all top-level route with no segments', async () => {
    const html = await renderViaHTTP(appPort, '/')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('top level route param: undefined')
  })

  it('should render catch-all nested route with multiple segments', async () => {
    const html = await renderViaHTTP(appPort, '/nested/hello/world')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('nested route param: [hello|world]')
  })

  it('should render catch-all nested route with single segment', async () => {
    const html = await renderViaHTTP(appPort, '/nested/hello')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('nested route param: [hello]')
  })

  it('should render catch-all nested route with no segments', async () => {
    const html = await renderViaHTTP(appPort, '/nested')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('nested route param: undefined')
  })

  it('should render catch-all nested route with no segments and leading slash', async () => {
    const html = await renderViaHTTP(appPort, '/nested/')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('nested route param: undefined')
  })

  it('should match catch-all api route with multiple segments', async () => {
    const res = await fetchViaHTTP(appPort, '/api/post/ab/cd')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: ['ab', 'cd'] })
  })

  it('should match catch-all api route with single segment', async () => {
    const res = await fetchViaHTTP(appPort, '/api/post/a')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: ['a'] })
  })

  it('should match catch-all api route with no segments', async () => {
    const res = await fetchViaHTTP(appPort, '/api/post')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
  })

  it('should match catch-all api route with no segments and leading slash', async () => {
    const res = await fetchViaHTTP(appPort, '/api/post/')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
  })

  it('should handle getStaticPaths no segments', async () => {
    const html = await renderViaHTTP(appPort, '/get-static-paths')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp route: undefined')
  })

  it('should handle getStaticPaths no segments and trailing slash', async () => {
    const html = await renderViaHTTP(appPort, '/get-static-paths/')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp route: undefined')
  })

  it('should handle getStaticPaths 1 segment', async () => {
    const html = await renderViaHTTP(appPort, '/get-static-paths/p1')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp route: [p1]')
  })

  it('should handle getStaticPaths 1 segment and trailing slash', async () => {
    const html = await renderViaHTTP(appPort, '/get-static-paths/p1/')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp route: [p1]')
  })

  it('should handle getStaticPaths 2 segments', async () => {
    const html = await renderViaHTTP(appPort, '/get-static-paths/p2/p3')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp route: [p2|p3]')
  })

  it('should handle getStaticPaths 2 segments and trailing slash', async () => {
    const html = await renderViaHTTP(appPort, '/get-static-paths/p2/p3/')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp route: [p2|p3]')
  })

  it('should fall back to top-level catch-all', async () => {
    const html = await renderViaHTTP(appPort, '/get-static-paths/hello/world')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe(
      'top level route param: [get-static-paths|hello|world]'
    )
  })

  it('should match root path on undefined param', async () => {
    const html = await renderViaHTTP(appPort, '/get-static-paths-undefined')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp undefined route: undefined')
  })

  it('should match root path on false param', async () => {
    const html = await renderViaHTTP(appPort, '/get-static-paths-false')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp false route: undefined')
  })

  it('should match root path on null param', async () => {
    const html = await renderViaHTTP(appPort, '/get-static-paths-null')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp null route: undefined')
  })

  it('should handle getStaticPaths with fallback no segments', async () => {
    const html = await renderViaHTTP(appPort, '/get-static-paths-fallback')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe(
      'gsp fallback route: undefined is not fallback'
    )
  })

  it('should handle getStaticPaths with fallback 2 segments', async () => {
    const html = await renderViaHTTP(
      appPort,
      '/get-static-paths-fallback/p2/p3'
    )
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe(
      'gsp fallback route: [p2|p3] is not fallback'
    )
  })

  it('should fallback correctly when fallback enabled', async () => {
    const html = await renderViaHTTP(
      appPort,
      '/get-static-paths-fallback/hello/world'
    )
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp fallback route: undefined is fallback')
  })
}

const nextConfig = join(appDir, 'next.config.js')

function runInvalidPagesTests(buildFn) {
  it('should fail to build when optional route has index.js at root', async () => {
    const invalidRoute = appDir + 'pages/index.js'
    try {
      await fs.outputFile(invalidRoute, DUMMY_PAGE, 'utf-8')
      await buildFn(appDir)
      await check(
        () => stderr,
        /You cannot define a route with the same specificity as a optional catch-all route/
      )
    } finally {
      await fs.unlink(invalidRoute)
    }
  })

  it('should fail to build when optional route has same page at root', async () => {
    const invalidRoute = appDir + 'pages/nested.js'
    try {
      await fs.outputFile(invalidRoute, DUMMY_PAGE, 'utf-8')
      await buildFn(appDir)
      await check(
        () => stderr,
        /You cannot define a route with the same specificity as a optional catch-all route/
      )
    } finally {
      await fs.unlink(invalidRoute)
    }
  })

  it('should fail to build when mixed with regular catch-all', async () => {
    const invalidRoute = appDir + 'pages/nested/[...param].js'
    try {
      await fs.outputFile(invalidRoute, DUMMY_PAGE, 'utf-8')
      await buildFn(appDir)
      await check(() => stderr, /You cannot use both .+ at the same level/)
    } finally {
      await fs.unlink(invalidRoute)
    }
  })

  it('should fail to build when optional but no catch-all', async () => {
    const invalidRoute = appDir + 'pages/invalid/[[param]].js'
    try {
      await fs.outputFile(invalidRoute, DUMMY_PAGE, 'utf-8')
      await buildFn(appDir)
      await check(
        () => stderr,
        /Optional route parameters are not yet supported/
      )
    } finally {
      await fs.unlink(invalidRoute)
    }
  })
}

describe('Dynamic Optional Routing', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()

    runInvalidPagesTests(async (appDir) => {
      stderr = ''
      await launchApp(appDir, await findPort(), {
        onStderr: (msg) => {
          stderr += msg
        },
      })
    })
  })

  describe('production mode', () => {
    beforeAll(async () => {
      const curConfig = await fs.readFile(nextConfig, 'utf8')

      if (curConfig.includes('target')) {
        await fs.writeFile(nextConfig, `module.exports = {}`)
      }
      await nextBuild(appDir)

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()

    runInvalidPagesTests(async (appDir) => {
      ;({ stderr } = await nextBuild(appDir, [], { stderr: true }))
    })

    it('should fail to build when param is not explicitly defined', async () => {
      const invalidRoute = appDir + 'pages/invalid/[[...slug]].js'
      try {
        await fs.outputFile(
          invalidRoute,
          `
            export async function getStaticPaths() {
              return {
                paths: [
                  { params: {} },
                ],
                fallback: false,
              }
            }

            export async function getStaticProps({ params }) {
              return { props: { params } }
            }

            export default function Index(props) {
              return (
                <div>Invalid</div>
              )
            }
          `,
          'utf-8'
        )
        const { stderr } = await nextBuild(appDir, [], { stderr: true })
        await expect(stderr).toMatch(
          'A required parameter (slug) was not provided as an array in getStaticPaths for /invalid/[[...slug]]'
        )
      } finally {
        await fs.unlink(invalidRoute)
      }
    })
  })

  describe('serverless mode', () => {
    let origNextConfig

    beforeAll(async () => {
      origNextConfig = await fs.readFile(nextConfig, 'utf8')
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'experimental-serverless-trace' }`
      )

      await nextBuild(appDir)

      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await fs.writeFile(nextConfig, origNextConfig)
      await killApp(app)
    })
    runTests()
  })

  describe('raw serverless mode', () => {
    let origNextConfig

    beforeAll(async () => {
      origNextConfig = await fs.readFile(nextConfig, 'utf8')
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'experimental-serverless-trace' }`
      )

      await nextBuild(appDir)

      appPort = await findPort()
      app = await initNextServerScript(join(appDir, 'server.js'), /ready on/, {
        ...process.env,
        PORT: appPort,
      })
    })
    afterAll(async () => {
      await fs.writeFile(nextConfig, origNextConfig)
      await killApp(app)
    })

    const render = (path, query) => {
      return fetchViaHTTP(appPort, path, query, {
        headers: {
          // force relying on query values
          'x-vercel-id': 'hi',
        },
      }).then((res) => res.text())
    }

    it('should render normal (non-dynamic) page', async () => {
      const html = await render('/about')
      const $ = cheerio.load(html)
      expect($('#content').text()).toBe('about')
    })

    it('should render top level optional catch-all root', async () => {
      const html = await render('/', { optionalName: '' })
      const $ = cheerio.load(html)
      expect($('#route').text()).toBe('top level route param: undefined')
      expect($('#keys').text()).toBe('[]')
      expect($('#asPath').text()).toBe('/')
    })

    it('should render top level optional catch-all one level', async () => {
      const html = await render('/hello', { optionalName: 'hello' })
      const $ = cheerio.load(html)
      expect($('#route').text()).toBe('top level route param: [hello]')
      expect($('#keys').text()).toBe('["optionalName"]')
      expect($('#asPath').text()).toBe('/hello')
    })

    it('should render top level optional catch-all two levels', async () => {
      const html = await render('/hello/world', { optionalName: 'hello/world' })
      const $ = cheerio.load(html)
      expect($('#route').text()).toBe('top level route param: [hello|world]')
      expect($('#keys').text()).toBe('["optionalName"]')
      expect($('#asPath').text()).toBe('/hello/world')
    })

    it('should render nested optional catch-all root', async () => {
      const html = await render('/nested', { optionalName: '' })
      const $ = cheerio.load(html)
      expect($('#route').text()).toBe('nested route param: undefined')
      expect($('#keys').text()).toBe('[]')
      expect($('#asPath').text()).toBe('/nested')
    })

    it('should render nested optional catch-all one level', async () => {
      const html = await render('/nested/hello', { optionalName: 'hello' })
      const $ = cheerio.load(html)
      expect($('#route').text()).toBe('nested route param: [hello]')
      expect($('#keys').text()).toBe('["optionalName"]')
      expect($('#asPath').text()).toBe('/nested/hello')
    })

    it('should render nested optional catch-all two levels', async () => {
      const html = await render('/nested/hello/world', {
        optionalName: 'hello/world',
      })
      const $ = cheerio.load(html)
      expect($('#route').text()).toBe('nested route param: [hello|world]')
      expect($('#keys').text()).toBe('["optionalName"]')
      expect($('#asPath').text()).toBe('/nested/hello/world')
    })

    it('should render optional catch-all api root', async () => {
      const text = await render('/api/post', { slug: '' })
      const data = JSON.parse(text)
      expect(data).toEqual({})
    })

    it('should render optional catch-all api root one level', async () => {
      const text = await render('/api/post/hello', { slug: 'hello' })
      const data = JSON.parse(text)
      expect(data).toEqual({ slug: ['hello'] })
    })

    it('should render optional catch-all api root two levels', async () => {
      const text = await render('/api/post/hello', { slug: 'hello/world' })
      const data = JSON.parse(text)
      expect(data).toEqual({ slug: ['hello', 'world'] })
    })
  })
})
