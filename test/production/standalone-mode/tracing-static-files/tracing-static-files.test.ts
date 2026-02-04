import { nextTestSetup } from 'e2e-utils'

describe('standalone mode - tracing-static-files', () => {
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

  it('should trace process.cwd calls in node_modules', async () => {
    let { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    let trace = await next.readJSON('.next/server/app/page.js.nft.json')

    // should trace process.cwd and relative calls relative to the root
    expect(trace.files).toContain('../../../data/static-from-app-cwd.txt')
    if (process.env.IS_TURBOPACK_TEST) {
      // Webpack doesn't trace these relative reference
      expect(trace.files).toContain(
        '../../../data/static-from-app-rel-join.txt'
      )
      expect(trace.files).toContain(
        '../../../data/static-from-app-rel-read.txt'
      )
    }

    if (process.env.IS_TURBOPACK_TEST) {
      // Webpack doesn't trace these relative reference
      expect(trace.files).toContainEqual(
        expect.stringMatching(/.*\/node_modules\/foo\/foo\.txt$/)
      )
    }

    // should not trace process.cwd or relative calls in node_modules (only relative to file)
    expect(trace.files).not.toContain('../../../app/static-from-pkg.txt')
    expect(trace.files).not.toContain('../../../foo/foo.txt')
  })
})
