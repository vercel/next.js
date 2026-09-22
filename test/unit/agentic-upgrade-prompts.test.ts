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
import { handoffUpgrade } from 'next/dist/lib/upgrade/harness'
import { Telemetry } from 'next/dist/telemetry/storage'
import {
  UpgradePreparationError,
  prepareUpgrade,
} from 'next/dist/lib/upgrade/prepare-upgrade'
import loadConfig from 'next/dist/server/config'
import { normalizeConfig } from 'next/dist/server/config-shared'
import { PHASE_PRODUCTION_BUILD } from 'next/dist/shared/lib/constants'
import { getAgentName } from 'next/dist/telemetry/agent-name'

jest.mock('next/dist/telemetry/storage', () => ({
  Telemetry: jest.fn(),
}))
jest.mock('@next/env', () => ({
  loadEnvConfig: jest.fn(),
  updateInitialEnv: jest.fn(),
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
  getNpxCommand: () => 'npx',
}))
jest.mock('next/dist/lib/picocolors', () => ({
  bold: (text: string) => text,
  cyan: (text: string) => text,
  dim: (text: string) => text,
}))
jest.mock('next/dist/lib/upgrade/prepare-upgrade', () => ({
  UpgradePreparationError: jest.requireActual(
    'next/dist/lib/upgrade/prepare-upgrade'
  ).UpgradePreparationError,
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
const cliVersion: string = require('next/package.json').version
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
  const record = jest.fn()
  const flush = jest.fn()
  const originalPath = process.env.PATH
  const originalUseCurrentCli = process.env.__NEXT_UPGRADE_USE_CURRENT_CLI
  const originalExpectedCliVersion =
    process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
  const originalFetch = global.fetch
  const originalExitCode = process.exitCode

  beforeEach(() => {
    jest.resetAllMocks()
    jest
      .mocked(Telemetry)
      .mockImplementation(() => ({ record, flush }) as never)
    delete process.env.__NEXT_UPGRADE_TELEMETRY
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
      distDir: '.next',
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

    if (originalUseCurrentCli === undefined) {
      delete process.env.__NEXT_UPGRADE_USE_CURRENT_CLI
    } else {
      process.env.__NEXT_UPGRADE_USE_CURRENT_CLI = originalUseCurrentCli
    }

    process.exitCode = originalExitCode
    global.fetch = originalFetch
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

  it('uses the pinned CLI without looking up canary again', async () => {
    jest.mocked(prepareUpgrade).mockResolvedValue({
      status: 'unaffected',
      installedVersion: '16.3.5',
      reason: 'Already current.',
    })

    await spawnNextUpgrade('/workspace/app', {
      revision: 'latest',
      verbose: false,
      ai: 'security',
    })

    expect(global.fetch).toHaveBeenCalledTimes(0)
    expect(crossSpawn).toHaveBeenCalledTimes(0)
    expect(prepareUpgrade).toHaveBeenCalledTimes(1)
    expect(process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION).toBeUndefined()
    expect(process.env.__NEXT_UPGRADE_USE_CURRENT_CLI).toBeUndefined()
  })

  it('rejects a worker running a different CLI version', async () => {
    process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION = '0.0.0'

    await spawnNextUpgrade('/workspace/app', {
      revision: 'latest',
      verbose: false,
      ai: 'security',
    })

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
        installedVersion: '16.3.5',
        reason: 'Already current.',
      })

      await spawnNextUpgrade('/workspace/app', {
        revision: 'latest',
        verbose: false,
        ai: 'security',
      })

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

  it.each([true, 'security', 'latest', 'future'])(
    'delegates %s to the exact canary and preserves its failure status',
    async (ai) => {
      delete process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
      const version = '99.0.0-canary.35'
      jest
        .mocked(global.fetch)
        .mockResolvedValue(new Response(JSON.stringify({ version })))
      crossSpawn.mockImplementation(() => {
        const child = new EventEmitter()
        process.nextTick(() => child.emit('close', 42, null))
        return child
      })

      await spawnNextUpgrade('/workspace/app', {
        revision: 'latest',
        verbose: true,
        ai,
      })

      expect(global.fetch).toHaveBeenCalledTimes(1)
      expect(crossSpawn).toHaveBeenCalledTimes(1)
      expect(crossSpawn).toHaveBeenCalledWith(
        'npx',
        [
          `next@${version}`,
          'upgrade',
          '/workspace/app',
          ai === true ? '--ai' : `--ai=${ai}`,
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

    await spawnNextUpgrade('/workspace/app', {
      revision: 'latest',
      verbose: false,
      ai: 'security',
    })

    expect(Log.error).toHaveBeenCalledWith(
      'Could not prepare the upgrade:',
      'Could not fetch the latest Next.js canary from npm.'
    )
    expect(process.exitCode).toBe(1)
    expect(crossSpawn).toHaveBeenCalledTimes(0)
    expect(prepareUpgrade).toHaveBeenCalledTimes(0)
  })

  it('uses the planned multiple-agent question and choices', async () => {
    delete process.env.__NEXT_UPGRADE_USE_CURRENT_CLI
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
    delete process.env.__NEXT_UPGRADE_USE_CURRENT_CLI
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

     Set \`experimental.agenticAutoUpgrade\` to "security" in the app's Next.js config as part of this upgrade. Preserve unrelated configuration. If the target Next.js version does not support this option, skip the setting and report why.

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

  it.each(['security', 'latest', 'future'] as const)(
    'uses the configured %s policy for a bare AI upgrade',
    async (policy) => {
      jest.mocked(loadConfig).mockResolvedValue({
        distDir: '.next',
        default: { experimental: { agenticAutoUpgrade: policy } },
      } as never)

      await spawnNextUpgrade('/workspace/app', {
        revision: 'latest',
        verbose: false,
        ai: true,
      })

      expect(prepareUpgrade).toHaveBeenCalledWith('/workspace/app', policy)
      expect(Log.bootstrap).toHaveBeenCalledWith(
        expect.stringContaining(
          `Set \`experimental.agenticAutoUpgrade\` to "${policy}"`
        )
      )
    }
  )

  it.each([true, 'latest'] as const)(
    'uses the configured telemetry directory for --ai=%s',
    async (ai) => {
      jest.mocked(loadConfig).mockResolvedValue({
        distDir: '.custom',
        default: {
          distDir: '.raw',
          experimental: { agenticAutoUpgrade: 'security' },
        },
      } as never)
      await spawnNextUpgrade('/workspace/app', {
        revision: 'latest',
        verbose: false,
        ai,
      })
      expect(loadConfig).toHaveBeenCalledTimes(ai === true ? 2 : 1)
      expect(normalizeConfig).toHaveBeenCalledTimes(ai === true ? 1 : 0)
      expect(loadConfig).toHaveBeenLastCalledWith(
        PHASE_PRODUCTION_BUILD,
        '/workspace/app',
        { silent: true }
      )
      expect(Telemetry).toHaveBeenCalledWith(
        { distDir: expect.stringMatching(/[/\\]app[/\\]\.custom$/) },
        '/workspace/app'
      )
      expect(prepareUpgrade).toHaveBeenCalledWith(
        '/workspace/app',
        ai === true ? 'security' : 'latest'
      )
    }
  )

  it('preserves explicit upgrades when reading telemetry configuration fails', async () => {
    jest.mocked(loadConfig).mockRejectedValue(new Error('Cannot load config'))
    await spawnNextUpgrade('/workspace/app', {
      revision: 'latest',
      verbose: false,
      ai: 'latest',
    })
    expect(Telemetry).toHaveBeenCalledTimes(0)
    expect(prepareUpgrade).toHaveBeenCalledWith('/workspace/app', 'latest')
    expect(process.exitCode).toBeUndefined()
  })

  it('preserves bare upgrades when resolved telemetry config rejects legacy options', async () => {
    jest
      .mocked(loadConfig)
      .mockImplementation(async (_phase, _dir, options) => {
        if (options?.rawConfig) {
          return {
            target: 'serverless',
            experimental: { agenticAutoUpgrade: 'latest' },
          } as never
        }
        throw new Error('The target property is no longer supported')
      })
    await spawnNextUpgrade('/workspace/app', {
      revision: 'latest',
      verbose: false,
      ai: true,
    })
    expect(Telemetry).toHaveBeenCalledTimes(0)
    expect(prepareUpgrade).toHaveBeenCalledWith('/workspace/app', 'latest')
    expect(process.exitCode).toBeUndefined()
  })

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

    expect(loadConfig).toHaveBeenCalledWith(
      PHASE_PRODUCTION_BUILD,
      '/workspace/app',
      { silent: true }
    )
    expect(prepareUpgrade).toHaveBeenCalledWith('/workspace/app', 'latest')
    expect(normalizedBootstrapCalls()).toMatchInlineSnapshot(`
     [
       [
         "Read and follow every applicable instruction in "/tmp/next-upgrade-test/docs/01-app/02-guides/upgrading/agentic-upgrade.md" before proceeding.

     We're upgrading the app in "/workspace/app" from Next.js 16.2.12 to 16.3.5 because a newer stable Next.js release is available.

     Set \`experimental.agenticAutoUpgrade\` to "latest" in the app's Next.js config as part of this upgrade. Preserve unrelated configuration. If the target Next.js version does not support this option, skip the setting and report why.

     References:
     - https://registry.npmjs.org/next/latest",
       ],
     ]
    `)
  })

  it.each(['latest', 'future'] as const)(
    'hands off the exact canary target for %s upgrades',
    async (policy) => {
      jest.mocked(prepareUpgrade).mockResolvedValue({
        status: 'ready',
        installedVersion: '17.2.0-canary.4',
        targetVersion: '17.2.0-canary.9',
        references: ['https://registry.npmjs.org/next/canary'],
        futureDefaults: [],
      })

      await spawnNextUpgrade('/workspace/app', {
        revision: 'latest',
        verbose: false,
        ai: policy,
      })

      expect(prepareUpgrade).toHaveBeenCalledWith('/workspace/app', policy)
      const prompt = normalizedBootstrapCalls().flat().join('\n')
      expect(prompt).toContain(
        'from Next.js 17.2.0-canary.4 to 17.2.0-canary.9'
      )
      expect(prompt).toContain(
        policy === 'latest'
          ? 'newer canary Next.js release'
          : 'latest canary release'
      )
      expect(prompt).toContain('https://registry.npmjs.org/next/canary')
      expect(String(jest.mocked(writeFile).mock.calls[0][1])).toContain(
        'upgrade 17.2.0-canary.9 --yes --skip-adoption'
      )
    }
  )

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

     Set \`experimental.agenticAutoUpgrade\` to "future" in the app's Next.js config as part of this upgrade. Preserve unrelated configuration. If the target Next.js version does not support this option, skip the setting and report why.

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

     Set \`experimental.agenticAutoUpgrade\` to "future" in the app's Next.js config as part of this upgrade. Preserve unrelated configuration. If the target Next.js version does not support this option, skip the setting and report why.

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
  it.each(['blocked', 'unknown'] as const)(
    'records structured %s preparation failures without error text',
    async (state) => {
      jest
        .mocked(prepareUpgrade)
        .mockRejectedValue(
          new UpgradePreparationError('private diagnostic', state, '16.0.0')
        )
      await spawnNextUpgrade('/workspace/app', {
        ai: 'latest',
        revision: 'latest',
        verbose: false,
      })
      expect(record.mock.calls.map(([event]) => event.eventName)).toEqual([
        'NEXT_UPGRADE_STARTED',
        'NEXT_UPGRADE_PREPARED',
        'NEXT_UPGRADE_FINISHED',
      ])
      expect(record.mock.calls[1][0].payload).toEqual({
        upgradeId: expect.any(String),
        prepareState: state,
        installedVersion: '16.0.0',
        targetVersion: null,
        durationMs: expect.any(Number),
      })
      expect(
        JSON.stringify(record.mock.calls).includes('private diagnostic')
      ).toBe(false)
      expect(record.mock.calls[2][0].payload.outcome).toBe('failure')
    }
  )

  it('records an unaffected attempt without handoff or failure', async () => {
    jest.mocked(prepareUpgrade).mockResolvedValue({
      status: 'unaffected',
      installedVersion: '16.0.0',
      reason: 'Already current.',
    })
    await spawnNextUpgrade('/workspace/app', {
      ai: 'latest',
      revision: 'latest',
      verbose: false,
    })
    expect(record.mock.calls.map(([event]) => event.eventName)).toEqual([
      'NEXT_UPGRADE_STARTED',
      'NEXT_UPGRADE_PREPARED',
    ])
    expect(record.mock.calls[1][0].payload.prepareState).toBe('unaffected')
  })

  it('records a guide preparation failure without claiming ready', async () => {
    jest.mocked(cp).mockRejectedValue(new Error('private file path'))
    await spawnNextUpgrade('/workspace/app', {
      ai: 'latest',
      revision: 'latest',
      verbose: false,
    })
    expect(record.mock.calls.map(([event]) => event.eventName)).toEqual([
      'NEXT_UPGRADE_STARTED',
      'NEXT_UPGRADE_PREPARED',
      'NEXT_UPGRADE_FINISHED',
    ])
    expect(record.mock.calls[1][0].payload).toMatchObject({
      prepareState: 'unknown',
      installedVersion: '14.1.1',
      targetVersion: '16.3.5',
    })
  })

  it('keeps one attempt across a delegated CLI and consumes context before handoff', async () => {
    delete process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
    jest
      .mocked(global.fetch)
      .mockResolvedValue(
        new Response(JSON.stringify({ version: '99.0.0-canary.1' }))
      )
    crossSpawn.mockImplementation(() => {
      const child = new EventEmitter()
      process.nextTick(() => child.emit('close', 0, null))
      return child
    })
    await spawnNextUpgrade(
      '/workspace/app',
      { ai: 'latest', revision: 'latest', verbose: false },
      'dev:21d268bc-e130-4415-860c-dc46532e614b'
    )
    const context = crossSpawn.mock.calls[0][2].env.__NEXT_UPGRADE_TELEMETRY
    expect(record.mock.calls.map(([event]) => event.eventName)).toEqual([
      'NEXT_UPGRADE_STARTED',
    ])
    process.env.__NEXT_UPGRADE_TELEMETRY = context
    process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION = cliVersion
    await spawnNextUpgrade('/workspace/app', {
      ai: 'latest',
      revision: 'latest',
      verbose: false,
    })
    expect(process.env.__NEXT_UPGRADE_TELEMETRY).toBeUndefined()
    expect(record.mock.calls.map(([event]) => event.eventName)).toEqual([
      'NEXT_UPGRADE_STARTED',
      'NEXT_UPGRADE_PREPARED',
      'NEXT_UPGRADE_HANDOFF',
    ])
    expect(
      new Set(record.mock.calls.map(([event]) => event.payload.upgradeId)).size
    ).toBe(1)
    expect(record.mock.calls[0][0].payload).toMatchObject({
      trigger: 'dev',
      reminderId: '21d268bc-e130-4415-860c-dc46532e614b',
    })
  })

  describe('handoff telemetry boundaries', () => {
    beforeEach(() => {
      process.env.PATH = '/agents'
      overrideTTY(process.stdin)
      overrideTTY(process.stdout)
      jest.mocked(getAgentName).mockResolvedValue(null)
      jest.mocked(access).mockResolvedValue(undefined)
      jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
    })

    it.each(['codex', 'claude'])(
      'reports %s spawn before close and never infers success from exit zero',
      async (name) => {
        jest.mocked(cliSelect).mockResolvedValue({ id: name } as never)
        const child = new EventEmitter()
        crossSpawn.mockImplementation(() => {
          process.nextTick(() => child.emit('spawn'))
          return child
        })
        let spawned: () => void
        const reported = new Promise<void>((resolve) => {
          spawned = resolve
        })
        const onHandoff = jest.fn(async () => {
          spawned()
        })
        const completion = handoffUpgrade('prompt', '/workspace/app', onHandoff)
        await reported
        expect(onHandoff).toHaveBeenCalledWith(name)
        expect(process.exitCode).toBeUndefined()
        child.emit('close', 0, null)
        await completion
        expect(onHandoff.mock.calls).toEqual([[name]])
        expect(process.exitCode).toBe(0)
      }
    )

    it('reports a failed handoff if agent selection fails after preparation', async () => {
      jest
        .mocked(cliSelect)
        .mockRejectedValue(new Error('terminal unavailable'))
      await spawnNextUpgrade('/workspace/app', {
        ai: 'latest',
        revision: 'latest',
        verbose: false,
      })
      expect(record.mock.calls.map(([event]) => event.eventName)).toEqual([
        'NEXT_UPGRADE_STARTED',
        'NEXT_UPGRADE_PREPARED',
        'NEXT_UPGRADE_HANDOFF',
        'NEXT_UPGRADE_FINISHED',
      ])
      expect(record.mock.calls[2][0].payload.handoffState).toBe('failed')
    })

    it('reports failure when the harness cannot spawn', async () => {
      jest.mocked(cliSelect).mockResolvedValue({ id: 'codex' } as never)
      crossSpawn.mockImplementation(() => {
        const child = new EventEmitter()
        process.nextTick(() => child.emit('error', new Error('ENOENT')))
        return child
      })
      const onHandoff = jest.fn(async () => {})
      await handoffUpgrade('prompt', '/workspace/app', onHandoff)
      expect(onHandoff.mock.calls).toEqual([['failed']])
      expect(process.exitCode).toBe(1)
    })

    it('reports cancellation separately from failure', async () => {
      jest.mocked(cliSelect).mockResolvedValue({ id: 'cancel' } as never)
      const onHandoff = jest.fn(async () => {})
      await handoffUpgrade('prompt', '/workspace/app', onHandoff)
      expect(onHandoff.mock.calls).toEqual([['cancelled']])
      expect(crossSpawn).toHaveBeenCalledTimes(0)
    })

    it.each([
      ['copied', 0],
      ['printed', 1],
    ] as const)(
      'reports %s based on the clipboard result',
      async (expected, status) => {
        jest.mocked(cliSelect).mockResolvedValue({ id: 'copy' } as never)
        Object.assign(crossSpawn, { sync: jest.fn(() => ({ status })) })
        const onHandoff = jest.fn(async () => {})
        await handoffUpgrade('prompt', '/workspace/app', onHandoff)
        expect(onHandoff.mock.calls).toEqual([[expected]])
      }
    )
  })
})
