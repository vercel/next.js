import { createServer, type Server } from 'node:http'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { isNextDev, nextTestSetup } from 'e2e-utils'
import {
  expectTraceEventContract,
  parseTraceFile,
} from '../../../lib/parse-trace-file'

type ExportedSpan = {
  name: string
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

// Local files, local collector, and CLI process shutdown are self-hosted contracts.
// @force-gate !deploy
describe('experimental tooling OTel', () => {
  describe.each(['on', 'off'])('application sampler %s', (sampler) => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
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
      next.env.TOOLING_TRACE_FILE = join(
        'otel-output',
        isNextDev ? 'dev' : '',
        'trace'
      )
      await next.start()
    })

    afterAll(async () => {
      await next.stop('SIGTERM')
      await new Promise<void>((resolve) => collector?.close(() => resolve()))
    })

    it('keeps local diagnostics independent while exporting through the application provider', async () => {
      expect(await next.render('/')).toContain('hello world')
      if (isNextDev) {
        await next.patchFile('app/page.tsx', (source) =>
          source.replace('hello world', 'edited page')
        )
        expect(await next.render('/')).toContain('edited page')
      }
      await next.stop('SIGTERM')
      const local = parseTraceFile(
        join(next.testDir, next.env.TOOLING_TRACE_FILE)
      ).events
      expectTraceEventContract(local)
      const rootName = isNextDev ? 'start-dev-server' : 'next-build'
      expect(local.some((event) => event.name === rootName)).toBe(true)
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
      for (const span of tooling) {
        expect(span.traceId).toBe(root.traceId)
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
