import { nextTestSetup } from 'e2e-utils'

describe('standalone mode - tracing-module-sync', () => {
  const dependencies = require('./package.json').dependencies

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    dependencies,
    skipDeployment: true,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  it('should trace module-sync export condition files into standalone output', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    const trace = await next.readJSON('.next/server/app/page.js.nft.json')

    // The file tracer must include require.mjs from packages that declare
    // "module-sync" in their exports map. Node.js >= 22.10 resolves
    // module-sync before require/default, so omitting it from the standalone
    // output causes a MODULE_NOT_FOUND crash at runtime.
    // See: https://github.com/vercel/next.js/issues/90567
    expect(trace.files).toContainEqual(
      expect.stringMatching(/module-sync-pkg\/require\.mjs$/)
    )
  })
})
