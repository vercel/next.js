import { nextTestSetup } from 'e2e-utils'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import type { ResultEvent } from 'next/dist/experimental/testing/reporting/events'

const exec = promisify(execFile)

describe('next-testing-mock-lifecycle', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  async function run(file: string) {
    const { stdout } = await exec(
      process.execPath,
      [join(next.testDir, 'compile.cjs'), file, 'lifecycle-original.js'],
      {
        cwd: next.testDir,
        env: { ...process.env, NODE_ENV: 'development' },
        maxBuffer: 10 * 1024 * 1024,
        timeout: 90000,
      }
    )
    const marker = 'MOCK_LIFECYCLE_RESULTS='
    const line = stdout.split('\n').find((value) => value.startsWith(marker))
    expect(line).toBeDefined()
    return JSON.parse(line!.slice(marker.length))
  }

  function output(events: ResultEvent[]) {
    return events
      .filter((event) => event.type === 'output')
      .map((event) => event.text)
      .join('')
  }

  function marker(text: string, prefix: string) {
    const line = text.split('\n').find((value) => value.startsWith(prefix))
    expect(line).toBeDefined()
    return JSON.parse(line!.slice(prefix.length))
  }

  it.each([
    ['lifecycle-async-error.js', 'LIFECYCLE_ASYNC_FACTORY_REJECTION', false],
    ['lifecycle-late-error.js', 'LIFECYCLE_LATE_FACTORY_REJECTION', true],
  ] as const)(
    'attributes %s to its file and isolates the following original graph',
    async (file, sentinel, late) => {
      const [failed, original] = await run(file)
      expect(failed.compilationError).toBeUndefined()
      expect(failed.artifact.moduleMocking).toEqual({ version: 1 })
      expect(failed.result).toEqual(
        expect.objectContaining({ entryId: file, status: 'failed' })
      )
      const diagnostics: ResultEvent[] = failed.events.filter(
        (event: ResultEvent) => event.type === 'diagnostic'
      )
      expect(JSON.stringify(diagnostics)).toContain(sentinel)
      expect(JSON.stringify(diagnostics)).not.toContain('process deadline')
      for (const event of diagnostics) {
        expect(event.runId).toBe('mock-lifecycle')
        expect(event).toEqual(expect.objectContaining({ entryId: file }))
      }
      expect(
        failed.events.filter((event: ResultEvent) => event.type === 'case-end')
      ).toHaveLength(late ? 1 : 0)
      const failedOutput = output(failed.events)
      let failedPid: number
      if (late) {
        const provisional = marker(failedOutput, 'LIFECYCLE_PROVISIONAL=')
        expect(provisional.status).toBe('passed')
        failedPid = provisional.pid
        expect(
          JSON.stringify(marker(failedOutput, 'LIFECYCLE_CAUGHT='))
        ).toContain(sentinel)
        expect(JSON.stringify(diagnostics)).toContain('code 1')
      } else {
        failedPid = marker(failedOutput, 'LIFECYCLE_FAILED_PID=')
      }
      expect(original.compilationError).toBeUndefined()
      expect(original.artifact.moduleMocking).toBeUndefined()
      expect(original.result).toEqual(
        expect.objectContaining({
          entryId: 'lifecycle-original.js',
          status: 'passed',
        })
      )
      expect(
        original.events.filter(
          (event: ResultEvent) => event.type === 'diagnostic'
        )
      ).toEqual([])
      expect(
        original.events.filter(
          (event: ResultEvent) => event.type === 'case-end'
        )
      ).toHaveLength(1)
      const restored = marker(output(original.events), 'LIFECYCLE_ORIGINAL=')
      expect(restored.value).toBe('original')
      expect(restored.pid).not.toBe(failedPid)
      for (const pid of [failedPid, restored.pid]) {
        expect(Number.isInteger(pid)).toBe(true)
        expect(() => process.kill(pid, 0)).toThrow(
          expect.objectContaining({ code: 'ESRCH' })
        )
      }
    }
  )
})
