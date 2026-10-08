import { EventEmitter } from 'events'
import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { access, stat } from 'fs/promises'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import * as Log from 'next/dist/build/output/log'
import cliSelect from 'next/dist/compiled/cli-select'
import { spawnNextUpgrade } from 'next/dist/cli/next-upgrade'
import { findDir } from 'next/dist/lib/find-pages-dir'
import { getProjectDir } from 'next/dist/lib/get-project-dir'
import {
  buildCISetupPrompt,
  getAppDirectoryFromGitRoot,
  type CISetupInput,
} from 'next/dist/lib/upgrade/ci-setup'
import { getHarnessModels } from 'next/dist/lib/upgrade/model-discovery'
import loadConfig from 'next/dist/server/config'
import { normalizeConfig } from 'next/dist/server/config-shared'
import { getAgentName } from 'next/dist/telemetry/agent-name'
import { Telemetry } from 'next/dist/telemetry/storage'

jest.mock('fs/promises', () => ({
  ...jest.requireActual('fs/promises'),
  access: jest.fn(),
  stat: jest.fn(),
}))
jest.mock('next/dist/build/spinner', () => ({
  __esModule: true,
  default: jest.fn(() => ({ stop: jest.fn() })),
}))
jest.mock('next/dist/build/output/log', () => ({
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
jest.mock('next/dist/lib/upgrade/model-discovery', () => ({
  getHarnessModels: jest.fn(),
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
jest.mock('next/dist/telemetry/storage', () => ({
  Telemetry: jest.fn(),
}))

const crossSpawn = require('next/dist/compiled/cross-spawn') as jest.Mock & {
  sync: jest.Mock
}
const cliVersion: string = require('next/package.json').version
const restoreDescriptors: Array<() => void> = []

function overrideTTY(target: NodeJS.ReadStream | NodeJS.WriteStream) {
  const descriptor = Object.getOwnPropertyDescriptor(target, 'isTTY')
  restoreDescriptors.push(() => {
    if (descriptor) {
      Object.defineProperty(target, 'isTTY', descriptor)
    } else {
      delete target.isTTY
    }
  })
  Object.defineProperty(target, 'isTTY', { configurable: true, value: true })
}

function select(...ids: Array<string | 'esc' | 'ctrl-c'>) {
  for (const id of ids) {
    if (id === 'esc') {
      jest.mocked(cliSelect).mockRejectedValueOnce(undefined)
    } else if (id === 'ctrl-c') {
      jest.mocked(cliSelect).mockImplementationOnce(() => {
        process.stdin.emit('keypress', '\u0003', { name: 'c', ctrl: true })
        return Promise.reject(undefined)
      })
    } else {
      jest.mocked(cliSelect).mockResolvedValueOnce({ id } as never)
    }
  }
}

function questions(): string[] {
  return jest
    .mocked(Log.bootstrap)
    .mock.calls.map(([value]) => String(value))
    .filter((value) => value.endsWith('?') && value.startsWith('  '))
    .map((value) => value.trim())
}

function detectAgents(...names: string[]) {
  process.env.PATH = '/agents'
  jest.mocked(access).mockImplementation(async (file) => {
    if (names.some((name) => String(file).includes(name))) return
    throw Object.assign(new Error('not found'), { code: 'ENOENT' })
  })
  jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
}

function mockLaunch() {
  crossSpawn.mockImplementation(() => {
    const child = new EventEmitter()
    process.nextTick(() => {
      child.emit('spawn')
      child.emit('close', 0, null)
    })
    return child
  })
}

function expectedHarnessPath(name: string): string {
  const extension =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
          .split(';')
          .filter(Boolean)[0]
      : ''
  return resolve('/agents', `${name}${extension}`)
}

// Windows clipboards receive UTF-16 buffers.
function clipboardInput(): string {
  const input = crossSpawn.sync.mock.calls[0][2].input
  return Buffer.isBuffer(input) ? input.toString('utf16le') : String(input)
}

function baseInput(overrides: Partial<CISetupInput> = {}): CISetupInput {
  return {
    agent: 'claude',
    model: null,
    effort: 'default',
    policy: 'security',
    schedule: 'weekly',
    directory: '.',
    nextVersion: '16.5.0',
    ...overrides,
  }
}

describe('next upgrade --ci setup prompt', () => {
  it('describes the thin workflow for Claude Code with defaults', () => {
    const prompt = buildCISetupPrompt(baseInput())

    expect(prompt).toContain('.github/workflows/next-upgrade.yml')
    expect(prompt).toContain(
      "on:\n  schedule:\n    - cron: '0 9 * * 1'\n  workflow_dispatch:"
    )
    expect(prompt).toContain(
      'permissions:\n  contents: write\n  pull-requests: write\n'
    )
    expect(prompt).toContain(
      'concurrency:\n  group: next-upgrade\n  cancel-in-progress: false'
    )
    expect(prompt).toContain(
      '- uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2'
    )
    expect(prompt).toContain('fetch-depth: 0')
    expect(prompt).toContain('persist-credentials: false')
    expect(prompt).toContain(
      '- uses: vercel/next.js/packages/next-upgrade/action@<commit SHA> # v16.5.0'
    )
    expect(prompt).toContain(
      // eslint-disable-next-line no-template-curly-in-string -- GitHub expression
      '          agent: claude\n          api-key: ${{ secrets.ANTHROPIC_API_KEY }}\n          policy: security\n```'
    )
    expect(prompt).not.toMatch(/^\s+(model|effort|directory):/m)
    expect(prompt).toContain(
      'git ls-remote https://github.com/vercel/next.js refs/tags/v16.5.0'
    )
    expect(prompt).toContain('packages/next-upgrade/action/action.yml')
    expect(prompt).toContain('If the tag or the action is missing, stop')
    expect(prompt).toContain('Never guess another ref.')
    expect(prompt).toContain('pull_request_target')
    expect(prompt).toContain('issue_comment')
    expect(prompt).toContain(
      'Grant only `contents: write` and `pull-requests: write`.'
    )
    expect(prompt).toContain('runs `next upgrade --agent` for this app')
    expect(prompt).toContain(
      'Ask the user before committing, pushing, or opening a pull request.'
    )
    expect(prompt).toContain('Add the `ANTHROPIC_API_KEY` repository secret')
    expect(prompt).toContain(
      'Allow GitHub Actions to create and approve pull requests'
    )
  })

  it('includes Codex secrets and non-default settings', () => {
    const prompt = buildCISetupPrompt(
      baseInput({
        agent: 'codex',
        model: 'gpt-5.6-terra',
        effort: 'high',
        policy: 'experimental-future',
        directory: 'apps/web',
      })
    )

    expect(prompt).toContain(
      // eslint-disable-next-line no-template-curly-in-string -- GitHub expression
      '          agent: codex\n          api-key: ${{ secrets.OPENAI_API_KEY }}\n          policy: experimental-future\n          directory: "apps/web"\n          model: "gpt-5.6-terra"\n          effort: "high"\n```'
    )
    expect(prompt).toContain('Add the `OPENAI_API_KEY` repository secret')
    expect(prompt).toContain('in "apps/web"')
  })

  it('quotes workflow input values', () => {
    const prompt = buildCISetupPrompt(
      baseInput({ directory: 'apps/my app: "web"', model: 'model #1' })
    )

    expect(prompt).toContain('directory: "apps/my app: \\"web\\""')
    expect(prompt).toContain('model: "model #1"')
  })

  it('keeps workflows for different apps separate while preserving the root filename', () => {
    const paths = ['.', 'apps/web', 'apps/admin'].map((directory) => {
      const prompt = buildCISetupPrompt(baseInput({ directory }))
      expect(prompt).toContain('Never overwrite a workflow for another app.')
      return prompt.match(/4\. Write `([^`]+)`/)![1]
    })
    expect(paths[0]).toBe('.github/workflows/next-upgrade.yml')
    expect(new Set(paths).size).toBe(3)
    expect(buildCISetupPrompt(baseInput({ directory: 'apps/web' }))).toContain(
      paths[1]
    )
  })

  it.each(['security', 'latest', 'experimental-future'] as const)(
    'sets policy %s',
    (policy) => {
      expect(buildCISetupPrompt(baseInput({ policy }))).toContain(
        `          policy: ${policy}\n`
      )
    }
  )

  it.each([
    ['weekly', "    - cron: '0 9 * * 1'"],
    ['daily', "    - cron: '0 9 * * *'"],
  ] as const)('schedules %s runs', (schedule, cron) => {
    const prompt = buildCISetupPrompt(baseInput({ schedule }))
    expect(prompt).toContain(cron)
    expect(prompt).toContain('  workflow_dispatch:')
  })

  it('only allows manual dispatch for manual workflows', () => {
    const prompt = buildCISetupPrompt(baseInput({ schedule: 'manual' }))
    expect(prompt).toContain('on:\n  workflow_dispatch:\npermissions:')
    expect(prompt).not.toContain('cron:')
    expect(prompt).toContain('Trigger only on `workflow_dispatch`.')
  })

  it('resolves the app directory relative to the Git root', () => {
    const root = mkdtempSync(join(tmpdir(), 'next-upgrade-ci-'))
    try {
      mkdirSync(join(root, '.git'))
      mkdirSync(join(root, 'apps', 'web'), { recursive: true })
      expect(getAppDirectoryFromGitRoot(join(root, 'apps', 'web'))).toBe(
        'apps/web'
      )
      expect(getAppDirectoryFromGitRoot(root)).toBe('.')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('next upgrade --ci onboarding', () => {
  const originalPath = process.env.PATH
  const originalExitCode = process.exitCode

  beforeEach(() => {
    jest.resetAllMocks()
    process.exitCode = undefined
    jest.mocked(Telemetry).mockImplementation(
      () =>
        ({
          record: jest.fn(),
          flush: jest.fn().mockResolvedValue([]),
        }) as never
    )
    jest.mocked(getHarnessModels).mockImplementation(async (name) =>
      (name === 'codex' ? ['gpt-5.6-terra'] : ['opus']).map((id) => ({
        id,
        label: id,
        description: '',
        efforts: ['low', 'high'],
        isDefault: true,
      }))
    )
    crossSpawn.sync.mockReturnValue({
      status: 0,
      stdout:
        '  --approve-for-me  Route approval requests through automatic review\n  --permission-mode <mode>  Permission mode to use for the session\n                                        (choices: "acceptEdits", "auto", "manual")',
    })
    jest.mocked(getProjectDir).mockReturnValue('/workspace/app')
    jest.mocked(findDir).mockReturnValue('/workspace/app/app')
    jest.mocked(getAgentName).mockResolvedValue(null)
    jest.mocked(loadConfig).mockResolvedValue({
      default: { experimental: { agentUpgrade: 'latest' } },
    } as never)
    jest
      .mocked(normalizeConfig)
      .mockImplementation(async (_phase, config) => config)
  })

  afterEach(() => {
    process.env.PATH = originalPath
    process.exitCode = originalExitCode
    while (restoreDescriptors.length > 0) {
      restoreDescriptors.pop()?.()
    }
  })

  const ci = (agent?: boolean | string) =>
    spawnNextUpgrade(
      '/workspace/app',
      { revision: 'latest', verbose: false, agent, ci: true },
      null
    )

  it('runs agent, model, effort, permission, policy, and schedule stages', async () => {
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    detectAgents('codex', 'claude')
    mockLaunch()
    select(
      'codex',
      'gpt-5.6-terra',
      'high',
      'yes',
      'experimental-future',
      'daily'
    )

    await ci()

    expect(questions()).toEqual([
      'Multiple coding agents detected. Which one would you like to use?',
      'Which Codex model should run the upgrade?',
      'Which reasoning effort should the upgrade use?',
      'Use Auto permission mode for Codex?',
      'Which upgrade policy should the workflow use?',
      'When should the workflow run?',
    ])
    // The configured policy is preselected.
    expect(jest.mocked(cliSelect).mock.calls[4][0].defaultValue).toBe(1)
    expect(Object.keys(jest.mocked(cliSelect).mock.calls[5][0].values)).toEqual(
      ['weekly', 'daily', 'manual']
    )
    const [command, args, options] = crossSpawn.mock.calls[0]
    expect(command).toBe(expectedHarnessPath('codex'))
    expect(options).toEqual({ cwd: '/workspace/app', stdio: 'inherit' })
    expect(args.slice(0, -1)).toEqual([
      '--model',
      'gpt-5.6-terra',
      '-c',
      'model_reasoning_effort=high',
      '--approve-for-me',
    ])
    const prompt = args.at(-1)
    expect(prompt).toContain('agent: codex')
    expect(prompt).toContain('model: "gpt-5.6-terra"')
    expect(prompt).toContain('effort: "high"')
    expect(prompt).toContain('policy: experimental-future')
    expect(prompt).toContain("cron: '0 9 * * *'")
    expect(prompt).toContain(`# v${cliVersion}`)
  })

  it('goes back from schedule to policy before launching', async () => {
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    detectAgents('claude')
    mockLaunch()
    select(
      'claude',
      'opus',
      'default',
      'yes',
      'security',
      'esc',
      'latest',
      'manual'
    )

    await ci()

    expect(questions().slice(-3)).toEqual([
      'When should the workflow run?',
      'Which upgrade policy should the workflow use?',
      'When should the workflow run?',
    ])
    const args = crossSpawn.mock.calls[0][1]
    expect(args.slice(0, -1)).toEqual([
      '--model',
      'opus',
      '--permission-mode',
      'auto',
    ])
    expect(args.at(-1)).toContain('policy: latest')
    expect(args.at(-1)).not.toContain('cron:')
  })

  it('cancels when Ctrl+C is pressed at schedule selection', async () => {
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    detectAgents('claude')
    select('claude', 'opus', 'default', 'yes', 'security', 'ctrl-c')

    await ci()

    expect(crossSpawn).not.toHaveBeenCalled()
    expect(Log.bootstrap).toHaveBeenCalledWith('  Upgrade cancelled.\n')
    expect(process.exitCode).toBe(1)
  })

  it('asks for the CI agent before copying the prompt', async () => {
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    detectAgents('claude')
    crossSpawn.sync.mockReturnValue({ status: 1 })
    select('copy', 'codex', 'security', 'weekly')

    await ci()

    expect(questions()).toEqual([
      'Claude Code detected. Would you like to proceed?',
      'Which coding agent should run upgrades in GitHub Actions?',
      'Which upgrade policy should the workflow use?',
      'When should the workflow run?',
    ])
    expect(crossSpawn).not.toHaveBeenCalled()
    expect(Log.info).toHaveBeenCalledWith(
      'Could not access the clipboard. Copy this GitHub Action setup prompt:'
    )
    const printed = jest
      .mocked(Log.bootstrap)
      .mock.calls.map(([value]) => String(value))
      .find((value) => value.includes('next-upgrade.yml'))
    expect(printed).toContain('agent: codex')
    expect(printed).not.toMatch(/^\s+(model|effort):/m)
  })

  it('asks for the CI agent when no local agent is installed', async () => {
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    detectAgents()
    crossSpawn.sync.mockReturnValue({ status: 0 })
    select('claude', 'latest', 'daily')

    await ci()

    expect(questions()[0]).toBe(
      'Which coding agent should run upgrades in GitHub Actions?'
    )
    expect(Log.info).toHaveBeenCalledWith(
      'No supported coding agent found. The GitHub Action setup prompt was copied to your clipboard.'
    )
    expect(clipboardInput()).toContain('agent: claude')
  })

  it('prints the prompt with defaults without a TTY', async () => {
    await ci()

    expect(cliSelect).not.toHaveBeenCalled()
    expect(Log.info).toHaveBeenCalledWith(
      'Copy this GitHub Action setup prompt into your coding agent:'
    )
    const prompt = String(jest.mocked(Log.bootstrap).mock.calls.at(-1)![0])
    expect(prompt).toContain('agent: claude')
    expect(prompt).toContain('policy: latest')
    expect(prompt).toContain("cron: '0 9 * * 1'")
  })

  it('uses the current agent inside an agent session', async () => {
    jest.mocked(getAgentName).mockResolvedValue('codex')
    jest.mocked(loadConfig).mockResolvedValue({ default: {} } as never)

    await ci()

    const prompt = String(jest.mocked(Log.bootstrap).mock.calls.at(-1)![0])
    expect(prompt).toContain('agent: codex')
    expect(prompt).toContain('policy: security')
  })

  it('rejects --ci with --agent', async () => {
    await ci('latest')

    expect(Log.error).toHaveBeenCalledWith(
      '`--ci` cannot be combined with `--agent`.'
    )
    expect(process.exitCode).toBe(1)
    expect(loadConfig).not.toHaveBeenCalled()
  })

  it('requires a Next.js app directory', async () => {
    jest.mocked(findDir).mockReturnValue(null)

    await ci()

    expect(Log.error).toHaveBeenCalledWith(
      'Could not set up the upgrade workflow:',
      expect.stringContaining('No Next.js app found in this directory.')
    )
    expect(process.exitCode).toBe(1)
  })
})
