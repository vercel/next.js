import type { ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { readdir } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { nextTestSetup } from 'e2e-utils'
import fs from 'fs-extra'
import { findPort, initNextServerScript, killApp } from 'next-test-utils'
import WebSocket from 'ws'

// This fixture deliberately verifies the legacy ISR prerender manifest, which
// is not produced when Cache Components is enabled.
const describeWithoutCacheComponents =
  process.env.__NEXT_CACHE_COMPONENTS === 'true' ? describe.skip : describe

describeWithoutCacheComponents(
  'WebSocket Route Handlers with output: standalone',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    let appPort: number
    let closeReceiptPath: string
    let hasPrerenderedRuntimeStaticRoute = false
    let routeTraceFiles: string[]
    let server: ChildProcess | undefined
    let standaloneDir: string
    let standaloneNodeModulesFiles: string[]

    function requestUpgrade(requestPath: string) {
      return new Promise<{
        status: number
        headers: http.IncomingHttpHeaders
        body: string
      }>((resolve, reject) => {
        const request = http.request({
          host: '127.0.0.1',
          port: appPort,
          path: requestPath,
          headers: {
            connection: 'Upgrade',
            upgrade: 'websocket',
            'sec-websocket-key': Buffer.alloc(16).toString('base64'),
            'sec-websocket-version': '13',
          },
        })
        request.once('response', (response) => {
          const chunks: Buffer[] = []
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
          response.on('end', () => {
            resolve({
              status: response.statusCode!,
              headers: response.headers,
              body: Buffer.concat(chunks).toString(),
            })
          })
        })
        request.once('upgrade', (response, socket) => {
          socket.destroy()
          resolve({
            status: response.statusCode!,
            headers: response.headers,
            body: '',
          })
        })
        request.once('error', reject)
        request.end()
      })
    }

    beforeAll(async () => {
      await next.build({ env: { WEBSOCKET_RUNTIME_UPGRADE: '0' } })

      const prerenderManifest = await next.readJSON(
        '.next/prerender-manifest.json'
      )
      hasPrerenderedRuntimeStaticRoute = Boolean(
        prerenderManifest.routes['/runtime-static']
      )

      const routeFile = path.join(next.testDir, '.next/server/app/ws/route.js')
      const routeTrace = (await fs.readJSON(`${routeFile}.nft.json`)) as {
        files: string[]
      }
      routeTraceFiles = routeTrace.files.map((file) =>
        path.resolve(path.dirname(routeFile), file).replaceAll('\\', '/')
      )

      const isolatedRoot = await fs.mkdtemp(
        path.join(tmpdir(), 'next-websocket-standalone-')
      )
      standaloneDir = path.join(isolatedRoot, 'standalone')
      closeReceiptPath = path.join(isolatedRoot, 'close-receipt.json')
      await fs.move(path.join(next.testDir, '.next/standalone'), standaloneDir)
      standaloneNodeModulesFiles = await readdir(
        path.join(standaloneDir, 'node_modules'),
        { recursive: true }
      )

      appPort = await findPort()
      server = await initNextServerScript(
        path.join(standaloneDir, 'server.js'),
        /Ready in/i,
        {
          ...process.env,
          PORT: appPort.toString(),
          WEBSOCKET_RUNTIME_UPGRADE: '1',
          WEBSOCKET_CLOSE_RECEIPT: closeReceiptPath,
        },
        undefined,
        { cwd: standaloneDir }
      )
    })

    afterAll(async () => {
      if (server && server.exitCode === null && server.signalCode === null) {
        await killApp(server).catch(() => {})
      }
      if (standaloneDir && !process.env.NEXT_TEST_SKIP_CLEANUP) {
        await fs.remove(path.dirname(standaloneDir))
      }
    })

    it('rejects a prerendered ISR upgrade in the standalone server', async () => {
      expect(hasPrerenderedRuntimeStaticRoute).toBe(true)
      const ordinaryGet = await fetch(
        `http://127.0.0.1:${appPort}/runtime-static`
      )
      expect(ordinaryGet.status).toBe(200)
      await ordinaryGet.body?.cancel()

      const response = await requestUpgrade('/runtime-static')
      expect(response).toMatchObject({
        status: 404,
        body: 'Not Found',
        headers: {
          'cache-control':
            'private, no-cache, no-store, max-age=0, must-revalidate',
          connection: 'close',
          'content-length': '9',
          'content-type': 'text/plain; charset=utf-8',
          'x-standalone-public': 'public-value',
        },
      })
      for (const name of [
        'age',
        'cloudflare-cdn-cache-control',
        'cdn-cache-control',
        'content-encoding',
        'edge-control',
        'etag',
        'example-cache-control',
        'expires',
        'last-modified',
        'netlify-cdn-cache-control',
        'proxy-connection',
        'set-cookie',
        'surrogate-control',
        'vercel-cdn-cache-control',
        'x-accel-buffering',
        'x-accel-expires',
        'x-accel-redirect',
        'x-lighttpd-send-file',
        'x-sendfile',
        'x-standalone-hop',
        'x-standalone-proxy-hop',
      ]) {
        expect(response.headers[name]).toBeUndefined()
      }
      const executions = await fetch(
        `http://127.0.0.1:${appPort}/runtime-executions`
      )
      expect(await executions.json()).toEqual({ executions: 0 })
    })

    it('traces WebSocket support and closes accepted peers during SIGTERM', async () => {
      expect(
        routeTraceFiles.some((reference) =>
          /(?:^|\/)server\/route-modules\/app-route\/websocket-runtime\.external\.[cm]?[jt]s$/.test(
            reference
          )
        )
      ).toBe(true)
      expect(
        routeTraceFiles.some((reference) =>
          /(?:^|\/)websocket-upgrade\.[cm]?[jt]s$/.test(reference)
        )
      ).toBe(true)
      expect(
        routeTraceFiles.some((reference) =>
          /(?:^|\/)(?:compiled|node_modules)\/crossws(?:\/|$)/.test(reference)
        )
      ).toBe(false)
      expect(
        routeTraceFiles.some((reference) =>
          /(?:^|\/)(?:compiled|node_modules)\/ws(?:\/|$)/.test(reference)
        )
      ).toBe(true)
      for (const optionalAddon of ['bufferutil', 'utf-8-validate']) {
        const optionalAddonPattern = new RegExp(
          `(?:^|/)${optionalAddon}(?:/|$)`
        )
        expect(
          routeTraceFiles.some((reference) =>
            optionalAddonPattern.test(reference)
          )
        ).toBe(false)
        expect(
          standaloneNodeModulesFiles.some((file) =>
            optionalAddonPattern.test(file.replaceAll('\\', '/'))
          )
        ).toBe(false)
      }

      const socket = new WebSocket(`ws://127.0.0.1:${appPort}/ws`)

      try {
        const upgraded = once(socket, 'upgrade')
        const connected = once(socket, 'message')
        await once(socket, 'open')

        const [response] = await upgraded
        expect(response.statusCode).toBe(101)
        expect((await connected)[0].toString()).toBe('connected')

        const echoed = once(socket, 'message')
        socket.send('standalone-echo')
        expect((await echoed)[0].toString()).toBe('standalone-echo')

        const closed = once(socket, 'close')
        const exited = once(server!, 'exit')
        process.kill(server!.pid!, 'SIGTERM')

        const [code] = await closed
        expect(code).toBe(1001)
        expect(await exited).toEqual([143, null])
        expect(await fs.readJSON(closeReceiptPath)).toEqual({
          code: 1001,
          reason: '',
        })
      } finally {
        if (socket.readyState !== WebSocket.CLOSED) {
          socket.terminate()
        }
      }
    })
  }
)
