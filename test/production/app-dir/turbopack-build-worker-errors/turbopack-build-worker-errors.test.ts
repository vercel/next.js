import { nextTestSetup } from 'e2e-utils'
import { findAllTelemetryEvents } from 'next-test-utils'
import { readdir } from 'fs-extra'
import { join } from 'path'

// `experimental.turbopackBuildWorker` only applies to Turbopack builds. This
// tests how the local `next build` process handles failures of its build
// worker, which a deployment doesn't expose.
// @force-gate turbopack
describe('turbopack-build-worker-errors', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // The first test causes a (simulated) Turbopack internal error.
    allowRustPanics: true,
  })

  it('records Turbopack internal errors in the build worker in the telemetry', async () => {
    const { exitCode, cliOutput } = await next.build({
      env: {
        // Makes Turbopack fail with an internal error before compiling, so
        // the fixture's loader doesn't run.
        NEXT_PRIVATE_TEST_TURBOPACK_INTERNAL_ERROR: '1',
        NEXT_TELEMETRY_DEBUG: '1',
      },
    })

    expect(exitCode).toBe(1)
    expect(cliOutput).toContain('Simulated internal error')
    expect(findAllTelemetryEvents(cliOutput, 'NEXT_ERROR_THROWN')).toEqual([
      { errorCode: 'TurbopackInternalError' },
    ])
    expect(cliOutput).not.toContain('Expected `telemetry` to be set in globals')
  })

  it('fails the build when the build worker dies during the compilation', async () => {
    // The fixture's loader kills the build worker (see `crash-loader.js`).
    // The main process must report that and exit, instead of waiting forever.
    const { exitCode, cliOutput } = await next.build({
      env: { NEXT_CPU_PROF: '1' },
    })

    expect(exitCode).toBe(1)
    expect(cliOutput).toContain('Next.js Turbopack build worker exited')
    expect(cliOutput).not.toContain('Compiled successfully')

    // A build worker writes its CPU profile when it exits normally, which the
    // killed one can't. So a `build-turbopack` profile would mean that the
    // main process started another build worker after the crash, e.g. to shut
    // down a project that doesn't exist in it.
    const profiles = await readdir(join(next.testDir, '.next-profiles'))
    expect(profiles.filter((f) => f.startsWith('build-turbopack-'))).toEqual([])
    expect(profiles.some((f) => f.startsWith('cpu-profile-'))).toBe(true)
  })
})
