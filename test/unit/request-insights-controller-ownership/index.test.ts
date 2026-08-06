import { spawnSync } from 'node:child_process'
import path from 'node:path'

const distDir = path.join(__dirname, '../../../packages/next/dist')
const resultMarker = '__REQUEST_INSIGHTS_RESULT__'

jest.setTimeout(120_000)

function runProbe(script: string, env: Record<string, string> = {}): unknown {
  const result = spawnSync(process.execPath, ['-e', script, distDir], {
    encoding: 'utf8',
    env: {
      ...process.env,
      __NEXT_DEV_SERVER: '1',
      NEXT_TELEMETRY_DISABLED: '1',
      ...env,
    },
    maxBuffer: 20 * 1024 * 1024,
    timeout: 120_000,
  })

  if (result.status !== 0) {
    throw new Error(
      result.stderr || result.stdout || `probe exited ${result.status}`
    )
  }

  const markerIndex = result.stdout.lastIndexOf(resultMarker)
  if (markerIndex === -1) {
    throw new Error(`probe did not report a result:\n${result.stdout}`)
  }

  return JSON.parse(result.stdout.slice(markerIndex + resultMarker.length))
}

function probeControllerAfterClose(inject: boolean): {
  createdOwnController: boolean
  retainedAfterClose: number
} {
  const script = String.raw`
    const fs = require('node:fs')
    const os = require('node:os')
    const path = require('node:path')
    const distDir = process.argv[1]
    const inject = ${JSON.stringify(inject)}

    function createFixture() {
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'request-insights-ownership-')
      )
      fs.mkdirSync(path.join(dir, '.next/server'), { recursive: true })
      fs.writeFileSync(path.join(dir, '.next/BUILD_ID'), 'test-build-id')
      fs.writeFileSync(
        path.join(dir, '.next/prerender-manifest.json'),
        JSON.stringify({
          version: 4,
          routes: {},
          dynamicRoutes: {},
          notFoundRoutes: [],
          preview: {
            previewModeId: 'test',
            previewModeSigningKey: 'test',
            previewModeEncryptionKey: 'test',
          },
        })
      )
      fs.writeFileSync(path.join(dir, '.next/server/pages-manifest.json'), '{}')
      fs.writeFileSync(
        path.join(dir, '.next/server/next-font-manifest.json'),
        JSON.stringify({
          pages: {},
          app: {},
          appUsingSizeAdjust: false,
          pagesUsingSizeAdjust: false,
        })
      )
      return dir
    }

    const { defaultConfig } = require(path.join(
      distDir,
      'server/config-shared'
    ))
    const NextNodeServer = require(path.join(
      distDir,
      'server/next-server'
    )).default
    const { RequestInsights } = require(path.join(
      distDir,
      'server/lib/trace/request-insights'
    ))

    async function main() {
      const injected = inject ? new RequestInsights() : undefined
      const server = new NextNodeServer({
        dir: createFixture(),
        dev: true,
        quiet: true,
        minimalMode: false,
        hostname: 'localhost',
        port: 3000,
        conf: {
          ...defaultConfig,
          configFileName: 'next.config.js',
          experimental: {
            ...defaultConfig.experimental,
            requestInsights: true,
            instantInsights: { validationLevel: 'warning' },
          },
        },
        requestInsights: injected,
      })

      const controller = injected ?? server.requestInsights
      await server.close()
      controller.recordSpan({
        requestId: 'after-close',
        attributes: { 'next.span_type': 'BaseServer.handleRequest' },
        startTime: 1,
        durationMs: 1,
      })
      process.stdout.write(
        '${resultMarker}' +
          JSON.stringify({
            createdOwnController: !inject && controller !== undefined,
            retainedAfterClose: controller.getSnapshot().requests.length,
          })
      )
    }

    main().catch((error) => {
      console.error(error)
      process.exit(1)
    })
  `

  return runProbe(script) as ReturnType<typeof probeControllerAfterClose>
}

function probeDirectRouterLifecycle(): {
  retainedBeforeClose: number
  retainedAfterClose: number
} {
  const script = String.raw`
    const fs = require('node:fs')
    const os = require('node:os')
    const path = require('node:path')
    const distDir = process.argv[1]
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'request-insights-router-lifecycle-')
    )
    process.on('exit', () =>
      fs.rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      })
    )
    fs.mkdirSync(path.join(dir, 'pages'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), '{"private":true}')
    fs.writeFileSync(
      path.join(dir, 'next.config.js'),
      "module.exports = { experimental: { requestInsights: true, instantInsights: { validationLevel: 'warning' } } }"
    )
    fs.writeFileSync(
      path.join(dir, 'pages/index.js'),
      'export default function Page() { return null }\n'
    )

    async function main() {
      let initialized
      try {
        const { initialize } = require(path.join(
          distDir,
          'server/lib/router-server'
        ))
        initialized = await initialize({
          dir,
          port: 3000,
          dev: true,
          hostname: 'localhost',
          quiet: true,
          onDevServerCleanup: undefined,
        })
        const controller = initialized.server.server.requestInsights
        controller.recordSpan({
          requestId: 'router-owned',
          url: '/router-owned',
          attributes: { 'next.span_type': 'BaseServer.handleRequest' },
          startTime: 1,
          durationMs: 1,
        })
        const retainedBeforeClose = controller.getSnapshot().requests.length

        await initialized.closeUpgraded()
        await initialized.server.close()
        initialized = undefined

        process.stdout.write(
          '${resultMarker}' +
            JSON.stringify({
              retainedBeforeClose,
              retainedAfterClose: controller.getSnapshot().requests.length,
            }),
          () => process.exit(0)
        )
      } finally {
        if (initialized) {
          await initialized.closeUpgraded()
          await initialized.server.close().catch(() => {})
        }
      }
    }

    main().catch((error) => {
      console.error(error)
      process.exit(1)
    })
  `

  return runProbe(script, {
    IS_TURBOPACK_TEST: '',
    TURBOPACK: '',
  }) as ReturnType<typeof probeDirectRouterLifecycle>
}

function probeConcurrentRealRequests(): {
  firstUrls: string[]
  secondUrls: string[]
  firstRetainedAfterClose: number
  secondUrlsAfterFirstClose: string[]
} {
  const script = String.raw`
    const fs = require('node:fs')
    const http = require('node:http')
    const os = require('node:os')
    const path = require('node:path')
    const distDir = process.argv[1]

    function createFixture(name) {
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'request-insights-real-' + name + '-')
      )
      fs.mkdirSync(path.join(dir, '.next/server'), { recursive: true })
      fs.writeFileSync(path.join(dir, '.next/BUILD_ID'), 'test-build-id')
      fs.writeFileSync(
        path.join(dir, '.next/prerender-manifest.json'),
        JSON.stringify({
          version: 4,
          routes: {},
          dynamicRoutes: {},
          notFoundRoutes: [],
          preview: {
            previewModeId: 'test',
            previewModeSigningKey: 'test',
            previewModeEncryptionKey: 'test',
          },
        })
      )
      fs.writeFileSync(path.join(dir, '.next/server/pages-manifest.json'), '{}')
      fs.writeFileSync(
        path.join(dir, '.next/server/next-font-manifest.json'),
        JSON.stringify({
          pages: {},
          app: {},
          appUsingSizeAdjust: false,
          pagesUsingSizeAdjust: false,
        })
      )
      return dir
    }

    const { defaultConfig } = require(path.join(
      distDir,
      'server/config-shared'
    ))
    const NextNodeServer = require(path.join(
      distDir,
      'server/next-server'
    )).default
    const { traceLocalSpan } = require(path.join(
      distDir,
      'server/lib/trace/local-span-recorder'
    ))

    let concurrentArrivals = 0
    let releaseConcurrentRequests
    const concurrentRequestsReady = new Promise((resolve) => {
      releaseConcurrentRequests = resolve
    })

    function createRunningServer(name, port) {
      const server = new NextNodeServer({
        dir: createFixture(name),
        dev: true,
        quiet: true,
        minimalMode: false,
        hostname: '127.0.0.1',
        port,
        conf: {
          ...defaultConfig,
          configFileName: 'next.config.js',
          experimental: {
            ...defaultConfig.experimental,
            requestInsights: true,
            instantInsights: { validationLevel: 'warning' },
          },
        },
      })

      server.handleRequestImpl = async (req, res) => {
        await traceLocalSpan({ name: 'real request handler' }, async () => {
          if (!req.url.includes('after-first-close')) {
            concurrentArrivals += 1
            if (concurrentArrivals === 2) releaseConcurrentRequests()
            await concurrentRequestsReady
          }
          const response = res.originalResponse ?? res
          response.statusCode = 200
          response.end(req.url)
        })
      }

      const httpServer = http.createServer((req, res) => {
        server.getRequestHandler()(req, res).catch((error) => {
          res.statusCode = 500
          res.end(String(error.stack || error))
        })
      })
      return { server, httpServer }
    }

    async function listen(running) {
      await new Promise((resolve, reject) => {
        running.httpServer.once('error', reject)
        running.httpServer.listen(0, '127.0.0.1', resolve)
      })
      running.origin =
        'http://127.0.0.1:' + running.httpServer.address().port
    }

    async function fetchOk(running, pathname) {
      const response = await fetch(running.origin + pathname)
      const body = await response.text()
      if (!response.ok) {
        throw new Error(pathname + ' returned ' + response.status + ': ' + body)
      }
    }

    async function waitForUrl(controller, expectedUrl) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const urls = controller.getSnapshot().requests.map(({ url }) => url)
        if (urls.includes(expectedUrl)) return urls
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      throw new Error('Timed out waiting for ' + expectedUrl)
    }

    async function closeRunning(running) {
      await new Promise((resolve, reject) => {
        running.httpServer.close((error) =>
          error ? reject(error) : resolve()
        )
        running.httpServer.closeAllConnections()
      })
      await running.server.close()
    }

    async function main() {
      let first = createRunningServer('first', 3000)
      let second = createRunningServer('second', 3001)
      try {
        await Promise.all([listen(first), listen(second)])
        await Promise.all([
          fetchOk(first, '/first'),
          fetchOk(second, '/second'),
        ])

        const firstController = first.server.requestInsights
        const secondController = second.server.requestInsights
        const [firstUrls, secondUrls] = await Promise.all([
          waitForUrl(firstController, '/first'),
          waitForUrl(secondController, '/second'),
        ])

        await closeRunning(first)
        first = undefined

        await fetchOk(second, '/second-after-first-close')
        const secondUrlsAfterFirstClose = await waitForUrl(
          secondController,
          '/second-after-first-close'
        )

        const result = {
          firstUrls,
          secondUrls,
          firstRetainedAfterClose:
            firstController.getSnapshot().requests.length,
          secondUrlsAfterFirstClose,
        }

        await closeRunning(second)
        second = undefined
        process.stdout.write(
          '${resultMarker}' + JSON.stringify(result),
          () => process.exit(0)
        )
      } finally {
        if (first) await closeRunning(first).catch(() => {})
        if (second) await closeRunning(second).catch(() => {})
      }
    }

    main().catch((error) => {
      console.error(error)
      process.exit(1)
    })
  `

  return runProbe(script) as ReturnType<typeof probeConcurrentRealRequests>
}

describe('Request Insights controller ownership', () => {
  it('transfers router ownership to the render server close lifecycle', () => {
    expect(probeDirectRouterLifecycle()).toEqual({
      retainedBeforeClose: 1,
      retainedAfterClose: 0,
    })
  })

  it('isolates concurrent real requests across two servers', () => {
    const result = probeConcurrentRealRequests()

    expect(result.firstUrls).toContain('/first')
    expect(result.firstUrls).not.toContain('/second')
    expect(result.secondUrls).toContain('/second')
    expect(result.secondUrls).not.toContain('/first')
    expect(result.firstRetainedAfterClose).toBe(0)
    expect(result.secondUrlsAfterFirstClose).toContain(
      '/second-after-first-close'
    )
  })

  it('preserves an injected controller across server close', () => {
    expect(probeControllerAfterClose(true)).toEqual({
      createdOwnController: false,
      retainedAfterClose: 1,
    })
  })

  it('disposes a self-created controller on server close', () => {
    expect(probeControllerAfterClose(false)).toEqual({
      createdOwnController: true,
      retainedAfterClose: 0,
    })
  })
})
