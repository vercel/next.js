import { nextTestSetup } from 'e2e-utils'
import { findAllTelemetryEvents } from 'next-test-utils'

describe('build-lifecycle-hooks', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      NEXT_TELEMETRY_DEBUG: '1',
    },
  })

  it('should run runAfterProductionCompile', async () => {
    const output = next.cliOutput

    expect(output).toContain('')
    expect(output).toContain(`Using distDir: ${next.testDir}/.next`)
    expect(output).toContain(`Using projectDir: ${next.testDir}`)
    expect(output).toContain(`Total files in ${next.testDir}/.next folder:`)
    expect(output).toContain('Completed runAfterProductionCompile in')

    // Ensure telemetry event is recorded
    const events = findAllTelemetryEvents(output, 'NEXT_BUILD_FEATURE_USAGE')
    expect(events).toContainEqual({
      featureName: 'runAfterProductionCompile',
      invocationCount: 1,
    })
  })

  it('should allow throwing error in runAfterProductionCompile', async () => {
    try {
      await next.stop()
      await next.patchFile('next.config.ts', (content) => {
        return content.replace(
          `import { after } from './after'`,
          `import { after } from './bad-after'`
        )
      })

      const getCliOutput = next.getCliOutputFromHere()
      await next.build()
      expect(getCliOutput()).toContain('error after production build')
      expect(getCliOutput()).not.toContain(
        'Completed runAfterProductionCompile in'
      )
    } finally {
      await next.patchFile('next.config.ts', (content) => {
        return content.replace(
          `import { after } from './bad-after'`,
          `import { after } from './after'`
        )
      })
    }
  })
})
