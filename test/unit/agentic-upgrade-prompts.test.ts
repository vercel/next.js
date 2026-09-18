import { EventEmitter } from 'events'
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'fs/promises'
import * as Log from 'next/dist/build/output/log'
import cliSelect from 'next/dist/compiled/cli-select'
import { spawnNextUpgrade } from 'next/dist/cli/next-upgrade'
import { findDir } from 'next/dist/lib/find-pages-dir'
import { getProjectDir } from 'next/dist/lib/get-project-dir'
import { getNpxCommand } from 'next/dist/lib/helpers/get-npx-command'
import { getPkgManager } from 'next/dist/lib/helpers/get-pkg-manager'
import { handoffUpgrade } from 'next/dist/lib/upgrade/harness'
import { prepareUpgrade } from 'next/dist/lib/upgrade/prepare-upgrade'
import loadConfig from 'next/dist/server/config'
import { normalizeConfig } from 'next/dist/server/config-shared'
import { PHASE_PRODUCTION_BUILD } from 'next/dist/shared/lib/constants'
import { getAgentName } from 'next/dist/telemetry/agent-name'

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
jest.mock('next/dist/build/spinner', () => ({
  __esModule: true,
  default: jest.fn(),
}))
jest.mock('next/dist/build/output/log', () => ({
  bootstrap: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}))
jest.mock('next/dist/compiled/cli-select', () => ({
  __esModule: true,
  default: jest.fn(),
}))
jest.mock('next/dist/compiled/cross-spawn', () => jest.fn())
jest.mock('next/dist/lib/find-pages-dir', () => ({
  findDir: jest.fn(),
}))
jest.mock('next/dist/lib/get-project-dir', () => ({
  getProjectDir: jest.fn(),
}))
jest.mock('next/dist/lib/helpers/get-npx-command', () => ({
  getNpxCommand: jest.fn(),
}))
jest.mock('next/dist/lib/helpers/get-pkg-manager', () => ({
  getPkgManager: jest.fn(),
}))
jest.mock('next/dist/lib/picocolors', () => ({
  bold: (text: string) => text,
  cyan: (text: string) => text,
  dim: (text: string) => text,
}))
jest.mock('next/dist/lib/upgrade/prepare-upgrade', () => ({
  prepareUpgrade: jest.fn(),
}))
jest.mock('next/dist/server/config', () => ({
  __esModule: true,
  default: jest.fn(),
}))
jest.mock('next/dist/server/config-shared', () => ({
  normalizeConfig: jest.fn(),
}))
jest.mock('next/dist/telemetry/agent-name', () => ({
  getAgentName: jest.fn(),
}))

const createSpinner = require('next/dist/build/spinner').default as jest.Mock
const crossSpawn = require('next/dist/compiled/cross-spawn') as jest.Mock
const restoreDescriptors: Array<() => void> = []

function normalizedBootstrapCalls(): string[][] {
  return jest
    .mocked(Log.bootstrap)
    .mock.calls.map(([message]) => [String(message).replace(/\\+/g, '/')])
}

function normalizedFileWriteCalls() {
  return jest
    .mocked(writeFile)
    .mock.calls.map(([path, ...args]) => [
      String(path).replace(/\\+/g, '/'),
      ...args,
    ])
}

function normalizedWriteFileCalls() {
  return normalizedFileWriteCalls().filter(([path]) =>
    String(path).includes('/skills/')
  )
}

function overrideTTY(target: NodeJS.ReadStream | NodeJS.WriteStream): void {
  const descriptor = Object.getOwnPropertyDescriptor(target, 'isTTY')
  restoreDescriptors.push(() => {
    if (descriptor) {
      Object.defineProperty(target, 'isTTY', descriptor)
    } else {
      delete target.isTTY
    }
  })
  Object.defineProperty(target, 'isTTY', {
    configurable: true,
    value: true,
  })
}

describe('agentic upgrade prompts', () => {
  const originalPath = process.env.PATH
  const originalExpectedCliVersion =
    process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
  const originalUseCurrentCli = process.env.__NEXT_UPGRADE_USE_CURRENT_CLI
  const originalFetch = global.fetch
  const originalExitCode = process.exitCode
  const currentCliVersion = require('../../packages/next/package.json').version

  beforeEach(() => {
    jest.resetAllMocks()
    process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION = currentCliVersion
    delete process.env.__NEXT_UPGRADE_USE_CURRENT_CLI
    global.fetch = jest.fn()
    process.exitCode = undefined

    jest.mocked(getPkgManager).mockReturnValue('npm')
    jest.mocked(getNpxCommand).mockReturnValue('npx')
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
      default: { experimental: { agenticAutoUpgrade: false } },
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

    process.exitCode = originalExitCode
    global.fetch = originalFetch
    if (originalUseCurrentCli === undefined) {
      delete process.env.__NEXT_UPGRADE_USE_CURRENT_CLI
    } else {
      process.env.__NEXT_UPGRADE_USE_CURRENT_CLI = originalUseCurrentCli
    }
    if (originalExpectedCliVersion === undefined) {
      delete process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
    } else {
      process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION =
        originalExpectedCliVersion
    }
    while (restoreDescriptors.length > 0) {
      restoreDescriptors.pop()?.()
    }
  })

  function mockQuery(output: string, code: number | null = 0) {
    crossSpawn.mockImplementationOnce(() => {
      const child = Object.assign(new EventEmitter(), {
        stdout: Object.assign(new EventEmitter(), { setEncoding: jest.fn() }),
        stderr: { resume: jest.fn() },
      })
      queueMicrotask(() => {
        child.stdout.emit('data', output)
        child.emit('close', code)
      })
      return child
    })
  }

  it.each(['npm', 'pnpm'] as const)(
    'revalidates canary with %s from the app directory and reuses the matching CLI',
    async (packageManager) => {
      delete process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
      jest.mocked(getPkgManager).mockReturnValue(packageManager)
      mockQuery(JSON.stringify(currentCliVersion))

      await spawnNextUpgrade('/workspace/app', {
        revision: 'latest',
        verbose: false,
        ai: true,
      })

      expect(getPkgManager).toHaveBeenCalledWith('/workspace/app')
      expect(crossSpawn).toHaveBeenCalledTimes(1)
      expect(crossSpawn).toHaveBeenCalledWith(
        packageManager,
        [
          'view',
          'next',
          'dist-tags.canary',
          '--json',
          '--prefer-online',
          '--prefer-offline=false',
          '--offline=false',
        ],
        {
          cwd: '/workspace/app',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 10_000,
        }
      )
      expect(global.fetch).not.toHaveBeenCalled()
      expect(prepareUpgrade).toHaveBeenCalledWith('/workspace/app', 'security')
    }
  )

  it.each(['1.22.22', '4.9.2'])(
    'resolves canary through Yarn %s configuration',
    async (yarnVersion) => {
      delete process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
      jest.mocked(getPkgManager).mockReturnValue('yarn')
      mockQuery(yarnVersion)
      const classic = yarnVersion.startsWith('1.')
      mockQuery(
        classic
          ? JSON.stringify({ type: 'info', data: 'notice' }) +
              '\n' +
              JSON.stringify({ type: 'inspect', data: currentCliVersion })
          : JSON.stringify({
              name: 'next',
              'dist-tags': { canary: currentCliVersion },
            })
      )

      await spawnNextUpgrade('/workspace/app', {
        revision: 'latest',
        verbose: false,
        ai: true,
      })

      expect(crossSpawn).toHaveBeenNthCalledWith(
        2,
        'yarn',
        classic
          ? ['info', 'next', 'dist-tags.canary', '--json']
          : ['npm', 'info', 'next', '--fields', 'dist-tags', '--json'],
        {
          cwd: '/workspace/app',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 10_000,
        }
      )
      expect(prepareUpgrade).toHaveBeenCalled()
    }
  )

  it.each(['npx --yes', 'pnpm --loglevel=error dlx', 'yarn --quiet dlx'])(
    'delegates to an exact version with %s and preserves its exit code',
    async (runner) => {
      delete process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
      jest.mocked(getNpxCommand).mockReturnValue(runner)
      mockQuery(JSON.stringify('99.0.0-canary.1'))
      crossSpawn.mockImplementationOnce(() => {
        const child = new EventEmitter()
        queueMicrotask(() => child.emit('close', 7))
        return child
      })

      await spawnNextUpgrade('/workspace/app', {
        revision: 'latest',
        verbose: true,
        ai: 'future',
      })

      const [command, ...args] = runner.split(' ')
      expect(crossSpawn).toHaveBeenCalledWith(
        command,
        [
          ...args,
          'next@99.0.0-canary.1',
          'upgrade',
          '/workspace/app',
          '--ai=future',
          '--verbose',
        ],
        expect.objectContaining({
          cwd: '/workspace/app',
          stdio: 'inherit',
          env: expect.objectContaining({
            __NEXT_UPGRADE_EXPECTED_CLI_VERSION: '99.0.0-canary.1',
            __NEXT_UPGRADE_USE_CURRENT_CLI: '1',
          }),
        })
      )
      expect(prepareUpgrade).not.toHaveBeenCalled()
      expect(process.exitCode).toBe(7)
    }
  )

  it('consumes both handoff flags without another lookup or launch', async () => {
    process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION = currentCliVersion
    process.env.__NEXT_UPGRADE_USE_CURRENT_CLI = '1'

    await spawnNextUpgrade('/workspace/app', {
      revision: 'latest',
      verbose: false,
      ai: true,
    })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(crossSpawn).not.toHaveBeenCalled()
    expect(prepareUpgrade).toHaveBeenCalled()
    expect(process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION).toBeUndefined()
    expect(process.env.__NEXT_UPGRADE_USE_CURRENT_CLI).toBeUndefined()
  })

  it('rejects a delegated CLI version mismatch', async () => {
    process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION = '99.0.0-canary.1'
    process.env.__NEXT_UPGRADE_USE_CURRENT_CLI = '1'

    await spawnNextUpgrade('/workspace/app', {
      revision: 'latest',
      verbose: false,
      ai: true,
    })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(crossSpawn).not.toHaveBeenCalled()
    expect(prepareUpgrade).not.toHaveBeenCalled()
    expect(Log.error).toHaveBeenCalledWith(
      'Could not prepare the upgrade:',
      `Expected Next.js 99.0.0-canary.1 for the upgrade, but launched ${currentCliVersion}.`
    )
    expect(process.exitCode).toBe(1)
  })

  it.each([
    'command error',
    'timeout',
    'nonzero exit',
    'invalid JSON',
    'invalid version',
    'missing tag',
  ])('stops when the canary lookup fails: %s', async (failure) => {
    delete process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
    if (failure === 'command error') {
      crossSpawn.mockImplementationOnce(() => {
        const child = new EventEmitter()
        queueMicrotask(() => child.emit('error', new Error('ENOENT')))
        return child
      })
    } else {
      mockQuery(
        failure === 'invalid JSON'
          ? 'not JSON'
          : JSON.stringify(failure === 'missing tag' ? null : '--invalid'),
        failure === 'timeout' ? null : failure === 'nonzero exit' ? 1 : 0
      )
    }

    await spawnNextUpgrade('/workspace/app', {
      revision: 'latest',
      verbose: false,
      ai: true,
    })

    expect(crossSpawn).toHaveBeenCalledTimes(1)
    expect(prepareUpgrade).not.toHaveBeenCalled()
    expect(Log.error).toHaveBeenCalledWith(
      'Could not prepare the upgrade:',
      'Could not determine the current Next.js canary version. Please try again.'
    )
    expect(process.exitCode).toBe(1)
  })

  it('uses the planned multiple-agent question and choices', async () => {
    delete process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
    process.env.PATH = '/agents'
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    jest.mocked(getAgentName).mockResolvedValue(null)
    jest.mocked(access).mockResolvedValue(undefined)
    jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
    jest.mocked(cliSelect).mockResolvedValue({ id: 'cancel' } as never)

    await handoffUpgrade('Prepared upgrade prompt.', '/workspace/app')

    const selectOptions = jest.mocked(cliSelect).mock.calls[0][0]
    expect({
      progress: jest.mocked(Log.info).mock.calls,
      prompt: jest.mocked(Log.bootstrap).mock.calls,
      menu: {
        values: Object.entries(selectOptions.values),
        defaultValue: selectOptions.defaultValue,
        selected: selectOptions.selected,
        unselected: selectOptions.unselected,
        indentation: selectOptions.indentation,
      },
    }).toMatchInlineSnapshot(`
     {
       "menu": {
         "defaultValue": 0,
         "indentation": 2,
         "selected": "❯",
         "unselected": " ",
         "values": [
           [
             "codex",
             "Continue with Codex",
           ],
           [
             "claude",
             "Continue with Claude Code",
           ],
           [
             "copy",
             "Copy prompt for another coding agent",
           ],
           [
             "cancel",
             "Cancel",
           ],
         ],
       },
       "progress": [
         [
           "Looking for coding agents...",
         ],
       ],
       "prompt": [
         [
           "",
         ],
         [
           "  Multiple coding agents detected. Which one would you like to use?",
         ],
         [
           "  Use ↑/↓ to choose, then press Enter.
     ",
         ],
         [
           "  Upgrade cancelled.
     ",
         ],
       ],
     }
    `)
  })

  it('uses the planned single-agent question', async () => {
    delete process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
    process.env.PATH = '/agents'
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    jest.mocked(getAgentName).mockResolvedValue(null)
    jest.mocked(access).mockImplementation(async (file) => {
      if (/[/\\]codex(?:\.(?:exe|cmd|bat|com))?$/i.test(String(file))) return
      throw new Error('not found')
    })
    jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
    jest.mocked(cliSelect).mockResolvedValue({ id: 'cancel' } as never)

    await handoffUpgrade('Prepared upgrade prompt.', '/workspace/app')

    expect(Log.bootstrap).toHaveBeenCalledWith(
      '  Codex detected. Would you like to proceed?'
    )
  })

  it('passes the complete migration prompt to an existing agent', async () => {
    await spawnNextUpgrade('/workspace/app', {
      revision: 'latest',
      verbose: false,
      ai: 'security',
    })

    expect(prepareUpgrade).toHaveBeenCalledWith('/workspace/app', 'security')
    const [guidePath, guide] = jest.mocked(writeFile).mock.calls[0]
    expect(String(guidePath).replace(/\\+/g, '/')).toBe(
      '/tmp/next-upgrade-test/docs/01-app/02-guides/upgrading/agentic-upgrade.md'
    )
    expect(String(guide)).toMatch(
      /^Run npx @next\/codemod@\S+ upgrade 16\.3\.5 --yes --skip-adoption$/
    )
    expect(normalizedBootstrapCalls()).toMatchInlineSnapshot(`
     [
       [
         "Read and follow every applicable instruction in "/tmp/next-upgrade-test/docs/01-app/02-guides/upgrading/agentic-upgrade.md" before proceeding.

     We're upgrading the app in "/workspace/app" from Next.js 14.1.1 to 16.3.5 because the installed version is affected by a published security advisory.

     References:
     - https://api.github.com/advisories?affects=next
     - https://registry.npmjs.org/next",
       ],
     ]
    `)
  })

  it('renders verbose codemod instructions in the guide', async () => {
    await spawnNextUpgrade('/workspace/app', {
      revision: 'latest',
      verbose: true,
      ai: 'security',
    })

    const [guidePath, guide] = jest.mocked(writeFile).mock.calls[0]
    expect(String(guidePath).replace(/\\+/g, '/')).toBe(
      '/tmp/next-upgrade-test/docs/01-app/02-guides/upgrading/agentic-upgrade.md'
    )
    expect(String(guide)).toMatch(/--skip-adoption --verbose$/)
  })

  it('defaults a bare AI upgrade to security', async () => {
    await spawnNextUpgrade('/workspace/app', {
      revision: 'latest',
      verbose: false,
      ai: true,
    })

    expect(loadConfig).toHaveBeenCalledWith(
      PHASE_PRODUCTION_BUILD,
      '/workspace/app',
      { rawConfig: true }
    )
    expect(prepareUpgrade).toHaveBeenCalledWith('/workspace/app', 'security')
  })

  it.each(['latest', 'future'] as const)(
    'uses the configured %s policy for a bare AI upgrade',
    async (policy) => {
      jest.mocked(loadConfig).mockResolvedValue({
        default: { experimental: { agenticAutoUpgrade: policy } },
      } as never)

      await spawnNextUpgrade('/workspace/app', {
        revision: 'latest',
        verbose: false,
        ai: true,
      })

      expect(prepareUpgrade).toHaveBeenCalledWith('/workspace/app', policy)
    }
  )

  it('passes the latest target to the existing agent', async () => {
    jest.mocked(prepareUpgrade).mockResolvedValue({
      status: 'ready',
      installedVersion: '16.2.12',
      targetVersion: '16.3.5',
      references: ['https://registry.npmjs.org/next/latest'],
      futureDefaults: [],
    })

    await spawnNextUpgrade('/workspace/app', {
      revision: 'latest',
      verbose: false,
      ai: 'latest',
    })

    expect(loadConfig).not.toHaveBeenCalled()
    expect(prepareUpgrade).toHaveBeenCalledWith('/workspace/app', 'latest')
    expect(normalizedBootstrapCalls()).toMatchInlineSnapshot(`
     [
       [
         "Read and follow every applicable instruction in "/tmp/next-upgrade-test/docs/01-app/02-guides/upgrading/agentic-upgrade.md" before proceeding.

     We're upgrading the app in "/workspace/app" from Next.js 16.2.12 to 16.3.5 because a newer stable Next.js release is available.

     References:
     - https://registry.npmjs.org/next/latest",
       ],
     ]
    `)
  })

  it('adds temporary Future Default instructions to the migration prompt', async () => {
    jest.mocked(prepareUpgrade).mockResolvedValue({
      status: 'ready',
      installedVersion: '16.2.0',
      targetVersion: '16.4.0',
      references: ['https://registry.npmjs.org/next/latest'],
      futureDefaults: [
        {
          name: 'Cache Components',
          availableSince: '16.3.0',
          isAdopted: jest.fn(() => false),
          adoptionDoc: [
            'docs/01-app/02-guides/migrating-to-cache-components.md',
            'skills/next-cache-components-adoption/SKILL.md',
          ],
          optimizationDoc: ['skills/next-cache-components-optimizer/SKILL.md'],
        },
      ],
    })

    crossSpawn.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter & { setEncoding: jest.Mock }
        stderr: EventEmitter & { setEncoding: jest.Mock }
      }
      child.stdout = Object.assign(new EventEmitter(), {
        setEncoding: jest.fn(),
      })
      child.stderr = Object.assign(new EventEmitter(), {
        setEncoding: jest.fn(),
      })
      process.nextTick(() => {
        child.stdout.emit('data', 'Adopt Cache Components safely.\n')
        child.emit('close', 0)
      })
      return child
    })

    await spawnNextUpgrade('/workspace/app', {
      revision: 'latest',
      verbose: false,
      ai: 'future',
    })

    expect(crossSpawn).toHaveBeenCalledTimes(1)
    expect(normalizedFileWriteCalls()).toContainEqual([
      '/tmp/next-upgrade-test/docs/01-app/02-guides/upgrading/agentic-upgrade.md',
      expect.stringMatching(
        /^Run npx @next\/codemod@\S+ upgrade 16\.4\.0 --yes --skip-adoption$/
      ),
    ])

    expect({
      prompt: normalizedBootstrapCalls(),
      savedInstructions: normalizedWriteFileCalls(),
    }).toMatchInlineSnapshot(`
     {
       "prompt": [
         [
           "Read and follow every applicable instruction in "/tmp/next-upgrade-test/docs/01-app/02-guides/upgrading/agentic-upgrade.md" before proceeding.

     We're upgrading the app in "/workspace/app" from Next.js 16.2.0 to 16.4.0 because the Future policy applies the latest stable release and adopts its Future Defaults.

     After completing and verifying the version migration, adopt these Future Defaults in order:
     - Cache Components
       - Read and follow "/tmp/next-upgrade-test/docs/01-app/02-guides/migrating-to-cache-components.md".
       - Read and follow "/tmp/next-upgrade-test/skills/next-cache-components-adoption/PROMPT.md".
     Complete each adoption. Temporary opt-outs and TODO markers are intermediate work only; do not stop until they are removed and the adoption is fully verified.

     References:
     - https://registry.npmjs.org/next/latest",
         ],
       ],
       "savedInstructions": [
         [
           "/tmp/next-upgrade-test/skills/next-cache-components-adoption/PROMPT.md",
           "Adopt Cache Components safely.
     ",
         ],
       ],
     }
    `)
  })

  it('includes the shared preflight without a version migration when current', async () => {
    jest.mocked(prepareUpgrade).mockResolvedValue({
      status: 'ready',
      installedVersion: '16.4.0',
      targetVersion: '16.4.0',
      references: ['https://registry.npmjs.org/next/latest'],
      futureDefaults: [
        {
          name: 'Cache Components',
          availableSince: '16.3.0',
          isAdopted: jest.fn(() => false),
          adoptionDoc: [
            'docs/01-app/02-guides/migrating-to-cache-components.md',
            'skills/next-cache-components-adoption/SKILL.md',
          ],
          optimizationDoc: ['skills/next-cache-components-optimizer/SKILL.md'],
        },
      ],
    })

    crossSpawn.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter & { setEncoding: jest.Mock }
        stderr: EventEmitter & { setEncoding: jest.Mock }
      }
      child.stdout = Object.assign(new EventEmitter(), {
        setEncoding: jest.fn(),
      })
      child.stderr = Object.assign(new EventEmitter(), {
        setEncoding: jest.fn(),
      })
      process.nextTick(() => {
        child.stdout.emit('data', 'Adopt Cache Components safely.\n')
        child.emit('close', 0)
      })
      return child
    })

    await spawnNextUpgrade('/workspace/app', {
      revision: 'latest',
      verbose: false,
      ai: 'future',
    })

    expect(
      jest
        .mocked(cp)
        .mock.calls.map(([source, destination]) =>
          [String(source), String(destination)].map((path) =>
            path.replace(/\\+/g, '/')
          )
        )
    ).toEqual(
      expect.arrayContaining([
        [
          expect.stringContaining('/docs/01-app/02-guides/upgrading'),
          '/tmp/next-upgrade-test/docs/01-app/02-guides/upgrading',
        ],
      ])
    )
    expect(readFile).not.toHaveBeenCalled()
    expect(normalizedFileWriteCalls()).not.toContainEqual([
      '/tmp/next-upgrade-test/docs/01-app/02-guides/upgrading/agentic-upgrade.md',
      expect.anything(),
    ])
    expect(normalizedBootstrapCalls()).toMatchInlineSnapshot(`
     [
       [
         "Read and follow every applicable instruction in "/tmp/next-upgrade-test/docs/01-app/02-guides/upgrading/agentic-upgrade.md" before proceeding.

     We're adopting the Future Defaults available to the app in "/workspace/app", which already uses Next.js 16.4.0.

     Adopt these Future Defaults in order:
     - Cache Components
       - Read and follow "/tmp/next-upgrade-test/docs/01-app/02-guides/migrating-to-cache-components.md".
       - Read and follow "/tmp/next-upgrade-test/skills/next-cache-components-adoption/PROMPT.md".
     Complete each adoption. Temporary opt-outs and TODO markers are intermediate work only; do not stop until they are removed and the adoption is fully verified.

     References:
     - https://registry.npmjs.org/next/latest",
       ],
     ]
    `)
  })
})
