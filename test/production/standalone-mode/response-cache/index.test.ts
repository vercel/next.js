import glob from 'glob'
import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import {
  killApp,
  findPort,
  renderViaHTTP,
  initNextServerScript,
  fetchViaHTTP,
} from 'next-test-utils'

describe('minimal-mode-response-cache', () => {
  let next: NextInstance
  let server
  let port
  let appPort
  let output = ''

  beforeAll(async () => {
    // test build against environment with next support
    process.env.NOW_BUILDER = '1'

    next = await createNext({
      files: new FileRef(join(__dirname, 'app')),
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
      cwd: join(next.testDir, 'standalone/.next/server'),
      nodir: true,
      dot: true,
    })

    for (const file of files) {
      if (file.match(/(pages|app)[/\\]/) && !file.endsWith('.js')) {
        await fs.remove(join(next.testDir, 'standalone/.next/server', file))
        console.log(
          'removing',
          join(next.testDir, 'standalone/.next/server', file)
        )
      }
    }

    const testServer = join(next.testDir, 'standalone/server.js')
    await fs.writeFile(
      testServer,
      (await fs.readFile(testServer, 'utf8'))
        .replace('console.error(err)', `console.error('top-level', err)`)
        .replace('port:', 'minimalMode: true,port:')
    )
    port = await findPort()
    server = await initNextServerScript(
      testServer,
      /- Local:/,
      {
        ...process.env,
        HOSTNAME: '',
        PORT: port.toString(),
      },
      undefined,
      {
        cwd: next.testDir,
        onStdout(msg) {
          output += msg
        },
        onStderr(msg) {
          output += msg
        },
      }
    )
    appPort = `http://127.0.0.1:${port}`
  })
  afterAll(async () => {
    await next.destroy()
    if (server) await killApp(server)
  })

  it('app router revalidate should work with previous response cache dynamic', async () => {
    const headers = {
      vary: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch',
      'x-now-route-matches': '1=compare&rsc=1',
      'x-matched-path': '/app-blog/compare.rsc',
      'x-vercel-id': '1',
      rsc: '1',
    }
    const res1 = await fetchViaHTTP(
      appPort,
      '/app-blog/compare.rsc',
      undefined,
      {
        headers,
      }
    )
    const content1 = await res1.text()
    expect(content1).not.toContain('<html')
    expect(content1).toContain('app-blog')
    expect(res1.headers.get('content-type')).toContain('text/x-component')

    const res2 = await fetchViaHTTP(appPort, '/app-blog/compare', undefined, {
      headers,
    })
    const content2 = await res2.text()
    expect(content2).toContain('<html')
    expect(content2).toContain('app-blog')
    expect(res2.headers.get('content-type')).toContain('text/html')
  })

  it('app router revalidate should work with previous response cache', async () => {
    const headers = {
      vary: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch',
      'x-now-route-matches': '1=app-another&rsc=1',
      'x-matched-path': '/app-another.rsc',
      'x-vercel-id': '1',
      rsc: '1',
    }
    const res1 = await fetchViaHTTP(appPort, '/app-another.rsc', undefined, {
      headers,
    })
    const content1 = await res1.text()
    expect(res1.headers.get('content-type')).toContain('text/x-component')
    expect(content1).not.toContain('<html')
    expect(content1).toContain('app-another')

    const res2 = await fetchViaHTTP(appPort, '/app-another', undefined, {
      headers,
    })
    const content2 = await res2.text()
    expect(res2.headers.get('content-type')).toContain('text/html')
    expect(content2).toContain('<html')
    expect(content2).toContain('app-another')
  })

  it('should have correct "Started server on" log', async () => {
    expect(output).toContain(`- Local:`)
    expect(output).toContain(`http://localhost:${port}`)
  })

  it('should have correct responses', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html.length).toBeTruthy()

    for (const { path, matchedPath, query, asPath, pathname } of [
      { path: '/', asPath: '/' },
      { path: '/', matchedPath: '/index', asPath: '/' },
      { path: '/', matchedPath: '/index/', asPath: '/' },
      { path: '/', matchedPath: '/', asPath: '/' },
      {
        path: '/news/',
        matchedPath: '/news/',
        asPath: '/news/',
        pathname: '/news',
      },
      {
        path: '/news/',
        matchedPath: '/news',
        asPath: '/news/',
        pathname: '/news',
      },
      {
        path: '/blog/first/',
        matchedPath: '/blog/first/',
        pathname: '/blog/[slug]',
        asPath: '/blog/first/',
        query: { slug: 'first' },
      },
      {
        path: '/blog/second/',
        matchedPath: '/blog/[slug]/',
        pathname: '/blog/[slug]',
        asPath: '/blog/second/',
        query: { slug: 'second' },
      },
    ]) {
      const html = await renderViaHTTP(appPort, path, undefined, {
        headers: {
          'x-matched-path': matchedPath || path,
        },
      })
      const $ = cheerio.load(html)
      expect($('#asPath').text()).toBe(asPath)
      expect($('#pathname').text()).toBe(pathname || path)
      expect(JSON.parse($('#query').text())).toEqual(query || {})
    }
  })
})
