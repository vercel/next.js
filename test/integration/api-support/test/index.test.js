/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import AbortController from 'abort-controller'
import {
  killApp,
  findPort,
  launchApp,
  fetchViaHTTP,
  renderViaHTTP,
  nextBuild,
  nextStart,
  nextExport,
  getPageFileFromBuildManifest,
  getPageFileFromPagesManifest,
} from 'next-test-utils'
import json from '../big.json'

jest.setTimeout(1000 * 60 * 2)
const appDir = join(__dirname, '../')
const nextConfig = join(appDir, 'next.config.js')
let appPort
let stderr
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

  it('should set cors headers when adding cors middleware', async () => {
    const res = await fetchViaHTTP(appPort, '/api/cors', null, {
      method: 'OPTIONS',
      headers: {
        origin: 'example.com',
      },
    })

    expect(res.status).toEqual(204)
    expect(res.headers.get('access-control-allow-methods')).toEqual(
      'GET,POST,OPTIONS'
    )
  })

  it('should work with index api', async () => {
    const text = await fetchViaHTTP(appPort, '/api', null, {}).then(
      (res) => res.ok && res.text()
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

  it('should throw Internal Server Error (async)', async () => {
    const res = await fetchViaHTTP(appPort, '/api/user-error-async', null, {})
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
    }).then((res) => res.ok && res.json())

    expect(data).toEqual([{ title: 'Nextjs' }])
  })

  it('should special-case empty JSON body', async () => {
    const data = await fetchViaHTTP(appPort, '/api/parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    }).then((res) => res.ok && res.json())

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

  it('should support undefined response body', async () => {
    const res = await fetchViaHTTP(appPort, '/api/undefined', null, {})
    const body = res.ok ? await res.text() : null
    expect(body).toBe('')
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
    let res
    let error

    try {
      res = await fetchViaHTTP(appPort, '/api/parse', null, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(json),
      })
    } catch (err) {
      error = err
    }

    if (error) {
      // This is a temporary workaround for testing since node doesn't handle
      // closed connections when POSTing data to an endpoint correctly
      // https://github.com/nodejs/node/issues/12339
      // TODO: investigate re-enabling this after above issue has been
      // addressed in node or `node-fetch`
      expect(error.code).toBe('EPIPE')
    } else {
      expect(res.status).toEqual(413)
      expect(res.statusText).toEqual('Body exceeded 1mb limit')
    }
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

  it('should support etag spec', async () => {
    const response = await fetchViaHTTP(appPort, '/api/blog')
    const etag = response.headers.get('etag')

    const unmodifiedResponse = await fetchViaHTTP(appPort, '/api/blog', null, {
      headers: { 'If-None-Match': etag },
    })

    expect(unmodifiedResponse.status).toBe(304)
  })

  it('should parse urlencoded body', async () => {
    const body = {
      title: 'Nextjs',
      description: 'The React Framework for Production',
    }

    const formBody = Object.keys(body)
      .map((key) => {
        return `${encodeURIComponent(key)}=${encodeURIComponent(body[key])}`
      })
      .join('&')

    const data = await fetchViaHTTP(appPort, '/api/parse', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-Form-urlencoded',
      },
      body: formBody,
    }).then((res) => res.ok && res.json())

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
    }).then((res) => res.ok && res.json())

    expect(data).toEqual([{ title: 'Nextjs' }])
  })

  it('should parse body with config', async () => {
    const data = await fetchViaHTTP(appPort, '/api/parsing', null, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify([{ title: 'Nextjs' }]),
    }).then((res) => res.ok && res.json())

    expect(data).toEqual({ message: 'Parsed body' })
  })

  it('should show friendly error for invalid redirect', async () => {
    await fetchViaHTTP(appPort, '/api/redirect-error', null, {})
    expect(stderr).toContain(
      `Invalid redirect arguments. Please use a single argument URL, e.g. res.redirect('/destination') or use a status code and URL, e.g. res.redirect(307, '/destination').`
    )
  })

  it('should show friendly error in case of passing null as first argument redirect', async () => {
    await fetchViaHTTP(appPort, '/api/redirect-null', null, {})
    expect(stderr).toContain(
      `Invalid redirect arguments. Please use a single argument URL, e.g. res.redirect('/destination') or use a status code and URL, e.g. res.redirect(307, '/destination').`
    )
  })

  it('should redirect with status code 307', async () => {
    const res = await fetchViaHTTP(appPort, '/api/redirect-307', null, {
      redirect: 'manual',
    })

    expect(res.status).toEqual(307)
  })

  it('should redirect to login', async () => {
    const res = await fetchViaHTTP(appPort, '/api/redirect-307', null, {})

    expect(res.redirected).toBe(true)
    expect(res.url).toContain('/login')
  })

  it('should redirect with status code 301', async () => {
    const res = await fetchViaHTTP(appPort, '/api/redirect-301', null, {
      redirect: 'manual',
    })

    expect(res.status).toEqual(301)
  })

  it('should return empty query object', async () => {
    const data = await fetchViaHTTP(appPort, '/api/query', null, {}).then(
      (res) => res.ok && res.json()
    )
    expect(data).toEqual({})
  })

  it('should parse query correctly', async () => {
    const data = await fetchViaHTTP(
      appPort,
      '/api/query?a=1&b=2&a=3',
      null,
      {}
    ).then((res) => res.ok && res.json())
    expect(data).toEqual({ a: ['1', '3'], b: '2' })
  })

  it('should return empty cookies object', async () => {
    const data = await fetchViaHTTP(appPort, '/api/cookies', null, {}).then(
      (res) => res.ok && res.json()
    )
    expect(data).toEqual({})
  })

  it('should return cookies object', async () => {
    const data = await fetchViaHTTP(appPort, '/api/cookies', null, {
      headers: {
        Cookie: 'nextjs=cool;',
      },
    }).then((res) => res.ok && res.json())
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
    }).then((res) => res.ok && res.json())

    expect(data).toEqual([{ title: 'Nextjs' }])
  })

  it('should return data on dynamic route', async () => {
    const data = await fetchViaHTTP(appPort, '/api/post-1', null, {}).then(
      (res) => res.ok && res.json()
    )

    expect(data).toEqual({ post: 'post-1' })
  })

  it('should work with dynamic params and search string', async () => {
    const data = await fetchViaHTTP(
      appPort,
      '/api/post-1?val=1',
      null,
      {}
    ).then((res) => res.ok && res.json())

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
    ).then((res) => res.ok && res.json())

    expect(data).toEqual([{ message: 'Prioritize a non-dynamic api page' }])
  })

  it('should return data on dynamic nested route', async () => {
    const data = await fetchViaHTTP(
      appPort,
      '/api/post-1/comment-1',
      null,
      {}
    ).then((res) => res.ok && res.json())

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
    ).then((res) => res.ok && res.json())

    expect(data).toEqual({ post: 'post-1', id: '1' })
  })

  it('should work with child_process correctly', async () => {
    const data = await renderViaHTTP(appPort, '/api/child-process')
    expect(data).toBe('hi')
  })

  if (dev) {
    it('should compile only server code in development', async () => {
      await fetchViaHTTP(appPort, '/api/users')

      expect(() => getPageFileFromBuildManifest(appDir, '/api/users')).toThrow(
        /No files for page/
      )

      expect(getPageFileFromPagesManifest(appDir, '/api/users')).toBeTruthy()
    })

    it('should show warning when the API resolves without ending the request in dev mode', async () => {
      const controller = new AbortController()
      setTimeout(() => {
        controller.abort()
      }, 2000)
      await fetchViaHTTP(appPort, '/api/test-no-end', undefined, {
        signal: controller.signal,
      }).catch(() => {})
      expect(stderr).toContain(
        `API resolved without sending a response for /api/test-no-end, this may result in stalled requests.`
      )
    })

    it('should not show warning when the API resolves and the response is piped', async () => {
      const startIdx = stderr.length > 0 ? stderr.length - 1 : stderr.length
      await fetchViaHTTP(appPort, `/api/test-res-pipe`, { port: appPort })
      expect(stderr.substr(startIdx)).not.toContain(
        `API resolved without sending a response for /api/test-res-pipe`
      )
    })

    it('should show false positive warning if not using externalResolver flag', async () => {
      const apiURL = '/api/external-resolver-false-positive'
      const req = await fetchViaHTTP(appPort, apiURL)
      expect(stderr).toContain(
        `API resolved without sending a response for ${apiURL}, this may result in stalled requests.`
      )
      expect(await req.text()).toBe('hello world')
    })

    it('should not show warning if using externalResolver flag', async () => {
      const startIdx = stderr.length > 0 ? stderr.length - 1 : stderr.length
      const apiURL = '/api/external-resolver'
      const req = await fetchViaHTTP(appPort, apiURL)
      expect(stderr.substr(startIdx)).not.toContain(
        `API resolved without sending a response for ${apiURL}`
      )
      expect(await req.text()).toBe('hello world')
    })
  } else {
    it('should show warning with next export', async () => {
      const { stderr } = await nextExport(
        appDir,
        { outdir: join(appDir, 'out') },
        { stderr: true }
      )
      expect(stderr).toContain(
        'https://nextjs.org/docs/messages/api-routes-static-export'
      )
    })

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
      stderr = ''
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStderr: (msg) => {
          stderr += msg
        },
      })
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
