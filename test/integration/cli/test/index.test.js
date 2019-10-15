/* global fixture, test */
import 'testcafe'

import { runNextCommand, runNextCommandDev, findPort } from 'next-test-utils'
import { join } from 'path'
import pkg from 'next/package'

const dir = join(__dirname, '..')

fixture('CLI Usage')

fixture('no command')

test('--help', async t => {
  const help = await runNextCommand(['--help'], {
    stdout: true
  })
  await t.expect(help.stdout).match(/Usage/)
})

test('-h', async t => {
  const help = await runNextCommand(['-h'], {
    stdout: true
  })
  await t.expect(help.stdout).match(/Usage/)
})

test('--version', async t => {
  const output = await runNextCommand(['--version'], {
    stdout: true
  })
  await t
    .expect(output.stdout)
    .match(new RegExp(`Next\\.js v${pkg.version.replace(/\./g, '\\.')}`))
})

test('-v', async t => {
  const output = await runNextCommand(['--version'], {
    stdout: true
  })
  await t
    .expect(output.stdout)
    .match(new RegExp(`Next\\.js v${pkg.version.replace(/\./g, '\\.')}`))
})

fixture('build')

test('--help', async t => {
  const help = await runNextCommand(['build', '--help'], {
    stdout: true
  })
  await t
    .expect(help.stdout)
    .match(/Compiles the application for production deployment/)
})

test('-h', async t => {
  const help = await runNextCommand(['build', '-h'], {
    stdout: true
  })
  await t
    .expect(help.stdout)
    .match(/Compiles the application for production deployment/)
})

fixture('dev')
test('--help', async t => {
  const help = await runNextCommand(['dev', '--help'], {
    stdout: true
  })
  await t
    .expect(help.stdout)
    .match(/Starts the application in development mode/)
})

test('-h', async t => {
  const help = await runNextCommand(['dev', '-h'], {
    stdout: true
  })
  await t
    .expect(help.stdout)
    .match(/Starts the application in development mode/)
})

test('custom directory', async t => {
  const port = await findPort()
  const output = await runNextCommandDev([dir, '--port', port], true)
  await t.expect(output).match(/ready on/i)
})

test('--port', async t => {
  const port = await findPort()
  const output = await runNextCommandDev([dir, '--port', port], true)
  await t.expect(output).match(new RegExp(`http://localhost:${port}`))
})

test('-p', async t => {
  const port = await findPort()
  const output = await runNextCommandDev([dir, '-p', port], true)
  await t.expect(output).match(new RegExp(`http://localhost:${port}`))
})

test('--hostname', async t => {
  const port = await findPort()
  const output = await runNextCommandDev(
    [dir, '--hostname', '0.0.0.0', '--port', port],
    true
  )
  await t.expect(output).match(new RegExp(`http://0.0.0.0:${port}`))
})

test('-H', async t => {
  const port = await findPort()
  const output = await runNextCommandDev(
    [dir, '-H', '0.0.0.0', '--port', port],
    true
  )
  await t.expect(output).match(new RegExp(`http://0.0.0.0:${port}`))
})

fixture('start')

test('--help', async t => {
  const help = await runNextCommand(['start', '--help'], {
    stdout: true
  })
  await t.expect(help.stdout).match(/Starts the application in production mode/)
})

test('-h', async t => {
  const help = await runNextCommand(['start', '-h'], {
    stdout: true
  })
  await t.expect(help.stdout).match(/Starts the application in production mode/)
})

fixture('export')

test('--help', async t => {
  const help = await runNextCommand(['export', '--help'], {
    stdout: true
  })
  await t.expect(help.stdout).match(/Exports the application/)
})

test('-h', async t => {
  const help = await runNextCommand(['export', '-h'], {
    stdout: true
  })
  await t.expect(help.stdout).match(/Exports the application/)
})
