import { nextTestSetup } from 'e2e-utils'

// @force-gate !deploy
// @force-gate turbopack
// @force-gate start
describe('swc-plugins-cell-identity', () => {
  const { next } = nextTestSetup({
    files: __dirname + '/fixture',
    skipStart: true,
  })

  const env = {
    TURBO_ENGINE_IGNORE_DIRTY: '1',
    TURBO_ENGINE_SNAPSHOT_MIN_ACTIVE_TIME_MILLIS: '0',
  }

  async function touchComponents(round: number) {
    for (const file of [
      'components/part-1.tsx',
      'components/part-2.tsx',
      'components/part-3.tsx',
    ]) {
      await next.patchFile(file, (content) =>
        content.replace(/(\n\/\/ round \d+)?\n$/, `\n// round ${round}\n`)
      )
    }
  }

  it('runs every plugin with its own config after a cache restore', async () => {
    for (let round = 0; round < 3; round++) {
      if (round > 0) {
        await touchComponents(round)
      }

      const { exitCode, cliOutput } = await next.build({ env })
      expect(cliOutput).not.toContain('Failed to execute SWC plugin')
      expect(exitCode).toBe(0)

      const html = await next.readFile('.next/server/app/index.html')
      expect(html.replaceAll('<!-- -->', '')).toContain(
        '<p>a:alpha b:beta c:gamma</p>'
      )
    }
  })
})
