import { nextTestSetup } from 'e2e-utils'

const UNGUARDED_CONFIG = `require('single-context-addon')
module.exports = {}
`

// A native addon declared with `NODE_MODULE` rather than `NODE_MODULE_INIT` can
// only be loaded once per process, so a second `dlopen` on another thread of the
// same process fails with `ERR_DLOPEN_FAILED` / "Module did not self-register".
//
// `experimental.workerThreads` decides whether static generation runs in real
// worker threads or in forked child processes. Forks get a fresh process and load
// the addon cleanly; threads share the build process and do not. That is why the
// flag defaults to false (PR #9199) and why the static export worker was fixed to
// respect it instead of hardcoding threads on (PR #25063).
describe('prerender worker threads', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    // `bindings` is a direct dependency rather than one of the addon. The addon
    // resolves it by walking up from the virtual store, and declaring it on the
    // addon would make it a non-registry transitive dependency, which
    // `blockExoticSubdeps` rejects.
    //
    // These use `file:` rather than `link:` so pnpm copies them into the virtual
    // store. A linked package resolves to a path inside the app, which the bundler
    // treats as app code and tries to bundle, and `bindings` contains a `require`
    // it cannot resolve statically.
    dependencies: require('./package.json').dependencies,
  })

  it('should prerender a page using a non-context-aware addon by default', async () => {
    const { exitCode, cliOutput } = await next.build()

    expect(cliOutput).not.toContain('Module did not self-register')
    expect(exitCode).toBe(0)
  })

  it('should fail to prerender that page when worker threads are enabled', async () => {
    await next.patchFile(
      'next.config.js',
      `const { isMainThread } = require('node:worker_threads')
if (isMainThread) { require('single-context-addon') }
module.exports = { experimental: { workerThreads: true } }
`
    )

    const { exitCode, cliOutput } = await next.build()

    expect(cliOutput).toContain('Module did not self-register')
    expect(cliOutput).toContain('single_context_addon.node')
    expect(exitCode).not.toBe(0)
  })

  // This documents a bug rather than intended behavior. `next build` runs Turbopack
  // in a worker thread (`enableWorkerThreads: true` is hardcoded in
  // packages/next/src/build/turbopack-build/index.ts) and that worker re-evaluates
  // `next.config.js`, so requiring a non-context-aware addon from the config breaks
  // the build even though `experimental.workerThreads` is off. It is the same class
  // of failure PR #9199 and PR #25063 fixed, in a worker those PRs did not touch.
  //
  // Webpack is unaffected, because its build worker is a forked child process.
  //
  // When Turbopack stops evaluating the config on a worker thread, this test will
  // fail: drop the branch and assert the webpack outcome for both bundlers.
  it('should currently fail under Turbopack when the config loads the addon', async () => {
    await next.patchFile('next.config.js', UNGUARDED_CONFIG)

    const { exitCode, cliOutput } = await next.build()

    if (isTurbopack) {
      expect(cliOutput).toContain('Module did not self-register')
      expect(exitCode).not.toBe(0)
    } else {
      expect(cliOutput).not.toContain('Module did not self-register')
      expect(exitCode).toBe(0)
    }
  })
})
