import { ChildProcess } from 'child_process'
import spawn from 'next/dist/compiled/cross-spawn'
import { processEnv, resetEnv, updateInitialEnv } from '@next/env'
import { runUpgrade } from './next-upgrade'

jest.mock('next/dist/compiled/cross-spawn', () => jest.fn())
jest.mock('../lib/helpers/get-npx-command', () => ({
  getNpxCommand: () => 'pnpm --loglevel=error dlx',
}))
jest.mock('../server/config', () => async () => ({}))
jest.mock('../telemetry/storage', () => ({
  Telemetry: class {
    record = jest.fn()
    flush = async () => []
  },
}))
jest.mock('../telemetry/agent-name', () => ({ getAgentName: async () => null }))
const spawnMock = jest.mocked(spawn)
const originalExitCode = process.exitCode
beforeEach(() => {
  jest.resetAllMocks()
  process.exitCode = undefined
  spawnMock.mockImplementation(() => {
    const child = new ChildProcess()
    child.kill = jest.fn(() => true)
    process.nextTick(() => child.emit('close', 19, null))
    return child
  })
})
afterEach(() => {
  process.exitCode = originalExitCode
})

it.each(['security', 'latest', 'experimental-future'] as const)(
  'runs an explicitly requested %s upgrade',
  async (policy) => {
    const originalNextVersion = process.env.__NEXT_VERSION
    const originalExpectedVersion =
      process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
    process.env.__NEXT_AGENT_UPGRADE = policy
    process.env.__NEXT_VERSION = '16.4.0-preview-test'
    process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION = '16.4.0-preview-test'
    processEnv([], process.cwd())
    updateInitialEnv({
      __NEXT_AGENT_UPGRADE: policy,
      __NEXT_VERSION: '16.4.0-preview-test',
    })
    spawnMock.mockImplementationOnce(() => {
      expect(process.env.__NEXT_AGENT_UPGRADE).toBeUndefined()
      // Future upgrade preparation reloads config and resets the environment.
      resetEnv()
      expect(process.env.__NEXT_AGENT_UPGRADE).toBeUndefined()
      expect(process.env.__NEXT_VERSION).toBe('16.4.0-preview-test')
      const child = new ChildProcess()
      child.kill = jest.fn(() => true)
      process.nextTick(() => child.emit('close', 19, null))
      return child
    })
    try {
      await runUpgrade(process.cwd(), policy, null)
      expect(spawnMock).toHaveBeenCalledWith(
        'pnpm',
        [
          '--loglevel=error',
          'dlx',
          '@next/upgrade@16.4.0-preview-test',
          process.cwd(),
          `--agent=${policy}`,
        ],
        {
          cwd: process.cwd(),
          stdio: 'inherit',
          env: expect.objectContaining({
            __NEXT_UPGRADE_NEXT_PATH: expect.any(String),
            __NEXT_AGENT_UPGRADE_RUN_ID: expect.any(String),
            __NEXT_UPGRADE_EXPECTED_CLI_VERSION: '16.4.0-preview-test',
          }),
        }
      )
    } finally {
      if (originalExpectedVersion === undefined) {
        delete process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
      } else {
        process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION =
          originalExpectedVersion
      }
      if (originalNextVersion === undefined) {
        delete process.env.__NEXT_VERSION
      } else {
        process.env.__NEXT_VERSION = originalNextVersion
      }
      updateInitialEnv({ __NEXT_VERSION: originalNextVersion })
    }
  }
)
