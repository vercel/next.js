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
  const originalUpgradeLocal = process.env.__NEXT_UPGRADE_LOCAL
  const originalExitCode = process.exitCode

  beforeEach(() => {
    jest.resetAllMocks()
    process.env.__NEXT_UPGRADE_LOCAL = '1'
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
      checkedAt: '2026-09-14T13:41:58.013Z',
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

    if (originalUpgradeLocal === undefined) {
      delete process.env.__NEXT_UPGRADE_LOCAL
    } else {
      process.env.__NEXT_UPGRADE_LOCAL = originalUpgradeLocal
    }

    process.exitCode = originalExitCode
    while (restoreDescriptors.length > 0) {
      restoreDescriptors.pop()?.()
    }
  })

  it('separates the interactive question from progress output', async () => {
    delete process.env.__NEXT_UPGRADE_LOCAL
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
             "Copy upgrade prompt",
           ],
           [
             "cancel",
             "Cancel",
           ],
         ],
       },
       "progress": [
         [
           "Looking for installed coding agents…",
         ],
       ],
       "prompt": [
         [
           "",
         ],
         [
           "  How would you like to continue?",
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

  it('passes the complete migration prompt to an existing agent', async () => {
    await spawnNextUpgrade('/workspace/app', {
      revision: undefined,
      verbose: false,
      ai: 'security',
      experimentalAgenticDryRun: false,
    })

    expect(normalizedBootstrapCalls()).toMatchInlineSnapshot(`
     [
       [
         "Upgrade "/workspace/app" from Next.js 14.1.1 to 16.3.5.
     Upgrade type: security.
     References: ["https://api.github.com/advisories?affects=next","https://registry.npmjs.org/next"]
     Read and follow "/tmp/next-upgrade-test/docs/01-app/02-guides/upgrading/agentic-upgrade.md" before making changes.
     Preserve existing permissions.",
       ],
     ]
    `)
  })

  it('defaults a bare AI upgrade to security without loading app policy', async () => {
    await spawnNextUpgrade('/workspace/app', {
      revision: undefined,
      verbose: false,
      ai: true,
      experimentalAgenticDryRun: false,
    })

    expect(prepareUpgrade).toHaveBeenCalledWith('/workspace/app', 'security')
  })

  it('adds the local-only boundary to the dry-run prompt', async () => {
    await spawnNextUpgrade('/workspace/app', {
      revision: undefined,
      verbose: false,
      ai: 'security',
      experimentalAgenticDryRun: true,
    })

    expect(normalizedBootstrapCalls()).toMatchInlineSnapshot(`
     [
       [
         "Upgrade "/workspace/app" from Next.js 14.1.1 to 16.3.5.
     Upgrade type: security.
     References: ["https://api.github.com/advisories?affects=next","https://registry.npmjs.org/next"]
     Read and follow "/tmp/next-upgrade-test/docs/01-app/02-guides/upgrading/agentic-upgrade.md" before making changes.
     Preserve existing permissions.
     This is a --experimental-agentic-dry-run: complete the migration and verification, create local commits, then stop. Do not push or create a PR/MR.",
       ],
     ]
    `)
  })
})
