import { nextTestSetup, isNextStart } from 'e2e-utils'
import { join } from 'path'
import { readFileSync } from 'fs'
import type { TraceEvent } from 'next/dist/trace'

function parseTraceFile(tracePath: string): TraceEvent[] {
  const content = readFileSync(tracePath, 'utf8')
  const events: TraceEvent[] = []
  for (const line of content.trim().split('\n').filter(Boolean)) {
    events.push(...(JSON.parse(line) as TraceEvent[]))
  }
  return events
}

describe('build-failed-trace', () => {
  if (!isNextStart) {
    return
  }

  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  it('should mark the next-build span as failed when the build fails', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).not.toBe(0)

    const tracePath = join(next.testDir, '.next', 'trace')
    const events = parseTraceFile(tracePath)

    const nextBuildEvent = events.find((e) => e.name === 'next-build')
    expect(nextBuildEvent).toBeDefined()
    expect(nextBuildEvent!.tags).toMatchObject({ failed: true })
  })
})
