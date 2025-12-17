import { nextTestSetup } from 'e2e-utils'
import { runNextCommand, shouldUseTurbopack } from 'next-test-utils'
import path from 'node:path'
import { ChildProcess, spawn } from 'node:child_process'

describe('next experimental-analyze', () => {
  if (!shouldUseTurbopack()) {
    it('skips in non-Turbopack tests', () => {})
    return
  }

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    it('is skipped', () => {})
    return
  }

  it('runs successfully without errors', async () => {
    const { code, stderr } = await runNextCommand(['experimental-analyze'], {
      cwd: next.testDir,
      stderr: true,
    })

    expect(code).toBe(0)
    expect(stderr).not.toContain('Error')

    const nextDir = path.dirname(require.resolve('next/package'))
    const nextBin = path.join(nextDir, 'dist/bin/next')

    const serveProcess = spawn(
      'node',
      [nextBin, 'experimental-analyze', '--serve', '--port', '0'],
      {
        cwd: next.testDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )

    try {
      const url = await waitForServer(serveProcess)
      const response = await fetch(url)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain(
        '<title>Next.js Bundle Analyzer</title>'
      )
    } finally {
      serveProcess.kill()
    }
  })
})

function waitForServer(process: ChildProcess, timeoutMs: number = 30000) {
  const serverUrlPromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      process.stdout.off('data', onStdout)
      process.off('error', onError)
      process.off('exit', onExit)
      reject(new Error('Server did not start within timeout'))
    }, timeoutMs)

    function onStdout(data: Buffer) {
      const urlMatch = data.toString().match(/http:\/\/[^\s]+/)
      if (urlMatch) {
        clearTimeout(timeout)
        process.stdout.off('data', onStdout)
        process.off('error', onError)
        process.off('exit', onExit)
        resolve(urlMatch[0])
      }
    }

    function onError(error: Error) {
      clearTimeout(timeout)
      process.stdout.off('data', onStdout)
      process.off('error', onError)
      process.off('exit', onExit)
      reject(error)
    }

    function onExit(code: number) {
      clearTimeout(timeout)
      process.stdout.off('data', onStdout)
      process.off('error', onError)
      process.off('exit', onExit)
      reject(
        new Error(
          `Server process exited with code ${code} before URL was emitted`
        )
      )
    }

    process.stdout.on('data', onStdout)
    process.on('error', onError)
    process.on('exit', onExit)
  })

  return serverUrlPromise
}
