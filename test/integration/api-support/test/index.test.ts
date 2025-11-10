/* eslint-env jest */

import fs from 'fs-extra'
import { join } from 'path'
import AbortController from 'abort-controller'
import {
  killApp,
  findPort,
  launchApp,
  fetchViaHTTP,
  File,
  renderViaHTTP,
  nextBuild,
  nextStart,
  getPageFileFromBuildManifest,
  getPageFileFromPagesManifest,
  check,
} from 'next-test-utils'
import json from '../big.json'

const appDir = join(__dirname, '../')
const originalIsNextDev = global.isNextDev
let appPort
let stderr
let mode
let app

function runTests(dev = false) {
  beforeAll(() => {
    // isNextDev is used for getDistDir, where it is used for reading the build manifest files.
    global.isNextDev = dev
  })
  afterAll(() => {
    global.isNextDev = originalIsNextDev
  })

  it('should not strip .json from API route', async () => {
    const res = await fetchViaHTTP(appPort, '/api/hello.json')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ post: 'hello.json' })
  })

  it('should handle proxying to self correctly', async () => {
    const res1 = await fetchViaHTTP(appPort, '/api/proxy-self')
    expect(res1.status).toBe(200)
    expect(await res1.text()).toContain('User')

    const buildId = dev
      ? 'development'
      : await fs.readFile(join(appDir, '.next', 'BUILD_ID'), 'utf8')

    const res2 = await fetchViaHTTP(
      appPort,
      `/api/proxy-self?buildId=${buildId}`
    )
    expect(res2.status).toBe(200)
    expect(await res2.text()).toContain('__SSG_MANIFEST')
  })

  it('should respond from /api/auth/[...nextauth] correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/api/auth/signin', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ from: 'auth' })
  })

  it('should handle 204 status correctly', async () => {
    const res = await fetchViaHTTP(appPort, '/api/status-204', undefined, {
      redirect: 'manual',
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('content-type')).toBe(null)
    expect(res.headers.get('content-length')).toBe(null)
    expect(res.headers.get('transfer-encoding')).toBe(null)

    const stderrIdx = stderr.length
    const res2 = await fetchViaHTTP(
      appPort,
      '/api/status-204',
      { invalid: '1' },
      {
        redirect: 'manual',
      }
    )
    expect(res2.status).toBe(204)
    expect(res2.headers.get('content-type')).toBe(null)
    expect(res2.headers.get('content-length')).toBe(null)
    expect(res2.headers.get('transfer-encoding')).toBe(null)

    if (dev) {
      await check(
        () => stderr.slice(stderrIdx),
        /A body was attempted to be set with a 204 statusCode/
      )
    }
  })

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

    if (dev) {
      expect(text).toContain('User error')
    } else {
      expect(text).toBe('Internal Server Error')
    }
  })

  it('should throw Internal Server Error (async)', async () => {
    const res = await fetchViaHTTP(appPort, '/api/user-error-async', null, {})
    const text = await res.text()
    expect(res.status).toBe(500)

    if (dev) {
      expect(text).toContain('User error')
    } else {
      expect(text).toBe('Internal Server Error')
    }
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
    const res = await fetchViaHTTP(appPort, '/api/json-undefined', null, {})
    const body = res.ok ? await res.text() : null
    expect(body).toBe('')
  })

  it('should support string in JSON response body', async () => {
    const res = await fetchViaHTTP(appPort, '/api/json-string', null, {})
    const body = res.ok ? await res.text() : null
    expect(body).toBe('"Hello world!"')
  })

  it('should support null in JSON response body', async () => {
    const res = await fetchViaHTTP(appPort, '/api/json-null')
    const body = res.ok ? await res.json() : 'Not null'
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    )
    expect(body).toBe(null)
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

  // TODO: Investigate this test flaking
  it.skip('should return error exceeded body limit', async () => {
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

    await check(() => {
      expect(stderr).toContain(
        `Invalid redirect arguments. Please use a single argument URL, e.g. res.redirect('/destination') or use a status code and URL, e.g. res.redirect(307, '/destination').`
      )
      return 'yes'
    }, 'yes')
  })

  it('should show friendly error in case of passing null as first argument redirect', async () => {
    await fetchViaHTTP(appPort, '/api/redirect-null', null, {})

    check(() => {
      expect(stderr).toContain(
        `Invalid redirect arguments. Please use a single argument URL, e.g. res.redirect('/destination') or use a status code and URL, e.g. res.redirect(307, '/destination').`
      )
      return 'yes'
    }, 'yes')
  })

  it('should redirect with status code 307', async () => {
    const res = await fetchViaHTTP(appPort, '/api/redirect-307', null, {
      redirect: 'manual',
    })

    expect(res.status).toEqual(307)
    const text = await res.text()
    expect(text).toEqual('/login')
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
    const text = await res.text()
    expect(text).toEqual('/login')
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

  it('should work with nullable payload', async () => {
    const data = await renderViaHTTP(appPort, '/api/nullable-payload')
    expect(data).toBe('')
  })

  it('should warn if response body is larger than 4MB', async () => {
    let res = await fetchViaHTTP(appPort, '/api/large-response')
    expect(res.ok).toBeTruthy()
    expect(stderr).toContain(
      'API response for /api/large-response exceeds 4MB. API Routes are meant to respond quickly.'
    )

    res = await fetchViaHTTP(appPort, '/api/large-chunked-response')
    expect(res.ok).toBeTruthy()
    expect(stderr).toContain(
      'API response for /api/large-chunked-response exceeds 4MB. API Routes are meant to respond quickly.'
    )
  })

  it('should not warn if response body is larger than 4MB with responseLimit config = false', async () => {
    await check(async () => {
      let res = await fetchViaHTTP(appPort, '/api/large-response-with-config')
      expect(res.ok).toBeTruthy()
      expect(stderr).not.toContain(
        'API response for /api/large-response-with-config exceeds 4MB. API Routes are meant to respond quickly.'
      )
      return 'success'
    }, 'success')
  })

  it('should warn with configured size if response body is larger than configured size', async () => {
    await check(async () => {
      let res = await fetchViaHTTP(
        appPort,
        '/api/large-response-with-config-size'
      )
      expect(res.ok).toBeTruthy()
      expect(stderr).toContain(
        'API response for /api/large-response-with-config-size exceeds 5MB. API Routes are meant to respond quickly.'
      )
      return 'success'
    }, 'success')
  })

  if (dev) {
    it('should compile only server code in development', async () => {
      await fetchViaHTTP(appPort, '/api/users')

      expect(() => getPageFileFromBuildManifest(appDir, '/api/users')).toThrow(
        /No files for page/
      )

      expect(getPageFileFromPagesManifest(appDir, '/api/users')).toBeTruthy()
    })

    it('should show warning when the API resolves without ending the request in development mode', async () => {
      const controller = new AbortController()
      setTimeout(() => {
        controller.abort()
      }, 2000)
      await fetchViaHTTP(appPort, '/api/test-no-end', undefined, {
        signal: controller.signal,
      }).catch(() => {})

      await check(
        () => stderr,
        /API resolved without sending a response for \/api\/test-no-end, this may result in stalled requests/
      )
    })

    it('should not show warning when the API resolves and the response is piped', async () => {
      const startIdx = stderr.length > 0 ? stderr.length - 1 : stderr.length
      await fetchViaHTTP(appPort, `/api/test-res-pipe`, { port: appPort })
      expect(stderr.slice(startIdx)).not.toContain(
        `API resolved without sending a response for /api/test-res-pipe`
      )
    })

    it('should show false positive warning if not using externalResolver flag', async () => {
      const apiURL = '/api/external-resolver-false-positive'
      const req = await fetchViaHTTP(appPort, apiURL)
      expect(await req.text()).toBe('hello world')

      check(() => {
        expect(stderr).toContain(
          `API resolved without sending a response for ${apiURL}, this may result in stalled requests.`
        )
        return 'yes'
      }, 'yes')
    })

    it('should not show warning if using externalResolver flag', async () => {
      const startIdx = stderr.length > 0 ? stderr.length - 1 : stderr.length
      const apiURL = '/api/external-resolver'
      const req = await fetchViaHTTP(appPort, apiURL)
      expect(stderr.slice(startIdx)).not.toContain(
        `API resolved without sending a response for ${apiURL}`
      )
      expect(await req.text()).toBe('hello world')
    })
  } else {
    it('should show error with output export', async () => {
      const nextConfig = new File(join(appDir, 'next.config.js'))
      nextConfig.write(`module.exports = { output: 'export' }`)
      try {
        const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
        expect(stderr).toContain('https://nextjs.org/docs/messages/gssp-export')
        expect(code).toBe(1)
      } finally {
        nextConfig.delete()
      }
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
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      beforeAll(async () => {
        await nextBuild(appDir)
        mode = 'server'
        appPort = await findPort()
        app = await nextStart(appDir, appPort)
      })
      afterAll(() => killApp(app))

      runTests()
    }
  )
})
