/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import cheerio from 'cheerio'
import {
  initNextServerScript,
  killApp,
  findPort,
  nextBuild,
  fetchViaHTTP,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')
let app
let appPort

describe('Fallback asPath normalizing', () => {
  beforeAll(async () => {
    const startServerlessEmulator = async (dir, port, buildId) => {
      const scriptPath = join(dir, 'server.js')
      const env = Object.assign({}, { ...process.env }, { PORT: port })
      return initNextServerScript(scriptPath, /ready on/i, env, false)
    }
    await fs.remove(join(appDir, '.next'))
    await nextBuild(appDir)

    appPort = await findPort()
    app = await startServerlessEmulator(appDir, appPort)
  })
  afterAll(() => killApp(app))

  it('should have normalized asPath for fallback page', async () => {
    const html = await fetchViaHTTP(appPort, '/blog/[post]', undefined, {
      headers: {
        'x-now-route-matches': '1=post-1',
        'x-vercel-id': 'hi',
      },
    }).then((res) => res.text())

    const $ = cheerio.load(html)
    const asPath = $('#as-path').text()
    const query = JSON.parse($('#query').text())
    const params = JSON.parse($('#params').text())

    expect(asPath).toBe('/blog/post-1')
    expect(query).toEqual({ post: 'post-1' })
    expect(params).toEqual({ post: 'post-1' })
  })

  it('should have normalized asPath for fallback page with entry directory', async () => {
    const html = await fetchViaHTTP(
      appPort,
      '/web-app/blog/[post]',
      undefined,
      {
        headers: {
          'x-now-route-matches': '1=post-abc',
          'x-vercel-id': 'hi',
        },
      }
    ).then((res) => res.text())

    const $ = cheerio.load(html)
    const asPath = $('#as-path').text()
    const query = JSON.parse($('#query').text())
    const params = JSON.parse($('#params').text())

    expect(asPath).toBe('/web-app/blog/post-abc')
    expect(query).toEqual({ post: 'post-abc' })
    expect(params).toEqual({ post: 'post-abc' })
  })

  it('should have normalized asPath for fallback page multi-params', async () => {
    const html = await fetchViaHTTP(
      appPort,
      '/blog/[post]/[comment]',
      undefined,
      {
        headers: {
          'x-now-route-matches': '1=post-1&2=comment-2',
          'x-vercel-id': 'hi',
        },
      }
    ).then((res) => res.text())

    const $ = cheerio.load(html)
    const asPath = $('#as-path').text()
    const query = JSON.parse($('#query').text())
    const params = JSON.parse($('#params').text())

    expect(asPath).toBe('/blog/post-1/comment-2')
    expect(query).toEqual({ post: 'post-1', comment: 'comment-2' })
    expect(params).toEqual({ post: 'post-1', comment: 'comment-2' })
  })

  it('should have normalized asPath for fallback page with entry directory multi-params', async () => {
    const html = await fetchViaHTTP(
      appPort,
      '/web-app/blog/[post]/[comment]',
      undefined,
      {
        headers: {
          'x-now-route-matches': '1=post-abc&2=comment-cba',
          'x-vercel-id': 'hi',
        },
      }
    ).then((res) => res.text())

    const $ = cheerio.load(html)
    const asPath = $('#as-path').text()
    const query = JSON.parse($('#query').text())
    const params = JSON.parse($('#params').text())

    expect(asPath).toBe('/web-app/blog/post-abc/comment-cba')
    expect(query).toEqual({ post: 'post-abc', comment: 'comment-cba' })
    expect(params).toEqual({ post: 'post-abc', comment: 'comment-cba' })
  })
})
