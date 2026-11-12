import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { isNextDev, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import {
  expectTraceEventContract,
  parseTraceFile,
} from '../../../lib/parse-trace-file'

type ExportedSpan = {
  name: string
  instrumentationScope: string
  traceId: string
  spanId: string
  parentSpanId?: string
  startTime: [number, number]
  endTime: [number, number]
  attributes: Record<string, unknown>
}
type Message = {
  kind:
    | 'config'
    | 'instrumentation-load'
    | 'register'
    | 'provider'
    | 'spans'
    | 'metrics'
  pid: number
  phase?: string
  installed?: boolean
  metricsInstalled?: boolean
  identityStable?: boolean
  registrations?: number
  time?: number
  spans?: ExportedSpan[]
  metrics?: {
    name: string
    unit: string
    instrumentationScope: string
    dataPoints: {
      attributes: Record<string, unknown>
      value: number | { count: number; sum: number; min: number; max: number }
    }[]
  }[]
  unfinished?: {
    name: string
    spanId: string
    traceId: string
    toolingId: unknown
  }[]
}
const webpackBuildOperations = [
  'create-entrypoints',
  'make',
  'seal',
  'chunk-graph',
  'optimize-modules',
  'optimize-chunks',
  'optimize',
  'optimize-tree',
  'optimize-chunk-modules',
  'module-hash',
  'node-file-trace-build',
]
const selectedNames = new Set([
  'dev-server-session',
  'render-path',
  'navigation-to-hydration',
  'turbopack-persistence',
  'turbopack-compaction',
  'turbopack-module-graph',
  'turbopack-write-entrypoints',
  'turbopack-emit',
  ...webpackBuildOperations,
  'next-export',
  'client-hmr-latency',
  'next-build',
  'run-webpack',
  'run-webpack-compiler',
  'run-turbopack',
  'run-typescript',
  'static-check',
  'static-generation',
  'collect-build-traces',
  'start-dev-server',
  'setup-dev-bundler',
  'hot-reloader',
  'webpack-compilation',
  'compile-path',
  ...['server', 'edge-server', 'client'].flatMap((compiler) => [
    `worker-main-${compiler}`,
    `webpack-invalidated-${compiler}`,
  ]),
])

const milliseconds = ([seconds, ns]: [number, number]) =>
  seconds * 1000 + ns / 1e6

function readMessages(output: string): Message[] {
  return output
    .split('\n')
    .slice(0, -1)
    .flatMap((line) => {
      const marker = '[tooling-otel]'
      const index = line.indexOf(marker)
      return index === -1 ? [] : [JSON.parse(line.slice(index + marker.length))]
    })
}

const dependencies = {
  '@opentelemetry/api': '1.9.0',
  '@opentelemetry/sdk-trace': '2.12.0',
  '@opentelemetry/sdk-metrics': '2.12.0',
}

function setupTooling(env: Record<string, string> = {}) {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies,
    startCommand: isNextDev
      ? `node node_modules/next/dist/bin/next ${process.env.IS_WEBPACK_TEST ? '--webpack' : '--turbopack'}`
      : undefined,
    env: {
      TOOLING_TRACE_FILE: join(
        'otel-output',
        ...(isNextDev ? ['dev'] : []),
        'trace'
      ),
      ...env,
    },
  })
  return {
    next,
    messages: () => readMessages(next.cliOutput),
    localEvents: () =>
      parseTraceFile(join(next.testDir, next.env.TOOLING_TRACE_FILE)).events,
  }
}

type ProviderCase = {
  name: string
  sampler: string
  distDir: string
  otelInBuild?: boolean
  preRegistered?: boolean
  withInstrumentation?: boolean
}

const providerCases: ProviderCase[] = (
  isNextDev ? ['.next', 'otel-output'] : ['otel-output']
).flatMap((distDir) =>
  (distDir === '.next' ? ['on'] : ['on', 'off']).map((sampler) => ({
    name: `${sampler} sampler, ${distDir} output`,
    sampler,
    distDir,
    otelInBuild: true,
  }))
)
if (!isNextDev) {
  for (const otelInBuild of [false, undefined]) {
    providerCases.push({
      name: `${otelInBuild === false ? 'disabled' : 'default'} build registration`,
      sampler: 'on',
      distDir: 'otel-output',
      otelInBuild,
    })
  }
}
providerCases.push({
  name: 'without instrumentation',
  sampler: 'on',
  distDir: 'otel-output',
  withInstrumentation: false,
})
if (!isNextDev) {
  providerCases.push({
    name: 'pre-registered provider with build registration disabled',
    sampler: 'on',
    distDir: 'otel-output',
    otelInBuild: false,
    preRegistered: true,
  })
}

// Local files, SDK output, and CLI process shutdown are self-hosted contracts.
// @force-gate !deploy
describe('experimental tooling OTel', () => {
  describe.each(providerCases)(
    '$name',
    ({
      sampler,
      distDir,
      otelInBuild,
      preRegistered = false,
      withInstrumentation = true,
    }) => {
      const { next, messages, localEvents } = setupTooling({
        ...(isNextDev && distDir === '.next' && sampler === 'on' && otelInBuild
          ? {}
          : { NEXT_EXIT_TIMEOUT_MS: '30000' }),
        TOOLING_SAMPLER: sampler,
        ...(preRegistered ? { TOOLING_PRE_REGISTER: '1' } : {}),
      })

      beforeAll(async () => {
        if (otelInBuild !== true) {
          await next.patchFile('next.config.ts', (source) =>
            source.replace(
              'otelInBuild: true',
              otelInBuild === undefined ? '' : `otelInBuild: ${otelInBuild}`
            )
          )
        }
        if (!withInstrumentation) await next.deleteFile('instrumentation.ts')
        if (isNextDev && distDir === '.next') {
          // Keep the default legacy path and the existing custom-dev path covered.
          await next.patchFile('next.config.ts', (source) =>
            source.replace("'otel-output'", "'.next'")
          )
        }
        next.env.TOOLING_TRACE_FILE = join(
          distDir,
          ...(isNextDev ? ['dev'] : []),
          'trace'
        )
        await next.start()
      })

      afterAll(async () => {
        await next.stop('SIGTERM')
      })

      it('keeps local files independent while exporting through the application provider', async () => {
        expect(await next.render('/')).toContain('hello world')
        if (isNextDev) {
          const pagesBrowser = await next.browser('/legacy-pages')
          expect(await pagesBrowser.elementByCss('p').text()).toBe(
            'pages hydrated'
          )
          await retry(async () => {
            expect(
              (await pagesBrowser.log()).some((entry) =>
                entry.message.includes('[HMR] connected')
              )
            ).toBe(true)
          })
          await pagesBrowser.close()
          const browser = await next.browser('/')
          await browser.eval(`
            window.__NEXT_HMR_LATENCY_CB = (latency) => {
              window.__toolingHmrLatency = latency
            }
          `)
          await next.patchFile('app/page.tsx', (source) =>
            source.replace('hello world', 'edited page')
          )
          await retry(async () => {
            expect(await browser.elementByCss('p').text()).toBe('edited page')
            expect(await browser.eval('window.__toolingHmrLatency')).toEqual(
              expect.any(Number)
            )
          })
          await browser.close()
        }
        if (isNextDev && sampler === 'on' && withInstrumentation) {
          await retry(async () => {
            const exported = messages().flatMap(
              (message) => message.spans ?? []
            )
            expect(exported).toEqual(
              expect.arrayContaining([
                expect.objectContaining({
                  name: 'client-hmr-latency',
                  attributes: expect.objectContaining({ page: '/' }),
                }),
                expect.objectContaining({ name: 'compile-path' }),
              ])
            )
          }, 15000)
        }
        await next.stop('SIGTERM')
        const local = localEvents()
        expectTraceEventContract(local)
        if (isNextDev) {
          expect(local.map((event) => event.name)).toEqual(
            expect.arrayContaining([
              'start-dev-server',
              'setup-dev-bundler',
              'hot-reloader',
              'compile-path',
              'client-hmr-latency',
              'render-path',
              'navigation-to-hydration',
              'memory-usage',
              ...(process.env.IS_WEBPACK_TEST ? ['webpack-compilation'] : []),
            ])
          )
        } else {
          expect(local.map((event) => event.name)).toEqual(
            expect.arrayContaining([
              'next-build',
              'static-check',
              'static-generation',
              'next-export',
              'run-typescript',
              'memory-usage',
              ...(process.env.IS_WEBPACK_TEST
                ? ['webpack-compilation', ...webpackBuildOperations]
                : [
                    'turbopack-module-graph',
                    'turbopack-write-entrypoints',
                    'turbopack-emit',
                    'turbopack-persistence',
                  ]),
            ])
          )
        }
        const rootName = isNextDev ? 'dev-server-session' : 'next-build'
        expect(local.some((event) => event.name === rootName)).toBe(true)
        // Fine observations remain in the full local hierarchy, never the SDK lane.
        expect(local.some((event) => !selectedNames.has(event.name))).toBe(true)
        const registrations = messages().filter(
          (message) => message.kind === 'register'
        )
        const coordinator = messages().find(
          (message) =>
            message.kind === 'config' &&
            message.phase === 'phase-production-build'
        )
        if (!isNextDev) {
          expect(coordinator).toBeDefined()
          if (otelInBuild !== true) {
            expect(
              messages().filter(
                (message) =>
                  message.pid === coordinator!.pid &&
                  ['instrumentation-load', 'register'].includes(message.kind)
              )
            ).toEqual([])
            expect(
              registrations
                .filter((message) => message.phase === 'phase-production-build')
                .every((message) => message.pid !== coordinator!.pid)
            ).toBe(true)
          }
        }
        if (
          !withInstrumentation ||
          (!isNextDev && !preRegistered && otelInBuild !== true)
        ) {
          if (!withInstrumentation) {
            expect(registrations).toEqual([])
            expect(
              messages().filter(
                (message) => message.kind === 'instrumentation-load'
              )
            ).toEqual([])
          } else {
            expect(registrations.length).toBeGreaterThan(0)
            for (const registration of registrations) {
              expect(registration).toMatchObject({
                installed: true,
                registrations: 1,
              })
              expect(registration.pid).not.toBe(coordinator!.pid)
            }
          }
          expect(
            messages()
              .flatMap((message) => message.spans ?? [])
              .filter(
                (span) => span.attributes['next.tooling.id'] !== undefined
              )
          ).toEqual([])
          expect(
            messages().flatMap((message) => message.metrics ?? [])
          ).toEqual([])
          return
        }
        expect(registrations).not.toHaveLength(0)
        if (isNextDev) expect(registrations).toHaveLength(1)
        const registration = isNextDev
          ? registrations[0]
          : messages().find(
              (message) =>
                message.pid === coordinator!.pid &&
                message.kind === (preRegistered ? 'provider' : 'register')
            )!
        expect(registration).toBeDefined()
        expect(
          messages()
            .filter(
              (message) =>
                message.pid === registration.pid &&
                ['provider', 'register', 'spans', 'metrics'].includes(
                  message.kind
                )
            )
            .every((message) => message.identityStable)
        ).toBe(true)
        expect(registration).toMatchObject({
          installed: true,
          metricsInstalled: true,
          registrations: preRegistered ? 0 : 1,
        })
        const exportedMetrics = messages().flatMap(
          (message) => message.metrics ?? []
        )
        for (const [operation, measurements] of [
          [
            'memory-usage',
            [
              ['memory.rss', 'memory.rss', 'By'],
              ['memory.heapUsed', 'memory.heap_used', 'By'],
              ['memory.heapTotal', 'memory.heap_total', 'By'],
            ],
          ],
          [
            'turbopack-persistence',
            [
              ['bytes_written', 'turbopack.bytes_written', 'By'],
              ['bytes_deleted', 'turbopack.bytes_deleted', 'By'],
              ['task_count', 'turbopack.task_count', '{task}'],
            ],
          ],
          [
            'turbopack-compaction',
            [
              ['bytes_written', 'turbopack.bytes_written', 'By'],
              ['bytes_deleted', 'turbopack.bytes_deleted', 'By'],
            ],
          ],
        ] as const) {
          const observations = local.filter((event) => event.name === operation)
          if (operation === 'memory-usage')
            expect(observations.length).toBeGreaterThan(0)
          if (!observations.length) continue
          for (const [tag, suffix, unit] of measurements) {
            const values = observations.map((event) => Number(event.tags[tag]))
            expect(
              values.every(
                (value) =>
                  Number.isFinite(value) &&
                  (operation === 'memory-usage' ? value > 0 : value >= 0)
              )
            ).toBe(true)
            const metric = exportedMetrics
              .filter((item) => item.name === `next.tooling.${suffix}`)
              .at(-1)!
            const point = metric?.dataPoints.find(
              (point) => point.attributes.operation === operation
            )
            const count = (point?.value as { count: number })?.count
            expect(count).toBeGreaterThan(0)
            expect(count).toBeLessThanOrEqual(values.length)
            const sampledValues = values.slice(0, count)
            expect(metric).toMatchObject({
              unit,
              instrumentationScope: 'next.js',
            })
            expect(point).toMatchObject({
              attributes: { operation },
              value: {
                count,
                sum: sampledValues.reduce((sum, value) => sum + value, 0),
                min: Math.min(...sampledValues),
                max: Math.max(...sampledValues),
              },
            })
            if (operation === 'memory-usage')
              expect(metric.dataPoints).toHaveLength(1)
          }
        }
        const allSpans = messages().flatMap((message) => message.spans ?? [])
        const tooling = allSpans.filter(
          (span) => span.attributes['next.tooling.id'] !== undefined
        )
        if (sampler === 'off') {
          expect(tooling).toHaveLength(0)
          return
        }
        const expected = local.filter((event) => selectedNames.has(event.name))
        expect(
          tooling
            .map((span) => span.attributes['next.tooling.id'] as number)
            .sort((a, b) => a - b)
        ).toEqual(expected.map((event) => event.id).sort((a, b) => a - b))
        expect(tooling.map((span) => span.name)).toContain(rootName)
        const root = tooling.find((span) => span.name === rootName)!
        expect(root).toBeDefined()
        expect(root.attributes).toMatchObject({
          'next.tooling.session_id': expect.any(String),
          'next.tooling.telemetry_session_id': expect.any(String),
          'next.tooling.anonymous_id': expect.any(String),
          'next.tooling.arch': process.arch,
          'next.tooling.platform': process.platform,
          'next.tooling.cpus': expect.any(Number),
          'next.tooling.mode': isNextDev ? 'dev' : 'build',
          'next.tooling.turbopack': !process.env.IS_WEBPACK_TEST,
          'next.tooling.package_name': expect.any(String),
          'next.tooling.branch': expect.any(String),
          'next.tooling.commit': expect.any(String),
          'next.tooling.version': expect.any(String),
        })
        expect(root.attributes['next.tooling.session_id']).not.toBe('')
        if (isNextDev) {
          expect(root.attributes['exit.reason']).toBe('SIGTERM')
          expect(
            tooling.find((span) => span.name === 'start-dev-server')
          ).toMatchObject({
            parentSpanId: root.spanId,
          })
        }
        expect(root.parentSpanId).toBeUndefined()
        expect(milliseconds(root.startTime)).toBeLessThan(registration.time!)
        expect(milliseconds(root.endTime)).toBeGreaterThanOrEqual(
          registration.time!
        )
        const early = tooling.filter(
          (span) => milliseconds(span.endTime) <= registration.time!
        )
        if (!preRegistered) expect(early.length).toBeGreaterThan(0)
        expect(
          new Set(tooling.map((span) => span.attributes['next.tooling.id']))
            .size
        ).toBe(tooling.length)
        const spansById = new Map(tooling.map((span) => [span.spanId, span]))
        const unfinishedById = new Map(
          messages()
            .filter(
              (message) =>
                message.pid === registration.pid && message.kind === 'spans'
            )
            .at(-1)
            ?.unfinished?.map((span) => [span.spanId, span])
        )
        const localById = new Map(local.map((event) => [event.id, event]))
        for (const span of tooling) {
          expect(span.traceId).toBe(root.traceId)
          expect(span.instrumentationScope).toBe('next.js')
          expect(selectedNames.has(span.name)).toBe(true)
          const event = localById.get(
            span.attributes['next.tooling.id'] as number
          )!
          expect(event).toBeDefined()
          expect(event.name).toBe(span.name)
          for (const [key, value] of Object.entries(event.tags)) {
            expect(span.attributes[key]).toEqual(
              typeof value === 'object' ? JSON.stringify(value) : value
            )
          }
          expect(span.attributes['next.tooling.parent_id']).toBe(event.parentId)
          expect(
            Math.abs(milliseconds(span.startTime) - event.startTime!)
          ).toBeLessThan(5)
          expect(
            Math.abs(
              milliseconds(span.endTime) -
                milliseconds(span.startTime) -
                event.duration / 1000
            )
          ).toBeLessThan(1)
          const parent = span.parentSpanId && spansById.get(span.parentSpanId)
          if (parent) {
            // Skip omitted fine ancestors in the SDK tree, not in local files.
            let parentId = event.parentId
            const seen = new Set<number>()
            while (parentId !== undefined && !seen.has(parentId)) {
              seen.add(parentId)
              const localParent = localById.get(parentId)
              if (!localParent || selectedNames.has(localParent.name)) break
              parentId = localParent.parentId
            }
            expect(parent.attributes['next.tooling.id']).toBe(parentId)
          } else if (span.parentSpanId) {
            const liveParent = unfinishedById.get(span.parentSpanId)
            expect(liveParent).toMatchObject({
              traceId: span.traceId,
              toolingId: event.parentId,
            })
            expect(localById.has(liveParent!.toolingId as number)).toBe(false)
          }
        }
        if (!isNextDev && process.env.IS_WEBPACK_TEST) {
          const workers = tooling.filter((span) =>
            span.name.startsWith('worker-main-')
          )
          expect(workers.length).toBeGreaterThan(0)
          for (const worker of workers)
            expect(worker.parentSpanId).toBe(root.spanId)
        }
      })
    }
  )

  // Restart and child-process lifetime are dev-server contracts.
  // @force-gate dev
  describe.each(['on', 'off'])('memory restart, %s sampler', (sampler) => {
    const { next, messages } = setupTooling({
      NEXT_EXIT_TIMEOUT_MS: '30000',
      TOOLING_SAMPLER: sampler,
    })

    beforeAll(async () => {
      await next.start()
    })
    afterAll(async () => {
      await next.stop('SIGTERM')
    })

    it('reports the completed process session before restarting', async () => {
      await next.render('/')
      const registration = messages().find(
        (message) => message.kind === 'register'
      )!
      expect(registration).toBeDefined()
      expect(await (await next.fetch('/api/restart-memory')).json()).toEqual({
        restarting: true,
      })
      await retry(async () => {
        const processMessages = messages().filter(
          (message) => message.pid === registration.pid
        )
        const sessions = processMessages
          .flatMap((message) => message.spans ?? [])
          .filter((span) => span.name === 'dev-server-session')
        if (sampler === 'off') expect(sessions).toEqual([])
        else {
          expect(sessions).toHaveLength(1)
          expect(sessions[0].attributes['exit.reason']).toBe('memory-threshold')
        }
        expect(
          messages().some(
            (message) =>
              message.kind === 'register' && message.pid !== registration.pid
          )
        ).toBe(true)
      }, 30000)
      expect(await next.render('/')).toContain('hello world')
    })
  })

  // Separate compiler workers and their local files are Webpack build contracts.
  // @force-gate start && webpack
  describe('parallel compiler replay', () => {
    const { next, messages, localEvents } = setupTooling({
      TOOLING_SAMPLER: 'on',
    })

    it('retains both parallel worker results locally and in the application provider', async () => {
      await next.patchFile('next.config.ts', (source) =>
        source.replace(
          'otelInBuild: true',
          'otelInBuild: true, webpackBuildWorker: true, parallelServerCompiles: true, parallelServerBuildTraces: true'
        )
      )
      await next.patchFile(
        'app/edge/route.ts',
        "export const runtime = 'edge'; export function GET() { return new Response('edge') }"
      )
      expect((await next.build()).exitCode).toBe(0)
      const local = localEvents()
      const exported = messages().flatMap((message) => message.spans ?? [])
      const root = exported.find((span) => span.name === 'next-build')!
      expect(root).toBeDefined()
      const correlation = (name: string, id: unknown, parentId: unknown) =>
        JSON.stringify([name, id, parentId])
      expect(
        exported
          .filter((span) => span.attributes['next.tooling.id'] !== undefined)
          .map((span) =>
            correlation(
              span.name,
              span.attributes['next.tooling.id'],
              span.attributes['next.tooling.parent_id']
            )
          )
          .sort()
      ).toEqual(
        local
          .filter((event) => selectedNames.has(event.name))
          .map((event) => correlation(event.name, event.id, event.parentId))
          .sort()
      )
      const fileTrace = exported.filter(
        (span) => span.name === 'node-file-trace-build'
      )
      expect(fileTrace).toHaveLength(1)
      expect(fileTrace[0].parentSpanId).toBe(
        exported.find((span) => span.name === 'collect-build-traces')?.spanId
      )
      for (const compiler of ['server', 'edge-server', 'client']) {
        const name = `worker-main-${compiler}`
        const events = local.filter((event) => event.name === name)
        const spans = exported.filter((span) => span.name === name)
        expect(events).toHaveLength(1)
        expect(spans).toHaveLength(1)
        expect(spans[0].traceId).toBe(root.traceId)
        expect(spans[0].parentSpanId).toBe(root.spanId)
        expect(spans[0].attributes['next.tooling.id']).toBe(events[0].id)
        expect(spans[0].attributes['next.tooling.parent_id']).toBe(
          events[0].parentId
        )
      }
      // Legacy numeric IDs can overlap across parallel workers. Correlate each
      // result by its compiler name rather than pretending IDs are global.
    })
  })

  // A webpack config hook has no equivalent execution path in Turbopack.
  // @force-gate start && webpack
  describe('compiler setup failure', () => {
    const { next, localEvents } = setupTooling()

    it('completes the compiler span when config setup throws', async () => {
      await next.patchFile('next.config.ts', (source) =>
        source
          .replace(
            "distDir: 'otel-output'",
            "distDir: 'otel-output', webpack() { throw new Error('tooling-webpack-setup-failure') }"
          )
          .replace(
            'otelInBuild: true',
            'otelInBuild: true, webpackBuildWorker: false'
          )
      )
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain('tooling-webpack-setup-failure')
      const events = localEvents()
      expectTraceEventContract(events)
      const root = events.find((event) => event.name === 'next-build')!
      expect(root.tags).toMatchObject({ failed: true })
      const compilers = events.filter(
        (event) => event.name === 'run-webpack-compiler'
      )
      expect(compilers).toHaveLength(1)
      const compiler = compilers[0]
      expect(compiler.parentId).toBe(root.id)
      expect(compiler.tags).toMatchObject({ failed: true })
      const config = events.find(
        (event) => event.name === 'generate-webpack-config'
      )!
      expect(config.parentId).toBe(compiler.id)
      expect(config.timestamp).toBeGreaterThanOrEqual(compiler.timestamp)
      expect(config.timestamp + config.duration).toBeLessThanOrEqual(
        compiler.timestamp + compiler.duration
      )
      expect(compiler.timestamp + compiler.duration).toBeLessThanOrEqual(
        root.timestamp + root.duration
      )
    })
  })

  // Compiler failure and prerender failure are build-only process boundaries.
  // @force-gate start
  describe.each(['removed', 'before', 'after'])(
    'build lifecycle: %s',
    (phase) => {
      const { next, messages, localEvents } = setupTooling({
        TOOLING_SAMPLER: 'on',
      })

      it('uses the current instrumentation entry and preserves completed failure reporting', async () => {
        if (phase === 'after') {
          // process.exit() bypasses build finalizers; exercise controlled failure.
          await next.patchFile('next.config.ts', (source) =>
            source.replace(
              'otelInBuild: true',
              'otelInBuild: true, prerenderEarlyExit: false'
            )
          )
          await next.patchFile(
            'app/page.tsx',
            "export default function Page() { throw new Error('tooling-prerender-failure') }"
          )
        } else {
          await next.patchFile('next.config.ts', (source) =>
            source.replace(
              "distDir: 'otel-output'",
              "distDir: 'otel-output', cleanDistDir: false"
            )
          )
          await next.patchFile(
            'otel-output/server/instrumentation.js',
            "require('node:fs').writeFileSync('stale-instrumentation-ran', 'unexpected'); exports.register = () => {}"
          )
          if (phase === 'removed') await next.deleteFile('instrumentation.ts')
          else
            await next.patchFile(
              'app/page.tsx',
              "import './missing-tooling-fixture'; export default function Page() { return <p>broken</p> }"
            )
        }
        const { exitCode } = await next.build()
        expect(exitCode === 0).toBe(phase === 'removed')
        const events = localEvents()
        expectTraceEventContract(events)
        const root = events.find((event) => event.name === 'next-build')!
        expect(root).toBeDefined()
        if (phase !== 'removed')
          expect(root.tags).toMatchObject({ failed: true })
        expect(
          existsSync(join(next.testDir, 'stale-instrumentation-ran'))
        ).toBe(false)
        if (phase === 'after') {
          expect(
            messages().filter((message) => message.kind === 'register')
          ).toHaveLength(1)
          const exported = messages().flatMap((message) => message.spans ?? [])
          expect(
            exported.find((span) => span.name === 'next-build')?.attributes
          ).toMatchObject({ failed: true })
        } else {
          expect(
            messages().filter((message) => message.kind !== 'config')
          ).toEqual([])
        }
      })
    }
  )
})
