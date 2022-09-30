import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP, normalizeRegEx, renderViaHTTP } from 'next-test-utils'
import cheerio from 'cheerio'
import { join } from 'path'
import escapeStringRegexp from 'escape-string-regexp'

describe('edge-render-getserversideprops', () => {
  let next: NextInstance

  if (process.env.NEXT_TEST_REACT_VERSION === '^17') {
    it('should skip for react v17', () => {})
    return
  }

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(join(__dirname, 'app')),
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should have correct query/params on index', async () => {
    const html = await renderViaHTTP(next.url, '/')
    const $ = cheerio.load(html)
    expect($('#page').text()).toBe('/index')
    const props = JSON.parse($('#props').text())
    expect(props.query).toEqual({})
    expect(props.params).toBe(null)
  })

  it('should have correct query/params on /[id]', async () => {
    const html = await renderViaHTTP(next.url, '/123', { hello: 'world' })
    const $ = cheerio.load(html)
    expect($('#page').text()).toBe('/[id]')
    const props = JSON.parse($('#props').text())
    expect(props.query).toEqual({ id: '123', hello: 'world' })
    expect(props.params).toEqual({ id: '123' })
  })

  it('should respond to _next/data for index correctly', async () => {
    const res = await fetchViaHTTP(
      next.url,
      `/_next/data/${next.buildId}/index.json`,
      undefined,
      {
        headers: {
          'x-nextjs-data': '1',
        },
      }
    )
    expect(res.status).toBe(200)
    const { pageProps: props } = await res.json()
    expect(props.query).toEqual({})
    expect(props.params).toBe(null)
  })

  it('should respond to _next/data for [id] correctly', async () => {
    const res = await fetchViaHTTP(
      next.url,
      `/_next/data/${next.buildId}/321.json`,
      { hello: 'world' },
      {
        headers: {
          'x-nextjs-data': '1',
        },
      }
    )
    expect(res.status).toBe(200)
    const { pageProps: props } = await res.json()
    expect(props.query).toEqual({ id: '321', hello: 'world' })
    expect(props.params).toEqual({ id: '321' })
  })

  if ((global as any).isNextStart) {
    it('should have data routes in routes-manifest', async () => {
      const manifest = JSON.parse(
        await next.readFile('.next/routes-manifest.json')
      )

      for (const route of manifest.dataRoutes) {
        route.dataRouteRegex = normalizeRegEx(route.dataRouteRegex)
      }

      expect(manifest.dataRoutes).toEqual([
        {
          dataRouteRegex: normalizeRegEx(
            `^/_next/data/${escapeStringRegexp(next.buildId)}/index.json$`
          ),
          page: '/',
        },
        {
          dataRouteRegex: normalizeRegEx(
            `^/_next/data/${escapeStringRegexp(next.buildId)}/([^/]+?)\\.json$`
          ),
          namedDataRouteRegex: `^/_next/data/${escapeStringRegexp(
            next.buildId
          )}/(?<id>[^/]+?)\\.json$`,
          page: '/[id]',
          routeKeys: {
            id: 'id',
          },
        },
      ])
    })
  }
})
