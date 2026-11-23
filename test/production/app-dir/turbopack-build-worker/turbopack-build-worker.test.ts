import { nextTestSetup } from 'e2e-utils'
import { readdir, readFile } from 'fs-extra'
import { join } from 'path'

interface TraceEvent {
  name: string
  id: number
  parentId?: number
}

function getAncestorNames(events: TraceEvent[], event: TraceEvent): string[] {
  const byId = new Map(events.map((e) => [e.id, e]))
  const names: string[] = []
  let parent = byId.get(event.parentId!)
  // Bounded, so a cycle fails the assertion instead of hanging the test.
  while (parent && names.length < events.length) {
    names.push(parent.name)
    parent = byId.get(parent.parentId!)
  }
  return names
}

// `experimental.turbopackBuildWorker` only applies to Turbopack builds. This
// tests how the local `next build` process runs the compilation, which a
// deployment doesn't expose.
// @force-gate turbopack
describe('turbopack-build-worker', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // The fixture sets `deploymentId` in the config, which must not be
    // overridden by the test's `NEXT_DEPLOYMENT_ID` (see next.config.ts).
    disableAutoSkewProtection: true,
  })

  async function readTrace(): Promise<TraceEvent[]> {
    const content = await readFile(join(next.testDir, '.next/trace'), 'utf8')
    return content
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => JSON.parse(line) as TraceEvent[])
  }

  function findEvent(events: TraceEvent[], name: string): TraceEvent {
    const event = events.find((e) => e.name === name)
    expect(event).toBeDefined()
    return event!
  }

  describe('successful build', () => {
    beforeAll(async () => {
      const { exitCode, cliOutput } = await next.build()
      if (exitCode !== 0) {
        throw new Error(`next build failed with ${exitCode}:\n${cliOutput}`)
      }
      await next.start({ skipBuild: true })
    })
    afterAll(() => next.stop())

    it('should serve the compiled app', async () => {
      const $ = await next.render$('/')
      expect($('#hello').text()).toBe('hello world')
    })

    it('should compile with the environment of the parent process', async () => {
      // See next.config.ts: the value is only visible to the build worker if
      // it applied the parent's environment, which changed after the worker
      // was spawned.
      const $ = await next.render$('/')
      expect($('#deployment-id').text()).toBe('turbopack-build-worker')
    })

    it('should record the build worker spans in the build trace', async () => {
      const events = await readTrace()
      // Span ids from the build worker must not collide with the parent's.
      expect(new Set(events.map((e) => e.id)).size).toBe(events.length)

      const ancestors = (name: string) =>
        getAncestorNames(events, findEvent(events, name))

      expect(ancestors('run-turbopack')).toEqual(['next-build'])
      expect(ancestors('turbopack-build-worker')).toContain('next-build')
      // Persistence happens during shutdown, so this is only present when the
      // build waited for the worker to finish persisting before ending it.
      expect(ancestors('turbopack-persistence')).toEqual(
        expect.arrayContaining(['turbopack-build-worker', 'next-build'])
      )
    })

    it('should persist the Turbopack cache for the next build', async () => {
      const cacheDir = join(next.testDir, '.next/cache/turbopack')
      expect((await readdir(cacheDir)).length).toBeGreaterThan(0)

      await next.stop()
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
      await next.start({ skipBuild: true })
      const $ = await next.render$('/')
      expect($('#hello').text()).toBe('hello world')
    })
  })

  describe('failing builds', () => {
    afterEach(async () => {
      await next.stop()
    })

    it('should report compile errors the same way as an in-process build', async () => {
      await next.patchFile(
        'app/broken/page.tsx',
        'export default function Page() { return <div> }\n',
        async () => {
          const withWorker = await next.build()
          expect(withWorker.exitCode).not.toBe(0)

          let withoutWorker: Awaited<ReturnType<typeof next.build>>
          await next.patchFile(
            'next.config.ts',
            (content) =>
              content!.replace(
                'turbopackBuildWorker: true',
                'turbopackBuildWorker: false'
              ),
            async () => {
              withoutWorker = await next.build()
            }
          )
          expect(withoutWorker!.exitCode).not.toBe(0)

          const errorSummary = (cliOutput: string) => {
            const start = cliOutput.indexOf('Turbopack build failed with')
            expect(start).toBeGreaterThan(-1)
            // The message and code frame, without the stack trace, which
            // naturally differs between the two.
            return cliOutput
              .slice(start)
              .split('\n')
              .filter((line) => !/^\s+at /.test(line))
              .join('\n')
              .replace(/\\/g, '/')
              .trim()
          }
          expect(errorSummary(withWorker.cliOutput)).toBe(
            errorSummary(withoutWorker!.cliOutput)
          )
          expect(errorSummary(withWorker.cliOutput)).toContain(
            'app/broken/page.tsx'
          )
        }
      )
    })

    it('should exit when the build fails before compiling', async () => {
      // `generateBuildId` runs after the build worker has been spawned, but
      // before the compilation starts. The worker must not keep the build
      // process alive.
      await next.patchFile(
        'next.config.ts',
        (content) =>
          content!.replace(
            'const nextConfig: NextConfig = {',
            `const nextConfig: NextConfig = {
  generateBuildId: async () => {
    throw new Error('build-worker-pre-compile-failure')
  },`
          ),
        async () => {
          const { exitCode, cliOutput } = await next.build()
          expect(exitCode).not.toBe(0)
          expect(cliOutput).toContain('build-worker-pre-compile-failure')
        }
      )
    })

    it('should persist the cache when the build fails after compiling', async () => {
      // Prerendering this page fails during static generation, while (or
      // after) the build worker persists the Turbopack cache. With
      // `prerenderEarlyExit: false` the error is reported by `build()` rather
      // than by exiting the process from the static worker.
      await next.patchFile(
        'next.config.ts',
        (content) =>
          content!.replace(
            'turbopackBuildWorker: true,',
            'turbopackBuildWorker: true,\n    prerenderEarlyExit: false,'
          ),
        () =>
          next
            .patchFile(
              'app/prerender-error/page.tsx',
              `export default function Page(): never {
  throw new Error('build-worker-prerender-failure')
}
`,
              async () => {
                const { exitCode, cliOutput } = await next.build()
                expect(exitCode).not.toBe(0)
                expect(cliOutput).toContain('build-worker-prerender-failure')

                // Only recorded once the worker finished persisting, which the
                // failing build must wait for before ending the worker.
                const events = await readTrace()
                expect(
                  getAncestorNames(
                    events,
                    findEvent(events, 'turbopack-persistence')
                  )
                ).toContain('turbopack-build-worker')
              }
            )
            .then(() => {})
      )
    })
  })
})
