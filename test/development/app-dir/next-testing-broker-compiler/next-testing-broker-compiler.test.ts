import { nextTestSetup } from 'e2e-utils'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'

const exec = promisify(execFile)

describe('next-testing-broker-compiler', () => {
  const { next } = nextTestSetup({ files: __dirname, skipStart: true })

  it.each(['env', 'crash', 'cancel', 'send-failure'])(
    'owns real compiled broker workers through %s',
    async (mode) => {
      const { stdout } = await exec(
        process.execPath,
        [join(next.testDir, 'broker.cjs'), mode],
        {
          cwd: next.testDir,
          env: { ...process.env, NODE_ENV: 'development' },
          maxBuffer: 10 * 1024 * 1024,
        }
      )
      const marker = 'BROKER_RESULT='
      const line = stdout.split('\n').find((value) => value.startsWith(marker))
      expect(line).toBeDefined()
      const outcome = JSON.parse(line!.slice(marker.length))
      expect(outcome.workerGone).toBe(true)
      expect(outcome.workerPid).not.toBe(outcome.clientPid)
      expect(outcome.artifactRetained).toBe(true)
      expect(outcome.ownershipClosed).toBe(true)
      expect(outcome.closeDuration).toBeLessThan(10000)
      expect(outcome.parentEnvironment).toBe('stale-parent')
      if (mode === 'env') {
        expect(outcome.result.status).toBe('passed')
        expect(outcome.closedError).toBeUndefined()
      } else if (mode === 'cancel') {
        expect(outcome.result.status).toBe('cancelled')
        expect(outcome.closedError).toBeUndefined()
      } else if (mode === 'send-failure') {
        expect(outcome.closedError).toContain('EXPECTED_BROKER_SEND_FAILURE')
      } else {
        expect(outcome.clientExit.signal).toBe('SIGKILL')
        expect(outcome.result).toBeUndefined()
      }
    }
  )
})
