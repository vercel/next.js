/* eslint-env jest */
/* global jasmine */
import fs from 'fs-extra'
import { join } from 'path'
import {
  killApp,
  findPort,
  launchApp,
  fetchViaHTTP,
  renderViaHTTP,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import json from '../big.json'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2
const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')
let appPort
let mode
let app

function runTests(dev = false) {
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
    const res = await fetchViaHTTP(appPort, '/api-conflict')
    expect(res.status).not.toEqual(404)
  })

  it('should work with index api', async () => {
    const text = await fetchViaHTTP(appPort, '/api', null, {}).then(
      res => res.ok && res.text()
    )
    expect(text).toEqual('Index should work')
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
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify([{ title: 'Nextjs' }]),
    }).then(res => res.ok && res.json())

    expect(data).toEqual([{ title: 'Nextjs' }])
  })

  it('should special-case empty JSON body', async () => {
    const data = await fetchViaHTTP(appPort, '/api/parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    }).then(res => res.ok && res.json())

    expect(data).toEqual({})
  })

  it('should support boolean for JSON in api page', async () => {
    const res = await fetchViaHTTP(appPort, '/api/bool', null, {})
    const body = res.ok ? await res.json() : null
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    )
    expect(body).toBe(true)
  })

  it('should return error with invalid JSON', async () => {
    const data = await fetchViaHTTP(appPort, '/api/parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: `{"message":Invalid"}`,
    })
    expect(data.status).toEqual(400)
    expect(data.statusText).toEqual('Invalid JSON')
  })

  it('should return error exceeded body limit', async () => {
    const data = await fetchViaHTTP(appPort, '/api/parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(json),
    })

    expect(data.status).toEqual(413)
    expect(data.statusText).toEqual('Body exceeded 1mb limit')
  })

  it('should parse bigger body then 1mb', async () => {
    const data = await fetchViaHTTP(appPort, '/api/big-parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(json),
    })

    expect(data.status).toEqual(200)
  })

  it('should parse urlencoded body', async () => {
    const body = {
      title: 'Nextjs',
      description: 'The React Framework for Production',
    }

    const formBody = Object.keys(body)
      .map(key => {
        return `${encodeURIComponent(key)}=${encodeURIComponent(body[key])}`
      })
      .join('&')

    const data = await fetchViaHTTP(appPort, '/api/parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-Form-urlencoded',
      },
      body: formBody,
    }).then(res => res.ok && res.json())

    expect(data).toEqual({
      title: 'Nextjs',
      description: 'The React Framework for Production',
    })
  })

  it('should parse body in handler', async () => {
    const data = await fetchViaHTTP(appPort, '/api/no-parsing', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify([{ title: 'Nextjs' }]),
    }).then(res => res.ok && res.json())

    expect(data).toEqual([{ title: 'Nextjs' }])
  })

  it('should parse body with config', async () => {
    const data = await fetchViaHTTP(appPort, '/api/parsing', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify([{ title: 'Nextjs' }]),
    }).then(res => res.ok && res.json())

    expect(data).toEqual({ message: 'Parsed body' })
  })

  it('should return empty query object', async () => {
    const data = await fetchViaHTTP(appPort, '/api/query', null, {}).then(
      res => res.ok && res.json()
    )
    expect(data).toEqual({})
  })

  it('should parse query correctly', async () => {
    const data = await fetchViaHTTP(
      appPort,
      '/api/query?a=1&b=2&a=3',
      null,
      {}
    ).then(res => res.ok && res.json())
    expect(data).toEqual({ a: ['1', '3'], b: '2' })
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
        Cookie: 'nextjs=cool;',
      },
    }).then(res => res.ok && res.json())
    expect(data).toEqual({ nextjs: 'cool' })
  })

  it('should return 200 on POST on pages', async () => {
    const res = await fetchViaHTTP(appPort, '/user', null, {
      method: 'POST',
    })

    expect(res.status).toEqual(200)
  })

  it('should return JSON on post on API', async () => {
    const data = await fetchViaHTTP(appPort, '/api/blog?title=Nextjs', null, {
      method: 'POST',
    }).then(res => res.ok && res.json())

    expect(data).toEqual([{ title: 'Nextjs' }])
  })

  it('should return data on dynamic route', async () => {
    const data = await fetchViaHTTP(appPort, '/api/post-1', null, {}).then(
      res => res.ok && res.json()
    )

    expect(data).toEqual({ post: 'post-1' })
  })

  it('should work with dynamic params and search string', async () => {
    const data = await fetchViaHTTP(
      appPort,
      '/api/post-1?val=1',
      null,
      {}
    ).then(res => res.ok && res.json())

    expect(data).toEqual({ val: '1', post: 'post-1' })
  })

  it('should work with dynamic params and search string like lambda', async () => {
    const res = await fetchViaHTTP(appPort, '/api/post-1?val=1')
    const json = await res.json()

    expect(json).toEqual({ val: '1', post: 'post-1' })
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

  it('should return data on dynamic optional nested route', async () => {
    const data = await fetchViaHTTP(
      appPort,
      '/api/blog/post-1/comment/1',
      null,
      {}
    ).then(res => res.ok && res.json())

    expect(data).toEqual({ post: 'post-1', id: '1' })
  })

  if (dev) {
    it('should compile only server code in development', async () => {
      await fetchViaHTTP(appPort, '/')
      await fetchViaHTTP(appPort, '/api/users')

      // Normal page
      expect(
        await fs.exists(
          join(appDir, `/.next/static/development/pages/index.js`)
        )
      ).toBeTruthy()
      expect(
        await fs.exists(
          join(appDir, `/.next/server/static/development/pages/index.js`)
        )
      ).toBeTruthy()
      // API page
      expect(
        await fs.exists(
          join(appDir, `/.next/static/development/pages/api/users.js`)
        )
      ).toBeFalsy()
      expect(
        await fs.exists(
          join(appDir, `/.next/server/static/development/pages/api/users.js`)
        )
      ).toBeTruthy()
    })
  } else {
    it('should build api routes', async () => {
      const pagesManifest = JSON.parse(
        await fs.readFile(
          join(appDir, `.next/${mode}/pages-manifest.json`),
          'utf8'
        )
      )
      expect(Object.keys(pagesManifest).includes('/api/[post]')).toBeTruthy()

      const res = await fetchViaHTTP(appPort, '/api/nextjs')
      const json = await res.json()

      expect(json).toEqual({ post: 'nextjs' })

      const buildManifest = JSON.parse(
        await fs.readFile(join(appDir, '.next/build-manifest.json'), 'utf8')
      )
      expect(
        Object.keys(buildManifest.pages).includes('/api-conflict')
      ).toBeTruthy()
    })
  }
}

describe('API routes', () => {
  describe('dev support', () => {
    beforeAll(async () => {
      appPort = await findPort()
      app = await launchApp(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests(true)
  })

  describe('Server support', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      mode = 'server'
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(() => killApp(app))

    runTests()
  })

  describe('Serverless support', () => {
    beforeAll(async () => {
      await fs.writeFile(
        nextConfig,
        `module.exports = { target: 'serverless' }`
      )
      await nextBuild(appDir)
      mode = 'serverless'
      appPort = await findPort()
      app = await nextStart(appDir, appPort)
    })
    afterAll(async () => {
      await killApp(app)
      await fs.remove(nextConfig)
    })

    runTests()
  })
})
