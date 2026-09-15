import { access, cp, mkdtemp, rm, stat } from 'fs/promises'
import * as Log from 'next/dist/build/output/log'
import cliSelect from 'next/dist/compiled/cli-select'
import { spawnNextUpgrade } from 'next/dist/cli/next-upgrade'
import { findDir } from 'next/dist/lib/find-pages-dir'
import { getProjectDir } from 'next/dist/lib/get-project-dir'
import { handoffUpgrade } from 'next/dist/lib/upgrade/harness'
import { prepareUpgrade } from 'next/dist/lib/upgrade/prepare-upgrade'
import { getAgentName } from 'next/dist/telemetry/agent-name'

jest.mock('fs/promises', () => ({
  access: jest.fn(),
  cp: jest.fn(),
  mkdtemp: jest.fn(),
  rm: jest.fn(),
  stat: jest.fn(),
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
jest.mock('next/dist/lib/find-pages-dir', () => ({
  findDir: jest.fn(),
}))
jest.mock('next/dist/lib/get-project-dir', () => ({
  getProjectDir: jest.fn(),
}))
jest.mock('next/dist/lib/picocolors', () => ({
  bold: (text: string) => text,
  cyan: (text: string) => text,
  dim: (text: string) => text,
}))
jest.mock('next/dist/lib/upgrade/prepare-upgrade', () => ({
  prepareUpgrade: jest.fn(),
}))
jest.mock('next/dist/telemetry/agent-name', () => ({
  getAgentName: jest.fn(),
}))

const createSpinner = require('next/dist/build/spinner').default as jest.Mock
const restoreDescriptors: Array<() => void> = []

function normalizedBootstrapCalls(): string[][] {
  return jest
    .mocked(Log.bootstrap)
    .mock.calls.map(([message]) => [String(message).replace(/\\+/g, '/')])
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
    })
    jest.mocked(mkdtemp).mockResolvedValue('/tmp/next-upgrade-test')
    jest.mocked(cp).mockResolvedValue(undefined)
    jest.mocked(rm).mockResolvedValue(undefined)
    jest.mocked(getAgentName).mockResolvedValue('codex')
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
      if (String(file).endsWith('/codex')) return
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

    expect(prepareUpgrade).toHaveBeenCalledWith('/workspace/app')
    expect(normalizedBootstrapCalls()).toMatchInlineSnapshot(`
     [
       [
         "Upgrade the app in "/workspace/app" from Next.js 14.1.1 to 16.3.5.

     Read and follow "/tmp/next-upgrade-test/docs/01-app/02-guides/upgrading/agentic-upgrade.md" before making changes.

     References:
     - https://api.github.com/advisories?affects=next
     - https://registry.npmjs.org/next

     Preserve existing permissions.",
       ],
     ]
    `)
  })

  it('defaults a bare AI upgrade to security', async () => {
    await spawnNextUpgrade('/workspace/app', {
      revision: 'latest',
      verbose: false,
      ai: true,
    })

    expect(prepareUpgrade).toHaveBeenCalledWith('/workspace/app')
  })
})
