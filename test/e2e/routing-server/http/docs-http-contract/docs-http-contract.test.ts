import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { Server, ServerResponse } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import cheerio from 'cheerio'

// Public contracts: route.mdx (request bodies/streams), loading.mdx (streamed
// statuses), API Routes (bodyParser), headers.mdx (immutable assets) and
// public-folder.mdx (default public-file caching).
describe('documented HTTP contracts', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  let control: Server | undefined
  const waiting = new Map<string, ServerResponse>()
  const released = new Set<string>()
  const completed = new Set<string>()

  function release(id: string) {
    released.add(id)
    waiting.get(id)?.end('released')
    waiting.delete(id)
  }

  beforeAll(async () => {
    if (!isNextDeploy) {
      control = createServer((request, response) => {
        if (request.url!.startsWith('/completed/')) {
          completed.add(
            decodeURIComponent(request.url!.slice('/completed/'.length))
          )
          response.end('completed')
          return
        }
        const id = decodeURIComponent(request.url!.slice(1))
        if (released.has(id)) response.end('released')
        else waiting.set(id, response)
      })
      control.listen(0, '127.0.0.1')
      await once(control, 'listening')
      const address = control.address()
      if (!address || typeof address === 'string')
        throw new Error('No control port')
      next.env.ROUTING_TEST_CONTROL_ORIGIN = 'http://127.0.0.1:' + address.port
    }
    await next.start()
  })

  afterAll(async () => {
    for (const id of waiting.keys()) release(id)
    if (control) {
      const closed = once(control, 'close')
      control.close()
      control.closeAllConnections()
      await closed
    }
  })

  it('[H01/H03] preserves binary response bytes, status and headers', async () => {
    const bytes = new Uint8Array([0, 255, 128, 13, 10, 0, 42])
    const response = await next.fetch('/echo', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: bytes,
    })
    expect(response.status).toBe(201)
    expect(response.headers.get('content-type')).toBe(
      'application/octet-stream'
    )
    expect(response.headers.get('x-received-bytes')).toBe(String(bytes.length))
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual(
      Array.from(bytes)
    )
  })

  it('[H01] reads multipart repeated fields and uploaded bytes', async () => {
    const form = new FormData()
    form.append('value', 'first')
    form.append('value', 'second')
    form.append(
      'file',
      new Blob([new Uint8Array([0, 255, 65])], {
        type: 'application/octet-stream',
      }),
      'contract.bin'
    )
    const response = await next.fetch('/echo', { method: 'POST', body: form })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      values: ['first', 'second'],
      file: {
        name: 'contract.bin',
        type: 'application/octet-stream',
        bytes: [0, 255, 65],
      },
    })
  })

  it('[H03] sends independent cookies that a browser returns to the destination', async () => {
    const response = await next.fetch('/cookies/set')
    expect(response.headers.getSetCookie()).toEqual([
      'first=one; Path=/; HttpOnly',
      'second=two; Path=/; HttpOnly',
    ])
    const browser = await next.browser('/')
    await browser.elementByCss('button').click()
    await retry(async () => {
      expect(JSON.parse(await browser.elementByCss('output').text())).toEqual({
        first: 'one',
        second: 'two',
      })
    })
  })

  it('[H03] honors poweredByHeader:false', async () => {
    expect((await next.fetch('/')).headers.get('x-powered-by')).toBeNull()
  })

  // The default parser limit is documented in bytes. Avoid JSON envelope
  // overhead so the below/at/above cases target the exact request-body limit.
  for (const [path, limit] of [
    ['/api/body', 1024 * 1024],
    ['/api/body-configured', 2 * 1024],
  ] as const) {
    it.each([limit - 1, limit])(
      '[H02] accepts %i bytes at ' + path,
      async (bytes) => {
        const response = await next.fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: 'x'.repeat(bytes),
        })
        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ bytes })
      }
    )

    it('[H02] rejects a body over the parser limit at ' + path, async () => {
      let status: number
      if (isNextDeploy) {
        // A hosting proxy can buffer requests before forwarding them.
        status = (
          await next.fetch(path, {
            method: 'POST',
            headers: { 'content-type': 'text/plain' },
            body: 'x'.repeat(limit + 1),
          })
        ).status
      } else {
        // Chunked framing makes the parser observe the actual over-limit
        // bytes before rejecting. Sending a known Content-Length can reject
        // before upload and race the client's remaining writes with EPIPE.
        status = await new Promise<number>((resolve, reject) => {
          const url = new URL(path, next.url)
          const request = (
            url.protocol === 'https:' ? httpsRequest : httpRequest
          )(
            url,
            {
              method: 'POST',
              headers: {
                'content-type': 'text/plain',
                'transfer-encoding': 'chunked',
              },
            },
            (response) => {
              response.resume()
              response.once('end', () => {
                resolve(response.statusCode!)
                request.destroy()
              })
              response.once('error', reject)
            }
          )
          request.on('error', reject)
          request.setTimeout(10000, () =>
            request.destroy(new Error('Body-limit response timed out'))
          )
          request.end('x'.repeat(limit + 1))
        })
      }
      // The configured limit is documented; 413 also preserves the existing
      // Pages API compatibility expectation from api-support's skipped case.
      expect(status).toBe(413)
    })
  }

  it('[H02] bodyParser:false preserves a stream larger than the default limit', async () => {
    const body = 'raw-λ'.repeat(250000)
    const response = await next.fetch('/api/body-raw', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body,
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      bytes: Buffer.byteLength(body),
      hash: createHash('sha256').update(body).digest('hex'),
    })
  })

  it('[H07] gives public files the documented default cache policy', async () => {
    const response = await next.fetch('/contract.txt')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('Public routing contract asset.\n')
    expect(response.headers.get('cache-control')).toBe('public, max-age=0')
  })

  // Development bundles are intentionally mutable.
  // @force-gate !dev
  it('[H07] immutable hashed assets override configured cache headers', async () => {
    const $ = await next.render$('/')
    const assets = $('script[src]')
      .toArray()
      .map((element) => $(element).attr('src')!)
      .filter((src) => src.includes('/_next/static/'))
    expect(assets.length).toBeGreaterThan(0)
    for (const asset of assets) {
      const response = await next.fetch(asset)
      expect(response.status).toBe(200)
      expect({
        asset,
        cacheControl: response.headers.get('cache-control'),
      }).toEqual({
        asset,
        cacheControl: 'public, max-age=31536000, immutable',
      })
    }
  })

  for (const [name, status] of [
    ['not-found', 404],
    ['redirect', 307],
    ['permanent-redirect', 308],
    ['unauthorized', 401],
    ['forbidden', 403],
  ] as const) {
    it(
      '[H05] returns ' + status + ' before the shell for ' + name,
      async () => {
        const response = await next.fetch('/status/' + name, {
          redirect: 'manual',
        })
        expect(response.status).toBe(status)
        if (name.includes('redirect')) {
          expect(
            new URL(response.headers.get('location')!, next.url).pathname
          ).toBe('/destination')
        } else {
          const html = await response.text()
          expect(html).toContain('Contract ' + name.replace('-', ' '))
          expect(
            cheerio.load(html)('meta[name="robots"]').attr('content')
          ).toContain('noindex')
          const browser = await next.browser('/status/' + name)
          expect(await browser.elementByCss('#' + name).text()).toBe(
            'Contract ' + name.replace('-', ' ')
          )
        }
      }
    )
  }

  // Controlled release requires an upstream on the test process's loopback
  // interface; a deployment cannot reach it. Non-controlled payload/status
  // assertions above still run in deploy mode.
  // @force-gate !deploy
  describe('responses held at an explicit release barrier', () => {
    it('[H10] Proxy waitUntil finishes controlled background work after the response', async () => {
      const id = randomUUID()
      try {
        const response = await next.fetch('/background-work?id=' + id, {
          signal: AbortSignal.timeout(15000),
        })
        expect(response.status).toBe(200)
        expect(await response.text()).toBe('response finished\n')
        await retry(() => expect(waiting.has(id)).toBe(true))
        expect(released.has(id)).toBe(false)
        expect(completed.has(id)).toBe(false)
        release(id)
        await retry(() => expect(completed.has(id)).toBe(true))
      } finally {
        release(id)
      }
    })

    async function readThrough(
      reader: ReadableStreamDefaultReader<Uint8Array>,
      marker: string
    ) {
      let text = ''
      const decoder = new TextDecoder()
      while (!text.includes(marker)) {
        const chunk = await reader.read()
        expect(chunk.done).toBe(false)
        text += decoder.decode(chunk.value, { stream: true })
      }
      return text
    }

    async function finish(reader: ReadableStreamDefaultReader<Uint8Array>) {
      let text = ''
      const decoder = new TextDecoder()
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) return text + decoder.decode()
        text += decoder.decode(chunk.value, { stream: true })
      }
    }

    for (const path of ['/stream', '/api/stream']) {
      it('[H04] delivers early bytes before release at ' + path, async () => {
        const id = randomUUID()
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
        try {
          const response = await next.fetch(path + '?id=' + id, {
            signal: AbortSignal.timeout(15000),
          })
          expect(response.status).toBe(200)
          reader = response.body!.getReader()
          const first = await readThrough(reader, 'first\n')
          expect(first).toBe('first\n')
          expect(released.has(id)).toBe(false)
          await retry(() => expect(waiting.has(id)).toBe(true))
          release(id)
          expect(first + (await finish(reader))).toBe('first\nlast\n')
        } finally {
          release(id)
          await reader?.cancel()
        }
      })
    }

    for (const name of [
      'not-found',
      'redirect',
      'permanent-redirect',
      'unauthorized',
      'forbidden',
    ]) {
      it('[H05] preserves 200 after the shell for ' + name, async () => {
        const id = randomUUID()
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
        try {
          const response = await next.fetch(
            '/streamed-status/' + name + '?id=' + id,
            {
              redirect: 'manual',
              signal: AbortSignal.timeout(15000),
            }
          )
          expect(response.status).toBe(200)
          expect(response.headers.get('location')).toBeNull()
          reader = response.body!.getReader()
          const first = await readThrough(reader, 'id="pending-shell"')
          await retry(() => expect(waiting.has(id)).toBe(true))
          expect(released.has(id)).toBe(false)
          release(id)
          const html = first + (await finish(reader))
          const $ = cheerio.load(html)
          if (name.includes('redirect')) {
            expect($('meta[http-equiv="refresh"]').attr('content')).toContain(
              '/destination'
            )
          } else {
            // React can deliver a fallback through its streamed instructions,
            // so check the public browser result rather than parsing an inert
            // response as if all of its UI were ordinary HTML elements.
            expect(html).toContain('Contract ' + name.replace('-', ' '))
            const browserId = randomUUID()
            release(browserId)
            const browser = await next.browser(
              '/streamed-status/' + name + '?id=' + browserId
            )
            expect(await browser.elementByCss('#' + name).text()).toBe(
              'Contract ' + name.replace('-', ' ')
            )
            expect($('meta[name="robots"]').attr('content')).toContain(
              'noindex'
            )
          }
        } finally {
          release(id)
          await reader?.cancel()
        }
      })
    }
  })
})
