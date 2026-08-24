/* eslint-env jest */
import type { AddressInfo } from 'node:net'
import type { NextUrlWithParsedQuery } from '../../request-meta'

import http from 'node:http'

import { proxyRequest } from './proxy-request'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve']
  let reject!: Deferred<T>['reject']
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${port}`
}

async function closeServer(server: http.Server | undefined) {
  if (!server?.listening) return
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
}

function toParsedUrl(target: string): NextUrlWithParsedQuery {
  const parsed = new URL(target)
  return {
    auth: null,
    hash: parsed.hash || null,
    hostname: parsed.hostname,
    href: parsed.href,
    pathname: parsed.pathname,
    port: parsed.port || null,
    protocol: parsed.protocol,
    query: Object.fromEntries(parsed.searchParams),
    search: parsed.search || null,
    slashes: true,
  }
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out')), 5_000)
      timer.unref()
    }),
  ]).finally(() => clearTimeout(timer))
}

describe('proxyRequest', () => {
  let targetServer: http.Server | undefined
  let proxyServer: http.Server | undefined

  afterEach(async () => {
    await closeServer(proxyServer)
    await closeServer(targetServer)
    proxyServer = undefined
    targetServer = undefined
  })

  it('does not add redundant close listeners to the response', async () => {
    targetServer = http.createServer((_req, res) => res.end('proxied'))
    const targetUrl = await listen(targetServer)
    const closeListenerCount = deferred<number>()
    const proxyError = deferred<never>()

    proxyServer = http.createServer((req, res) => {
      const initialCount = res.listenerCount('close')
      res.once('finish', () => {
        closeListenerCount.resolve(res.listenerCount('close') - initialCount)
      })
      proxyRequest(req, res, toParsedUrl(targetUrl)).catch(proxyError.reject)
    })
    const proxyUrl = await listen(proxyServer)

    const response = await fetch(proxyUrl)
    expect(await response.text()).toBe('proxied')
    expect(
      await Promise.race([closeListenerCount.promise, proxyError.promise])
    ).toBeLessThanOrEqual(5)
  })

  it('aborts the upstream request when the client disconnects before a response', async () => {
    const targetReceived = deferred<void>()
    const targetClosed = deferred<void>()

    targetServer = http.createServer((_req, res) => {
      targetReceived.resolve()
      res.once('close', () => targetClosed.resolve())
    })
    const targetUrl = await listen(targetServer)

    proxyServer = http.createServer((req, res) => {
      proxyRequest(req, res, toParsedUrl(targetUrl)).catch(() => {})
    })
    const proxyUrl = await listen(proxyServer)

    const clientRequest = http.request(proxyUrl)
    clientRequest.on('error', () => {})
    clientRequest.end()

    await withTimeout(targetReceived.promise)
    clientRequest.destroy()
    await withTimeout(targetClosed.promise)
  })

  it('aborts the upstream response when the client disconnects while streaming', async () => {
    const targetStarted = deferred<void>()
    const targetClosed = deferred<void>()

    targetServer = http.createServer((_req, res) => {
      res.once('close', () => targetClosed.resolve())
      res.write('first chunk')
      targetStarted.resolve()
    })
    const targetUrl = await listen(targetServer)

    proxyServer = http.createServer((req, res) => {
      proxyRequest(req, res, toParsedUrl(targetUrl)).catch(() => {})
    })
    const proxyUrl = await listen(proxyServer)

    const clientClosed = deferred<void>()
    const clientRequest = http.get(proxyUrl, (res) => {
      res.once('data', () => {
        res.destroy()
        clientClosed.resolve()
      })
    })
    clientRequest.on('error', () => {})

    await withTimeout(targetStarted.promise)
    await withTimeout(clientClosed.promise)
    await withTimeout(targetClosed.promise)
  })
})
