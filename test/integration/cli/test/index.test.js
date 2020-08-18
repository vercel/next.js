/* eslint-env jest */

import {
  findPort,
  killApp,
  launchApp,
  runNextCommand,
  runNextCommandDev,
} from 'next-test-utils'
import { join } from 'path'
import pkg from 'next/package'
import http from 'http'

jest.setTimeout(1000 * 60 * 5)

const dir = join(__dirname, '..')
const dirOldReact = join(__dirname, '../old-react')
const dirOldReactDom = join(__dirname, '../old-react-dom')
const dirExperimentalReact = join(__dirname, '../experimental-react')
const dirExperimentalReactDom = join(__dirname, '../experimental-react-dom')

describe('CLI Usage', () => {
  describe('no command', () => {
    test('--help', async () => {
      const help = await runNextCommand(['--help'], {
        stdout: true,
      })
      expect(help.stdout).toMatch(/Usage/)
    })

    test('-h', async () => {
      const help = await runNextCommand(['-h'], {
        stdout: true,
      })
      expect(help.stdout).toMatch(/Usage/)
    })

    test('--version', async () => {
      const output = await runNextCommand(['--version'], {
        stdout: true,
      })
      expect(output.stdout).toMatch(
        new RegExp(`Next\\.js v${pkg.version.replace(/\./g, '\\.')}`)
      )
    })

    test('-v', async () => {
      const output = await runNextCommand(['--version'], {
        stdout: true,
      })
      expect(output.stdout).toMatch(
        new RegExp(`Next\\.js v${pkg.version.replace(/\./g, '\\.')}`)
      )
    })
  })
  describe('build', () => {
    test('--help', async () => {
      const help = await runNextCommand(['build', '--help'], {
        stdout: true,
      })
      expect(help.stdout).toMatch(
        /Compiles the application for production deployment/
      )
    })

    test('-h', async () => {
      const help = await runNextCommand(['build', '-h'], {
        stdout: true,
      })
      expect(help.stdout).toMatch(
        /Compiles the application for production deployment/
      )
    })

    test('should warn when unknown argument provided', async () => {
      const { stderr } = await runNextCommand(['build', '--random'], {
        stderr: true,
      })
      expect(stderr).toEqual('Unknown or unexpected option: --random\n')
    })
    test('should not throw UnhandledPromiseRejectionWarning', async () => {
      const { stderr } = await runNextCommand(['build', '--random'], {
        stderr: true,
      })
      expect(stderr).not.toContain('UnhandledPromiseRejectionWarning')
    })
  })

  describe('dev', () => {
    test('--help', async () => {
      const help = await runNextCommand(['dev', '--help'], {
        stdout: true,
      })
      expect(help.stdout).toMatch(/Starts the application in development mode/)
    })

    test('-h', async () => {
      const help = await runNextCommand(['dev', '-h'], {
        stdout: true,
      })
      expect(help.stdout).toMatch(/Starts the application in development mode/)
    })

    test('custom directory', async () => {
      const port = await findPort()
      const output = await runNextCommandDev([dir, '--port', port], true)
      expect(output).toMatch(/started server/i)
    })

    test('--port', async () => {
      const port = await findPort()
      const output = await runNextCommandDev([dir, '--port', port], true)
      expect(output).toMatch(new RegExp(`http://localhost:${port}`))
    })

    test("NODE_OPTIONS='--inspect'", async () => {
      // this test checks that --inspect works by launching a single debugger for the main Next.js process,
      // not for its subprocesses
      const port = await findPort()
      const output = await runNextCommandDev([dir, '--port', port], true, {
        env: { NODE_OPTIONS: '--inspect' },
      })
      expect(output).toMatch(new RegExp(`http://localhost:${port}`))
    })

    test('-p', async () => {
      const port = await findPort()
      const output = await runNextCommandDev([dir, '-p', port], true)
      expect(output).toMatch(new RegExp(`http://localhost:${port}`))
    })

    test('-p conflict', async () => {
      const port = await findPort()

      let app = http.createServer((_, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('OK')
      })
      await new Promise((resolve, reject) => {
        // This code catches EADDRINUSE error if the port is already in use
        app.on('error', reject)
        app.on('listening', () => resolve())
        app.listen(port)
      })
      let stdout = '',
        stderr = ''
      await launchApp(dir, port, {
        stdout: true,
        stderr: true,
        onStdout(msg) {
          stdout += msg
        },
        onStderr(msg) {
          stderr += msg
        },
      })
      await new Promise((resolve) => app.close(resolve))
      expect(stderr).toMatch('already in use')
      expect(stdout).not.toMatch('ready')
      expect(stdout).not.toMatch('started')
      expect(stdout).not.toMatch(`${port}`)
      expect(stdout).toBeFalsy()
    })

    test('--hostname', async () => {
      const port = await findPort()
      const output = await runNextCommandDev(
        [dir, '--hostname', '0.0.0.0', '--port', port],
        true
      )
      expect(output).toMatch(new RegExp(`http://0.0.0.0:${port}`))
    })

    test('-H', async () => {
      const port = await findPort()
      const output = await runNextCommandDev(
        [dir, '-H', '0.0.0.0', '--port', port],
        true
      )
      expect(output).toMatch(new RegExp(`http://0.0.0.0:${port}`))
    })

    test('should warn when unknown argument provided', async () => {
      const { stderr } = await runNextCommand(['dev', '--random'], {
        stderr: true,
      })
      expect(stderr).toEqual('Unknown or unexpected option: --random\n')
    })
    test('should not throw UnhandledPromiseRejectionWarning', async () => {
      const { stderr } = await runNextCommand(['dev', '--random'], {
        stderr: true,
      })
      expect(stderr).not.toContain('UnhandledPromiseRejectionWarning')
    })
  })

  describe('start', () => {
    test('--help', async () => {
      const help = await runNextCommand(['start', '--help'], {
        stdout: true,
      })
      expect(help.stdout).toMatch(/Starts the application in production mode/)
    })

    test('-h', async () => {
      const help = await runNextCommand(['start', '-h'], {
        stdout: true,
      })
      expect(help.stdout).toMatch(/Starts the application in production mode/)
    })

    test('should warn when unknown argument provided', async () => {
      const { stderr } = await runNextCommand(['start', '--random'], {
        stderr: true,
      })
      expect(stderr).toEqual('Unknown or unexpected option: --random\n')
    })
    test('should not throw UnhandledPromiseRejectionWarning', async () => {
      const { stderr } = await runNextCommand(['start', '--random'], {
        stderr: true,
      })
      expect(stderr).not.toContain('UnhandledPromiseRejectionWarning')
    })

    test('too old of react version', async () => {
      const port = await findPort()

      let stderr = ''
      let instance = await launchApp(dirOldReact, port, {
        stderr: true,
        onStderr(msg) {
          stderr += msg
        },
      })

      expect(stderr).toMatch(
        'Fast Refresh is disabled in your application due to an outdated `react` version'
      )
      expect(stderr).not.toMatch(`react-dom`)

      await killApp(instance)
    })

    test('too old of react-dom version', async () => {
      const port = await findPort()

      let stderr = ''
      let instance = await launchApp(dirOldReactDom, port, {
        stderr: true,
        onStderr(msg) {
          stderr += msg
        },
      })

      expect(stderr).toMatch(
        'Fast Refresh is disabled in your application due to an outdated `react-dom` version'
      )
      expect(stderr).not.toMatch('`react`')

      await killApp(instance)
    })

    test('experimental react version', async () => {
      const port = await findPort()

      let stderr = ''
      let instance = await launchApp(dirExperimentalReact, port, {
        stderr: true,
        onStderr(msg) {
          stderr += msg
        },
      })

      expect(stderr).not.toMatch('disabled')
      expect(stderr).not.toMatch('outdated')
      expect(stderr).not.toMatch(`react-dom`)

      await killApp(instance)
    })

    test('experimental react-dom version', async () => {
      const port = await findPort()

      let stderr = ''
      let instance = await launchApp(dirExperimentalReactDom, port, {
        stderr: true,
        onStderr(msg) {
          stderr += msg
        },
      })

      expect(stderr).not.toMatch('disabled')
      expect(stderr).not.toMatch('outdated')
      expect(stderr).not.toMatch('`react`')

      await killApp(instance)
    })
  })

  describe('export', () => {
    test('--help', async () => {
      const help = await runNextCommand(['export', '--help'], {
        stdout: true,
      })
      expect(help.stdout).toMatch(/Exports the application/)
    })

    test('-h', async () => {
      const help = await runNextCommand(['export', '-h'], {
        stdout: true,
      })
      expect(help.stdout).toMatch(/Exports the application/)
    })

    test('should warn when unknown argument provided', async () => {
      const { stderr } = await runNextCommand(['export', '--random'], {
        stderr: true,
      })
      expect(stderr).toEqual('Unknown or unexpected option: --random\n')
    })
    test('should not throw UnhandledPromiseRejectionWarning', async () => {
      const { stderr } = await runNextCommand(['export', '--random'], {
        stderr: true,
      })
      expect(stderr).not.toContain('UnhandledPromiseRejectionWarning')
    })
  })

  describe('telemetry', () => {
    test('--help', async () => {
      const help = await runNextCommand(['telemetry', '--help'], {
        stdout: true,
      })
      expect(help.stdout).toMatch(
        /Allows you to control Next\.js' telemetry collection/
      )
    })

    test('-h', async () => {
      const help = await runNextCommand(['telemetry', '-h'], {
        stdout: true,
      })
      expect(help.stdout).toMatch(
        /Allows you to control Next\.js' telemetry collection/
      )
    })

    test('should warn when unknown argument provided', async () => {
      const { stderr } = await runNextCommand(['telemetry', '--random'], {
        stderr: true,
      })
      expect(stderr).toEqual('Unknown or unexpected option: --random\n')
    })
    test('should not throw UnhandledPromiseRejectionWarning', async () => {
      const { stderr } = await runNextCommand(['telemetry', '--random'], {
        stderr: true,
      })
      expect(stderr).not.toContain('UnhandledPromiseRejectionWarning')
    })
  })
})
