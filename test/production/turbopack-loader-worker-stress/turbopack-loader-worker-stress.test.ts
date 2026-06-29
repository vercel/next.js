import { nextTestSetup } from 'e2e-utils'

// Regression test for the napi-rs v2 worker-pool crash: under `workerThreads`, a
// custom loader doing many getResolve() round-trips drove napi Buffer/reference
// churn (send_task_message) that was dropped off the env thread and routed through
// napi-rs's global CustomGC ThreadsafeFunction, racing worker-env teardown and
// crashing the build (SIGSEGV/SIGTRAP/SIGABRT) on every Node version.
//
// The fixture builds 4 files through that loader (4 * 500 = 2000 resolve
// round-trips) with `workerThreads`. If the worker pool crashes, the
// production build aborts and `nextTestSetup` fails before any test runs — so
// reaching the assertions (and seeing the loader output) is the guard.
// (Tuned to reliably crash the pre-fix binary across the full supported Node
// range — 20.9.0 / 22 / 26 — while staying small.)
describe('turbopack-loader-worker-stress', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    env: { TEST_TURBOPACK_PLUGIN_RUNTIME_STRATEGY: 'workerThreads' },
  })

  // The worker-thread loader backend only exists in Turbopack.
  const itTurbopack = isTurbopack ? it : it.skip

  itTurbopack(
    'builds under workerThreads with heavy loader churn without crashing',
    async () => {
      const res = await next.fetch('/')
      expect(res.status).toBe(200)
      const html = await res.text()
      expect(html).toContain('STRESS_OK')
      // Each of the 4 loaders resolved ./meta.js 500x; proves the loader ran.
      expect(html).toContain('total=2000')
    }
  )
})
