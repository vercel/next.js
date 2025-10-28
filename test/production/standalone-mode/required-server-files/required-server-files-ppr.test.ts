import fs from 'node:fs/promises'
import { join } from 'node:path'
import cheerio from 'cheerio'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import {
  createNowRouteMatches,
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
  retry,
} from 'next-test-utils'
import { ChildProcess } from 'node:child_process'

// TODO(NAR-423): Migrate to Cache Components.
describe.skip('required server files app router', () => {
  let next: NextInstance
  let server: ChildProcess
  let appPort: number | string
  let delayedPostpone: string
  let rewritePostpone: string
  let secondCookiePostpone: string
  let secondCookieHTML: string
  let cliOutput = ''

  beforeAll(async () => {
    process.env.NOW_BUILDER = '1'
    process.env.NEXT_PRIVATE_TEST_HEADERS = '1'
    process.env.NEXT_PRIVATE_DEBUG_CACHE_ENTRY_HANDLERS =
      './cache-entry-handlers.js'

    // Setup the Next.js app and build it.
    next = await createNext({
      files: {
        app: new FileRef(join(__dirname, 'app')),
        'pages/catch-all/[[...rest]].js': new FileRef(
          join(__dirname, 'pages', 'catch-all', '[[...rest]].js')
        ),
        lib: new FileRef(join(__dirname, 'lib')),
        'cache-handler.js': new FileRef(join(__dirname, 'cache-handler.js')),
        'middleware.js': new FileRef(join(__dirname, 'middleware.js')),
        'data.txt': new FileRef(join(__dirname, 'data.txt')),
        '.env': new FileRef(join(__dirname, '.env')),
        '.env.local': new FileRef(join(__dirname, '.env.local')),
        '.env.production': new FileRef(join(__dirname, '.env.production')),
        'cache-entry-handlers.js': new FileRef(
          join(__dirname, 'cache-entry-handlers.js')
        ),
      },
      overrideFiles: {
        'app/not-found.js': new FileRef(
          join(__dirname, 'ppr', 'app', 'not-found.js')
        ),
      },
      nextConfig: {
        cacheHandler: './cache-handler.js',
        experimental: {
          cacheComponents: true,
          clientSegmentCache: true,
        },
        output: 'standalone',
      },
    })

    // Stop the server, we're going to restart it using the standalone server
    // below after some cleanup.
    await next.stop()

    // Read the postponed state and the HTML that was generated at build time
    // from the output of the build.
    delayedPostpone = (await next.readJSON('.next/server/app/delayed.meta'))
      .postponed
    rewritePostpone = (
      await next.readJSON('.next/server/app/rewrite/first-cookie.meta')
    ).postponed
    secondCookiePostpone = (
      await next.readJSON('.next/server/app/rewrite/second-cookie.meta')
    ).postponed
    secondCookieHTML = await next.readFile(
      '.next/server/app/rewrite/second-cookie.html'
    )

    await fs.rename(
      join(next.testDir, '.next/standalone'),
      join(next.testDir, 'standalone')
    )

    const serverFilePath = join(next.testDir, 'standalone/server.js')

    // We're going to use the minimal mode for the server.
    await fs.writeFile(
      serverFilePath,
      (await fs.readFile(serverFilePath, 'utf8')).replace(
        'port:',
        `minimalMode: true, port:`
      )
    )

    // Find a port to use for the server.
    appPort = await findPort()

    // Then we can start the server with the new environment variables.
    server = await initNextServerScript(
      serverFilePath,
      /- Local:/,
      {
        ...process.env,
        __NEXT_TEST_MODE: 'e2e',
        PORT: `${appPort}`,
        NEXT_PRIVATE_DEBUG_CACHE: '1',
      },
      undefined,
      {
        cwd: next.testDir,
        onStderr(data) {
          cliOutput += data
        },
        onStdout(data) {
          cliOutput += data
        },
      }
    )
  })

  afterAll(async () => {
    delete process.env.NOW_BUILDER
    delete process.env.NEXT_PRIVATE_TEST_HEADERS
    delete process.env.NEXT_PRIVATE_DEBUG_CACHE_ENTRY_HANDLERS
    await next.destroy()
    if (server) await killApp(server)
  })

  it('should not fail caching', async () => {
    expect(next.cliOutput).not.toContain('ERR_INVALID_URL')
  })

  it('should de-dupe client segment tree revalidate requests', async () => {
    const { segmentPaths } = await next.readJSON(
      'standalone/.next/server/app/isr/first.meta'
    )
    const outputIdx = cliOutput.length

    for (const segmentPath of segmentPaths) {
      const outputSegmentPath =
        join('/isr/[slug].segments', segmentPath) + '.segment.rsc'

      require('console').error('requesting', outputSegmentPath)

      const res = await fetchViaHTTP(appPort, outputSegmentPath, undefined, {
        headers: {
          'x-matched-path': '/isr/[slug].segments/_tree.segment.rsc',
          'x-now-route-matches': createNowRouteMatches({
            slug: 'first',
          }).toString(),
        },
      })

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('text/x-component')

      // We expect that because we're performing a segment prefetch, we
      // shouldn't even get to the cache entry handler.
      expect(res.headers.has('x-nextjs-cache-entry-handler')).toBe(false)
    }

    expect(
      cliOutput.substring(outputIdx).match(/rendering \/isr\/\[slug\]/g).length
    ).toBe(1)
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

    // We expect that because we're performing a resume, we should be a miss.
    expect(res.headers.get('x-nextjs-cache-entry-handler')).toBe('MISS_2')

    let chunks = []

    for await (const chunk of res.body) {
      chunks.push({
        time: Date.now(),
        chunk: chunk.toString(),
      })
    }

    const firstSuspense = chunks.find((item) => item.chunk.includes('time'))
    const secondSuspense = chunks.find((item) => item.chunk.includes('random'))

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

  it('should properly handle resume request that looks like a data request', async () => {
    const metadata = await next.readJSON('.next/server/app/[...catchAll].meta')
    const postponed = metadata.postponed

    const res = await fetchViaHTTP(
      appPort,
      // The pathname here represents a route that doesn't actually exist, but
      // we want to simulate a pages route Link that performs a prefetch to a
      // route backed by PPR.
      `/_next/data/${next.buildId}/index.json`,
      undefined,
      {
        method: 'POST',
        headers: {
          'x-matched-path': '/[...catchAll]',
          'x-now-route-matches': createNowRouteMatches({
            catchAll: `_next/data/${next.buildId}/index.json`,
          }).toString(),
          'next-resume': '1',
        },
        body: postponed,
      }
    )

    // Expect that the status code is 422, we asked for a /_next/data route and
    // also indicated that we wanted to resume a PPR render (which is
    // impossible).
    expect(res.status).toBe(422)

    // We expect that because we have a short-circuit for these unprocessable
    // requests, we should not have a cache entry handler header because it
    // should never get reached.
    expect(res.headers.has('x-nextjs-cache-entry-handler')).toBe(false)

    // Expect that the response body is empty.
    const html = await res.text()
    expect(html).toBeEmpty()
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

      // We expect that because we're performing a resume, we should be a miss.
      expect(res.headers.get('x-nextjs-cache-entry-handler')).toBe('MISS_2')

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

    // We expect that because we're performing a resume, we should be a miss.
    expect(res.headers.get('x-nextjs-cache-entry-handler')).toBe('MISS_2')

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

      if (!path.startsWith('/api')) {
        // We expect that because these aren't ISR'ed, they should all be a
        // hit!
        expect(res.headers.get('x-nextjs-cache-entry-handler')).toBe('HIT_2')
      }
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

      if (!path.startsWith('/api')) {
        // We expect that because these aren't SSR'ed, they should all be a
        // miss.
        expect(res.headers.get('x-nextjs-cache-entry-handler')).toBe('MISS_1')
      }
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

      if (!path.startsWith('/api')) {
        // We expect that because these aren't SSR'ed, they should all be a
        // miss.
        expect(res.headers.get('x-nextjs-cache-entry-handler')).toBe('MISS_1')
      }
    }
  })

  it('should handle RSC requests', async () => {
    const res = await fetchViaHTTP(appPort, '/dyn/first.rsc', undefined, {
      headers: {
        'x-matched-path': '/dyn/[slug]',
        'x-now-route-matches': createNowRouteMatches({
          slug: 'first',
        }).toString(),
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
          'x-now-route-matches': createNowRouteMatches({
            slug: 'first',
          }).toString(),
        },
      }
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toEqual('text/x-component')
    expect(res.headers.has('x-nextjs-postponed')).toBeTrue()

    // We expect that because we're performing a prefetch, we should be a miss
    // because it isn't handled by the cache handler.
    expect(res.headers.get('x-nextjs-cache-entry-handler')).toBe('MISS_2')
  })

  it('should use the postponed state for the RSC requests', async () => {
    // Let's parse the random number out of the HTML that was generated at build
    // time. We want to use that value as it's the one that's tied to the
    // postponed state that we also have.
    const $ = cheerio.load(secondCookieHTML)

    const random = $('#random').text()
    expect(random).toBeDefined()
    expect(random.length).toBeGreaterThan(0)

    // Record the start of the logs for this test.
    let start = cliOutput.length

    // Then let's do a Dynamic RSC request and verify that the random value is
    // not present in the response without passing the postponed state.
    let res = await fetchViaHTTP(
      appPort,
      '/rewrite/second-cookie.rsc',
      undefined,
      {
        headers: {
          'x-matched-path': '/rewrite/[slug]',
          'x-now-route-matches': createNowRouteMatches({
            slug: 'second-cookie',
          }).toString(),
        },
      }
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toEqual('text/x-component')
    expect(res.headers.has('x-nextjs-postponed')).toBeFalse()

    // We expect that because we requested this dynamic RSC route without
    // resuming it, it should be a hit because it should be producing a new
    // static render.
    expect(res.headers.get('x-nextjs-cache-entry-handler')).toBe('HIT_2')

    // We expect that the random value is not present in the response because
    // we're not providing a resume data cache via the postponed state.
    // Instead it'll contain another random number that's been generated at
    // runtime during this new static render.
    let rsc = await res.text()
    expect(rsc).not.toContain(random)

    // Ensure that we hit the cache handler and not the resume data cache.
    await retry(() => {
      expect(cliOutput.substring(start)).toContain('cache-handler get')
      expect(cliOutput.substring(start)).toContain('cache-handler set')

      // We expect that there is both a miss and a hit because we're producing a
      // new static render.
      expect(cliOutput.substring(start)).toContain('rdc:miss')
      expect(cliOutput.substring(start)).toContain('rdc:set')
    })

    // Reset the start of the logs for this test.
    start = cliOutput.length

    // Then let's get the Dynamic RSC request and verify that the random value
    // is present in the response by passing the postponed state.
    res = await fetchViaHTTP(appPort, '/rewrite/second-cookie.rsc', undefined, {
      method: 'POST',
      headers: {
        'x-matched-path': '/rewrite/[slug]',
        'x-now-route-matches': createNowRouteMatches({
          slug: 'second-cookie',
        }).toString(),
        'next-resume': '1',
      },
      body: secondCookiePostpone,
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toEqual('text/x-component')
    expect(res.headers.has('x-nextjs-postponed')).toBeFalse()

    // We expect that because we're resuming, it should be a miss, because it
    // won't be producing a static response, and instead will be performing a
    // dynamic render.
    expect(res.headers.get('x-nextjs-cache-entry-handler')).toBe('MISS_2')

    // We expect that the random value is present in the response because
    // we're providing a resume data cache via the postponed state.
    rsc = await res.text()
    expect(rsc).toContain(random)

    // Ensure that we hit the resume data cache and not the cache handler.
    await retry(() => {
      expect(cliOutput.substring(start)).not.toContain('cache-handler get')
      expect(cliOutput.substring(start)).not.toContain('cache-handler set')

      // We expect that there is a resume data cache hit because we're providing
      // a resume data cache via the postponed state.
      expect(cliOutput.substring(start)).toContain('rdc:hit')

      // We expect that there is no resume data cache miss because we're
      // providing a resume data cache via the postponed state.
      expect(cliOutput.substring(start)).not.toContain('rdc:miss')
      expect(cliOutput.substring(start)).not.toContain('rdc:no-resume-data')
    })
  })

  it('should handle revalidating the fallback page', async () => {
    const res = await fetchViaHTTP(appPort, '/postpone/isr/[slug]', undefined, {
      headers: {
        'x-matched-path': '/postpone/isr/[slug]',
        // We don't include the `x-now-route-matches` header because we want to
        // test that the fallback route params are correctly set.
        'x-now-route-matches': '',
      },
    })

    expect(res.status).toBe(200)

    // We expect that the cache entry handler was hit because we're performing a
    // static render in minimal mode on a page that will suspend.
    expect(res.headers.get('x-nextjs-cache-entry-handler')).toBe('HIT_2')

    const html = await res.text()

    // We only expect a partial shell because the page will suspend.
    expect(html).not.toContain('</html>')

    const $ = cheerio.load(html)

    expect($('#page').text()).toBeEmpty()
    expect($('#params').text()).toBeEmpty()
    expect($('#now').text()).toBeEmpty()
    expect($('#slot-loading').text()).toBe('/[...catchAll]')
    expect($('#loading').text()).toBe('/postpone/isr/[slug]')
  })
})
