/* eslint-env jest */
/* global jasmine */
import { dirname, join } from 'path'
import {
  nextServer,
  startApp,
  stopApp,
  renderViaHTTP
} from 'next-test-utils'
import spawn from 'cross-spawn'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

function runNextCommand (argv, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`Running command "next ${argv.join(' ')}"`)
    const instance = spawn('node', [join(dirname(require.resolve('next/package')), 'dist/bin/next'), ...argv], { ...options.spawnOptions, cwd: join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] })

    let stderrOutput = ''
    if (options.stderr) {
      instance.stderr.on('data', function (chunk) {
        stderrOutput += chunk
      })
    }

    let stdoutOutput = ''
    if (options.stdout) {
      instance.stdout.on('data', function (chunk) {
        stdoutOutput += chunk
      })
    }

    instance.on('close', () => {
      resolve({
        stdout: stdoutOutput,
        stderr: stderrOutput
      })
    })

    instance.on('error', (err) => {
      err.stdout = stdoutOutput
      err.stderr = stderrOutput
      reject(err)
    })
  })
}

describe('Production Custom Build Directory', () => {
  describe('With basic usage', () => {
    it('should render the page', async () => {
      const result = await runNextCommand(['build', 'build'], { stdout: true, stderr: true })
      expect(result.stderr).toBe('')

      const app = nextServer({
        dir: join(__dirname, '../build'),
        dev: false,
        quiet: true
      })

      const server = await startApp(app)
      const appPort = server.address().port

      const html = await renderViaHTTP(appPort, '/')
      expect(html).toMatch(/Hello World/)

      await stopApp(server)
    })
  })
})
