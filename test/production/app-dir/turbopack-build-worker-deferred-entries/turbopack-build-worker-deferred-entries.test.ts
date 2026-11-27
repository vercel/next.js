import { nextTestSetup } from 'e2e-utils'

// `experimental.turbopackBuildWorker` only applies to Turbopack builds. This
// tests how the local `next build` process runs the compilation, which a
// deployment doesn't expose.
// @force-gate turbopack
describe('turbopack-build-worker-deferred-entries', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  afterEach(() => next.stop())

  it('should run onBeforeDeferredEntries in the main process before compiling the deferred entries', async () => {
    await next.remove('.callback-log')
    const { exitCode, cliOutput } = await next.build()
    if (exitCode !== 0) {
      throw new Error(`next build failed with ${exitCode}:\n${cliOutput}`)
    }

    // See next.config.ts: runs once, in the main process, on the config the
    // build uses.
    const log = (await next.readFile('.callback-log'))
      .split('\n')
      .filter(Boolean)
    expect(log).toEqual(['main build-config'])

    await next.start({ skipBuild: true })
    const $ = await next.render$('/deferred')
    expect($('#deferred-value').text()).toBe('written-by-main')
    expect((await next.render$('/'))('p').text()).toBe('hello world')
  })

  it('should fail the build when onBeforeDeferredEntries throws', async () => {
    await next.patchFile(
      '.callback-throws',
      'build-worker-deferred-callback-failure',
      async () => {
        const { exitCode, cliOutput } = await next.build()
        expect(exitCode).not.toBe(0)
        expect(cliOutput).toContain('build-worker-deferred-callback-failure')
      }
    )
  })

  it('should fail the build when onBeforeDeferredEntries throws a value that is not an error', async () => {
    await next.patchFile('.callback-throws', 'undefined', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).not.toBe(0)
    })
  })

  it.each([
    ['before', 'app/page.tsx'],
    ['after', 'app/deferred/page.tsx'],
  ])(
    'should report compile errors in entries compiled %s onBeforeDeferredEntries',
    async (_, file) => {
      await next.patchFile(
        file,
        'export default function Page() { return <div> }\n',
        async () => {
          const { exitCode, cliOutput } = await next.build()
          expect(exitCode).not.toBe(0)
          expect(cliOutput).toContain('Turbopack build failed with')
          expect(cliOutput.replace(/\\/g, '/')).toContain(file)
        }
      )
    }
  )
})
