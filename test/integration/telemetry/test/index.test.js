/* global fixture, test */
import 'testcafe'

import fs from 'fs-extra'
import path from 'path'
import {
  runNextCommand,
  findPort,
  launchApp,
  killApp,
  waitFor
} from 'next-test-utils'

const appDir = path.join(__dirname, '..')

fixture('Telemetry CLI')

test('can print telemetry status', async t => {
  const { stdout } = await runNextCommand(['telemetry'], {
    stdout: true
  })
  await t.expect(stdout).match(/Status: .*/)
})

test('can enable telemetry with flag', async t => {
  const { stdout } = await runNextCommand(['telemetry', '--enable'], {
    stdout: true
  })
  await t.expect(stdout).match(/Success/)
  await t.expect(stdout).match(/Status: Enabled/)
})

test('can disable telemetry with flag', async t => {
  const { stdout } = await runNextCommand(['telemetry', '--disable'], {
    stdout: true
  })
  await t.expect(stdout).match(/Your preference has been saved/)
  await t.expect(stdout).match(/Status: Disabled/)
})

test('can enable telemetry without flag', async t => {
  const { stdout } = await runNextCommand(['telemetry', 'enable'], {
    stdout: true
  })
  await t.expect(stdout).match(/Success/)
  await t.expect(stdout).match(/Status: Enabled/)
})

test('can re-enable telemetry', async t => {
  const { stdout } = await runNextCommand(['telemetry', 'enable'], {
    stdout: true
  })
  await t.expect(stdout).match(/Success/)
  await t.expect(stdout).match(/Status: Enabled/)
})

test('can disable telemetry without flag', async t => {
  const { stdout } = await runNextCommand(['telemetry', 'disable'], {
    stdout: true
  })
  await t.expect(stdout).match(/Your preference has been saved/)
  await t.expect(stdout).match(/Status: Disabled/)
})

test('can re-disable telemetry', async t => {
  const { stdout } = await runNextCommand(['telemetry', 'disable'], {
    stdout: true
  })
  await t.expect(stdout).match(/already disabled/)
  await t.expect(stdout).match(/Status: Disabled/)
})

test('detects isSrcDir dir correctly for `next build`', async t => {
  const { stderr } = await runNextCommand(['build', appDir], {
    stderr: true,
    env: {
      NEXT_TELEMETRY_DEBUG: 1
    }
  })

  await t.expect(stderr).match(/isSrcDir.*?false/)

  await fs.move(path.join(appDir, 'pages'), path.join(appDir, 'src/pages'))
  const { stderr: stderr2 } = await runNextCommand(['build', appDir], {
    stderr: true,
    env: {
      NEXT_TELEMETRY_DEBUG: 1
    }
  })
  await fs.move(path.join(appDir, 'src/pages'), path.join(appDir, 'pages'))

  await t.expect(stderr2).match(/isSrcDir.*?true/)
})

test('detects isSrcDir dir correctly for `next dev`', async t => {
  let port = await findPort()
  let stderr = ''

  const handleStderr = msg => {
    stderr += msg
  }
  let app = await launchApp(appDir, port, {
    onStderr: handleStderr,
    env: {
      NEXT_TELEMETRY_DEBUG: 1
    }
  })
  await waitFor(1000)
  await killApp(app)
  await t.expect(stderr).match(/isSrcDir.*?false/)

  await fs.move(path.join(appDir, 'pages'), path.join(appDir, 'src/pages'))
  stderr = ''

  port = await findPort()
  app = await launchApp(appDir, port, {
    onStderr: handleStderr,
    env: {
      NEXT_TELEMETRY_DEBUG: 1
    }
  })
  await waitFor(1000)
  await killApp(app)
  await fs.move(path.join(appDir, 'src/pages'), path.join(appDir, 'pages'))

  await t.expect(stderr).match(/isSrcDir.*?true/)
})
