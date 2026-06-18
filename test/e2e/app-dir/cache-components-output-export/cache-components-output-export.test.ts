import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'

describe('cache-components-output-export', () => {
  const { next, isNextStart } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  it('builds and statically exports a cached page and route handler', async () => {
    if (!isNextStart) {
      // output: export is a build-time concern; nothing to assert in dev.
      return
    }

    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    const out = join(next.testDir, 'out')
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toContain(
      'hello from cache'
    )
    expect(existsSync(join(out, 'feed'))).toBe(true)
  })
})
