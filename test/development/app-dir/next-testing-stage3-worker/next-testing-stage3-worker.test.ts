import { nextTestSetup } from 'e2e-utils'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { realpathSync } from 'fs'
import { pathToFileURL } from 'url'

const exec = promisify(execFile)

describe('next-testing-stage3-worker', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('retains compiled coverage through retries and rejects interrupted or invalid completion', async () => {
    const { stdout } = await exec(
      process.execPath,
      [join(next.testDir, 'compile.cjs')],
      {
        cwd: next.testDir,
        env: { ...process.env, NODE_ENV: 'development' },
        maxBuffer: 10 * 1024 * 1024,
      }
    )
    const marker = 'STAGE3_WORKER_RESULT='
    const line = stdout.split('\n').find((value) => value.startsWith(marker))
    expect(line).toBeDefined()
    const outcomes: Record<
      string,
      {
        result: { status: string }
        coverage: {
          complete: boolean
          files: { file: string; coveredLines: number[] }[]
        }
        leaseRetained: boolean
        workerClosed: boolean
        error: string
        formattedDiagnostic: string
        events: {
          type: string
          status: string
          errors: {
            stack: string
            frames?: {
              file: string
              line: number
              column: number
              original: boolean
            }[]
          }[]
        }[]
      }
    > & { artifactsRemoved: boolean } = JSON.parse(line!.slice(marker.length))
    for (const mode of ['retry', 'following']) {
      expect(outcomes[mode].result.status).toBe('passed')
      expect(outcomes[mode].coverage.complete).toBe(true)
      expect(outcomes[mode].leaseRetained).toBe(true)
      expect(outcomes[mode].workerClosed).toBe(true)
      expect(outcomes[mode].events.at(-1).type).toBe('file-end')
      expect(outcomes[mode].coverage.files.map((file) => file.file)).toEqual([
        expect.stringContaining('subject.ts'),
      ])
    }
    expect(
      outcomes.retry.events
        .filter((event) => event.type === 'case-end')
        .map((event) => event.status)
    ).toEqual(['failed', 'passed'])
    // Line 2 is reached only by the failed first attempt; setup and teardown
    // execute outside the successful retry's body but share the interval.
    expect(outcomes.retry.coverage.files[0].coveredLines).toEqual(
      expect.arrayContaining([2, 5, 8, 11])
    )
    expect(outcomes.failure.result.status).toBe('failed')
    expect(outcomes.failure.coverage.complete).toBe(true)
    for (const mode of [
      'cleanup',
      'timeout',
      'nonzero',
      'late',
      'missing',
      'consumer',
    ]) {
      expect(outcomes[mode].result.status).toBe('failed')
      expect(outcomes[mode].coverage).toBeUndefined()
    }
    expect(outcomes.cancel.result.status).toBe('cancelled')
    expect(outcomes.cancel.coverage).toBeUndefined()
    expect(outcomes['abort-consumer'].result.status).toBe('cancelled')
    expect(outcomes['abort-consumer'].coverage).toBeUndefined()
    expect(outcomes['abort-failed-consumer'].result.status).toBe('failed')
    expect(outcomes['abort-failed-consumer'].events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'diagnostic',
          diagnostic: expect.objectContaining({
            message: 'remap source mismatch',
          }),
        }),
      ])
    )
    for (const mode of ['duplicate', 'mismatch', 'unsolicited']) {
      expect(outcomes[mode].error).toMatch(/worker|coverage/i)
      expect(outcomes[mode].coverage).toBeUndefined()
    }
    const diagnostic = outcomes.failure.events.filter(
      (event) => event.type === 'case-end'
    )[0].errors[0]
    // The serializer preserves the raw stack and carries original coordinates
    // separately. The reporter must retain those coordinates after map disposal.
    expect(diagnostic.stack).toContain('EXPECTED_ORDINARY_FAILURE')
    expect(diagnostic.frames?.[0]).toMatchObject({
      file: pathToFileURL(realpathSync(join(next.testDir, 'scenario.mjs')))
        .href,
      line: 22,
      column: 35,
      original: true,
    })
    expect(outcomes.failure.formattedDiagnostic).toContain('scenario.mjs:22:35')
    expect(outcomes.artifactsRemoved).toBe(true)
  })
})
