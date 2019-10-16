/* global fixture, test */
import 'testcafe'

import { runNextCommand } from 'next-test-utils'

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
