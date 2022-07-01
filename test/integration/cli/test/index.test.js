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

const dir = join(__dirname, '..')
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

    test('invalid directory', async () => {
      const output = await runNextCommand(['non-existent'], {
        stderr: true,
      })
      expect(output.stderr).toContain(
        'Invalid project directory provided, no such directory'
      )
    })

    test('detects command typos', async () => {
      const typos = [
        ['buidl', 'build'],
        ['buill', 'build'],
        ['biild', 'build'],
        ['exporr', 'export'],
        ['starr', 'start'],
        ['dee', 'dev'],
      ]

      for (const check of typos) {
        const output = await runNextCommand([check[0]], {
          stderr: true,
        })
        expect(output.stderr).toContain(
          `"next ${check[0]}" does not exist. Did you mean "next ${check[1]}"?`
        )
      }
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

    test('invalid directory', async () => {
      const output = await runNextCommand(['build', 'non-existent'], {
        stderr: true,
      })
      expect(output.stderr).toContain(
        'Invalid project directory provided, no such directory'
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

    test('invalid directory', async () => {
      const output = await runNextCommand(['dev', 'non-existent'], {
        stderr: true,
      })
      expect(output.stderr).toContain(
        'Invalid project directory provided, no such directory'
      )
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

    test('invalid directory', async () => {
      const output = await runNextCommand(['start', 'non-existent'], {
        stderr: true,
      })
      expect(output.stderr).toContain(
        'Invalid project directory provided, no such directory'
      )
    })

    test('--keepAliveTimeout string arg', async () => {
      const { stderr } = await runNextCommand(
        ['start', '--keepAliveTimeout', 'string'],
        {
          stderr: true,
        }
      )
      expect(stderr).toContain(
        'Invalid --keepAliveTimeout, expected a non negative number but received "NaN"'
      )
    })

    test('--keepAliveTimeout negative number', async () => {
      const { stderr } = await runNextCommand(
        ['start', '--keepAliveTimeout=-100'],
        {
          stderr: true,
        }
      )
      expect(stderr).toContain(
        'Invalid --keepAliveTimeout, expected a non negative number but received "-100"'
      )
    })

    test('--keepAliveTimeout Infinity', async () => {
      const { stderr } = await runNextCommand(
        ['start', '--keepAliveTimeout', 'Infinity'],
        {
          stderr: true,
        }
      )
      expect(stderr).toContain(
        'Invalid --keepAliveTimeout, expected a non negative number but received "Infinity"'
      )
    })

    test('--keepAliveTimeout happy path', async () => {
      const { stderr } = await runNextCommand(
        ['start', '--keepAliveTimeout', '100'],
        {
          stderr: true,
        }
      )
      expect(stderr).not.toContain(
        'Invalid keep alive timeout provided, expected a non negative number'
      )
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

    test('invalid directory', async () => {
      const output = await runNextCommand(['export', 'non-existent'], {
        stderr: true,
      })
      expect(output.stderr).toContain(
        'Invalid project directory provided, no such directory'
      )
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

  describe('info', () => {
    test('--help', async () => {
      const help = await runNextCommand(['info', '--help'], {
        stdout: true,
      })
      expect(help.stdout).toMatch(
        /Prints relevant details about the current system which can be used to report Next\.js bugs/
      )
    })

    test('-h', async () => {
      const help = await runNextCommand(['info', '-h'], {
        stdout: true,
      })
      expect(help.stdout).toMatch(
        /Prints relevant details about the current system which can be used to report Next\.js bugs/
      )
    })

    test('should print output', async () => {
      const info = await runNextCommand(['info'], {
        stdout: true,
        stderr: true,
      })
      expect((info.stderr || '').toLowerCase()).not.toContain('error')

      expect(info.stdout).toMatch(
        new RegExp(`
    Operating System:
      Platform: .*
      Arch: .*
      Version: .*
    Binaries:
      Node: .*
      npm: .*
      Yarn: .*
      pnpm: .*
    Relevant packages:
      next: .*
      eslint-config-next: .*
      react: .*
      react-dom: .*
`)
      )
    })
  })
})
