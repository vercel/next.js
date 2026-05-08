import AbortController from 'abort-controller'
import {
  getPageFileFromBuildManifest,
  getPageFileFromPagesManifest,
  retry,
} from 'next-test-utils'
import { nextTestSetup, isNextDev } from 'e2e-utils'
import json from './big.json'

describe('API routes', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'http-proxy': 'latest',
      cors: 'latest',
      'node-fetch': '2.6.7',
    },
    skipDeployment: true,
    disableAutoSkewProtection: true,
  })
  if (skipped) return

  it('should not strip .json from API route', async () => {
    const res = await next.fetch('/api/hello.json')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ post: 'hello.json' })
  })

  it('should handle proxying to self correctly', async () => {
    const res1 = await next.fetch('/api/proxy-self')
    expect(res1.status).toBe(200)
    expect(await res1.text()).toContain('User')

    const buildId = isNextDev
      ? 'development'
      : await next.readFile('.next/BUILD_ID')

    const res2 = await next.fetch(`/api/proxy-self?buildId=${buildId}`)
    expect(res2.status).toBe(200)
    expect(await res2.text()).toContain('__SSG_MANIFEST')
  })

  it('should respond from /api/auth/[...nextauth] correctly', async () => {
    const res = await next.fetch('/api/auth/signin', { redirect: 'manual' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ from: 'auth' })
  })

  it('should handle 204 status correctly', async () => {
    const res = await next.fetch('/api/status-204', { redirect: 'manual' })
    expect(res.status).toBe(204)
    expect(res.headers.get('content-type')).toBe(null)
    expect(res.headers.get('content-length')).toBe(null)
    expect(res.headers.get('transfer-encoding')).toBe(null)

    const cliOutputBefore = next.cliOutput.length
    const res2 = await next.fetch('/api/status-204?invalid=1', {
      redirect: 'manual',
    })
    expect(res2.status).toBe(204)
    expect(res2.headers.get('content-type')).toBe(null)
    expect(res2.headers.get('content-length')).toBe(null)
    expect(res2.headers.get('transfer-encoding')).toBe(null)

    if (isNextDev) {
      await retry(() => {
        expect(next.cliOutput.slice(cliOutputBefore)).toContain(
          'A body was attempted to be set with a 204 statusCode'
        )
      })
    }
  })

  it('should render page', async () => {
    const html = await next.render('/')
    expect(html).toMatch(/API - support/)
  })

  it('should return 404 for undefined path', async () => {
    const { status } = await next.fetch('/api/not/unexisting/page/really')
    expect(status).toEqual(404)
  })

  it('should not conflict with /api routes', async () => {
    const res = await next.fetch('/api-conflict')
    expect(res.status).not.toEqual(404)
  })

  it('should set cors headers when adding cors middleware', async () => {
    const res = await next.fetch('/api/cors', {
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
    const text = await next.fetch('/api').then((res) => res.ok && res.text())
    expect(text).toEqual('Index should work')
  })

  it('should return custom error', async () => {
    const data = await next.fetch('/api/error')
    const body = await data.json()

    expect(data.status).toEqual(500)
    expect(body).toEqual({ error: 'Server error!' })
  })

  it('should throw Internal Server Error', async () => {
    const res = await next.fetch('/api/user-error')
    const text = await res.text()
    expect(res.status).toBe(500)

    if (isNextDev) {
      expect(text).toContain('User error')
    } else {
      expect(text).toBe('Internal Server Error')
    }
  })

  it('should throw Internal Server Error (async)', async () => {
    const res = await next.fetch('/api/user-error-async')
    const text = await res.text()
    expect(res.status).toBe(500)

    if (isNextDev) {
      expect(text).toContain('User error')
    } else {
      expect(text).toBe('Internal Server Error')
    }
  })

  it('should parse JSON body', async () => {
    const data = await next
      .fetch('/api/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify([{ title: 'Nextjs' }]),
      })
      .then((res) => res.ok && res.json())

    expect(data).toEqual([{ title: 'Nextjs' }])
  })

  it('should special-case empty JSON body', async () => {
    const data = await next
      .fetch('/api/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
      })
      .then((res) => res.ok && res.json())

    expect(data).toEqual({})
  })

  it('should support boolean for JSON in api page', async () => {
    const res = await next.fetch('/api/bool')
    const body = res.ok ? await res.json() : null
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    )
    expect(body).toBe(true)
  })

  it('should support undefined response body', async () => {
    const res = await next.fetch('/api/json-undefined')
    const body = res.ok ? await res.text() : null
    expect(body).toBe('')
  })

  it('should support string in JSON response body', async () => {
    const res = await next.fetch('/api/json-string')
    const body = res.ok ? await res.text() : null
    expect(body).toBe('"Hello world!"')
  })

  it('should support null in JSON response body', async () => {
    const res = await next.fetch('/api/json-null')
    const body = res.ok ? await res.json() : 'Not null'
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(
      'application/json; charset=utf-8'
    )
    expect(body).toBe(null)
  })

  it('should return error with invalid JSON', async () => {
    const data = await next.fetch('/api/parse', {
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
      res = await next.fetch('/api/parse', {
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
      expect(error.code).toBe('EPIPE')
    } else {
      expect(res.status).toEqual(413)
      expect(res.statusText).toEqual('Body exceeded 1mb limit')
    }
  })

  it('should parse bigger body then 1mb', async () => {
    const data = await next.fetch('/api/big-parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(json),
    })

    expect(data.status).toEqual(200)
  })

  it('should support etag spec', async () => {
    const response = await next.fetch('/api/blog')
    const etag = response.headers.get('etag')

    const unmodifiedResponse = await next.fetch('/api/blog', {
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

    const data = await next
      .fetch('/api/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-Form-urlencoded',
        },
        body: formBody,
      })
      .then((res) => res.ok && res.json())

    expect(data).toEqual({
      title: 'Nextjs',
      description: 'The React Framework for Production',
    })
  })

  it('should parse body in handler', async () => {
    const data = await next
      .fetch('/api/no-parsing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify([{ title: 'Nextjs' }]),
      })
      .then((res) => res.ok && res.json())

    expect(data).toEqual([{ title: 'Nextjs' }])
  })

  it('should parse body with config', async () => {
    const data = await next
      .fetch('/api/parsing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify([{ title: 'Nextjs' }]),
      })
      .then((res) => res.ok && res.json())

    expect(data).toEqual({ message: 'Parsed body' })
  })

  it('should show friendly error for invalid redirect', async () => {
    await next.fetch('/api/redirect-error')

    await retry(() => {
      expect(next.cliOutput).toContain(
        `Invalid redirect arguments. Please use a single argument URL, e.g. res.redirect('/destination') or use a status code and URL, e.g. res.redirect(307, '/destination').`
      )
    })
  })

  it('should show friendly error in case of passing null as first argument redirect', async () => {
    await next.fetch('/api/redirect-null')

    await retry(() => {
      expect(next.cliOutput).toContain(
        `Invalid redirect arguments. Please use a single argument URL, e.g. res.redirect('/destination') or use a status code and URL, e.g. res.redirect(307, '/destination').`
      )
    })
  })

  it('should redirect with status code 307', async () => {
    const res = await next.fetch('/api/redirect-307', {
      redirect: 'manual',
    })

    expect(res.status).toEqual(307)
    const text = await res.text()
    expect(text).toEqual('/login')
  })

  it('should redirect to login', async () => {
    const res = await next.fetch('/api/redirect-307')

    expect(res.redirected).toBe(true)
    expect(res.url).toContain('/login')
  })

  it('should redirect with status code 301', async () => {
    const res = await next.fetch('/api/redirect-301', {
      redirect: 'manual',
    })

    expect(res.status).toEqual(301)
    const text = await res.text()
    expect(text).toEqual('/login')
  })

  it('should return empty query object', async () => {
    const data = await next
      .fetch('/api/query')
      .then((res) => res.ok && res.json())
    expect(data).toEqual({})
  })

  it('should parse query correctly', async () => {
    const data = await next
      .fetch('/api/query?a=1&b=2&a=3')
      .then((res) => res.ok && res.json())
    expect(data).toEqual({ a: ['1', '3'], b: '2' })
  })

  it('should return empty cookies object', async () => {
    const data = await next
      .fetch('/api/cookies')
      .then((res) => res.ok && res.json())
    expect(data).toEqual({})
  })

  it('should return cookies object', async () => {
    const data = await next
      .fetch('/api/cookies', {
        headers: {
          Cookie: 'nextjs=cool;',
        },
      })
      .then((res) => res.ok && res.json())
    expect(data).toEqual({ nextjs: 'cool' })
  })

  it('should return 200 on POST on pages', async () => {
    const res = await next.fetch('/user', {
      method: 'POST',
    })

    expect(res.status).toEqual(200)
  })

  it('should return JSON on post on API', async () => {
    const data = await next
      .fetch('/api/blog?title=Nextjs', {
        method: 'POST',
      })
      .then((res) => res.ok && res.json())

    expect(data).toEqual([{ title: 'Nextjs' }])
  })

  it('should return data on dynamic route', async () => {
    const data = await next
      .fetch('/api/post-1')
      .then((res) => res.ok && res.json())

    expect(data).toEqual({ post: 'post-1' })
  })

  it('should work with dynamic params and search string', async () => {
    const data = await next
      .fetch('/api/post-1?val=1')
      .then((res) => res.ok && res.json())

    expect(data).toEqual({ val: '1', post: 'post-1' })
  })

  it('should work with dynamic params and search string like lambda', async () => {
    const res = await next.fetch('/api/post-1?val=1')
    const body = await res.json()

    expect(body).toEqual({ val: '1', post: 'post-1' })
  })

  it('should prioritize a non-dynamic page', async () => {
    const data = await next
      .fetch('/api/post-1/comments')
      .then((res) => res.ok && res.json())

    expect(data).toEqual([{ message: 'Prioritize a non-dynamic api page' }])
  })

  it('should return data on dynamic nested route', async () => {
    const data = await next
      .fetch('/api/post-1/comment-1')
      .then((res) => res.ok && res.json())

    expect(data).toEqual({ post: 'post-1', comment: 'comment-1' })
  })

  it('should 404 on optional dynamic api page', async () => {
    const res = await next.fetch('/api/blog/543/comment')

    expect(res.status).toBe(404)
  })

  it('should return data on dynamic optional nested route', async () => {
    const data = await next
      .fetch('/api/blog/post-1/comment/1')
      .then((res) => res.ok && res.json())

    expect(data).toEqual({ post: 'post-1', id: '1' })
  })

  it('should work with child_process correctly', async () => {
    const data = await next.render('/api/child-process')
    expect(data).toBe('hi')
  })

  it('should work with nullable payload', async () => {
    const data = await next.render('/api/nullable-payload')
    expect(data).toBe('')
  })

  it('should warn if response body is larger than 4MB', async () => {
    let res = await next.fetch('/api/large-response')
    expect(res.ok).toBeTruthy()
    expect(next.cliOutput).toContain(
      'API response for /api/large-response exceeds 4MB. API Routes are meant to respond quickly.'
    )

    res = await next.fetch('/api/large-chunked-response')
    expect(res.ok).toBeTruthy()
    expect(next.cliOutput).toContain(
      'API response for /api/large-chunked-response exceeds 4MB. API Routes are meant to respond quickly.'
    )
  })

  it('should not warn if response body is larger than 4MB with responseLimit config = false', async () => {
    await retry(async () => {
      let res = await next.fetch('/api/large-response-with-config')
      expect(res.ok).toBeTruthy()
      expect(next.cliOutput).not.toContain(
        'API response for /api/large-response-with-config exceeds 4MB. API Routes are meant to respond quickly.'
      )
    })
  })

  it('should warn with configured size if response body is larger than configured size', async () => {
    await retry(async () => {
      let res = await next.fetch('/api/large-response-with-config-size')
      expect(res.ok).toBeTruthy()
      expect(next.cliOutput).toContain(
        'API response for /api/large-response-with-config-size exceeds 5MB. API Routes are meant to respond quickly.'
      )
    })
  })

  if (isNextDev) {
    it('should compile only server code in development', async () => {
      await next.fetch('/api/users')

      expect(() =>
        getPageFileFromBuildManifest(next.testDir, '/api/users')
      ).toThrow(/No files for page/)

      expect(
        getPageFileFromPagesManifest(next.testDir, '/api/users')
      ).toBeTruthy()
    })

    it('should show warning when the API resolves without ending the request in development mode', async () => {
      const controller = new AbortController()
      setTimeout(() => {
        controller.abort()
      }, 2000)
      await next
        .fetch('/api/test-no-end', {
          signal: controller.signal,
        })
        .catch(() => {})

      await retry(() => {
        expect(next.cliOutput).toMatch(
          /API resolved without sending a response for \/api\/test-no-end, this may result in stalled requests/
        )
      })
    })

    it('should not show warning when the API resolves and the response is piped', async () => {
      const startIdx =
        next.cliOutput.length > 0
          ? next.cliOutput.length - 1
          : next.cliOutput.length
      await next.fetch(`/api/test-res-pipe?port=${next.appPort}`)
      expect(next.cliOutput.slice(startIdx)).not.toContain(
        `API resolved without sending a response for /api/test-res-pipe`
      )
    })

    it('should show false positive warning if not using externalResolver flag', async () => {
      const apiURL = '/api/external-resolver-false-positive'
      const req = await next.fetch(apiURL)
      expect(await req.text()).toBe('hello world')

      await retry(() => {
        expect(next.cliOutput).toContain(
          `API resolved without sending a response for ${apiURL}, this may result in stalled requests.`
        )
      })
    })

    it('should not show warning if using externalResolver flag', async () => {
      const startIdx =
        next.cliOutput.length > 0
          ? next.cliOutput.length - 1
          : next.cliOutput.length
      const apiURL = '/api/external-resolver'
      const req = await next.fetch(apiURL)
      expect(next.cliOutput.slice(startIdx)).not.toContain(
        `API resolved without sending a response for ${apiURL}`
      )
      expect(await req.text()).toBe('hello world')
    })
  } else {
    it('should build api routes', async () => {
      const pagesManifest = JSON.parse(
        await next.readFile(`.next/server/pages-manifest.json`)
      )
      expect(Object.keys(pagesManifest).includes('/api/[post]')).toBeTruthy()

      const res = await next.fetch('/api/nextjs')
      const body = await res.json()

      expect(body).toEqual({ post: 'nextjs' })

      const buildManifest = JSON.parse(
        await next.readFile('.next/build-manifest.json')
      )
      expect(
        Object.keys(buildManifest.pages).includes('/api-conflict')
      ).toBeTruthy()
    })
  }
})

describe('API routes output export error', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'http-proxy': 'latest',
      cors: 'latest',
      'node-fetch': '2.6.7',
    },
    skipStart: true,
    skipDeployment: true,
    disableAutoSkewProtection: true,
  })
  if (skipped) return

  it('should show error with output export', async () => {
    if (isNextDev) return

    await next.patchFile(
      'next.config.js',
      `module.exports = { output: 'export' }`
    )
    const { exitCode, cliOutput } = await next.build()
    expect(cliOutput).toContain('https://nextjs.org/docs/messages/gssp-export')
    expect(exitCode).toBe(1)
  })
})
