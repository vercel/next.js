import cheerio from 'cheerio'
import { FileRef, nextTestSetup, isNextDev } from 'e2e-utils'
import { join } from 'path'
import { retry } from 'next-test-utils'

const files = {
  pages: new FileRef(join(__dirname, 'pages')),
  'next.config.js': new FileRef(join(__dirname, 'next.config.js')),
}

describe('Dynamic Optional Routing', () => {
  const { next } = nextTestSetup({ files })

  it('should render catch-all top-level route with multiple segments', async () => {
    const html = await next.render('/hello/world')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('top level route param: [hello|world]')
  })

  it('should render catch-all top-level route with single segment', async () => {
    const html = await next.render('/hello')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('top level route param: [hello]')
  })

  it('should render catch-all top-level route with no segments', async () => {
    const html = await next.render('/')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('top level route param: undefined')
  })

  it('should render catch-all nested route with multiple segments', async () => {
    const html = await next.render('/nested/hello/world')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('nested route param: [hello|world]')
  })

  it('should render catch-all nested route with single segment', async () => {
    const html = await next.render('/nested/hello')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('nested route param: [hello]')
  })

  it('should render catch-all nested route with no segments', async () => {
    const html = await next.render('/nested')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('nested route param: undefined')
  })

  it('should render catch-all nested route with no segments and leading slash', async () => {
    const html = await next.render('/nested/')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('nested route param: undefined')
  })

  it('should match catch-all api route with multiple segments', async () => {
    const res = await next.fetch('/api/post/ab/cd')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: ['ab', 'cd'] })
  })

  it('should match catch-all api route with single segment', async () => {
    const res = await next.fetch('/api/post/a')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: ['a'] })
  })

  it('should match catch-all api route with no segments', async () => {
    const res = await next.fetch('/api/post')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
  })

  it('should match catch-all api route with no segments and leading slash', async () => {
    const res = await next.fetch('/api/post/')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
  })

  it('should handle getStaticPaths no segments', async () => {
    const html = await next.render('/get-static-paths')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp route: undefined')
  })

  it('should handle getStaticPaths no segments and trailing slash', async () => {
    const html = await next.render('/get-static-paths/')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp route: undefined')
  })

  it('should handle getStaticPaths 1 segment', async () => {
    const html = await next.render('/get-static-paths/p1')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp route: [p1]')
  })

  it('should handle getStaticPaths 1 segment and trailing slash', async () => {
    const html = await next.render('/get-static-paths/p1/')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp route: [p1]')
  })

  it('should handle getStaticPaths 2 segments', async () => {
    const html = await next.render('/get-static-paths/p2/p3')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp route: [p2|p3]')
  })

  it('should handle getStaticPaths 2 segments and trailing slash', async () => {
    const html = await next.render('/get-static-paths/p2/p3/')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp route: [p2|p3]')
  })

  it('should fall back to top-level catch-all', async () => {
    const html = await next.render('/get-static-paths/hello/world')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe(
      'top level route param: [get-static-paths|hello|world]'
    )
  })

  it('should match root path on undefined param', async () => {
    const html = await next.render('/get-static-paths-undefined')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp undefined route: undefined')
  })

  it('should match root path on false param', async () => {
    const html = await next.render('/get-static-paths-false')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp false route: undefined')
  })

  it('should match root path on null param', async () => {
    const html = await next.render('/get-static-paths-null')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp null route: undefined')
  })

  it('should handle getStaticPaths with fallback no segments', async () => {
    const html = await next.render('/get-static-paths-fallback')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe(
      'gsp fallback route: undefined is not fallback'
    )
  })

  it('should handle getStaticPaths with fallback 2 segments', async () => {
    const html = await next.render('/get-static-paths-fallback/p2/p3')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe(
      'gsp fallback route: [p2|p3] is not fallback'
    )
  })

  it('should fallback correctly when fallback enabled', async () => {
    const html = await next.render('/get-static-paths-fallback/hello/world')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp fallback route: undefined is fallback')
  })

  if (isNextDev) {
    const DUMMY_PAGE = 'export default () => null'

    it('should fail when optional route has index.js at root', async () => {
      try {
        await next.patchFile('pages/index.js', DUMMY_PAGE)
        await retry(async () => {
          expect(next.cliOutput).toMatch(
            /You cannot define a route with the same specificity as a optional catch-all route/
          )
        })
      } finally {
        await next.deleteFile('pages/index.js')
      }
    })

    it('should fail when optional route has same page at root', async () => {
      try {
        await next.patchFile('pages/nested.js', DUMMY_PAGE)
        await retry(async () => {
          expect(next.cliOutput).toMatch(
            /You cannot define a route with the same specificity as a optional catch-all route/
          )
        })
      } finally {
        await next.deleteFile('pages/nested.js')
      }
    })

    it('should fail when mixed with regular catch-all', async () => {
      try {
        await next.patchFile('pages/nested/[...param].js', DUMMY_PAGE)
        await retry(async () => {
          expect(next.cliOutput).toMatch(
            /You cannot use both .+ at the same level/
          )
        })
      } finally {
        await next.deleteFile('pages/nested/[...param].js')
      }
    })

    it('should fail when optional but no catch-all', async () => {
      try {
        await next.patchFile('pages/invalid/[[param]].js', DUMMY_PAGE)
        await retry(async () => {
          expect(next.cliOutput).toMatch(
            /Optional route parameters are not yet supported/
          )
        })
      } finally {
        await next.deleteFile('pages/invalid/[[param]].js')
      }
    })
  }
})

describe('Dynamic Optional Routing - build validation', () => {
  describe.each([
    {
      name: 'when optional route has index.js at root',
      page: 'pages/index.js',
      fixture: 'dummy-page.js',
      message:
        /You cannot define a route with the same specificity as a optional catch-all route/,
    },
    {
      name: 'when optional route has same page at root',
      page: 'pages/nested.js',
      fixture: 'dummy-page.js',
      message:
        /You cannot define a route with the same specificity as a optional catch-all route/,
    },
    {
      name: 'when mixed with regular catch-all',
      page: 'pages/nested/[...param].js',
      fixture: 'dummy-page.js',
      message: /You cannot use both .+ at the same level/,
    },
    {
      name: 'when optional but no catch-all',
      page: 'pages/invalid/[[param]].js',
      fixture: 'dummy-page.js',
      message: /Optional route parameters are not yet supported/,
    },
    {
      name: 'when param is not explicitly defined',
      page: 'pages/invalid/[[...slug]].js',
      fixture: 'missing-param.js',
      message:
        'A required parameter (slug) was not provided as an array received undefined in getStaticPaths for /invalid/[[...slug]]',
    },
  ])('$name', ({ page, fixture, message }) => {
    const { next } = nextTestSetup({
      files: {
        ...files,
        [page]: new FileRef(join(__dirname, 'fixtures', fixture)),
      },
      skipStart: true,
    })

    it('should fail to build', async () => {
      if (isNextDev) {
        // These build diagnostics also run in the dev test matrix.
        const { exitCode } = await next.build()
        expect(exitCode).toBe(1)
      } else {
        await expect(next.start()).rejects.toThrow()
      }
      expect(next.cliOutput).toMatch(message)
    }, 240_000)
  })
})
