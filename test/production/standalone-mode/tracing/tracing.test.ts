import { nextTestSetup } from 'e2e-utils'

describe('standalone mode - tracing', () => {
  const dependencies = require('./package.json').dependencies

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    dependencies,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should trace process.cwd calls in node_modules', async () => {
    let trace = await next.readJSON('.next/server/app/page.js.nft.json')

    // should trace process.cwd and relative calls relative to the root
    expect(trace.files).toContain('../../../data/static-from-app-cwd.txt')
    expect(trace.files).toContain('../../../data/static-from-app-rel-join.txt')
    expect(trace.files).toContain('../../../data/static-from-app-rel-read.txt')

    // should not trace process.cwd or relative calls in node_modules (only relative to file)
    expect(trace.files).toContainEqual(
      expect.stringMatching(/.*\/node_modules\/foo\/foo.txt/)
    )
    expect(trace.files).not.toContain('../../../app/static-from-pkg.txt')
    expect(trace.files).not.toContain('../../../foo/foo.txt')
  })
})
