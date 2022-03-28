/* eslint-env jest */

import { join } from 'path'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)
const context = {}
context.appDir = join(__dirname, '../')

describe('Middleware dynamic tests', () => {
  describe('dev mode', () => {
    beforeAll(async () => {
      context.appPort = await findPort()
      context.app = await launchApp(context.appDir, context.appPort)
    })
    afterAll(() => killApp(context.app))
    runTests()
    runTests('/fr')
  })
  describe('production mode', () => {
    beforeAll(async () => {
      await nextBuild(context.appDir)

      context.appPort = await findPort()
      context.app = await nextStart(context.appDir, context.appPort)
    })
    afterAll(() => killApp(context.app))
    runTests()
    runTests('/fr')
  })
})

function runTests(localePath = '') {
  const locale = localePath.slice(1)

  function fetch(path) {
    return fetchViaHTTP(context.appPort, `${localePath}${path}`)
  }

  it(`${localePath} should validate request url parameters from the root route`, async () => {
    const res = await fetch('/')
    expect(res.headers.get('req-url-pathname')).toBe('/')
    expect(res.headers.get('req-url-params')).toBeNull()
    expect(res.headers.get('req-url-query')).toBe('{}')
    expect(res.headers.get('x-slug-path')).toBeNull()
    if (locale !== '') {
      expect(res.headers.get('req-url-locale')).toBe(locale)
    }
  })

  it(`${localePath} should validate request url parameters from a static route`, async () => {
    const res = await fetch('/static')
    expect(res.headers.get('req-url-pathname')).toBe('/static')
    expect(res.headers.get('req-url-params')).toBeNull()
    expect(res.headers.get('req-url-query')).toBe('{}')
    expect(res.headers.get('x-slug-path')).toBeNull()
    if (locale !== '') {
      expect(res.headers.get('req-url-locale')).toBe(locale)
    }
  })

  it(`${localePath} should validate request url parameters from a dir route`, async () => {
    const res = await fetch('/dir')
    expect(res.headers.get('req-url-pathname')).toBe('/dir')
    expect(res.headers.get('req-url-params')).toBeNull()
    expect(res.headers.get('req-url-query')).toBe('{}')
    expect(res.headers.get('x-dir-path')).toBe('true')
    expect(res.headers.get('x-slug-path')).toBeNull()
    if (locale !== '') {
      expect(res.headers.get('req-url-locale')).toBe(locale)
    }
  })

  it(`${localePath} should validate request url parameters from a dynamic route`, async () => {
    const res = await fetch('/asdf')
    expect(res.headers.get('req-url-pathname')).toBe('/asdf')
    expect(res.headers.get('req-url-params')).toBe('{"slug":"asdf"}')
    expect(res.headers.get('req-url-page')).toBe('/[slug]')
    expect(res.headers.get('req-url-query')).toBe('{}')
    expect(res.headers.get('x-api-path')).toBeNull()
    expect(res.headers.get('x-dir-path')).toBeNull()
    expect(res.headers.get('x-slug-path')).toBe('true')
    expect(res.headers.get('x-slug-id-path')).toBeNull()
    if (locale !== '') {
      expect(res.headers.get('req-url-locale')).toBe(locale)
    }
  })

  it(`${localePath} should validate request url parameters from a dynamic route with query`, async () => {
    const res = await fetch('/asdf?foo=bar')
    expect(res.headers.get('req-url-pathname')).toBe('/asdf')
    expect(res.headers.get('req-url-params')).toBe('{"slug":"asdf"}')
    expect(res.headers.get('req-url-page')).toBe('/[slug]')
    expect(res.headers.get('req-url-query')).toBe('{"foo":"bar"}')
    expect(res.headers.get('x-api-path')).toBeNull()
    expect(res.headers.get('x-dir-path')).toBeNull()
    expect(res.headers.get('x-slug-path')).toBe('true')
    expect(res.headers.get('x-slug-id-path')).toBeNull()
    if (locale !== '') {
      expect(res.headers.get('req-url-locale')).toBe(locale)
    }
  })

  it(`${localePath} should validate request url parameters from a route on dynamic dir`, async () => {
    const res = await fetch('/asdf/static')
    expect(res.headers.get('req-url-pathname')).toBe('/asdf/static')
    expect(res.headers.get('req-url-params')).toBe('{"slug":"asdf"}')
    expect(res.headers.get('req-url-page')).toBe('/[slug]/static')
    expect(res.headers.get('req-url-query')).toBe('{}')
    expect(res.headers.get('x-api-path')).toBeNull()
    expect(res.headers.get('x-dir-path')).toBeNull()
    expect(res.headers.get('x-slug-path')).toBe('true')
    expect(res.headers.get('x-slug-id-path')).toBeNull()
    if (locale !== '') {
      expect(res.headers.get('req-url-locale')).toBe(locale)
    }
  })

  it(`${localePath} should validate request url parameters from a route on dynamic dir with static name`, async () => {
    const res = await fetch('/static/static')
    expect(res.headers.get('req-url-pathname')).toBe('/static/static')
    expect(res.headers.get('req-url-params')).toBe('{"slug":"static"}')
    expect(res.headers.get('req-url-page')).toBe('/[slug]/static')
    expect(res.headers.get('req-url-query')).toBe('{}')
    expect(res.headers.get('x-api-path')).toBeNull()
    expect(res.headers.get('x-dir-path')).toBeNull()
    expect(res.headers.get('x-slug-path')).toBe('true')
    expect(res.headers.get('x-slug-id-path')).toBeNull()
    if (locale !== '') {
      expect(res.headers.get('req-url-locale')).toBe(locale)
    }
  })

  it(`${localePath} should validate request url parameters from a route on dynamic dir with static dir name`, async () => {
    const res = await fetch('/dir/static')
    expect(res.headers.get('req-url-pathname')).toBe('/dir/static')
    expect(res.headers.get('req-url-params')).toBe('{"slug":"dir"}')
    expect(res.headers.get('req-url-page')).toBe('/[slug]/static')
    expect(res.headers.get('req-url-query')).toBe('{}')
    expect(res.headers.get('x-api-path')).toBeNull()
    expect(res.headers.get('x-dir-path')).toBe('true')
    expect(res.headers.get('x-slug-path')).toBe('true')
    expect(res.headers.get('x-slug-id-path')).toBeNull()
    if (locale !== '') {
      expect(res.headers.get('req-url-locale')).toBe(locale)
    }
  })

  it(`${localePath} should validate request url parameters from a nested dynamic route`, async () => {
    const res = await fetch('/foo/bar')
    expect(res.headers.get('req-url-pathname')).toBe('/foo/bar')
    expect(res.headers.get('req-url-params')).toBe('{"slug":"foo","id":"bar"}')
    expect(res.headers.get('req-url-page')).toBe('/[slug]/[id]')
    expect(res.headers.get('req-url-query')).toBe('{}')
    expect(res.headers.get('x-api-path')).toBeNull()
    expect(res.headers.get('x-dir-path')).toBeNull()
    expect(res.headers.get('x-slug-path')).toBe('true')
    expect(res.headers.get('x-slug-id-path')).toBe('true')
    if (locale !== '') {
      expect(res.headers.get('req-url-locale')).toBe(locale)
    }
  })

  it(`${localePath} should validate request url parameters from a nested dynamic route with static dir name`, async () => {
    const res = await fetch('/dir/asdf')
    expect(res.headers.get('req-url-pathname')).toBe('/dir/asdf')
    expect(res.headers.get('req-url-params')).toBe('{"slug":"dir","id":"asdf"}')
    expect(res.headers.get('req-url-page')).toBe('/[slug]/[id]')
    expect(res.headers.get('req-url-query')).toBe('{}')
    expect(res.headers.get('x-api-path')).toBeNull()
    expect(res.headers.get('x-dir-path')).toBe('true')
    expect(res.headers.get('x-slug-path')).toBe('true')
    expect(res.headers.get('x-slug-id-path')).toBe('true')
    if (locale !== '') {
      expect(res.headers.get('req-url-locale')).toBe(locale)
    }
  })

  it(`${localePath} should validate request url parameters from a nested non-existing route`, async () => {
    const res = await fetch('/foo/bar/not-exist')
    expect(res.headers.get('req-url-pathname')).toBe('/foo/bar/not-exist')
    expect(res.headers.get('req-url-params')).toBeNull()
    expect(res.headers.get('req-url-page')).toBeNull()
    expect(res.headers.get('req-url-query')).toBe('{}')
    expect(res.headers.get('x-api-path')).toBeNull()
    expect(res.headers.get('x-dir-path')).toBeNull()
    expect(res.headers.get('x-slug-path')).toBe('true')
    expect(res.headers.get('x-slug-id-path')).toBe('true')
    if (locale !== '') {
      expect(res.headers.get('req-url-locale')).toBe(locale)
    }
  })

  it(`${localePath} should validate request url parameters from a catch all route`, async () => {
    const res = await fetch('/catch-all/foo/bar')
    expect(res.headers.get('req-url-pathname')).toBe('/catch-all/foo/bar')
    expect(res.headers.get('req-url-params')).toBe('{"rest":["foo","bar"]}')
    expect(res.headers.get('req-url-page')).toBe('/catch-all/[...rest]')
    expect(res.headers.get('req-url-query')).toBe('{}')
    expect(res.headers.get('x-api-path')).toBeNull()
    expect(res.headers.get('x-dir-path')).toBeNull()
    expect(res.headers.get('x-slug-path')).toBeNull()
    expect(res.headers.get('x-slug-id-path')).toBeNull()
    expect(res.headers.get('x-catch-all-path')).toBe('true')
    if (locale !== '') {
      expect(res.headers.get('req-url-locale')).toBe(locale)
    }
  })

  it(`${localePath} should validate request url parameters from an optional catch all route`, async () => {
    const res = await fetch('/optional-catch-all/foo/bar')
    expect(res.headers.get('req-url-pathname')).toBe(
      '/optional-catch-all/foo/bar'
    )
    expect(res.headers.get('req-url-params')).toBe('{"rest":["foo","bar"]}')
    expect(res.headers.get('req-url-page')).toBe(
      '/optional-catch-all/[[...rest]]'
    )
    expect(res.headers.get('req-url-query')).toBe('{}')
    expect(res.headers.get('x-api-path')).toBeNull()
    expect(res.headers.get('x-dir-path')).toBeNull()
    expect(res.headers.get('x-slug-path')).toBeNull()
    expect(res.headers.get('x-slug-id-path')).toBeNull()
    expect(res.headers.get('x-optional-catch-all-path')).toBe('true')
    if (locale !== '') {
      expect(res.headers.get('req-url-locale')).toBe(locale)
    }
  })

  if (!localePath) {
    it('should validate request url parameters from a _next route', async () => {
      const res = await fetch('/_next/static/some-file.js')
      expect(res.headers.get('req-url-pathname')).toBeNull()
      expect(res.headers.get('req-url-params')).toBeNull()
      expect(res.headers.get('req-url-page')).toBeNull()
      expect(res.headers.get('req-url-query')).toBeNull()
      expect(res.headers.get('x-api-path')).toBeNull()
      expect(res.headers.get('x-dir-path')).toBeNull()
      expect(res.headers.get('x-slug-path')).toBeNull()
      expect(res.headers.get('x-slug-id-path')).toBeNull()
    })

    it('should validate request url parameters from a api route', async () => {
      const res = await fetch('/api')
      expect(res.headers.get('req-url-pathname')).toBe('/api')
      expect(res.headers.get('req-url-params')).toBeNull()
      expect(res.headers.get('req-url-query')).toBe('{}')
      expect(res.headers.get('x-api-path')).toBe('true')
      expect(res.headers.get('x-dir-path')).toBeNull()
      expect(res.headers.get('x-slug-path')).toBeNull()
    })

    it('should validate request url parameters from a api route with query', async () => {
      const res = await fetch('/api?foo=bar')
      expect(res.headers.get('req-url-pathname')).toBe('/api')
      expect(res.headers.get('req-url-params')).toBeNull()
      expect(res.headers.get('req-url-query')).toBe('{"foo":"bar"}')
      expect(res.headers.get('x-api-path')).toBe('true')
      expect(res.headers.get('x-dir-path')).toBeNull()
      expect(res.headers.get('x-slug-path')).toBeNull()
    })

    it('should validate request url parameters from a non-existing api route', async () => {
      const res = await fetch('/api/not-exist')
      expect(res.headers.get('req-url-pathname')).toBe('/api/not-exist')
      expect(res.headers.get('req-url-params')).toBeNull()
      expect(res.headers.get('req-url-query')).toBe('{}')
      expect(res.headers.get('x-api-path')).toBe('true')
      expect(res.headers.get('x-dir-path')).toBeNull()
      expect(res.headers.get('x-slug-path')).toBeNull()
      expect(res.headers.get('x-slug-id-path')).toBeNull()
    })

    it('should validate request url parameters from a non-existing api route with query', async () => {
      const res = await fetch('/api/not-exist?foo=bar')
      expect(res.headers.get('req-url-pathname')).toBe('/api/not-exist')
      expect(res.headers.get('req-url-params')).toBeNull()
      expect(res.headers.get('req-url-query')).toBe('{"foo":"bar"}')
      expect(res.headers.get('x-api-path')).toBe('true')
      expect(res.headers.get('x-dir-path')).toBeNull()
      expect(res.headers.get('x-slug-path')).toBeNull()
      expect(res.headers.get('x-slug-id-path')).toBeNull()
    })

    it('should validate request url parameters from a public route', async () => {
      const res = await fetch('/robots.txt')
      expect(res.headers.get('req-url-pathname')).toBe('/robots.txt')

      // This does not work as expected now
      // see: https://github.com/vercel/next.js/issues/31721
      // expect(res.headers.get('req-url-params')).toBeNull()

      expect(res.headers.get('req-url-query')).toBe('{}')
      expect(res.headers.get('x-api-path')).toBeNull()
      expect(res.headers.get('x-dir-path')).toBeNull()
      expect(res.headers.get('x-slug-path')).toBeNull()
      expect(res.headers.get('x-slug-id-path')).toBeNull()
    })
  }
}
