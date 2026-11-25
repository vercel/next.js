import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import semver from 'next/dist/compiled/semver'
import { spawnNextUpgrade } from 'next/dist/cli/next-upgrade'
import { handoffUpgrade } from 'next/dist/lib/upgrade/harness'
import { prepareUpgrade } from 'next/dist/lib/upgrade/prepare-upgrade'

// Only the network lookup and the agent launch are replaced. Loading the app's
// config and .env files runs for real.
jest.mock('next/dist/lib/upgrade/harness', () => ({
  handoffUpgrade: jest.fn(),
}))
jest.mock('next/dist/lib/upgrade/prepare-upgrade', () => ({
  ...jest.requireActual('next/dist/lib/upgrade/prepare-upgrade'),
  prepareUpgrade: jest.fn(),
}))

describe('agent upgrade handoff environment', () => {
  const savedEnv = { ...process.env }
  const { version } = require('next/package.json')
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'agent-upgrade-handoff-env-'))
    await mkdir(join(directory, 'app'))
    await writeFile(join(directory, 'package.json'), '{}')
    await writeFile(join(directory, 'next.config.js'), 'module.exports = {}\n')
    await writeFile(
      join(directory, '.env.production'),
      'UPGRADE_HANDOFF_DOTENV=production\nNEXT_TELEMETRY_DISABLED=1\n'
    )

    // The test runner's NODE_ENV=test would select .env.test instead.
    delete process.env.NODE_ENV
    delete process.env.NEXT_TELEMETRY_DISABLED
    process.env.UPGRADE_HANDOFF_SHELL_VAR = 'kept'
    // Use this CLI instead of delegating to the latest canary.
    process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION = version
    // loadConfig requires next.config.js, since Jest cannot run import().
    process.env.__NEXT_TEST_MODE = 'jest'

    jest.mocked(prepareUpgrade).mockResolvedValue({
      status: 'ready',
      installedVersion: version,
      targetVersion: semver.inc(
        version,
        semver.prerelease(version) ? 'prerelease' : 'patch'
      )!,
      references: [],
      futureDefaults: [],
    })
  })

  afterEach(async () => {
    process.env = { ...savedEnv }
    await rm(directory, { recursive: true, force: true })
  })

  it('launches the agent with the environment the upgrade started with', async () => {
    let handoffEnv: NodeJS.ProcessEnv | undefined
    jest.mocked(handoffUpgrade).mockImplementation(async () => {
      handoffEnv = { ...process.env }
      return 'handed_off'
    })

    await spawnNextUpgrade(
      directory,
      { revision: 'latest', verbose: false, agent: 'latest' },
      null
    )

    expect(handoffUpgrade).toHaveBeenCalledTimes(1)
    expect(handoffEnv).toMatchObject({
      UPGRADE_HANDOFF_SHELL_VAR: 'kept',
      // A telemetry opt-out from .env still applies to the upgrade.
      NEXT_TELEMETRY_DISABLED: '1',
    })
    expect(handoffEnv).not.toHaveProperty('UPGRADE_HANDOFF_DOTENV')
    // Otherwise the agent's own `next dev` skips loading .env files.
    expect(handoffEnv).not.toHaveProperty('__NEXT_PROCESSED_ENV')
  })
})
