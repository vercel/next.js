/* eslint-env jest */
/* global jasmine */
import { runNextCommand } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 2

describe('Telemetry CLI', () => {
  it('can print telemetry status', async () => {
    const { stdout } = await runNextCommand(['telemetry'], {
      stdout: true
    })
    expect(stdout).toMatch(/Status: .*/)
  })

  it('can enable telemetry', async () => {
    const { stdout } = await runNextCommand(['telemetry', '--enable'], {
      stdout: true
    })
    expect(stdout).toMatch(/Success/)
    expect(stdout).toMatch(/Status: Enabled/)
  })

  it('can disable telemetry', async () => {
    const { stdout } = await runNextCommand(['telemetry', '--disable'], {
      stdout: true
    })
    expect(stdout).toMatch(/Your preference has been saved/)
    expect(stdout).toMatch(/Status: Disabled/)
  })
})
