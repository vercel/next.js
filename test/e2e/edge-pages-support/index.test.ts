import { nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP, normalizeRegEx } from 'next-test-utils'
import cheerio from 'cheerio'
import { join } from 'path'
import escapeStringRegexp from 'escape-string-regexp'
import fs from 'fs-extra'

describe('edge-render-getserversideprops', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'app'),
  })

  if ((global as any).isNextStart) {
    // Turbopack doesn't have entry chunks for edge routes like Webpack does, so there is no fixed
    // known path where the nft file would be written to.
    ;(process.env.IS_TURBOPACK_TEST ? it.skip : it)(
      'should not output trace files for edge routes',
      async () => {
        /* eslint-disable jest/no-standalone-expect */
        expect(await fs.pathExists(join(next.testDir, '.next/pages'))).toBe(
          false
        )
        expect(
          await fs.pathExists(join(next.testDir, '.next/server/pages/[id].js'))
        ).toBe(true)
        expect(
          await fs.pathExists(
            join(next.testDir, '.next/server/pages/[id].js.nft.json')
          )
        ).toBe(false)
        expect(
          await fs.pathExists(join(next.testDir, '.next/server/pages/index.js'))
        ).toBe(true)
        expect(
          await fs.pathExists(
            join(next.testDir, '.next/server/pages/index.js.nft.json')
          )
        ).toBe(false)
        /* eslint-enable jest/no-standalone-expect */
      }
    )
  }

  it('should have correct query for pages/api', async () => {
    const res = await fetchViaHTTP(next.url, '/api/hello', { a: 'b' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      hello: 'world',
      query: {
        a: 'b',
      },
    })
  })

  it('should have correct query for pages/api dynamic', async () => {
    const res = await fetchViaHTTP(next.url, '/api/id-1', { a: 'b' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      hello: 'again',
      query: {
        a: 'b',
        id: 'id-1',
      },
    })
  })

  it('should have correct query/params on index', async () => {
    const res = await fetchViaHTTP(next.url, '/')
    expect(res.status).toBe(200)
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('#page').text()).toBe('/index')
    const props = JSON.parse($('#props').text())
    expect(props.query).toEqual({})
    expect(props.params).toBe(null)
    expect(props.url).toBe('/')
  })

  it('should have correct query/params on /[id]', async () => {
    const res = await fetchViaHTTP(next.url, '/123', { hello: 'world' })
    expect(res.status).toBe(200)
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('#page').text()).toBe('/[id]')
    const props = JSON.parse($('#props').text())
    expect(props.query).toEqual({ id: '123', hello: 'world' })
    expect(props.params).toEqual({ id: '123' })
    expect(props.url).toBe('/123?hello=world')
  })

  it('should have correct query/params on rewrite', async () => {
    const res = await fetchViaHTTP(next.url, '/rewrite-me', {
      hello: 'world',
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('#page').text()).toBe('/index')
    const props = JSON.parse($('#props').text())
    expect(props.query).toEqual({ hello: 'world' })
    expect(props.params).toEqual(null)
    expect(props.url).toBe('/rewrite-me?hello=world')
  })

  it('should have correct query/params on dynamic rewrite', async () => {
    const res = await fetchViaHTTP(next.url, '/rewrite-me-dynamic', {
      hello: 'world',
    })
    expect(res.status).toBe(200)
    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('#page').text()).toBe('/[id]')
    const props = JSON.parse($('#props').text())
    expect(props.query).toEqual({ id: 'first', hello: 'world' })
    expect(props.params).toEqual({ id: 'first' })
    expect(props.url).toBe('/rewrite-me-dynamic?hello=world')
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
            `^/_next/data/${escapeStringRegexp(next.buildId)}/index\\.json$`
          ),
          page: '/',
        },
        {
          dataRouteRegex: normalizeRegEx(
            `^/_next/data/${escapeStringRegexp(next.buildId)}/([^/]+?)\\.json$`
          ),
          namedDataRouteRegex: `^/_next/data/${escapeStringRegexp(
            next.buildId
          )}/(?<nxtPid>[^/]+?)\\.json$`,
          page: '/[id]',
          routeKeys: {
            nxtPid: 'nxtPid',
          },
        },
      ])
    })
  }
})
