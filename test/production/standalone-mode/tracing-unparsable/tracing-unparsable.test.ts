import { nextTestSetup } from 'e2e-utils'

describe('standalone mode - tracing-unparsable', () => {
  const dependencies = require('./package.json').dependencies

  const { next } = nextTestSetup({
    files: __dirname,
    dependencies,
    skipStart: true,
    // asserts on `node_modules/foo` in the top-level `files` list, which excludes
    // the virtual store
    pnpmGlobalVirtualStore: false,
  })

  it('should not error when dynamic require includes non-JS files', async () => {
    let { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    let trace = await next.readJSON('.next/server/app/page.js.nft.json')

    expect(trace.files).toContainEqual(
      expect.stringMatching(/.*\/node_modules\/foo\/LICENSE$/)
    )
    expect(trace.files).toContainEqual(
      expect.stringMatching(/.*\/node_modules\/foo\/binary$/)
    )
    expect(trace.files).toContainEqual(
      expect.stringMatching(/.*\/node_modules\/foo\/index\.js$/)
    )
    expect(trace.files).toContainEqual(
      expect.stringMatching(/.*\/node_modules\/foo\/value\.js$/)
    )
    expect(trace.files).toContainEqual(
      expect.stringMatching(/.*\/node_modules\/foo\/package\.json$/)
    )
  })
})
