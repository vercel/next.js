import { nextTestSetup, isNextStart } from 'e2e-utils'
import { join } from 'path'
import { parseTraceEvents } from '../../lib/parse-trace-file'

describe('build-failed-trace', () => {
  if (!isNextStart) {
    return
  }

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should mark the next-build span as failed when the build fails', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).not.toBe(0)

    const tracePath = join(next.testDir, '.next', 'trace')
    const events = parseTraceEvents(tracePath)

    const nextBuildEvent = events.find((e) => e.name === 'next-build')
    expect(nextBuildEvent).toBeDefined()
    expect(nextBuildEvent!.tags).toMatchObject({ failed: true })
  })
})
