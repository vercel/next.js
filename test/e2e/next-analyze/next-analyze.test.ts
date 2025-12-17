import { nextTestSetup } from 'e2e-utils'
import { runNextCommand, shouldUseTurbopack } from 'next-test-utils'
import path from 'node:path'
import { ChildProcess, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

describe('next experimental-analyze', () => {
  if (!shouldUseTurbopack()) {
    // Test suites require at least one test
    it('skips in non-Turbopack tests', () => {})
    return
  }

  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) {
    // Test suites require at least one test
    it('is skipped', () => {})
    return
  }

  it('runs successfully without errors', async () => {
    const nextDir = path.dirname(require.resolve('next/package'))
    const nextBin = path.join(nextDir, 'dist/bin/next')

    const serveProcess = spawn(
      'node',
      [nextBin, 'experimental-analyze', '--port', '0'],
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
  ;['-o', '--output'].forEach((flag) => {
    describe(`with ${flag} flag`, () => {
      it('writes output to .next/diagnostics/analyze path', async () => {
        const defaultOutputPath = path.join(
          next.testDir,
          '.next/diagnostics/analyze'
        )

        const { code, stderr, stdout } = await runNextCommand(
          ['experimental-analyze', flag],
          {
            cwd: next.testDir,
            stderr: true,
            stdout: true,
          }
        )

        expect(code).toBe(0)
        expect(stderr).not.toContain('Error')
        expect(stdout).toContain('.next/diagnostics/analyze')

        expect(existsSync(defaultOutputPath)).toBe(true)
        for (const file of [
          'index.html',
          'data/routes.json',
          'data/modules.data',
          'data/analyze.data',
        ]) {
          expect(existsSync(path.join(defaultOutputPath, file))).toBe(true)
        }

        const routesJson = readFileSync(
          path.join(defaultOutputPath, 'data', 'routes.json'),
          'utf-8'
        )
        const routes = JSON.parse(routesJson)
        expect(routes).toEqual(['/', '/_not-found'])
      })
    })
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
