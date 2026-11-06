import { createServer, type Server } from 'node:http'
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
  kind: 'register' | 'flush' | 'spans'
  pid: number
  phase?: string
  installed?: boolean
  identityStable?: boolean
  registrations?: number
  time?: number
  localHasRoot?: boolean
  spans?: ExportedSpan[]
  unfinished?: {
    name: string
    spanId: string
    traceId: string
    toolingId: unknown
  }[]
}
const selectedNames = new Set([
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

async function startCollector(messages: Message[]) {
  const collector = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    messages.push(JSON.parse(Buffer.concat(chunks).toString()))
    response.end('ok')
  })
  await new Promise<void>((resolve) =>
    collector.listen(0, '127.0.0.1', resolve)
  )
  return collector
}

const dependencies = {
  '@opentelemetry/api': '1.9.0',
  '@opentelemetry/sdk-trace': '2.12.0',
}

const providerCases = (
  isNextDev ? ['.next', 'otel-output'] : ['otel-output']
).flatMap((distDir) =>
  ['on', 'off'].map((sampler) => ({
    name: `${sampler} sampler, ${distDir} output`,
    sampler,
    distDir,
  }))
)

// Local files, local collector, and CLI process shutdown are self-hosted contracts.
// @force-gate !deploy
describe('experimental tooling OTel', () => {
  describe.each(providerCases)('$name', ({ sampler, distDir }) => {
    let startCommand: string | undefined
    if (isNextDev) {
      const bundlerFlag = process.env.IS_WEBPACK_TEST
        ? '--webpack'
        : '--turbopack'
      startCommand = `node node_modules/next/dist/bin/next ${bundlerFlag}`
    }
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      startCommand,
      dependencies,
      env: {
        NEXT_EXPERIMENTAL_OTEL_TOOLING:
          process.env.NEXT_EXPERIMENTAL_OTEL_TOOLING ?? '1',
        NEXT_EXIT_TIMEOUT_MS: '30000',
        TOOLING_SAMPLER: sampler,
      },
    })
    const messages: Message[] = []
    let collector: Server

    beforeAll(async () => {
      collector = await startCollector(messages)
      const address = collector.address() as { port: number }
      next.env.TOOLING_ENDPOINT = `http://127.0.0.1:${address.port}`
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
      await new Promise<void>((resolve) => collector?.close(() => resolve()))
    })

    it('keeps local files independent while exporting through the application provider', async () => {
      expect(await next.render('/')).toContain('hello world')
      let clientLatency: number | undefined
      let editStartedAt = Date.now()
      if (isNextDev) {
        const browser = await next.browser('/')
        await browser.eval(`
          window.__toolingHmrDocument = true
          window.__NEXT_HMR_LATENCY_CB = (latency) => {
            window.__toolingHmrLatency = latency
          }
        `)
        editStartedAt = Date.now()
        await next.patchFile('app/page.tsx', (source) =>
          source.replace('hello world', 'edited page')
        )
        await retry(async () => {
          expect(await browser.elementByCss('p').text()).toBe('edited page')
          expect(await browser.eval('window.__toolingHmrDocument')).toBe(true)
          expect(await browser.eval('window.__toolingHmrLatency')).toEqual(
            expect.any(Number)
          )
        })
        clientLatency = await browser.eval('window.__toolingHmrLatency')
        await browser.close()
      }
      const editFinishedAt = Date.now()
      await next.stop('SIGTERM')
      const local = parseTraceFile(
        join(next.testDir, next.env.TOOLING_TRACE_FILE)
      ).events
      expectTraceEventContract(local)
      const clientEvent = local
        .filter(
          (event) =>
            event.name === 'client-hmr-latency' &&
            event.tags.page === '/' &&
            event.startTime !== undefined &&
            event.startTime >= editStartedAt - 10
        )
        .at(-1)
      if (isNextDev) {
        expect(clientEvent).toBeDefined()
        expect(clientEvent!.startTime).toBeGreaterThanOrEqual(
          editStartedAt - 10
        )
        expect(clientEvent!.startTime).toBeLessThanOrEqual(editFinishedAt)
        expect(clientEvent!.duration).toBe(clientLatency! * 1000)
        expect(clientEvent!.tags).toMatchObject({
          page: '/',
          isPageHidden: expect.any(Boolean),
        })
        expect(Object.keys(clientEvent!.tags).sort()).toEqual([
          'isPageHidden',
          'page',
          'updatedModules',
        ])
        expect(clientEvent!.tags.updatedModules).toBeDefined()
        const parent = local.find((event) => event.id === clientEvent!.parentId)
        expect(parent?.name).toBe('hot-reloader')
        expect(clientEvent!.traceId).toBe(parent!.traceId)
      }
      const rootName = isNextDev ? 'start-dev-server' : 'next-build'
      expect(local.some((event) => event.name === rootName)).toBe(true)
      // Fine observations remain in the full local hierarchy, never the SDK lane.
      expect(local.some((event) => !selectedNames.has(event.name))).toBe(true)
      const flushes = messages.filter((message) => message.kind === 'flush')
      const registrations = messages.filter(
        (message) => message.kind === 'register'
      )
      if (next.env.NEXT_EXPERIMENTAL_OTEL_TOOLING !== '1') {
        expect(flushes).toHaveLength(0)
        expect(registrations).toHaveLength(1)
        expect(registrations[0]).toMatchObject({
          installed: true,
          registrations: 1,
        })
        if (!isNextDev)
          expect(registrations[0].phase).not.toBe('phase-production-build')
        expect(
          messages
            .flatMap((message) => message.spans ?? [])
            .filter((span) => span.attributes['next.tooling.id'] !== undefined)
        ).toEqual([])
        return
      }
      expect(registrations).not.toHaveLength(0)
      expect(flushes).toHaveLength(1)
      expect(flushes[0]).toMatchObject({
        registrations: 1,
        localHasRoot: true,
        identityStable: true,
      })
      const registration = messages.find(
        (message) =>
          message.kind === 'register' && message.pid === flushes[0].pid
      )!
      expect(registration).toMatchObject({ installed: true, registrations: 1 })
      const allSpans = messages.flatMap((message) => message.spans ?? [])
      const tooling = allSpans.filter(
        (span) => span.attributes['next.tooling.id'] !== undefined
      )
      if (sampler === 'off') {
        expect(tooling).toHaveLength(0)
        return
      }
      if (isNextDev) {
        const exportedClient = tooling.find(
          (span) => span.attributes['next.tooling.id'] === clientEvent!.id
        )
        expect(exportedClient?.name).toBe('client-hmr-latency')
        for (const [key, value] of Object.entries(clientEvent!.tags)) {
          // The existing SDK adapter JSON-encodes arrays/objects; local tags
          // retain supported arrays. Do not change either encoding for HMR.
          expect(exportedClient!.attributes[key]).toEqual(
            typeof value === 'object' ? JSON.stringify(value) : value
          )
        }
      }
      expect(tooling.map((span) => span.name)).toContain(rootName)
      const root = tooling.find((span) => span.name === rootName)!
      expect(root).toBeDefined()
      expect(root.parentSpanId).toBeUndefined()
      expect(milliseconds(root.startTime)).toBeLessThan(registration.time!)
      expect(milliseconds(root.endTime)).toBeGreaterThanOrEqual(
        registration.time!
      )
      const early = tooling.filter(
        (span) => milliseconds(span.endTime) <= registration.time!
      )
      expect(early.length).toBeGreaterThan(0)
      expect(
        new Set(tooling.map((span) => span.attributes['next.tooling.id'])).size
      ).toBe(tooling.length)
      const spansById = new Map(tooling.map((span) => [span.spanId, span]))
      const allSpansById = new Map(allSpans.map((span) => [span.spanId, span]))
      const orphans = tooling.filter(
        (span) => span.parentSpanId && !spansById.has(span.parentSpanId)
      )
      const unfinishedById = new Map(
        flushes[0].unfinished?.map((span) => [span.spanId, span])
      )
      // A framework operation that never ends is absent from both the local
      // file and completed SDK exports. Require proof that its real parent
      // remains live, rather than fabricating an end or ignoring lost exports.
      const missingParents = orphans.filter((span) => {
        const parent = unfinishedById.get(span.parentSpanId!)
        return (
          !parent ||
          parent.traceId !== span.traceId ||
          parent.toolingId !== span.attributes['next.tooling.parent_id']
        )
      })
      expect(
        missingParents.slice(0, 5).map((span) => {
          const parent = allSpansById.get(span.parentSpanId!)
          return {
            name: span.name,
            id: span.attributes['next.tooling.id'],
            parentSpanId: span.parentSpanId,
            parentName: parent?.name,
            parentAttributeCount: Object.keys(parent?.attributes ?? {}).length,
            parentToolingId: span.attributes['next.tooling.parent_id'],
            localParentName: local.find(
              (event) => event.id === span.attributes['next.tooling.parent_id']
            )?.name,
            unfinishedParent: flushes[0].unfinished?.find(
              (unfinishedSpan) => unfinishedSpan.spanId === span.parentSpanId
            ),
          }
        })
      ).toEqual([])
      for (const span of orphans) {
        const parent = unfinishedById.get(span.parentSpanId!)!
        expect(local.some((event) => event.id === parent.toolingId)).toBe(false)
      }
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
  })

  // Separate compiler workers and their local files are Webpack build contracts.
  // @force-gate start && webpack
  describe('parallel compiler replay', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      dependencies,
      env: { NEXT_EXPERIMENTAL_OTEL_TOOLING: '1', TOOLING_SAMPLER: 'on' },
    })
    const messages: Message[] = []
    let collector: Server

    beforeAll(async () => {
      collector = await startCollector(messages)
      next.env.TOOLING_ENDPOINT = `http://127.0.0.1:${(collector.address() as { port: number }).port}`
      next.env.TOOLING_TRACE_FILE = join('otel-output', 'trace')
    })
    afterAll(async () => {
      await new Promise<void>((resolve) => collector?.close(() => resolve()))
    })

    it('retains both parallel worker results locally and in the application provider', async () => {
      await next.patchFile('next.config.ts', (source) =>
        source.replace(
          "distDir: 'otel-output'",
          "distDir: 'otel-output', experimental: { webpackBuildWorker: true, parallelServerCompiles: true }"
        )
      )
      await next.patchFile(
        'app/edge/route.ts',
        "export const runtime = 'edge'; export function GET() { return new Response('edge') }"
      )
      expect((await next.build()).exitCode).toBe(0)
      const local = parseTraceFile(
        join(next.testDir, next.env.TOOLING_TRACE_FILE)
      ).events
      const exported = messages.flatMap((message) => message.spans ?? [])
      const root = exported.find((span) => span.name === 'next-build')!
      expect(root).toBeDefined()
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
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      dependencies,
      env: { NEXT_EXPERIMENTAL_OTEL_TOOLING: '1' },
    })

    it('completes the compiler span when config setup throws', async () => {
      await next.patchFile('next.config.ts', (source) =>
        source.replace(
          "distDir: 'otel-output'",
          "distDir: 'otel-output', experimental: { webpackBuildWorker: false }, webpack() { throw new Error('tooling-webpack-setup-failure') }"
        )
      )
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).not.toBe(0)
      expect(cliOutput).toContain('tooling-webpack-setup-failure')
      const events = parseTraceFile(
        join(next.testDir, 'otel-output', 'trace')
      ).events
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
  describe('build failure lifecycle', () => {
    describe('removed source entry', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
        dependencies,
        env: { NEXT_EXPERIMENTAL_OTEL_TOOLING: '1' },
      })

      it('does not run stale instrumentation after its source entry is removed', async () => {
        await next.deleteFile('instrumentation.ts')
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
        expect((await next.build()).exitCode).toBe(0)
        expect(
          existsSync(join(next.testDir, 'stale-instrumentation-ran'))
        ).toBe(false)
        const events = parseTraceFile(
          join(next.testDir, 'otel-output', 'trace')
        ).events
        expectTraceEventContract(events)
        expect(events.some((event) => event.name === 'next-build')).toBe(true)
      })
    })

    describe.each(['before', 'after'])('failure %s registration', (phase) => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
        dependencies,
        env: { NEXT_EXPERIMENTAL_OTEL_TOOLING: '1', TOOLING_SAMPLER: 'on' },
      })
      const messages: Message[] = []
      let collector: Server

      beforeAll(async () => {
        collector = await startCollector(messages)
        next.env.TOOLING_ENDPOINT = `http://127.0.0.1:${(collector.address() as { port: number }).port}`
        next.env.TOOLING_TRACE_FILE = join('otel-output', 'trace')
      })
      afterAll(async () => {
        await new Promise<void>((resolve) => collector?.close(() => resolve()))
      })

      it('flushes the failure root without loading stale instrumentation or losing registered exports', async () => {
        if (phase === 'before') {
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
          await next.patchFile(
            'app/page.tsx',
            "import './missing-tooling-fixture'; export default function Page() { return <p>broken</p> }"
          )
        } else {
          // The default early-exit policy terminates workers and coordinator
          // with process.exit(), bypassing all build finalizers. Exercise the
          // controlled error path here rather than promising crash-safe export.
          await next.patchFile('next.config.ts', (source) =>
            source.replace(
              "distDir: 'otel-output'",
              "distDir: 'otel-output', experimental: { prerenderEarlyExit: false }"
            )
          )
          await next.patchFile(
            'app/page.tsx',
            "export default function Page() { throw new Error('tooling-prerender-failure') }"
          )
        }
        const { exitCode } = await next.build()
        expect(exitCode).not.toBe(0)
        const events = parseTraceFile(
          join(next.testDir, next.env.TOOLING_TRACE_FILE)
        ).events
        expectTraceEventContract(events)
        expect(
          events.find((event) => event.name === 'next-build')?.tags
        ).toMatchObject({ failed: true })
        expect(
          existsSync(join(next.testDir, 'stale-instrumentation-ran'))
        ).toBe(false)
        if (phase === 'before') {
          expect(messages).toEqual([])
        } else {
          expect(
            messages.filter((message) => message.kind === 'register')
          ).toHaveLength(1)
          expect(
            messages.filter((message) => message.kind === 'flush')
          ).toEqual([
            expect.objectContaining({
              registrations: 1,
              localHasRoot: true,
              identityStable: true,
            }),
          ])
          const exported = messages.flatMap((message) => message.spans ?? [])
          expect(
            exported.find((span) => span.name === 'next-build')?.attributes
          ).toMatchObject({ failed: true })
        }
      })
    })
  })
})
