/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import {
  killApp,
  findPort,
  launchApp,
  fetchViaHTTP,
  renderViaHTTP,
  nextBuild,
  nextStart,
  runNextCommand,
  File
} from 'next-test-utils'
import json from '../big.json'
import { createServer } from 'http'

const appDir = join(__dirname, '../')
let appPort
let server
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

function runTests (serverless = false) {
  it('should render page', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/API - support/)
  })

  it('should return 404 for undefined path', async () => {
    const { status } = await fetchViaHTTP(
      appPort,
      '/api/not/unexisting/page/really',
      null,
      {}
    )
    expect(status).toEqual(404)
  })

  it('should not conflict with /api routes', async () => {
    const port = await findPort()
    await nextBuild(appDir)
    const app = await nextStart(appDir, port)
    const res = await fetchViaHTTP(port, '/api-conflict')
    expect(res.status).not.toEqual(404)
    killApp(app)
  })

  it('should work with index api', async () => {
    if (serverless) {
      const port = await findPort()
      const resolver = require(join(appDir, '.next/serverless/pages/api.js'))
        .default

      const server = createServer(resolver).listen(port)
      const res = await fetchViaHTTP(port, '/api')
      const text = await res.text()
      server.close()

      expect(text).toEqual('Index should work')
    } else {
      const text = await fetchViaHTTP(appPort, '/api', null, {}).then(
        res => res.ok && res.text()
      )

      expect(text).toEqual('Index should work')
    }
  })

  it('should return custom error', async () => {
    const data = await fetchViaHTTP(appPort, '/api/error', null, {})
    const json = await data.json()

    expect(data.status).toEqual(500)
    expect(json).toEqual({ error: 'Server error!' })
  })

  it('should throw Internal Server Error', async () => {
    const res = await fetchViaHTTP(appPort, '/api/user-error', null, {})
    const text = await res.text()
    expect(res.status).toBe(500)
    expect(text).toBe('Internal Server Error')
  })

  it('should parse JSON body', async () => {
    const data = await fetchViaHTTP(appPort, '/api/parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify([{ title: 'Nextjs' }])
    }).then(res => res.ok && res.json())

    expect(data).toEqual([{ title: 'Nextjs' }])
  })

  it('should return error with invalid JSON', async () => {
    const data = await fetchViaHTTP(appPort, '/api/parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: `{"message":Invalid"}`
    })
    expect(data.status).toEqual(400)
    expect(data.statusText).toEqual('Invalid JSON')
  })

  it('should return error exceeded body limit', async () => {
    const data = await fetchViaHTTP(appPort, '/api/parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(json)
    })

    expect(data.status).toEqual(413)
    expect(data.statusText).toEqual('Body exceeded 1mb limit')
  })

  it('should parse bigger body then 1mb', async () => {
    const data = await fetchViaHTTP(appPort, '/api/big-parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(json)
    })

    expect(data.status).toEqual(200)
  })

  it('should parse urlencoded body', async () => {
    const body = {
      title: 'Nextjs',
      description: 'The React Framework for Production'
    }

    const formBody = Object.keys(body)
      .map(key => {
        return `${encodeURIComponent(key)}=${encodeURIComponent(body[key])}`
      })
      .join('&')

    const data = await fetchViaHTTP(appPort, '/api/parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-Form-urlencoded'
      },
      body: formBody
    }).then(res => res.ok && res.json())

    expect(data).toEqual({
      title: 'Nextjs',
      description: 'The React Framework for Production'
    })
  })

  it('should parse body in handler', async () => {
    const data = await fetchViaHTTP(appPort, '/api/no-parsing', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify([{ title: 'Nextjs' }])
    }).then(res => res.ok && res.json())

    expect(data).toEqual([{ title: 'Nextjs' }])
  })

  it('should parse body with config', async () => {
    const data = await fetchViaHTTP(appPort, '/api/parsing', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify([{ title: 'Nextjs' }])
    }).then(res => res.ok && res.json())

    expect(data).toEqual({ message: 'Parsed body' })
  })

  it('should return empty cookies object', async () => {
    const data = await fetchViaHTTP(appPort, '/api/cookies', null, {}).then(
      res => res.ok && res.json()
    )
    expect(data).toEqual({})
  })

  it('should return cookies object', async () => {
    const data = await fetchViaHTTP(appPort, '/api/cookies', null, {
      headers: {
        Cookie: 'nextjs=cool;'
      }
    }).then(res => res.ok && res.json())
    expect(data).toEqual({ nextjs: 'cool' })
  })

  it('should return 405 on POST on pages', async () => {
    const res = await fetchViaHTTP(appPort, '/user', null, {
      method: 'POST'
    })

    expect(res.status).toEqual(405)
  })

  it('should return JSON on post on API', async () => {
    const data = await fetchViaHTTP(appPort, '/api/blog?title=Nextjs', null, {
      method: 'POST'
    }).then(res => res.ok && res.json())

    expect(data).toEqual([{ title: 'Nextjs' }])
  })

  it('should return data on dynamic route', async () => {
    const data = await fetchViaHTTP(appPort, '/api/post-1', null, {}).then(
      res => res.ok && res.json()
    )

    expect(data).toEqual({ post: 'post-1' })
  })

  it('should prioritize a non-dynamic page', async () => {
    const data = await fetchViaHTTP(
      appPort,
      '/api/post-1/comments',
      null,
      {}
    ).then(res => res.ok && res.json())

    expect(data).toEqual([{ message: 'Prioritize a non-dynamic api page' }])
  })

  it('should return data on dynamic nested route', async () => {
    const data = await fetchViaHTTP(
      appPort,
      '/api/post-1/comment-1',
      null,
      {}
    ).then(res => res.ok && res.json())

    expect(data).toEqual({ post: 'post-1', comment: 'comment-1' })
  })

  it('should 404 on optional dynamic api page', async () => {
    const res = await fetchViaHTTP(appPort, '/api/blog/543/comment', null, {})

    expect(res.status).toBe(404)
  })

  it('should build api routes', async () => {
    await nextBuild(appDir, [], { stdout: true })
    if (serverless) {
      const pagesManifest = JSON.parse(
        readFileSync(
          join(appDir, '.next/serverless/pages-manifest.json'),
          'utf8'
        )
      )
      expect(Object.keys(pagesManifest).includes('/api/[post]')).toBeTruthy()

      const port = await findPort()
      const resolver = require(join(
        appDir,
        '.next/serverless/pages/api/blog.js'
      )).default

      const server = createServer(resolver).listen(port)
      const res = await fetchViaHTTP(port, '/api/nextjs')
      const json = await res.json()
      server.close()

      expect(json).toEqual([{ title: 'Cool Post!' }])
    } else {
      expect(
        existsSync(join(appDir, '.next/server/pages-manifest.json'), 'utf8')
      ).toBeTruthy()

      const buildManifest = JSON.parse(
        readFileSync(join(appDir, '.next/build-manifest.json'), 'utf8')
      )
      expect(
        Object.keys(buildManifest.pages).includes('/api-conflict')
      ).toBeTruthy()
    }
  })

  if (!serverless) {
    it('should warn about API export', async () => {
      const { stdout } = await runNextCommand(['export', appDir], {
        stdout: true,
        stderr: true
      })

      expect(stdout).toContain('API pages are not supported in export')
    })
  }

  it('should return data on dynamic optional nested route', async () => {
    const data = await fetchViaHTTP(
      appPort,
      '/api/blog/post-1/comment/1',
      null,
      {}
    ).then(res => res.ok && res.json())

    expect(data).toEqual({ post: 'post-1', id: '1' })
  })

  it('should compile only server code in development', async () => {
    await fetchViaHTTP(appPort, '/')
    await fetchViaHTTP(appPort, '/api/users')

    // Normal page
    expect(
      existsSync(join(appDir, `/.next/static/development/pages/index.js`))
    ).toBeTruthy()
    expect(
      existsSync(
        join(appDir, `/.next/server/static/development/pages/index.js`)
      )
    ).toBeTruthy()
    // API page
    expect(
      existsSync(join(appDir, `/.next/static/development/pages/api/users.js`))
    ).toBeFalsy()
    expect(
      existsSync(
        join(appDir, `/.next/server/static/development/pages/api/users.js`)
      )
    ).toBeTruthy()
  })
}

describe('API routes', () => {
  beforeAll(async () => {
    appPort = await findPort()
    server = await launchApp(appDir, appPort)
  })
  afterAll(() => killApp(server))

  describe('Server support', () => {
    runTests()
  })

  describe('Serverless support', () => {
    const nextConfig = new File(join(appDir, 'next.config.js'))
    beforeEach(() => {
      nextConfig.replace('server', 'serverless')
    })
    afterEach(() => {
      nextConfig.restore()
    })
    runTests(true)
  })
})
