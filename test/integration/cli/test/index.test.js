/* eslint-env jest */
/* global jasmine */
import { runNextCommand, runNextCommandDev, findPort } from 'next-test-utils'
import { join } from 'path'
import pkg from 'next/package'
jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

const dir = join(__dirname, '..')

describe('CLI Usage', () => {
  describe('no command', () => {
    test('--help', async () => {
      const help = await runNextCommand(['--help'], {
        stdout: true
      })
      expect(help.stdout).toMatch(/Usage/)
    })

    test('-h', async () => {
      const help = await runNextCommand(['-h'], {
        stdout: true
      })
      expect(help.stdout).toMatch(/Usage/)
    })

    test('--version', async () => {
      const output = await runNextCommand(['--version'], {
        stdout: true
      })
      expect(output.stdout).toMatch(
        new RegExp(`Next\\.js v${pkg.version.replace(/\./g, '\\.')}`)
      )
    })

    test('-v', async () => {
      const output = await runNextCommand(['--version'], {
        stdout: true
      })
      expect(output.stdout).toMatch(
        new RegExp(`Next\\.js v${pkg.version.replace(/\./g, '\\.')}`)
      )
    })
  })
  describe('build', () => {
    test('--help', async () => {
      const help = await runNextCommand(['build', '--help'], {
        stdout: true
      })
      expect(help.stdout).toMatch(
        /Compiles the application for production deployment/
      )
    })

    test('-h', async () => {
      const help = await runNextCommand(['build', '-h'], {
        stdout: true
      })
      expect(help.stdout).toMatch(
        /Compiles the application for production deployment/
      )
    })
  })

  describe('dev', () => {
    test('--help', async () => {
      const help = await runNextCommand(['dev', '--help'], {
        stdout: true
      })
      expect(help.stdout).toMatch(/Starts the application in development mode/)
    })

    test('-h', async () => {
      const help = await runNextCommand(['dev', '-h'], {
        stdout: true
      })
      expect(help.stdout).toMatch(/Starts the application in development mode/)
    })

    test('custom directory', async () => {
      const port = await findPort()
      const output = await runNextCommandDev([dir, '--port', port], true)
      expect(output).toMatch(/ready on/i)
    })

    test('--port', async () => {
      const port = await findPort()
      const output = await runNextCommandDev([dir, '--port', port], true)
      expect(output).toMatch(new RegExp(`http://localhost:${port}`))
    })

    test('-p', async () => {
      const port = await findPort()
      const output = await runNextCommandDev([dir, '-p', port], true)
      expect(output).toMatch(new RegExp(`http://localhost:${port}`))
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
  })

  describe('start', () => {
    test('--help', async () => {
      const help = await runNextCommand(['start', '--help'], {
        stdout: true
      })
      expect(help.stdout).toMatch(/Starts the application in production mode/)
    })

    test('-h', async () => {
      const help = await runNextCommand(['start', '-h'], {
        stdout: true
      })
      expect(help.stdout).toMatch(/Starts the application in production mode/)
    })
  })

  describe('export', () => {
    test('--help', async () => {
      const help = await runNextCommand(['export', '--help'], {
        stdout: true
      })
      expect(help.stdout).toMatch(/Exports the application/)
    })

    test('-h', async () => {
      const help = await runNextCommand(['export', '-h'], {
        stdout: true
      })
      expect(help.stdout).toMatch(/Exports the application/)
    })
  })
})
