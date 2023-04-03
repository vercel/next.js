/* eslint-env jest */

import {
  check,
  findPort,
  killApp,
  launchApp,
  nextBuild,
  runNextCommand,
  runNextCommandDev,
} from 'next-test-utils'
import fs from 'fs-extra'
import { join } from 'path'
import pkg from 'next/package'
import http from 'http'
import stripAnsi from 'strip-ansi'

const dir = join(__dirname, '..')
const dirDuplicateSass = join(__dirname, '../duplicate-sass')

const testExitSignal = async (
  killSignal = '',
  args = [],
  readyRegex = /Creating an optimized production/
) => {
  let instance
  const killSigint = (inst) => {
    instance = inst
  }
  let output = ''

  let cmdPromise = runNextCommand(args, {
    ignoreFail: true,
    instance: killSigint,
    onStdout: (msg) => {
      output += stripAnsi(msg)
    },
  }).catch((err) => expect.fail(err.message))

  await check(() => output, readyRegex)
  instance.kill(killSignal)

  const { code, signal } = await cmdPromise
  // Node can only partially emulate signals on Windows. Our signal handlers won't affect the exit code.
  // See: https://nodejs.org/api/process.html#process_signal_events
  const expectedExitSignal = process.platform === `win32` ? killSignal : null
  expect(signal).toBe(expectedExitSignal)
  expect(code).toBe(0)
}

describe('CLI Usage', () => {
  describe('start', () => {
    test('should exit when SIGINT is signalled', async () => {
      require('console').log('before build')
      await fs.remove(join(dir, '.next'))
      await nextBuild(dir, undefined, {
        onStdout(msg) {
          console.log(msg)
        },
        onStderr(msg) {
          console.log(msg)
        },
      })
      require('console').log('build finished')

      const port = await findPort()
      await testExitSignal(
        'SIGINT',
        ['start', dir, '-p', port],
        /started server on/
      )
    })
    test('should exit when SIGTERM is signalled', async () => {
      await fs.remove(join(dir, '.next'))
      await nextBuild(dir, undefined, {
        onStdout(msg) {
          console.log(msg)
        },
        onStderr(msg) {
          console.log(msg)
        },
      })
      const port = await findPort()
      await testExitSignal(
        'SIGTERM',
        ['start', dir, '-p', port],
        /started server on/
      )
    })

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

    test('should format IPv6 addresses correctly', async () => {
      const port = await findPort()
      const output = await runNextCommand(
        ['start', '--hostname', '::', '--port', port],
        {
          stdout: true,
        }
      )
      expect(output.stdout).toMatch(new RegExp(`on \\[::\\]:${port}`))
      expect(output.stdout).toMatch(new RegExp(`http://\\[::1\\]:${port}`))
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

      try {
        await check(() => stderr, /both `sass` and `node-sass` installed/)
      } finally {
        await killApp(instance)
      }
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
      await testExitSignal('SIGINT', ['build', dir])
    })

    test('should exit when SIGTERM is signalled', async () => {
      await testExitSignal('SIGTERM', ['build', dir])
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
      let output = ''
      const app = await runNextCommandDev([dir, '--port', port], undefined, {
        onStdout(msg) {
          output += stripAnsi(msg)
        },
      })
      try {
        await check(() => output, /started server/i)
      } finally {
        await killApp(app)
      }
    })

    test('--port', async () => {
      const port = await findPort()
      let output = ''
      const app = await runNextCommandDev([dir, '--port', port], undefined, {
        onStdout(msg) {
          output += stripAnsi(msg)
        },
      })
      try {
        await check(() => output, new RegExp(`on 0.0.0.0:${port}`))
        await check(() => output, new RegExp(`http://localhost:${port}`))
      } finally {
        await killApp(app)
      }
    })

    test('--port 0', async () => {
      const port = await findPort()
      let output = ''
      const app = await runNextCommandDev([dir, '--port', port], undefined, {
        onStdout(msg) {
          output += stripAnsi(msg)
        },
      })
      try {
        await check(() => output, new RegExp(`on 0.0.0.0:${port}`))
        await check(() => output, new RegExp(`http://localhost:${port}`))
      } finally {
        await killApp(app)
      }
      const matches = /on 0.0.0.0:(\d+)/.exec(output)
      expect(matches).not.toBe(null)

      const _port = parseInt(matches[1])
      // Regression test: port 0 was interpreted as if no port had been
      // provided, falling back to 3000.
      expect(_port).not.toBe(3000)
    })

    test('PORT=0', async () => {
      let output = ''
      const app = await runNextCommandDev([dir], undefined, {
        env: {
          PORT: 0,
        },
        onStdout(msg) {
          output += stripAnsi(msg)
        },
      })
      try {
        await check(() => output, /on 0.0.0.0:(\d+)/)
        const matches = /on 0.0.0.0:(\d+)/.exec(output)
        const _port = parseInt(matches[1])
        expect(matches).not.toBe(null)
        // Regression test: port 0 was interpreted as if no port had been
        // provided, falling back to 3000.
        expect(_port).not.toBe(3000)
      } finally {
        await killApp(app)
      }
    })

    test("NODE_OPTIONS='--inspect'", async () => {
      const port = await findPort()
      let output = ''
      const app = await runNextCommandDev([dir, '--port', port], undefined, {
        onStdout(msg) {
          output += stripAnsi(msg)
        },
        env: { NODE_OPTIONS: '--inspect' },
      })
      try {
        await check(() => output, new RegExp(`on 0.0.0.0:${port}`))
        await check(() => output, new RegExp(`http://localhost:${port}`))
      } finally {
        await killApp(app)
      }
    })

    test('-p', async () => {
      const port = await findPort()
      let output = ''
      const app = await runNextCommandDev([dir, '-p', port], undefined, {
        onStdout(msg) {
          output += stripAnsi(msg)
        },
        env: { NODE_OPTIONS: '--inspect' },
      })
      try {
        await check(() => output, new RegExp(`on 0.0.0.0:${port}`))
        await check(() => output, new RegExp(`http://localhost:${port}`))
      } finally {
        await killApp(app)
      }
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
      expect(stripAnsi(stdout).trim()).toBeFalsy()
    })

    test('--hostname', async () => {
      const port = await findPort()
      let output = ''
      const app = await runNextCommandDev(
        [dir, '--hostname', '0.0.0.0', '--port', port],
        undefined,
        {
          onStdout(msg) {
            output += stripAnsi(msg)
          },
        }
      )
      try {
        await check(() => output, new RegExp(`on 0.0.0.0:${port}`))
        await check(() => output, new RegExp(`http://localhost:${port}`))
      } finally {
        await killApp(app)
      }
    })

    test('-H', async () => {
      const port = await findPort()
      let output = ''
      const app = await runNextCommandDev(
        [dir, '-H', '0.0.0.0', '--port', port],
        undefined,
        {
          onStdout(msg) {
            output += stripAnsi(msg)
          },
        }
      )
      try {
        await check(() => output, new RegExp(`on 0.0.0.0:${port}`))
        await check(() => output, new RegExp(`http://localhost:${port}`))
      } finally {
        await killApp(app)
      }
    })

    test('should format IPv6 addresses correctly', async () => {
      const port = await findPort()
      let output = ''
      const app = await runNextCommandDev(
        [dir, '--hostname', '::', '--port', port],
        undefined,
        {
          onStdout(msg) {
            output += stripAnsi(msg)
          },
        }
      )
      try {
        await check(() => output, new RegExp(`on \\[::\\]:${port}`))
        await check(() => output, new RegExp(`http://\\[::1\\]:${port}`))
      } finally {
        await killApp(app)
      }
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
      const port = await findPort()
      await testExitSignal(
        'SIGINT',
        ['dev', dir, '-p', port],
        /started server on/
      )
    })
    test('should exit when SIGTERM is signalled', async () => {
      const port = await findPort()
      await testExitSignal(
        'SIGTERM',
        ['dev', dir, '-p', port],
        /started server on/
      )
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
