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
  let delayedPostpone
  let rewritePostpone

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
        experimental: {
          ppr: true,
        },
        eslint: {
          ignoreDuringBuilds: true,
        },
        output: 'standalone',
      },
    })
    await next.stop()

    delayedPostpone = (await next.readJSON('.next/server/app/delayed.meta'))
      .postponed
    rewritePostpone = (
      await next.readJSON('.next/server/app/rewrite/first-cookie.meta')
    ).postponed

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
    delete process.env.NEXT_PRIVATE_TEST_HEADERS
    await next.destroy()
    if (server) await killApp(server)
  })

  it('should not fail caching', async () => {
    expect(next.cliOutput).not.toContain('ERR_INVALID_URL')
  })

  it('should properly stream resume with Next-Resume', async () => {
    const res = await fetchViaHTTP(appPort, '/delayed', undefined, {
      headers: {
        'x-matched-path': '/delayed',
        'next-resume': '1',
      },
      method: 'POST',
      body: delayedPostpone,
    })

    expect(res.status).toBe(200)

    let chunks = []

    for await (const chunk of res.body) {
      chunks.push({
        time: Date.now(),
        chunk: chunk.toString(),
      })
    }

    const firstSuspense = chunks.find((item) => item.chunk.includes('time'))
    const secondSuspense = chunks.find((item) => item.chunk.includes('random'))

    console.log({
      firstSuspense,
      secondSuspense,
    })

    expect(secondSuspense.time - firstSuspense.time).toBeGreaterThanOrEqual(
      2 * 1000
    )
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

  describe('middleware rewrite', () => {
    it('should work with a dynamic path with Next-Resume', async () => {
      const res = await fetchViaHTTP(
        appPort,
        '/rewrite-with-cookie',
        undefined,
        {
          method: 'POST',
          headers: {
            'x-matched-path': '/rewrite/first-cookie',
            'next-resume': '1',
          },
          body: rewritePostpone,
        }
      )

      expect(res.status).toBe(200)
      const html = await res.text()
      const $ = cheerio.load(html)

      expect($('#page').text()).toBe('/rewrite/[slug]')
      expect($('#params').text()).toBe(JSON.stringify({ slug: 'first-cookie' }))
    })
  })

  it('should still render when postponed is corrupted with Next-Resume', async () => {
    const random = Math.random().toString(36).substring(2)

    const res = await fetchViaHTTP(appPort, '/dyn/' + random, undefined, {
      method: 'POST',
      headers: {
        'x-matched-path': '/dyn/[slug]',
        'next-resume': '1',
      },
      // This is a corrupted postponed JSON payload.
      body: '{',
    })

    expect(res.status).toBe(200)

    const html = await res.text()

    // Expect that the closing HTML tag is still present, indicating a
    // successful render.
    expect(html).toContain('</html>')
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

  it('should handle RSC requests', async () => {
    const res = await fetchViaHTTP(appPort, '/dyn/first.rsc', undefined, {
      headers: {
        'x-matched-path': '/dyn/[slug]',
      },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toEqual('text/x-component')
    expect(res.headers.has('x-nextjs-postponed')).toBeFalse()
  })

  it('should handle prefetch RSC requests', async () => {
    const res = await fetchViaHTTP(
      appPort,
      '/dyn/first.prefetch.rsc',
      undefined,
      {
        headers: {
          'x-matched-path': '/dyn/[slug]',
        },
      }
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toEqual('text/x-component')
    expect(res.headers.has('x-nextjs-postponed')).toBeTrue()
  })

  it('should handle revalidating the fallback page', async () => {
    const res = await fetchViaHTTP(appPort, '/postpone/isr/[slug]', undefined, {
      headers: {
        'x-matched-path': '/postpone/isr/[slug]',
        // We don't include the `x-now-route-matches` header because we want to
        // test that the fallback route params are correctly set.
      },
    })

    expect(res.status).toBe(200)

    const html = await res.text()

    expect(html).not.toContain('</html>')

    const $ = cheerio.load(html)

    expect($('#page').text()).toBeEmpty()
    expect($('#params').text()).toBeEmpty()
    expect($('#now').text()).toBeEmpty()
    expect($('#loading').text()).toBe('/postpone/isr/[slug]')
  })
})
