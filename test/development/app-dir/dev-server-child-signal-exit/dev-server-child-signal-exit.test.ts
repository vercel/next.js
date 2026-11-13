import { nextTestSetup } from 'e2e-utils'
import { fetchViaHTTP, findPort } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

// Node.js can only emulate signals on Windows, so the server process can't be
// killed with a real SIGKILL there.
// @force-gate !windows
describe('dev-server-child-signal-exit', () => {
  const { next, isTurbopack, isRspack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('exits with an error when the server process is killed by a signal', async () => {
    const port = await findPort()
    const controller = new AbortController()

    let output = ''
    let onReady!: () => void
    const ready = new Promise<void>((resolve) => {
      onReady = resolve
    })
    const onOutput = (msg: string) => {
      output += stripAnsi(msg)
      if (output.includes('Ready in')) onReady()
    }

    const exit = next.runCommand(
      [
        'dev',
        ...(isRspack ? [] : [isTurbopack ? '--turbopack' : '--webpack']),
        '--port',
        String(port),
      ],
      { onStdout: onOutput, onStderr: onOutput, signal: controller.signal }
    )

    try {
      await Promise.race([
        ready,
        exit.then((result) => {
          throw new Error(
            `next dev exited before it was ready:\n${result.cliOutput}`
          )
        }),
      ])

      const res = await fetchViaHTTP(port, '/api/pid')
      expect(res.status).toBe(200)
      const serverPid = Number(await res.text())
      expect(serverPid).toBeGreaterThan(0)

      // Simulate the server process being killed, e.g. by the OOM killer.
      process.kill(serverPid, 'SIGKILL')

      // Previously, `next dev` ignored this: it exited silently with code 0
      // or kept running without a server. It must now report the signal and
      // exit with 128 + 9 (SIGKILL).
      const result = await exit
      expect(result.code).toBe(137)
      expect(stripAnsi(result.cliOutput)).toContain(
        'The Next.js dev server process exited unexpectedly due to signal SIGKILL'
      )
    } finally {
      controller.abort()
    }
  })
})
