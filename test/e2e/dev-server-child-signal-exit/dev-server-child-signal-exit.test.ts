import { execFileSync } from 'child_process'
import { nextTestSetup } from 'e2e-utils'
import { findPort, retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'
import type { ChildProcess } from 'child_process'

/**
 * `next dev` forks the actual dev server into a child process. When that child
 * dies from a signal (e.g. a native SIGSEGV), the parent CLI currently ignores
 * the signalled exit entirely: it exits with code 0 and prints nothing, so
 * process supervisors observe a clean shutdown after a server crash.
 *
 * This test locks in that current (incorrect) behavior. When `next dev` starts
 * reporting signalled child exits — the expected behavior is a non-zero exit
 * status (conventionally 128 + signal) and a message naming the signal — this
 * test must be updated along with the fix.
 */
// @force-gate dev
// @force-gate !windows
describe('next dev - server child killed by a signal', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('exits with code 0 and prints no crash notice when the server child dies from SIGSEGV', async () => {
    const port = await findPort()
    let output = ''
    let cli: ChildProcess | undefined

    const exitPromise = next.runCommand(
      ['dev', next.testDir, '-p', String(port)],
      {
        instance: (childProcess) => {
          cli = childProcess
        },
        onStdout: (msg) => {
          output += stripAnsi(msg)
        },
        onStderr: (msg) => {
          output += stripAnsi(msg)
        },
      }
    )

    await retry(() => {
      expect(output).toMatch(/Ready in/)
    })

    // The forked dev server process is the only direct child of the CLI.
    let serverPid: number | undefined
    await retry(() => {
      const pids = execFileSync('pgrep', ['-P', String(cli!.pid)])
        .toString()
        .split('\n')
        .map((line) => parseInt(line.trim(), 10))
        .filter((pid) => Number.isInteger(pid))
      expect(pids.length).toBe(1)
      serverPid = pids[0]
    })

    const outputBeforeCrash = output
    process.kill(serverPid!, 'SIGSEGV')

    const { code, signal } = await exitPromise

    // Current behavior: the signalled child exit is swallowed.
    expect({ code, signal }).toEqual({ code: 0, signal: null })
    expect(output.slice(outputBeforeCrash.length)).not.toMatch(/SIGSEGV/)
  })
})
