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
} from 'next-test-utils'

describe('minimal-mode-response-cache', () => {
  let next: NextInstance
  let server
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
      (await fs.readFile(testServer, 'utf8'))
        .replace('console.error(err)', `console.error('top-level', err)`)
        .replace('conf:', 'minimalMode: true,conf:')
    )
    appPort = await findPort()
    server = await initNextServerScript(
      testServer,
      /Listening on/,
      {
        ...process.env,
        HOSTNAME: '',
        PORT: appPort,
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
  })
  afterAll(async () => {
    await next.destroy()
    if (server) await killApp(server)
  })

  it('should have correct "Listening on" log', async () => {
    expect(output).toContain(`Listening on port`)
    expect(output).toContain(`url: http://localhost:${appPort}`)
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
