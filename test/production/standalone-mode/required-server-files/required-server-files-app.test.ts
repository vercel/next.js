import glob from 'glob'
import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import {
  createNowRouteMatches,
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
} from 'next-test-utils'
import { ChildProcess } from 'child_process'

describe('required server files app router', () => {
  let next: NextInstance
  let server: ChildProcess
  let appPort: number | string

  const setupNext = async ({
    nextEnv,
    minimalMode,
  }: {
    nextEnv?: boolean
    minimalMode?: boolean
  }) => {
    // test build against environment with next support
    process.env.NOW_BUILDER = nextEnv ? '1' : ''
    process.env.NEXT_PRIVATE_TEST_HEADERS = '1'

    next = await createNext({
      files: {
        app: new FileRef(join(__dirname, 'app')),
        lib: new FileRef(join(__dirname, 'lib')),
        'cache-handler.js': new FileRef(join(__dirname, 'cache-handler.js')),
        'middleware.js': new FileRef(join(__dirname, 'middleware.js')),
        'data.txt': new FileRef(join(__dirname, 'data.txt')),
        '.env': new FileRef(join(__dirname, '.env')),
        '.env.local': new FileRef(join(__dirname, '.env.local')),
        '.env.production': new FileRef(join(__dirname, '.env.production')),
      },
      nextConfig: {
        cacheHandler: './cache-handler.js',
        cacheMaxMemorySize: 0,
        output: 'standalone',
      },
    })
    await next.stop()

    await fs.move(
      join(next.testDir, '.next/standalone'),
      join(next.testDir, 'standalone')
    )
    for (const file of await fs.readdir(next.testDir)) {
      if (file !== 'standalone') {
        await fs.remove(join(next.testDir, file))
        console.log('removed', file)
      }
    }
    const files = glob.sync('**/*', {
      cwd: join(next.testDir, 'standalone/.next/server/pages'),
      dot: true,
    })

    for (const file of files) {
      if (file.endsWith('.json') || file.endsWith('.html')) {
        await fs.remove(join(next.testDir, '.next/server', file))
      }
    }

    const testServer = join(next.testDir, 'standalone/server.js')
    await fs.writeFile(
      testServer,
      (await fs.readFile(testServer, 'utf8')).replace(
        'port:',
        `minimalMode: ${minimalMode},port:`
      )
    )
    appPort = await findPort()
    server = await initNextServerScript(
      testServer,
      /- Local:/,
      {
        ...process.env,
        PORT: `${appPort}`,
      },
      undefined,
      {
        cwd: next.testDir,
      }
    )
  }

  beforeAll(async () => {
    await setupNext({ nextEnv: true, minimalMode: true })
  })
  afterAll(async () => {
    delete process.env.NOW_BUILDER
    delete process.env.NEXT_PRIVATE_TEST_HEADERS
    await next.destroy()
    if (server) await killApp(server)
  })

  it('should send the right cache headers for an app route', async () => {
    const res = await fetchViaHTTP(appPort, '/api/test/123', undefined, {
      headers: {
        'x-matched-path': '/api/test/[slug]',
        'x-now-route-matches': createNowRouteMatches({
          slug: '123',
        }).toString(),
      },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('s-maxage=31536000')
  })

  it('should handle optional catchall', async () => {
    let res = await fetchViaHTTP(
      appPort,
      '/optional-catchall/[lang]/[flags]/[[...slug]]',
      undefined,
      {
        headers: {
          'x-matched-path': '/optional-catchall/[lang]/[flags]/[[...slug]]',
          'x-now-route-matches': createNowRouteMatches({
            lang: 'en',
            flags: 'flags',
            slug: 'slug',
          }).toString(),
        },
      }
    )
    expect(res.status).toBe(200)

    let html = await res.text()
    let $ = cheerio.load(html)
    expect($('body [data-lang]').text()).toBe('en')
    expect($('body [data-slug]').text()).toBe('slug')

    res = await fetchViaHTTP(
      appPort,
      '/optional-catchall/[lang]/[flags]/[[...slug]]',
      undefined,
      {
        headers: {
          'x-matched-path': '/optional-catchall/[lang]/[flags]/[[...slug]]',
          'x-now-route-matches': createNowRouteMatches({
            lang: 'en',
            flags: 'flags',
          }).toString(),
        },
      }
    )
    expect(res.status).toBe(200)

    html = await res.text()
    $ = cheerio.load(html)
    expect($('body [data-lang]').text()).toBe('en')
    expect($('body [data-flags]').text()).toBe('flags')
    expect($('body [data-slug]').text()).toBe('')
  })

  it('should send the right cache headers for an app page', async () => {
    const res = await fetchViaHTTP(appPort, '/test/123', undefined, {
      headers: {
        'x-matched-path': '/test/[slug]',
        'x-now-route-matches': createNowRouteMatches({
          slug: '123',
        }).toString(),
      },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe(
      's-maxage=3600, stale-while-revalidate=31532400'
    )
  })

  it('should not fail caching', async () => {
    expect(next.cliOutput).not.toContain('ERR_INVALID_URL')
  })

  it('should properly handle prerender for bot request', async () => {
    const res = await fetchViaHTTP(appPort, '/isr/first', undefined, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.179 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'x-matched-path': '/isr/first',
      },
    })

    expect(res.status).toBe(200)
    const html = await res.text()
    const $ = cheerio.load(html)

    expect($('#page').text()).toBe('/isr/[slug]')

    const rscRes = await fetchViaHTTP(appPort, '/isr/first.rsc', undefined, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.179 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'x-matched-path': '/isr/first',
      },
    })

    expect(rscRes.status).toBe(200)
  })

  it('should properly handle fallback for bot request', async () => {
    const res = await fetchViaHTTP(appPort, '/isr/[slug]', undefined, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.179 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'x-now-route-matches': createNowRouteMatches({
          slug: 'new',
        }).toString(),
        'x-matched-path': '/isr/[slug]',
      },
    })

    expect(res.status).toBe(200)
    const html = await res.text()
    const $ = cheerio.load(html)

    expect($('#page').text()).toBe('/isr/[slug]')

    const rscRes = await fetchViaHTTP(appPort, '/isr/[slug].rsc', undefined, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.5735.179 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'x-now-route-matches': createNowRouteMatches({
          slug: 'new',
        }).toString(),
        'x-matched-path': '/isr/[slug]',
      },
    })

    expect(rscRes.status).toBe(200)
  })

  it('should send cache tags in minimal mode for ISR', async () => {
    for (const [path, tags] of [
      [
        '/isr/first',
        '_N_T_/layout,_N_T_/isr/layout,_N_T_/isr/[slug]/layout,_N_T_/isr/[slug]/page,_N_T_/isr/first,isr-page',
      ],
      [
        '/isr/second',
        '_N_T_/layout,_N_T_/isr/layout,_N_T_/isr/[slug]/layout,_N_T_/isr/[slug]/page,_N_T_/isr/second,isr-page',
      ],
      [
        '/api/isr/first',
        '_N_T_/layout,_N_T_/api/layout,_N_T_/api/isr/layout,_N_T_/api/isr/[slug]/layout,_N_T_/api/isr/[slug]/route,_N_T_/api/isr/first,isr-page',
      ],
      [
        '/api/isr/second',
        '_N_T_/layout,_N_T_/api/layout,_N_T_/api/isr/layout,_N_T_/api/isr/[slug]/layout,_N_T_/api/isr/[slug]/route,_N_T_/api/isr/second,isr-page',
      ],
    ]) {
      require('console').error('checking', { path, tags })
      const res = await fetchViaHTTP(appPort, path, undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('x-next-cache-tags')).toBe(tags)
    }
  })

  it('should not send cache tags in minimal mode for SSR', async () => {
    for (const path of [
      '/ssr/first',
      '/ssr/second',
      '/api/ssr/first',
      '/api/ssr/second',
    ]) {
      const res = await fetchViaHTTP(appPort, path, undefined, {
        redirect: 'manual',
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('x-next-cache-tags')).toBeFalsy()
    }
  })

  it('should not send invalid soft tags to cache handler', async () => {
    for (const path of [
      '/ssr/first',
      '/ssr/second',
      '/api/ssr/first',
      '/api/ssr/second',
    ]) {
      const res = await fetchViaHTTP(
        appPort,
        path,
        { hello: 'world' },
        {
          redirect: 'manual',
        }
      )
      expect(res.status).toBe(200)
      expect(res.headers.get('x-next-cache-tags')).toBeFalsy()
    }
  })

  it('should not override params with query params', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/search/[key]',
      { key: 'searchParams', nxtPkey: 'params' },
      {
        headers: {
          'x-matched-path': '/search/[key]',
        },
      }
    )

    const html = await res.text()
    const $ = cheerio.load(html)
    expect($('dd[data-params]').text()).toBe('params')
    expect($('dd[data-searchParams]').text()).toBe('searchParams')
  })
})
