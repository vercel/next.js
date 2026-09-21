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
  getNpxCommand: () => 'npx',
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
  const originalUseCurrentCli = process.env.__NEXT_UPGRADE_USE_CURRENT_CLI
  const originalExitCode = process.exitCode

  beforeEach(() => {
    jest.resetAllMocks()
    process.env.__NEXT_UPGRADE_USE_CURRENT_CLI = '1'
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
    while (restoreDescriptors.length > 0) {
      restoreDescriptors.pop()?.()
    }
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

     Set \`experimental.agenticAutoUpgrade\` to "latest" in the app's Next.js config as part of this upgrade. Preserve unrelated configuration. If the target Next.js version does not support this option, skip the setting and report why.

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
})
