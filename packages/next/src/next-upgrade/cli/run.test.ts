import { ChildProcess, spawn } from 'child_process'
import { processEnv, resetEnv, updateInitialEnv } from '@next/env'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import * as Log from '../../build/output/log'
import { findDir } from '../../lib/find-pages-dir'
import { getProjectDir } from '../../lib/get-project-dir'
import { prepareUpgrade } from './agent/prepare'
import { runUpgrade, spawnNextUpgrade } from './run'
import loadConfig from '../../server/config'
import { normalizeConfig } from '../../server/config-shared'
import { PHASE_PRODUCTION_BUILD } from '../../shared/lib/constants'
import { getAgentName } from '../../telemetry/agent-name'
import { Telemetry } from '../../telemetry/storage'

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: jest.fn(),
}))
jest.mock('fs/promises', () => ({
  access: jest.fn(),
  cp: jest.fn(),
  mkdir: jest.fn(),
  mkdtemp: jest.fn(),
  readFile: jest.fn(),
  rm: jest.fn(),
  stat: jest.fn(),
  writeFile: jest.fn(),
}))
jest.mock('../../build/spinner', () => ({
  __esModule: true,
  default: jest.fn(),
}))
jest.mock('../../build/output/log', () => ({
  bootstrap: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}))
jest.mock('next/dist/compiled/cli-select', () => ({
  __esModule: true,
  default: jest.fn(),
}))
jest.mock('next/dist/compiled/cross-spawn', () =>
  Object.assign(jest.fn(), { sync: jest.fn() })
)
jest.mock('../../lib/find-pages-dir', () => ({
  findDir: jest.fn(),
}))
jest.mock('../../lib/get-project-dir', () => ({
  getProjectDir: jest.fn(),
}))
jest.mock('../../lib/helpers/get-npx-command', () => ({
  getNpxCommand: () => 'npx',
}))
jest.mock('../../lib/picocolors', () => ({
  bold: (text: string) => text,
  cyan: (text: string) => text,
  dim: (text: string) => text,
}))
jest.mock('./agent/prepare', () => ({
  ...jest.requireActual('./agent/prepare'),
  prepareUpgrade: jest.fn(),
}))
jest.mock('../../server/config', () => ({
  __esModule: true,
  default: jest.fn(),
}))
jest.mock('../../server/config-shared', () => ({
  normalizeConfig: jest.fn(),
}))
jest.mock('../../telemetry/agent-name', () => ({
  getAgentName: jest.fn(),
}))
jest.mock('../../telemetry/storage', () => ({
  Telemetry: jest.fn(),
}))
const createSpinner = (
  require('../../build/spinner') as typeof import('../../build/spinner')
).default as jest.Mock
const crossSpawn = jest.mocked(
  require('next/dist/compiled/cross-spawn') as typeof import('next/dist/compiled/cross-spawn')
)
const cliVersion: string = require('next/package.json').version

describe('upgrade CLI execution', () => {
  const originalNextVersion = process.env.__NEXT_VERSION
  const originalPath = process.env.PATH
  const originalUseCurrentCli = process.env.__NEXT_UPGRADE_USE_CURRENT_CLI
  const originalExpectedCliVersion =
    process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
  const originalFetch = global.fetch
  const originalExitCode = process.exitCode

  beforeEach(() => {
    jest.resetAllMocks()
    jest.mocked(Telemetry).mockImplementation(
      () =>
        ({
          record: jest.fn(),
          flush: jest.fn().mockResolvedValue([]),
        }) as never
    )
    process.env.__NEXT_VERSION = cliVersion
    process.env.__NEXT_UPGRADE_USE_CURRENT_CLI = '1'
    process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION = cliVersion
    global.fetch = jest.fn()
    process.exitCode = undefined

    jest.mocked(getProjectDir).mockReturnValue('/workspace/app')
    jest.mocked(findDir).mockReturnValue('/workspace/app/app')
    jest.mocked(createSpinner).mockReturnValue({
      stop: jest.fn(),
    } as never)
    jest.mocked(prepareUpgrade).mockResolvedValue({
      status: 'ready',
      installedVersion: '14.1.1',
      targetVersion: '16.3.5',
      references: [
        'https://api.github.com/advisories?affects=next',
        'https://registry.npmjs.org/next',
      ],
      futureDefaults: [],
    })
    jest.mocked(mkdtemp).mockResolvedValue('/tmp/next-upgrade-test')
    jest.mocked(cp).mockResolvedValue(undefined)
    jest.mocked(readFile).mockResolvedValue('Run <codemod-command>')
    jest.mocked(mkdir).mockResolvedValue(undefined)
    jest.mocked(rm).mockResolvedValue(undefined)
    jest.mocked(writeFile).mockResolvedValue(undefined)
    jest.mocked(getAgentName).mockResolvedValue('codex')
    jest.mocked(loadConfig).mockResolvedValue({
      default: { experimental: { agentUpgrade: false } },
    } as never)
    jest
      .mocked(normalizeConfig)
      .mockImplementation(async (_phase, config) => config)
  })

  afterEach(() => {
    if (originalPath === undefined) {
      delete process.env.PATH
    } else {
      process.env.PATH = originalPath
    }

    if (originalUseCurrentCli === undefined) {
      delete process.env.__NEXT_UPGRADE_USE_CURRENT_CLI
    } else {
      process.env.__NEXT_UPGRADE_USE_CURRENT_CLI = originalUseCurrentCli
    }

    if (originalNextVersion === undefined) {
      delete process.env.__NEXT_VERSION
    } else {
      process.env.__NEXT_VERSION = originalNextVersion
    }
    process.exitCode = originalExitCode
    global.fetch = originalFetch
    if (originalExpectedCliVersion === undefined) {
      delete process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
    } else {
      process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION =
        originalExpectedCliVersion
    }
  })

  it('uses the pinned CLI without looking up canary again', async () => {
    jest.mocked(prepareUpgrade).mockResolvedValue({
      status: 'unaffected',
      reason: 'Already current.',
    })

    await spawnNextUpgrade(
      '/workspace/app',
      {
        revision: 'latest',
        verbose: false,
        agent: 'security',
      },
      null
    )

    expect(global.fetch).toHaveBeenCalledTimes(0)
    expect(crossSpawn).toHaveBeenCalledTimes(0)
    expect(prepareUpgrade).toHaveBeenCalledTimes(1)
    expect(process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION).toBeUndefined()
    expect(process.env.__NEXT_UPGRADE_USE_CURRENT_CLI).toBeUndefined()
  })

  it('rejects a worker running a different CLI version', async () => {
    process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION = '0.0.0'

    await spawnNextUpgrade(
      '/workspace/app',
      {
        revision: 'latest',
        verbose: false,
        agent: 'security',
      },
      null
    )

    expect(Log.error).toHaveBeenCalledWith(
      'Could not prepare the upgrade:',
      `Expected Next.js 0.0.0 for the upgrade, but launched ${cliVersion}.`
    )
    expect(process.exitCode).toBe(1)
    expect(global.fetch).toHaveBeenCalledTimes(0)
    expect(prepareUpgrade).toHaveBeenCalledTimes(0)
  })

  it.each([undefined, '1'])(
    'reuses the current canary after checking npm with legacy guard %s',
    async (legacyGuard) => {
      delete process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
      if (legacyGuard === undefined) {
        delete process.env.__NEXT_UPGRADE_USE_CURRENT_CLI
      } else {
        process.env.__NEXT_UPGRADE_USE_CURRENT_CLI = legacyGuard
      }
      jest
        .mocked(global.fetch)
        .mockResolvedValue(
          new Response(JSON.stringify({ version: cliVersion }))
        )
      jest.mocked(prepareUpgrade).mockResolvedValue({
        status: 'unaffected',
        reason: 'Already current.',
      })

      await spawnNextUpgrade(
        '/workspace/app',
        {
          revision: 'latest',
          verbose: false,
          agent: 'security',
        },
        null
      )

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/next/canary',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
          cache: 'no-store',
        })
      )
      expect(crossSpawn).toHaveBeenCalledTimes(0)
      expect(prepareUpgrade).toHaveBeenCalledTimes(1)
    }
  )

  it.each([true, 'security', 'latest', 'experimental-future'])(
    'delegates %s to the exact canary and preserves its failure status',
    async (agent) => {
      delete process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
      const version = '99.0.0-canary.35'
      jest
        .mocked(global.fetch)
        .mockResolvedValue(new Response(JSON.stringify({ version })))
      crossSpawn.mockImplementation(() => {
        const child = new ChildProcess()
        process.nextTick(() => child.emit('close', 42, null))
        return child
      })

      await spawnNextUpgrade(
        '/workspace/app',
        {
          revision: 'latest',
          verbose: true,
          agent,
        },
        null
      )

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(crossSpawn).toHaveBeenCalledTimes(1)
      expect(crossSpawn).toHaveBeenCalledWith(
        'npx',
        [
          `next@${version}`,
          'upgrade',
          '/workspace/app',
          agent === true ? '--agent' : `--agent=${agent}`,
          '--verbose',
        ],
        expect.objectContaining({
          cwd: '/workspace/app',
          stdio: 'inherit',
          env: expect.objectContaining({
            __NEXT_UPGRADE_EXPECTED_CLI_VERSION: version,
            __NEXT_UPGRADE_USE_CURRENT_CLI: '1',
          }),
        })
      )
      expect(process.exitCode).toBe(42)
      expect(prepareUpgrade).toHaveBeenCalledTimes(0)
    }
  )

  it.each([
    ['HTTP error', () => Promise.resolve(new Response('', { status: 503 }))],
    ['network error', () => Promise.reject(new TypeError('fetch failed'))],
    [
      'timeout',
      () => Promise.reject(new DOMException('Timed out', 'TimeoutError')),
    ],
    ['invalid JSON', () => Promise.resolve(new Response('invalid'))],
    ['missing version', () => Promise.resolve(new Response('{}'))],
    [
      'invalid version',
      () => Promise.resolve(new Response('{"version":"canary"}')),
    ],
  ] as const)('stops before upgrading on %s', async (_name, response) => {
    delete process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
    jest.mocked(global.fetch).mockImplementation(response)

    await spawnNextUpgrade(
      '/workspace/app',
      {
        revision: 'latest',
        verbose: false,
        agent: 'security',
      },
      null
    )

    expect(Log.error).toHaveBeenCalledWith(
      'Could not prepare the upgrade:',
      'Could not fetch the latest Next.js canary from npm.'
    )
    expect(process.exitCode).toBe(1)
    expect(crossSpawn).toHaveBeenCalledTimes(0)
    expect(prepareUpgrade).toHaveBeenCalledTimes(0)
  })

  it('defaults a bare agent upgrade to security', async () => {
    await spawnNextUpgrade(
      '/workspace/app',
      {
        revision: 'latest',
        verbose: false,
        agent: true,
      },
      null
    )

    expect(loadConfig).toHaveBeenCalledWith(
      PHASE_PRODUCTION_BUILD,
      '/workspace/app',
      { rawConfig: true }
    )
    expect(prepareUpgrade).toHaveBeenCalledWith('/workspace/app', 'security')
  })

  it.each(['security', 'latest', 'experimental-future'] as const)(
    'uses the configured %s policy for a bare agent upgrade',
    async (policy) => {
      jest.mocked(loadConfig).mockResolvedValue({
        default: { experimental: { agentUpgrade: policy } },
      } as never)

      await spawnNextUpgrade(
        '/workspace/app',
        {
          revision: 'latest',
          verbose: false,
          agent: true,
        },
        null
      )

      expect(prepareUpgrade).toHaveBeenCalledWith('/workspace/app', policy)
      expect(Log.bootstrap).toHaveBeenCalledWith(
        expect.stringContaining(
          `Set \`experimental.agentUpgrade\` to "${policy}"`
        )
      )
    }
  )
  it.each(['security', 'latest', 'experimental-future'] as const)(
    'runs an explicitly requested %s upgrade',
    async (policy) => {
      const directory = '/workspace/app'
      process.env.__NEXT_AGENT_UPGRADE = policy
      process.env.__NEXT_VERSION = cliVersion
      processEnv([], directory)
      updateInitialEnv({
        __NEXT_AGENT_UPGRADE: policy,
        __NEXT_VERSION: cliVersion,
      })
      jest.mocked(prepareUpgrade).mockImplementationOnce(async () => {
        expect(process.env.__NEXT_AGENT_UPGRADE).toBeUndefined()
        // Future upgrade preparation reloads config and resets the environment.
        resetEnv()
        expect(process.env.__NEXT_AGENT_UPGRADE).toBeUndefined()
        expect(process.env.__NEXT_VERSION).toBe(cliVersion)
        return { status: 'unaffected', reason: 'Already current.' }
      })
      await runUpgrade(directory, policy, null)
      expect(prepareUpgrade).toHaveBeenCalledWith(directory, policy)
    }
  )

  it('delegates manual upgrades to codemod and preserves its exit code', async () => {
    const child = new ChildProcess()
    jest.mocked(spawn).mockReturnValue(child)
    await spawnNextUpgrade(
      '/workspace/app',
      { revision: '16.4.0', verbose: true, agent: undefined },
      null
    )
    expect(spawn).toHaveBeenCalledWith(
      'npx',
      ['@next/codemod@canary', 'upgrade', '16.4.0', '--verbose'],
      { stdio: 'inherit', cwd: '/workspace/app' }
    )
    child.emit('close', 19)
    expect(process.exitCode).toBe(19)
  })
})
