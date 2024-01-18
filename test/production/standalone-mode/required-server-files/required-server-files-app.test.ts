import glob from 'glob'
import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
} from 'next-test-utils'

describe('required server files app router', () => {
  let next: NextInstance
  let server
  let appPort

  const setupNext = async ({
    nextEnv,
    minimalMode,
  }: {
    nextEnv?: boolean
    minimalMode?: boolean
  }) => {
    // test build against environment with next support
    process.env.NOW_BUILDER = nextEnv ? '1' : ''

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
        eslint: {
          ignoreDuringBuilds: true,
        },
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
      (
        await fs.readFile(testServer, 'utf8')
      ).replace('port:', `minimalMode: ${minimalMode},port:`)
    )
    appPort = await findPort()
    server = await initNextServerScript(
      testServer,
      /- Local:/,
      {
        ...process.env,
        PORT: appPort,
      },
      undefined,
      {
        cwd: next.testDir,
      }
    )
    appPort = `http://127.0.0.1:${appPort}`
  }

  beforeAll(async () => {
    await setupNext({ nextEnv: true, minimalMode: true })
  })
  afterAll(async () => {
    await next.destroy()
    if (server) await killApp(server)
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
        'x-now-route-matches': '1=second&nxtPslug=new',
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
        'x-now-route-matches': '1=second&nxtPslug=new',
        'x-matched-path': '/isr/[slug]',
      },
    })

    expect(rscRes.status).toBe(200)
  })

  it('should send cache tags in minimal mode for ISR', async () => {
    for (const [path, tags] of [
      [
        '/isr/first',
        'isr-page,_N_T_/layout,_N_T_/isr/layout,_N_T_/isr/[slug]/layout,_N_T_/isr/[slug]/page,_N_T_/isr/first',
      ],
      [
        '/isr/second',
        'isr-page,_N_T_/layout,_N_T_/isr/layout,_N_T_/isr/[slug]/layout,_N_T_/isr/[slug]/page,_N_T_/isr/second',
      ],
      [
        '/api/isr/first',
        'isr-page,_N_T_/layout,_N_T_/api/layout,_N_T_/api/isr/layout,_N_T_/api/isr/[slug]/layout,_N_T_/api/isr/[slug]/route,_N_T_/api/isr/first',
      ],
      [
        '/api/isr/second',
        'isr-page,_N_T_/layout,_N_T_/api/layout,_N_T_/api/isr/layout,_N_T_/api/isr/[slug]/layout,_N_T_/api/isr/[slug]/route,_N_T_/api/isr/second',
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
})
