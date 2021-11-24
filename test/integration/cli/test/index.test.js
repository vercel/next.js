/* eslint-env jest */

import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
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
const dirDuplicateSass = join(__dirname, '../duplicate-sass')

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

    test('should exit when SIGINT is signalled', async () => {
      const killSigint = (instance) =>
        setTimeout(() => instance.kill('SIGINT'), 1000)
      const { code, signal } = await runNextCommand(['build', dir], {
        ignoreFail: true,
        instance: killSigint,
      })
      // Node can only partially emulate signals on Windows. Our signal handlers won't affect the exit code.
      // See: https://nodejs.org/api/process.html#process_signal_events
      const expectedExitCode = process.platform === `win32` ? null : 0
      const expectedExitSignal = process.platform === `win32` ? 'SIGINT' : null
      expect(code).toBe(expectedExitCode)
      expect(signal).toBe(expectedExitSignal)
    })
    test('should exit when SIGTERM is signalled', async () => {
      const killSigterm = (instance) =>
        setTimeout(() => instance.kill('SIGTERM'), 1000)
      const { code, signal } = await runNextCommand(['build', dir], {
        ignoreFail: true,
        instance: killSigterm,
      })
      // Node can only partially emulate signals on Windows. Our signal handlers won't affect the exit code.
      // See: https://nodejs.org/api/process.html#process_signal_events
      const expectedExitCode = process.platform === `win32` ? null : 0
      const expectedExitSignal = process.platform === `win32` ? 'SIGTERM' : null
      expect(code).toBe(expectedExitCode)
      expect(signal).toBe(expectedExitSignal)
    })

    test('too old of react version', async () => {
      const { stderr } = await runNextCommand(['build', dirOldReact], {
        stderr: true,
      })

      expect(stderr).toMatch(
        'React 17.0.1 or newer will be required to leverage all of the upcoming features in Next.js 11.'
      )
    })

    test('too old of react-dom version', async () => {
      const { stderr } = await runNextCommand(['build', dirOldReactDom], {
        stderr: true,
      })

      expect(stderr).toMatch(
        'React 17.0.1 or newer will be required to leverage all of the upcoming features in Next.js 11.'
      )
    })

    test('experimental react version', async () => {
      const { stderr } = await runNextCommand(['build', dirExperimentalReact], {
        stderr: true,
      })

      expect(stderr).not.toMatch(
        'React 17.0.1 or newer will be required to leverage all of the upcoming features in Next.js 11.'
      )
    })

    test('experimental react-dom version', async () => {
      const { stderr } = await runNextCommand(
        ['build', dirExperimentalReactDom],
        {
          stderr: true,
        }
      )

      expect(stderr).not.toMatch(
        'React 17.0.1 or newer will be required to leverage all of the upcoming features in Next.js 11.'
      )
    })

    test('recommended react version', async () => {
      const { stderr } = await runNextCommand(['build'], {
        stderr: true,
      })

      expect(stderr).not.toMatch(
        'React 17.0.1 or newer will be required to leverage all of the upcoming features in Next.js 11.'
      )
    })

    test('recommended react-dom version', async () => {
      const { stderr } = await runNextCommand(['build'], {
        stderr: true,
      })

      expect(stderr).not.toMatch(
        'React 17.0.1 or newer will be required to leverage all of the upcoming features in Next.js 11.'
      )
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
      expect(output).toMatch(new RegExp(`on 0.0.0.0:${port}`))
      expect(output).toMatch(new RegExp(`http://localhost:${port}`))
    })

    test("NODE_OPTIONS='--inspect'", async () => {
      // this test checks that --inspect works by launching a single debugger for the main Next.js process,
      // not for its subprocesses
      const port = await findPort()
      const output = await runNextCommandDev([dir, '--port', port], true, {
        env: { NODE_OPTIONS: '--inspect' },
      })
      expect(output).toMatch(new RegExp(`on 0.0.0.0:${port}`))
      expect(output).toMatch(new RegExp(`http://localhost:${port}`))
    })

    test('-p', async () => {
      const port = await findPort()
      const output = await runNextCommandDev([dir, '-p', port], true)
      expect(output).toMatch(new RegExp(`on 0.0.0.0:${port}`))
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
      expect(output).toMatch(new RegExp(`on 0.0.0.0:${port}`))
      expect(output).toMatch(new RegExp(`http://localhost:${port}`))
    })

    test('-H', async () => {
      const port = await findPort()
      const output = await runNextCommandDev(
        [dir, '-H', '0.0.0.0', '--port', port],
        true
      )
      expect(output).toMatch(new RegExp(`on 0.0.0.0:${port}`))
      expect(output).toMatch(new RegExp(`http://localhost:${port}`))
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

    test('should exit when SIGINT is signalled', async () => {
      const killSigint = (instance) =>
        setTimeout(() => instance.kill('SIGINT'), 1000)
      const port = await findPort()
      const { code, signal } = await runNextCommand(['dev', dir, '-p', port], {
        ignoreFail: true,
        instance: killSigint,
      })
      // Node can only partially emulate signals on Windows. Our signal handlers won't affect the exit code.
      // See: https://nodejs.org/api/process.html#process_signal_events
      const expectedExitCode = process.platform === `win32` ? null : 0
      const expectedExitSignal = process.platform === `win32` ? 'SIGINT' : null
      expect(code).toBe(expectedExitCode)
      expect(signal).toBe(expectedExitSignal)
    })
    test('should exit when SIGTERM is signalled', async () => {
      const killSigterm = (instance) =>
        setTimeout(() => instance.kill('SIGTERM'), 1000)
      const port = await findPort()
      const { code, signal } = await runNextCommand(['dev', dir, '-p', port], {
        ignoreFail: true,
        instance: killSigterm,
      })
      // Node can only partially emulate signals on Windows. Our signal handlers won't affect the exit code.
      // See: https://nodejs.org/api/process.html#process_signal_events
      const expectedExitCode = process.platform === `win32` ? null : 0
      const expectedExitSignal = process.platform === `win32` ? 'SIGTERM' : null
      expect(code).toBe(expectedExitCode)
      expect(signal).toBe(expectedExitSignal)
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
        'React 17.0.1 or newer will be required to leverage all of the upcoming features in Next.js 11.'
      )

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
        'React 17.0.1 or newer will be required to leverage all of the upcoming features in Next.js 11.'
      )

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

      expect(stderr).not.toMatch(
        'React 17.0.1 or newer will be required to leverage all of the upcoming features in Next.js 11.'
      )

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

      expect(stderr).not.toMatch(
        'React 17.0.1 or newer will be required to leverage all of the upcoming features in Next.js 11.'
      )

      await killApp(instance)
    })

    test('recommended react version', async () => {
      const port = await findPort()

      let stderr = ''
      let instance = await launchApp(dir, port, {
        stderr: true,
        onStderr(msg) {
          stderr += msg
        },
      })

      expect(stderr).not.toMatch(
        'React 17.0.1 or newer will be required to leverage all of the upcoming features in Next.js 11.'
      )

      await killApp(instance)
    })

    test('recommended react-dom version', async () => {
      const port = await findPort()

      let stderr = ''
      let instance = await launchApp(dir, port, {
        stderr: true,
        onStderr(msg) {
          stderr += msg
        },
      })

      expect(stderr).not.toMatch(
        'React 17.0.1 or newer will be required to leverage all of the upcoming features in Next.js 11.'
      )

      await killApp(instance)
    })

    test('duplicate sass deps', async () => {
      const port = await findPort()

      let stderr = ''
      let instance = await launchApp(dirDuplicateSass, port, {
        stderr: true,
        onStderr(msg) {
          stderr += msg
        },
      })

      expect(stderr).toMatch('both `sass` and `node-sass` installed')

      await killApp(instance)
    })

    test('should exit when SIGINT is signalled', async () => {
      const killSigint = (instance) =>
        setTimeout(() => instance.kill('SIGINT'), 1000)
      await nextBuild(dir)
      const port = await findPort()
      const { code, signal } = await runNextCommand(
        ['start', dir, '-p', port],
        {
          ignoreFail: true,
          instance: killSigint,
        }
      )
      // Node can only partially emulate signals on Windows. Our signal handlers won't affect the exit code.
      // See: https://nodejs.org/api/process.html#process_signal_events
      const expectedExitCode = process.platform === `win32` ? null : 0
      const expectedExitSignal = process.platform === `win32` ? 'SIGINT' : null
      expect(code).toBe(expectedExitCode)
      expect(signal).toBe(expectedExitSignal)
    })
    test('should exit when SIGTERM is signalled', async () => {
      const killSigterm = (instance) =>
        setTimeout(() => instance.kill('SIGTERM'), 1000)
      await nextBuild(dir)
      const port = await findPort()
      const { code, signal } = await runNextCommand(
        ['start', dir, '-p', port],
        {
          ignoreFail: true,
          instance: killSigterm,
        }
      )
      // Node can only partially emulate signals on Windows. Our signal handlers won't affect the exit code.
      // See: https://nodejs.org/api/process.html#process_signal_events
      const expectedExitCode = process.platform === `win32` ? null : 0
      const expectedExitSignal = process.platform === `win32` ? 'SIGTERM' : null
      expect(code).toBe(expectedExitCode)
      expect(signal).toBe(expectedExitSignal)
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
