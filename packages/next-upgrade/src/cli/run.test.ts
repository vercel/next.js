import { EventEmitter } from 'events'
import { resolve as resolvePath } from 'path'
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
import * as Log from '../shared/log'
import cliSelect from 'cli-select'
import { spawnNextUpgrade } from './run'
import { findDir } from '../next/project'
import { getProjectDir } from '../next/project'
import { getHarnessModels } from './agent/model-discovery'
import { handoffUpgrade } from './agent/handoff'
import { prepareUpgrade } from './agent/prepare'
const mockLoadConfig = jest.fn()
const mockNormalizeConfig = jest.fn()
const PHASE_PRODUCTION_BUILD = 'phase-production-build'
import { getAgentName } from './agent/detect-agent'
const mockTelemetry = jest.fn()

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
jest.mock('./spinner', () => ({
  __esModule: true,
  default: jest.fn(),
}))
jest.mock('../shared/log', () => ({
  bootstrap: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}))
jest.mock('cli-select', () => ({
  __esModule: true,
  default: jest.fn(),
}))
jest.mock('cross-spawn', () => Object.assign(jest.fn(), { sync: jest.fn() }))
jest.mock('../next/project', () => ({
  findDir: jest.fn(),
  getProjectDir: jest.fn(),
  warnMissingReactDependencies: jest.fn(),
}))
jest.mock('./package-runner', () => ({
  getNpxCommand: () => 'npx',
}))
jest.mock('../shared/picocolors', () => ({
  bold: (text: string) => text,
  cyan: (text: string) => text,
  dim: (text: string) => text,
}))
jest.mock('./agent/model-discovery', () => ({
  getHarnessModels: jest.fn(),
}))
jest.mock('./agent/prepare', () => ({
  prepareUpgrade: jest.fn(),
}))

jest.mock('./agent/detect-agent', () => ({
  getAgentName: jest.fn(),
}))

const createSpinner = (require('./spinner') as typeof import('./spinner'))
  .default as jest.Mock
const crossSpawn =
  require('cross-spawn') as typeof import('cross-spawn') as unknown as jest.Mock & {
    sync: jest.Mock
  }
const select = jest.mocked(
  cliSelect as (
    options: Parameters<typeof cliSelect>[0]
  ) => Promise<{ id: string | number }>
)
const cliVersion: string = require('@next/upgrade/package.json').version
const restoreDescriptors: Array<() => void> = []

function normalizedBootstrapCalls(): string[][] {
  return jest.mocked(Log.bootstrap).mock.calls.map(([message]) => [
    String(message)
      .replace(/\\+/g, '/')
      // Run IDs are intentionally unique; keep prompt snapshots stable.
      .replace(
        /report-agent-upgrade [0-9a-f-]{36}/g,
        'report-agent-upgrade <run-id>'
      )
      .replaceAll(
        `@next/upgrade@${cliVersion} internal report-agent-upgrade`,
        '@next/upgrade@<cli-version> internal report-agent-upgrade'
      ),
  ])
}

function expectedHarnessPath(name: string): string {
  const extension =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
          .split(';')
          .filter(Boolean)[0]
      : ''
  return resolvePath('/agents', `${name}${extension}`)
}

function normalizedFileWriteCalls() {
  return jest
    .mocked(writeFile)
    .mock.calls.map(([path, ...args]) => [
      String(path).replace(/\\+/g, '/'),
      ...args,
    ])
}

function normalizedCopiedSources(): string[] {
  return jest
    .mocked(cp)
    .mock.calls.map(([source]) => String(source).replace(/\\+/g, '/'))
}

function normalizedWriteFileCalls() {
  return normalizedFileWriteCalls().filter(([path]) =>
    String(path).includes('/skills/')
  )
}

function overrideTTY(
  target: NodeJS.ReadStream | NodeJS.WriteStream,
  value: boolean = true
): void {
  const descriptor = Object.getOwnPropertyDescriptor(target, 'isTTY')
  restoreDescriptors.push(() => {
    if (descriptor) {
      Object.defineProperty(target, 'isTTY', descriptor)
    } else {
      Reflect.deleteProperty(target, 'isTTY')
    }
  })
  Object.defineProperty(target, 'isTTY', {
    configurable: true,
    value,
  })
}

describe('agentic upgrade prompts', () => {
  const originalPath = process.env.PATH
  const originalUseCurrentCli = process.env.__NEXT_UPGRADE_USE_CURRENT_CLI
  const originalExpectedCliVersion =
    process.env.__NEXT_UPGRADE_EXPECTED_CLI_VERSION
  const originalFetch = global.fetch
  const originalExitCode = process.exitCode

  beforeEach(() => {
    jest.resetAllMocks()
    mockTelemetry.mockImplementation(
      () =>
        ({
          record: jest.fn(),
          flush: jest.fn().mockResolvedValue([]),
        }) as never
    )
    jest.mocked(getHarnessModels).mockImplementation(async (name) =>
      (name === 'codex'
        ? [
            ['gpt-5.6-terra', 'GPT-5.6-Terra'],
            ['gpt-5.6-sol', 'GPT-5.6-Sol'],
            ['gpt-6-astra', 'GPT-6-Astra'],
          ]
        : [
            ['claude-sonnet-5[1m]', 'Claude Sonnet 5 (1M)'],
            ['opus', 'Claude Opus (latest)'],
            ['fable', 'Claude Fable (latest)'],
          ]
      ).map(([id, label]) => ({
        id,
        label,
        description: '',
        efforts:
          name === 'codex'
            ? ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']
            : ['low', 'medium', 'high', 'max'],
        isDefault: false,
      }))
    )
    crossSpawn.sync.mockReturnValue({
      status: 0,
      stdout:
        '  --approve-for-me  Route approval requests through automatic review\n  --permission-mode <mode>  Permission mode to use for the session\n                                        (choices: "acceptEdits", "auto", "manual")',
    })
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
    mockLoadConfig.mockResolvedValue({
      default: { experimental: { agentUpgrade: false } },
    } as never)
    mockNormalizeConfig.mockImplementation(async (_phase, config) => config)
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
      `Expected @next/upgrade 0.0.0 for the upgrade, but launched ${cliVersion}.`
    )
    expect(process.exitCode).toBe(1)
    expect(global.fetch).toHaveBeenCalledTimes(0)
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
    select.mockRejectedValue(undefined)

    await handoffUpgrade('Prepared upgrade prompt.', '/workspace/app', null)

    const selectOptions = select.mock.calls[0][0]
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
           "  Use ↑/↓ to choose, Enter to confirm, or Esc to cancel.
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
      throw Object.assign(new Error('not found'), { code: 'ENOENT' })
    })
    jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
    select.mockRejectedValue(undefined)

    await handoffUpgrade('Prepared upgrade prompt.', '/workspace/app', null)

    expect(Log.bootstrap).toHaveBeenCalledWith(
      '  Codex detected. Would you like to proceed?'
    )
  })

  it.each([
    [
      'codex',
      'gpt-5.6-terra',
      'ultra',
      ['--model', 'gpt-5.6-terra', '-c', 'model_reasoning_effort=ultra'],
    ],
    [
      'codex',
      'gpt-5.6-sol',
      'max',
      ['--model', 'gpt-5.6-sol', '-c', 'model_reasoning_effort=max'],
    ],
    [
      'codex',
      'gpt-6-astra',
      'high',
      ['--model', 'gpt-6-astra', '-c', 'model_reasoning_effort=high'],
    ],
    [
      'claude',
      'claude-sonnet-5[1m]',
      'high',
      ['--model', 'claude-sonnet-5[1m]', '--effort', 'high'],
    ],
    ['claude', 'opus', 'max', ['--model', 'opus', '--effort', 'max']],
    ['claude', 'fable', 'medium', ['--model', 'fable', '--effort', 'medium']],
  ])(
    'passes selected %s model %s and effort %s',
    async (agent, model, effort, flags) => {
      process.env.PATH = '/agents'
      overrideTTY(process.stdin)
      overrideTTY(process.stdout)
      jest.mocked(getAgentName).mockResolvedValue(null)
      jest.mocked(access).mockResolvedValue(undefined)
      jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
      select
        .mockResolvedValueOnce({ id: agent } as never)
        .mockResolvedValueOnce({ id: model } as never)
        .mockResolvedValueOnce({ id: effort } as never)
        .mockResolvedValueOnce({ id: 'yes' } as never)
        .mockResolvedValueOnce({ id: 'no' } as never)
      crossSpawn.mockImplementation(() => {
        const child = new EventEmitter()
        process.nextTick(() => {
          child.emit('spawn')
          child.emit('close', 0, null)
        })
        return child
      })

      const prompt = jest.fn((useWorktree: boolean | null) =>
        useWorktree ? 'Worktree prompt' : 'In-place prompt'
      )
      await handoffUpgrade(prompt, '/workspace/app', null)

      expect(prompt).toHaveBeenCalledWith(false)
      expect(crossSpawn).toHaveBeenCalledWith(
        expectedHarnessPath(agent),
        [
          ...flags,
          ...(agent === 'codex'
            ? ['--approve-for-me']
            : ['--permission-mode', 'auto']),
          'In-place prompt',
        ],
        { cwd: '/workspace/app', stdio: 'inherit' }
      )
      const modelMenu = select.mock.calls[1][0]
      expect(modelMenu.values).toEqual(
        agent === 'codex'
          ? {
              'gpt-5.6-terra': 'GPT-5.6-Terra',
              'gpt-5.6-sol': 'GPT-5.6-Sol',
              'gpt-6-astra': 'GPT-6-Astra',
            }
          : {
              'claude-sonnet-5[1m]': 'Claude Sonnet 5 (1M)',
              opus: 'Claude Opus (latest)',
              fable: 'Claude Fable (latest)',
            }
      )
      const effortMenu = select.mock.calls[2][0]
      expect(Object.keys(effortMenu.values)).toEqual(
        agent === 'claude'
          ? ['default', 'low', 'medium', 'high', 'max']
          : ['default', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']
      )
      expect(effortMenu.defaultValue).toBe(0)
      const permissionMenu = select.mock.calls[3][0]
      expect(permissionMenu.values).toEqual({
        yes: 'Yes',
        no: 'No, ask for approval',
      })
      expect(permissionMenu.defaultValue).toBe(0)
      expect(select.mock.calls[4][0].values).toEqual({
        yes: 'Yes',
        no: 'No',
      })
      const questions = jest
        .mocked(Log.bootstrap)
        .mock.calls.map(([value]) => String(value))
      expect(questions.filter((value) => value.startsWith('  ❯ '))).toEqual([
        `  ❯ Continue with ${agent === 'codex' ? 'Codex' : 'Claude Code'}`,
        `  ❯ ${(modelMenu.values as Record<string, string>)[model]}`,
        `  ❯ ${effort}`,
        '  ❯ Yes',
        '  ❯ No',
      ])
      expect(
        questions.findIndex((value) => value.includes('model should run'))
      ).toBeLessThan(
        questions.findIndex((value) => value.includes('reasoning effort'))
      )
      expect(
        questions.findIndex((value) => value.includes('reasoning effort'))
      ).toBeLessThan(
        questions.findIndex((value) => value.includes('permission mode'))
      )
    }
  )

  it('uses the selected model default when no effort override is chosen', async () => {
    process.env.PATH = '/agents'
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    jest.mocked(getAgentName).mockResolvedValue(null)
    jest.mocked(access).mockResolvedValue(undefined)
    jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
    select
      .mockResolvedValueOnce({ id: 'codex' } as never)
      .mockResolvedValueOnce({ id: 'gpt-5.6-terra' } as never)
      .mockResolvedValueOnce({ id: 'default' } as never)
      .mockResolvedValueOnce({ id: 'yes' } as never)
      .mockResolvedValueOnce({ id: 'no' } as never)
    crossSpawn.mockImplementation(() => {
      const child = new EventEmitter()
      process.nextTick(() => child.emit('close', 0, null))
      return child
    })

    await handoffUpgrade('Upgrade prompt', '/workspace/app', null)

    expect(Log.bootstrap).toHaveBeenCalledWith('  ❯ Model default')
    expect(crossSpawn).toHaveBeenCalledWith(
      expectedHarnessPath('codex'),
      ['--model', 'gpt-5.6-terra', '--approve-for-me', 'Upgrade prompt'],
      { cwd: '/workspace/app', stdio: 'inherit' }
    )
  })

  it('uses discovered names, descriptions, defaults, and per-model efforts', async () => {
    process.env.PATH = '/agents'
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    jest.mocked(getAgentName).mockResolvedValue(null)
    jest.mocked(access).mockResolvedValue(undefined)
    jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
    jest.mocked(getHarnessModels).mockResolvedValue([
      {
        id: 'future-model',
        label: 'Future',
        description: 'For upgrades',
        efforts: ['high'],
        isDefault: false,
      },
      {
        id: 'recommended-model',
        label: 'Recommended',
        description: '',
        efforts: ['low'],
        isDefault: true,
      },
    ])
    select
      .mockResolvedValueOnce({ id: 'codex' })
      .mockResolvedValueOnce({ id: 'future-model' })
      .mockResolvedValueOnce({ id: 'high' })
      .mockResolvedValueOnce({ id: 'yes' })
      .mockResolvedValueOnce({ id: 'no' })
    crossSpawn.mockImplementation(() => {
      const child = new EventEmitter()
      process.nextTick(() => child.emit('close', 0, null))
      return child
    })
    await handoffUpgrade('Upgrade prompt', '/workspace/app', null)
    expect(select.mock.calls[1][0]).toMatchObject({
      values: {
        'future-model': 'Future — For upgrades',
        'recommended-model': 'Recommended',
      },
      defaultValue: 1,
    })
    expect(select.mock.calls[2][0].values).toEqual({
      default: 'Model default',
      high: 'high',
    })
    expect(getHarnessModels).toHaveBeenCalledWith(
      'codex',
      expectedHarnessPath('codex'),
      '/workspace/app',
      expect.any(AbortSignal)
    )
  })

  it.each(['codex', 'claude'])(
    'uses %s defaults without warnings when discovery is empty',
    async (agent) => {
      process.env.PATH = '/agents'
      overrideTTY(process.stdin)
      overrideTTY(process.stdout)
      jest.mocked(getAgentName).mockResolvedValue(null)
      jest.mocked(access).mockResolvedValue(undefined)
      jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
      jest.mocked(getHarnessModels).mockResolvedValue([])
      select
        .mockResolvedValueOnce({ id: agent })
        .mockResolvedValueOnce({ id: 'yes' })
        .mockRejectedValueOnce(undefined)
        .mockRejectedValueOnce(undefined)
        .mockResolvedValueOnce({ id: agent })
        .mockResolvedValueOnce({ id: 'yes' })
        .mockResolvedValueOnce({ id: 'no' })
      crossSpawn.mockImplementation(() => {
        const child = new EventEmitter()
        process.nextTick(() => child.emit('close', 0, null))
        return child
      })
      await handoffUpgrade('Upgrade prompt', '/workspace/app', null)
      expect(getHarnessModels).toHaveBeenCalledTimes(2)
      expect(Log.warn).not.toHaveBeenCalled()
      expect(Log.error).not.toHaveBeenCalled()
      expect(crossSpawn).toHaveBeenCalledWith(
        expectedHarnessPath(agent),
        [
          ...(agent === 'codex'
            ? ['--approve-for-me']
            : ['--permission-mode', 'auto']),
          'Upgrade prompt',
        ],
        { cwd: '/workspace/app', stdio: 'inherit' }
      )
    }
  )

  it('skips unavailable efforts and goes back directly to model selection', async () => {
    process.env.PATH = '/agents'
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    jest.mocked(getAgentName).mockResolvedValue(null)
    jest.mocked(access).mockResolvedValue(undefined)
    jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
    jest.mocked(getHarnessModels).mockResolvedValue([
      {
        id: 'default',
        label: 'Default',
        description: '',
        efforts: [],
        isDefault: true,
      },
    ])
    select
      .mockResolvedValueOnce({ id: 'claude' })
      .mockResolvedValueOnce({ id: 'default' })
      .mockRejectedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'default' })
      .mockResolvedValueOnce({ id: 'yes' })
      .mockResolvedValueOnce({ id: 'no' })
    crossSpawn.mockImplementation(() => {
      const child = new EventEmitter()
      process.nextTick(() => child.emit('close', 0, null))
      return child
    })
    await handoffUpgrade('Upgrade prompt', '/workspace/app', null)
    expect(select.mock.calls[3][0].values).toEqual({
      default: 'Default',
    })
    expect(crossSpawn).toHaveBeenCalledWith(
      expectedHarnessPath('claude'),
      ['--model', 'default', '--permission-mode', 'auto', 'Upgrade prompt'],
      { cwd: '/workspace/app', stdio: 'inherit' }
    )
    expect(getHarnessModels).toHaveBeenCalledTimes(2)
  })

  it('prefetches both catalogs before agent selection and cancels unused discovery before launch', async () => {
    process.env.PATH = '/agents'
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    jest.mocked(getAgentName).mockResolvedValue(null)
    jest.mocked(access).mockResolvedValue(undefined)
    jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
    let resolveCodex!: (
      models: Awaited<ReturnType<typeof getHarnessModels>>
    ) => void
    const cancelled: string[] = []
    jest.mocked(getHarnessModels).mockImplementation(
      (name, _path, _cwd, signal) =>
        new Promise((resolve) => {
          if (name === 'codex') resolveCodex = resolve
          signal!.addEventListener(
            'abort',
            () => {
              cancelled.push(name)
              resolve(null)
            },
            { once: true }
          )
        })
    )
    select
      .mockImplementationOnce(async () => {
        expect(
          jest.mocked(getHarnessModels).mock.calls.map(([name]) => name)
        ).toEqual(['codex', 'claude'])
        resolveCodex([
          {
            id: 'fresh',
            label: 'Fresh',
            description: '',
            efforts: [],
            isDefault: true,
          },
        ])
        return { id: 'codex' }
      })
      .mockImplementationOnce(async () => {
        expect(cancelled).toEqual([])
        return { id: 'fresh' }
      })
      .mockResolvedValueOnce({ id: 'yes' })
      .mockResolvedValueOnce({ id: 'no' })
    crossSpawn.mockImplementation(() => {
      expect(cancelled).toContain('claude')
      const child = new EventEmitter()
      process.nextTick(() => child.emit('close', 0, null))
      return child
    })
    expect(await handoffUpgrade('Upgrade prompt', '/workspace/app', null)).toBe(
      'handed_off'
    )
  })

  it.each(['cancel', 'copy'])(
    'cleans up prefetched discovery when choosing %s',
    async (choice) => {
      process.env.PATH = '/agents'
      overrideTTY(process.stdin)
      overrideTTY(process.stdout)
      jest.mocked(getAgentName).mockResolvedValue(null)
      jest.mocked(access).mockResolvedValue(undefined)
      jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
      const cancelled: string[] = []
      jest.mocked(getHarnessModels).mockImplementation(
        (name, _path, _cwd, signal) =>
          new Promise((resolve) => {
            signal!.addEventListener(
              'abort',
              () => {
                cancelled.push(name)
                resolve(null)
              },
              { once: true }
            )
          })
      )
      if (choice === 'copy') select.mockResolvedValueOnce({ id: 'copy' })
      else select.mockRejectedValueOnce(undefined)
      await handoffUpgrade('Upgrade prompt', '/workspace/app', null)
      expect(cancelled).toEqual(['codex', 'claude'])
      expect(crossSpawn).not.toHaveBeenCalled()
    }
  )

  it('cancels when model discovery is interrupted', async () => {
    process.env.PATH = '/agents'
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    jest.mocked(getAgentName).mockResolvedValue(null)
    jest.mocked(access).mockResolvedValue(undefined)
    jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
    jest.mocked(getHarnessModels).mockResolvedValue(null)
    select.mockResolvedValueOnce({ id: 'codex' })
    expect(await handoffUpgrade('Upgrade prompt', '/workspace/app', null)).toBe(
      'cancelled'
    )
    expect(cliSelect).toHaveBeenCalledTimes(1)
    expect(crossSpawn).not.toHaveBeenCalled()
  })

  it('preserves unexpected agent probe errors as the cause', async () => {
    process.env.PATH = '/agents'
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    jest.mocked(getAgentName).mockResolvedValue(null)
    const cause = Object.assign(new Error('too many open files'), {
      code: 'EMFILE',
    })
    jest.mocked(access).mockRejectedValue(cause)

    await expect(
      handoffUpgrade('Upgrade prompt', '/workspace/app', null)
    ).rejects.toMatchObject({ cause })
  })

  it.each([
    ['codex', 'yes', ['--approve-for-me']],
    [
      'codex',
      'no',
      ['--sandbox', 'workspace-write', '--ask-for-approval', 'on-request'],
    ],
    ['claude', 'yes', ['--permission-mode', 'auto']],
    ['claude', 'no', ['--permission-mode', 'manual']],
  ])('passes %s %s permission flags', async (agent, useAuto, flags) => {
    process.env.PATH = '/agents'
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    jest.mocked(getAgentName).mockResolvedValue(null)
    jest.mocked(access).mockResolvedValue(undefined)
    jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
    select
      .mockResolvedValueOnce({ id: agent } as never)
      .mockResolvedValueOnce({
        id: agent === 'codex' ? 'gpt-5.6-terra' : 'opus',
      } as never)
      .mockResolvedValueOnce({ id: 'high' } as never)
      .mockResolvedValueOnce({ id: useAuto } as never)
      .mockResolvedValueOnce({ id: 'no' } as never)
    crossSpawn.mockImplementation(() => {
      const child = new EventEmitter()
      process.nextTick(() => child.emit('close', 0, null))
      return child
    })

    await handoffUpgrade('Upgrade prompt', '/workspace/app', null)

    expect(crossSpawn).toHaveBeenCalledWith(
      expectedHarnessPath(agent),
      [
        '--model',
        agent === 'codex' ? 'gpt-5.6-terra' : 'opus',
        ...(agent === 'codex'
          ? ['-c', 'model_reasoning_effort=high']
          : ['--effort', 'high']),
        ...flags,
        'Upgrade prompt',
      ],
      { cwd: '/workspace/app', stdio: 'inherit' }
    )
  })

  it('defaults to approval requests when the Codex CLI lacks Auto review', async () => {
    process.env.PATH = '/agents'
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    jest.mocked(getAgentName).mockResolvedValue(null)
    jest.mocked(access).mockResolvedValue(undefined)
    jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
    crossSpawn.sync.mockImplementation(() => {
      return { status: 0, stdout: '  --ask-for-approval <APPROVAL_POLICY>' }
    })
    select
      .mockResolvedValueOnce({ id: 'codex' } as never)
      .mockResolvedValueOnce({ id: 'gpt-5.6-terra' } as never)
      .mockResolvedValueOnce({ id: 'high' } as never)
      .mockResolvedValueOnce({ id: 'no' } as never)
    crossSpawn.mockImplementation(() => {
      const child = new EventEmitter()
      process.nextTick(() => child.emit('close', 0, null))
      return child
    })

    await handoffUpgrade('Upgrade prompt', '/workspace/app', null)

    expect(crossSpawn.sync).toHaveBeenCalledWith(
      expectedHarnessPath('codex'),
      ['--help'],
      expect.objectContaining({ encoding: 'utf8' })
    )
    expect(select.mock.calls[3][0].values).toEqual({
      yes: 'Yes',
      no: 'No',
    })
    expect(crossSpawn).toHaveBeenCalledWith(
      expectedHarnessPath('codex'),
      [
        '--model',
        'gpt-5.6-terra',
        '-c',
        'model_reasoning_effort=high',
        '--sandbox',
        'workspace-write',
        '--ask-for-approval',
        'on-request',
        'Upgrade prompt',
      ],
      { cwd: '/workspace/app', stdio: 'inherit' }
    )
  })

  it('uses explicit approval mode when the Claude CLI lacks Auto mode', async () => {
    process.env.PATH = '/agents'
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    jest.mocked(getAgentName).mockResolvedValue(null)
    jest.mocked(access).mockResolvedValue(undefined)
    jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
    crossSpawn.sync.mockReturnValue({
      status: 0,
      stdout:
        '  --permission-mode <mode>  Permission mode to use for the session\n                                        (choices: "default", "acceptEdits", "plan", "dontAsk", "bypassPermissions")',
    })
    select
      .mockResolvedValueOnce({ id: 'claude' } as never)
      .mockResolvedValueOnce({ id: 'opus' } as never)
      .mockResolvedValueOnce({ id: 'high' } as never)
      .mockResolvedValueOnce({ id: 'no' } as never)
    crossSpawn.mockImplementation(() => {
      const child = new EventEmitter()
      process.nextTick(() => child.emit('close', 0, null))
      return child
    })

    await handoffUpgrade('Upgrade prompt', '/workspace/app', null)

    expect(crossSpawn.sync).toHaveBeenCalledWith(
      expectedHarnessPath('claude'),
      ['--help'],
      expect.objectContaining({ encoding: 'utf8' })
    )
    expect(select.mock.calls[3][0].values).toEqual({
      yes: 'Yes',
      no: 'No',
    })
    expect(crossSpawn).toHaveBeenCalledWith(
      expectedHarnessPath('claude'),
      [
        '--model',
        'opus',
        '--effort',
        'high',
        '--permission-mode',
        'default',
        'Upgrade prompt',
      ],
      { cwd: '/workspace/app', stdio: 'inherit' }
    )
  })

  it('cancels the handoff when Ctrl+C is pressed at permission selection', async () => {
    process.env.PATH = '/agents'
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    jest.mocked(getAgentName).mockResolvedValue(null)
    jest.mocked(access).mockResolvedValue(undefined)
    jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
    select
      .mockResolvedValueOnce({ id: 'codex' } as never)
      .mockResolvedValueOnce({ id: 'gpt-5.6-terra' } as never)
      .mockResolvedValueOnce({ id: 'high' } as never)
      .mockImplementationOnce(() => {
        process.stdin.emit('keypress', '\u0003', { name: 'c', ctrl: true })
        return Promise.reject(undefined)
      })

    await handoffUpgrade('Upgrade prompt', '/workspace/app', null)

    expect(process.exitCode).toBe(1)
    expect(crossSpawn).not.toHaveBeenCalled()
  })

  it('goes back through worktree, permission, effort, and model before launching', async () => {
    process.env.PATH = '/agents'
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    jest.mocked(getAgentName).mockResolvedValue(null)
    jest.mocked(access).mockResolvedValue(undefined)
    jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
    select
      .mockResolvedValueOnce({ id: 'codex' })
      .mockResolvedValueOnce({ id: 'gpt-5.6-terra' })
      .mockResolvedValueOnce({ id: 'high' })
      .mockResolvedValueOnce({ id: 'yes' })
      .mockRejectedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'no' })
      .mockRejectedValueOnce(undefined)
      .mockRejectedValueOnce(undefined)
      .mockRejectedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'gpt-6-astra' })
      .mockResolvedValueOnce({ id: 'ultra' })
      .mockResolvedValueOnce({ id: 'yes' })
      .mockResolvedValueOnce({ id: 'no' })
    crossSpawn.mockImplementation(() => {
      const child = new EventEmitter()
      process.nextTick(() => child.emit('close', 0, null))
      return child
    })

    await handoffUpgrade('Upgrade prompt', '/workspace/app', null)

    expect(jest.mocked(getHarnessModels).mock.calls).toHaveLength(2)
    expect(
      crossSpawn.sync.mock.calls.filter(([, args]) => args[0] === '--help')
    ).toHaveLength(1)
    expect(select.mock.calls[7][0].defaultValue).toBe(1)
    expect(select.mock.calls[9][0].defaultValue).toBe(0)
    expect(
      jest
        .mocked(Log.bootstrap)
        .mock.calls.map(([value]) => String(value))
        .filter((value) => value.startsWith('  ❯ '))
    ).toEqual([
      '  ❯ Continue with Codex',
      '  ❯ GPT-5.6-Terra',
      '  ❯ high',
      '  ❯ Yes',
      '  ❯ No, ask for approval',
      '  ❯ GPT-6-Astra',
      '  ❯ ultra',
      '  ❯ Yes',
      '  ❯ No',
    ])
    expect(crossSpawn).toHaveBeenCalledWith(
      expectedHarnessPath('codex'),
      [
        '--model',
        'gpt-6-astra',
        '-c',
        'model_reasoning_effort=ultra',
        '--approve-for-me',
        'Upgrade prompt',
      ],
      { cwd: '/workspace/app', stdio: 'inherit' }
    )
  })

  it('defaults to the selected model when the previous effort is unavailable', async () => {
    process.env.PATH = '/agents'
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    jest.mocked(getAgentName).mockResolvedValue(null)
    jest.mocked(access).mockResolvedValue(undefined)
    jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
    select
      .mockResolvedValueOnce({ id: 'codex' })
      .mockResolvedValueOnce({ id: 'gpt-5.6-terra' })
      .mockResolvedValueOnce({ id: 'ultra' })
      .mockRejectedValueOnce(undefined)
      .mockRejectedValueOnce(undefined)
      .mockRejectedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'claude' })
      .mockResolvedValueOnce({ id: 'opus' })
      .mockResolvedValueOnce({ id: 'default' })
      .mockResolvedValueOnce({ id: 'yes' })
      .mockResolvedValueOnce({ id: 'no' })
    crossSpawn.mockImplementation(() => {
      const child = new EventEmitter()
      process.nextTick(() => child.emit('close', 0, null))
      return child
    })

    await handoffUpgrade('Upgrade prompt', '/workspace/app', null)

    expect(select.mock.calls[8][0].defaultValue).toBe(0)
    expect(crossSpawn).toHaveBeenCalledWith(
      expectedHarnessPath('claude'),
      ['--model', 'opus', '--permission-mode', 'auto', 'Upgrade prompt'],
      { cwd: '/workspace/app', stdio: 'inherit' }
    )
  })

  it('reuses Claude permission support after going back', async () => {
    process.env.PATH = '/agents'
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    jest.mocked(getAgentName).mockResolvedValue(null)
    jest.mocked(access).mockResolvedValue(undefined)
    jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
    select
      .mockResolvedValueOnce({ id: 'claude' })
      .mockResolvedValueOnce({ id: 'opus' })
      .mockResolvedValueOnce({ id: 'high' })
      .mockRejectedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'medium' })
      .mockResolvedValueOnce({ id: 'yes' })
      .mockResolvedValueOnce({ id: 'no' })
    crossSpawn.mockImplementation(() => {
      const child = new EventEmitter()
      process.nextTick(() => child.emit('close', 0, null))
      return child
    })

    await handoffUpgrade('Upgrade prompt', '/workspace/app', null)

    expect(
      crossSpawn.sync.mock.calls.filter(([, args]) => args[0] === '--help')
    ).toHaveLength(1)
    expect(crossSpawn).toHaveBeenCalledWith(
      expectedHarnessPath('claude'),
      [
        '--model',
        'opus',
        '--effort',
        'medium',
        '--permission-mode',
        'auto',
        'Upgrade prompt',
      ],
      { cwd: '/workspace/app', stdio: 'inherit' }
    )
  })

  it('returns from worktree to effort when Auto mode is unavailable', async () => {
    process.env.PATH = '/agents'
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    jest.mocked(getAgentName).mockResolvedValue(null)
    jest.mocked(access).mockResolvedValue(undefined)
    jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
    crossSpawn.sync.mockImplementation(() => {
      return { status: 0, stdout: '  --ask-for-approval <APPROVAL_POLICY>' }
    })
    select
      .mockResolvedValueOnce({ id: 'codex' })
      .mockResolvedValueOnce({ id: 'gpt-5.6-terra' })
      .mockResolvedValueOnce({ id: 'high' })
      .mockRejectedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'max' })
      .mockResolvedValueOnce({ id: 'no' })
    crossSpawn.mockImplementation(() => {
      const child = new EventEmitter()
      process.nextTick(() => child.emit('close', 0, null))
      return child
    })

    await handoffUpgrade('Upgrade prompt', '/workspace/app', null)

    expect(
      crossSpawn.sync.mock.calls.filter(([, args]) => args[0] === '--help')
    ).toHaveLength(1)
    expect(select.mock.calls[4][0].values).toEqual({
      default: 'Model default',
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: 'xhigh',
      max: 'max',
      ultra: 'ultra',
    })
    expect(crossSpawn).toHaveBeenCalledWith(
      expectedHarnessPath('codex'),
      [
        '--model',
        'gpt-5.6-terra',
        '-c',
        'model_reasoning_effort=max',
        '--sandbox',
        'workspace-write',
        '--ask-for-approval',
        'on-request',
        'Upgrade prompt',
      ],
      { cwd: '/workspace/app', stdio: 'inherit' }
    )
  })

  it('uses the existing agent settings without prompting interactively', async () => {
    const prompt = jest.fn(() => 'Prepared upgrade prompt.')

    await handoffUpgrade(prompt, '/workspace/app', null)

    expect(prompt).toHaveBeenCalledWith(null)
    expect(Log.bootstrap).toHaveBeenCalledWith('Prepared upgrade prompt.')
    expect(cliSelect).toHaveBeenCalledTimes(0)
    expect(crossSpawn).toHaveBeenCalledTimes(0)
  })

  it('passes the accepted worktree choice to the prompt factory', async () => {
    process.env.PATH = '/agents'
    overrideTTY(process.stdin)
    overrideTTY(process.stdout)
    jest.mocked(getAgentName).mockResolvedValue(null)
    jest.mocked(access).mockResolvedValue(undefined)
    jest.mocked(stat).mockResolvedValue({ isFile: () => true } as never)
    crossSpawn.sync.mockImplementation(() => {
      return { status: 0, stdout: '  --approve-for-me' }
    })
    select
      .mockResolvedValueOnce({ id: 'codex' } as never)
      .mockResolvedValueOnce({ id: 'gpt-5.6-terra' } as never)
      .mockResolvedValueOnce({ id: 'high' } as never)
      .mockResolvedValueOnce({ id: 'yes' } as never)
      .mockResolvedValueOnce({ id: 'yes' } as never)
    crossSpawn.mockImplementation(() => {
      const child = new EventEmitter()
      process.nextTick(() => child.emit('close', 0, null))
      return child
    })
    const prompt = jest.fn(() => 'Worktree prompt')

    await handoffUpgrade(prompt, '/workspace/app', null)

    expect(prompt).toHaveBeenCalledWith(true)
    expect(crossSpawn).toHaveBeenCalledWith(
      expectedHarnessPath('codex'),
      [
        '--model',
        'gpt-5.6-terra',
        '-c',
        'model_reasoning_effort=high',
        '--approve-for-me',
        'Worktree prompt',
      ],
      { cwd: '/workspace/app', stdio: 'inherit' }
    )
  })

  it('leaves the worktree choice open outside a TTY', async () => {
    overrideTTY(process.stdin, false)
    overrideTTY(process.stdout, false)
    jest.mocked(getAgentName).mockResolvedValue(null)
    const prompt = jest.fn((useWorktree: boolean | null) =>
      useWorktree === null ? 'Choice pending prompt' : 'Selected prompt'
    )

    await handoffUpgrade(prompt, '/workspace/app', null)

    expect(prompt).toHaveBeenCalledWith(null)
    expect(Log.bootstrap).toHaveBeenCalledWith(
      expect.stringContaining('Choice pending prompt')
    )
    expect(cliSelect).toHaveBeenCalledTimes(0)
    expect(crossSpawn).toHaveBeenCalledTimes(0)
  })

  it('passes the complete migration prompt to an existing agent', async () => {
    await spawnNextUpgrade(
      '/workspace/app',
      {
        revision: 'latest',
        verbose: false,
        agent: 'security',
      },
      null
    )

    expect(prepareUpgrade).toHaveBeenCalledWith('/workspace/app', 'security')
    const [guidePath, guide] = jest.mocked(writeFile).mock.calls[0]
    expect(String(guidePath).replace(/\\+/g, '/')).toBe(
      '/tmp/next-upgrade-test/upgrade/different-major.md'
    )
    expect(String(guide)).toMatch(
      /^Run npx @next\/codemod@\S+ upgrade 16\.3\.5 --yes --skip-adoption$/
    )
    const copiedSources = normalizedCopiedSources()
    expect(copiedSources).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/dist/guides/shared.md'),
        expect.stringContaining('/dist/guides/different-major.md'),
        expect.stringContaining('/codemods.md'),
        expect.stringContaining('/version-15.md'),
        expect.stringContaining('/version-16.md'),
      ])
    )
    expect(
      copiedSources.some((source) =>
        source.includes('/dist/guides/future-defaults.md')
      )
    ).toBe(false)
    expect(normalizedBootstrapCalls()).toMatchInlineSnapshot(`
     [
       [
         "Read and follow "/tmp/next-upgrade-test/upgrade/shared.md" first. Attempt its applicable duplicate checks before changing files. If a check is unavailable, report it and continue. Stop only if you find equivalent work. Then read and follow every applicable instruction in "/tmp/next-upgrade-test/upgrade/different-major.md".

     We're upgrading the app in "/workspace/app" from Next.js 14.1.1 to 16.3.5 because the installed version is affected by a published security advisory.

     Follow the user's worktree choice. If they do not specify, use a separate Git worktree when the app is in a Git repository. Run upgrade commands from this app's corresponding directory in that worktree. If the app is not in a Git repository, upgrade it in place.

     Set \`experimental.agentUpgrade\` to "security" in the app's Next.js config as part of this upgrade. Preserve unrelated configuration. If the target Next.js version does not support this option, skip the setting and report why.

     References:
     - https://api.github.com/advisories?affects=next
     - https://registry.npmjs.org/next

     When this task ends, report its result once. After completing the requested upgrade and all applicable verification, run \`npx @next/upgrade@<cli-version> internal report-agent-upgrade <run-id> success\`. If the attempted upgrade remains unsuccessful after repairs or verification fails, run \`npx @next/upgrade@<cli-version> internal report-agent-upgrade <run-id> failure\`. If you stop for duplicate work, user cancellation, or an unavailable prerequisite, do not report success or failure. Explain the result to the user separately; never include project details or error text in the telemetry command.",
       ],
     ]
    `)
  })

  it('renders verbose codemod instructions in the guide', async () => {
    await spawnNextUpgrade(
      '/workspace/app',
      {
        revision: 'latest',
        verbose: true,
        agent: 'security',
      },
      null
    )

    const [guidePath, guide] = jest.mocked(writeFile).mock.calls[0]
    expect(String(guidePath).replace(/\\+/g, '/')).toBe(
      '/tmp/next-upgrade-test/upgrade/different-major.md'
    )
    expect(String(guide)).toMatch(/--skip-adoption --verbose$/)
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

    expect(mockLoadConfig).toHaveBeenCalledWith(
      PHASE_PRODUCTION_BUILD,
      '/workspace/app',
      { rawConfig: true }
    )
    expect(prepareUpgrade).toHaveBeenCalledWith('/workspace/app', 'security')
  })

  it.each(['security', 'latest', 'experimental-future'] as const)(
    'uses the configured %s policy for a bare agent upgrade',
    async (policy) => {
      mockLoadConfig.mockResolvedValue({
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

  it('passes the latest target to the existing agent', async () => {
    jest.mocked(prepareUpgrade).mockResolvedValue({
      status: 'ready',
      installedVersion: '16.2.12',
      targetVersion: '16.3.5',
      references: ['https://registry.npmjs.org/next/latest'],
      futureDefaults: [],
    })

    await spawnNextUpgrade(
      '/workspace/app',
      {
        revision: 'latest',
        verbose: false,
        agent: 'latest',
      },
      null
    )

    expect(mockLoadConfig).toHaveBeenCalledTimes(1)
    expect(prepareUpgrade).toHaveBeenCalledWith('/workspace/app', 'latest')
    expect(readFile).toHaveBeenCalledTimes(0)
    expect(writeFile).toHaveBeenCalledTimes(0)
    expect(
      normalizedCopiedSources().some((source) =>
        source.includes('/dist/guides/future-defaults.md')
      )
    ).toBe(false)
    expect(
      normalizedCopiedSources().some((source) => source.includes('/02-pages/'))
    ).toBe(false)
    expect(normalizedBootstrapCalls()).toMatchInlineSnapshot(`
     [
       [
         "Read and follow "/tmp/next-upgrade-test/upgrade/shared.md" first. Attempt its applicable duplicate checks before changing files. If a check is unavailable, report it and continue. Stop only if you find equivalent work. Then read and follow every applicable instruction in "/tmp/next-upgrade-test/upgrade/same-major.md".

     We're upgrading the app in "/workspace/app" from Next.js 16.2.12 to 16.3.5 because a newer stable Next.js release is available.

     Follow the user's worktree choice. If they do not specify, use a separate Git worktree when the app is in a Git repository. Run upgrade commands from this app's corresponding directory in that worktree. If the app is not in a Git repository, upgrade it in place.

     Set \`experimental.agentUpgrade\` to "latest" in the app's Next.js config as part of this upgrade. Preserve unrelated configuration. If the target Next.js version does not support this option, skip the setting and report why.

     References:
     - https://registry.npmjs.org/next/latest

     When this task ends, report its result once. After completing the requested upgrade and all applicable verification, run \`npx @next/upgrade@<cli-version> internal report-agent-upgrade <run-id> success\`. If the attempted upgrade remains unsuccessful after repairs or verification fails, run \`npx @next/upgrade@<cli-version> internal report-agent-upgrade <run-id> failure\`. If you stop for duplicate work, user cancellation, or an unavailable prerequisite, do not report success or failure. Explain the result to the user separately; never include project details or error text in the telemetry command.",
       ],
     ]
    `)
  })

  it('uses the same-major guide for a security update', async () => {
    jest.mocked(prepareUpgrade).mockResolvedValue({
      status: 'ready',
      installedVersion: '15.0.0',
      targetVersion: '15.5.26',
      references: ['https://example.com/advisory'],
      futureDefaults: [],
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

    expect(normalizedBootstrapCalls().flat().join('\n')).toContain(
      '/upgrade/shared.md'
    )
    expect(normalizedBootstrapCalls().flat().join('\n')).toContain(
      '/upgrade/same-major.md'
    )
    expect(readFile).toHaveBeenCalledTimes(0)
    expect(writeFile).toHaveBeenCalledTimes(0)
    expect(normalizedCopiedSources()).toEqual([
      expect.stringContaining('/dist/guides/shared.md'),
      expect.stringContaining('/dist/guides/same-major.md'),
    ])
  })

  it('uses the different-major guide for a latest update', async () => {
    jest.mocked(prepareUpgrade).mockResolvedValue({
      status: 'ready',
      installedVersion: '15.5.26',
      targetVersion: '16.3.5',
      references: ['https://registry.npmjs.org/next/latest'],
      futureDefaults: [],
    })

    await spawnNextUpgrade(
      '/workspace/app',
      {
        revision: 'latest',
        verbose: false,
        agent: 'latest',
      },
      null
    )

    expect(normalizedBootstrapCalls().flat().join('\n')).toContain(
      '/upgrade/different-major.md'
    )
    expect(
      normalizedCopiedSources().some((source) =>
        source.includes('/dist/guides/future-defaults.md')
      )
    ).toBe(false)
  })

  it('adds the Future Defaults guide after a different-major update', async () => {
    jest.mocked(prepareUpgrade).mockResolvedValue({
      status: 'ready',
      installedVersion: '15.5.26',
      targetVersion: '16.3.5',
      references: ['https://registry.npmjs.org/next/latest'],
      futureDefaults: [],
    })

    await spawnNextUpgrade(
      '/workspace/app',
      {
        revision: 'latest',
        verbose: false,
        agent: 'experimental-future',
      },
      null
    )

    const prompt = normalizedBootstrapCalls().flat().join('\n')
    expect(prompt).toContain('/upgrade/different-major.md')
    expect(prompt).toContain('/upgrade/future-defaults.md')
    expect(normalizedCopiedSources()).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/dist/guides/future-defaults.md'),
      ])
    )
  })

  it.each(['latest', 'experimental-future'] as const)(
    'hands off the exact canary target for %s upgrades',
    async (policy) => {
      jest.mocked(prepareUpgrade).mockResolvedValue({
        status: 'ready',
        installedVersion: '17.2.0-canary.4',
        targetVersion: '17.2.0-canary.9',
        references: ['https://registry.npmjs.org/next/canary'],
        futureDefaults: [],
      })

      await spawnNextUpgrade(
        '/workspace/app',
        {
          revision: 'latest',
          verbose: false,
          agent: policy,
        },
        null
      )

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
      expect(readFile).toHaveBeenCalledTimes(0)
      expect(writeFile).toHaveBeenCalledTimes(0)
    }
  )

  it('names the stable target in a prerelease latest upgrade handoff', async () => {
    jest.mocked(prepareUpgrade).mockResolvedValue({
      status: 'ready',
      installedVersion: '17.2.0-rc.1',
      targetVersion: '17.2.0',
      references: ['https://registry.npmjs.org/next/latest'],
      futureDefaults: [],
    })

    await spawnNextUpgrade(
      '/workspace/app',
      {
        revision: 'latest',
        verbose: false,
        agent: 'latest',
      },
      null
    )

    const prompt = normalizedBootstrapCalls().flat().join('\n')
    expect(prompt).toContain('from Next.js 17.2.0-rc.1 to 17.2.0')
    expect(prompt).toContain('newer stable Next.js release')
    expect(prompt).toContain('https://registry.npmjs.org/next/latest')
  })

  it('adds the Future Defaults guide after a same-major update', async () => {
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
          isApplicable: jest.fn(() => true),
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

    await spawnNextUpgrade(
      '/workspace/app',
      {
        revision: 'latest',
        verbose: false,
        agent: 'experimental-future',
      },
      null
    )

    expect(crossSpawn).toHaveBeenCalledTimes(1)
    expect(readFile).toHaveBeenCalledTimes(0)
    expect(normalizedFileWriteCalls()).toEqual(normalizedWriteFileCalls())
    expect(normalizedCopiedSources()).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/dist/guides/future-defaults.md'),
      ])
    )

    expect({
      prompt: normalizedBootstrapCalls(),
      savedInstructions: normalizedWriteFileCalls(),
    }).toMatchInlineSnapshot(`
     {
       "prompt": [
         [
           "Read and follow "/tmp/next-upgrade-test/upgrade/shared.md" first. Attempt its applicable duplicate checks before changing files. If a check is unavailable, report it and continue. Stop only if you find equivalent work. Then read and follow every applicable instruction in "/tmp/next-upgrade-test/upgrade/same-major.md".

     We're upgrading the app in "/workspace/app" from Next.js 16.2.0 to 16.4.0 because the Future policy applies the latest stable release and adopts its Future Defaults.

     Follow the user's worktree choice. If they do not specify, use a separate Git worktree when the app is in a Git repository. Run upgrade commands from this app's corresponding directory in that worktree. If the app is not in a Git repository, upgrade it in place.

     Set \`experimental.agentUpgrade\` to "experimental-future" in the app's Next.js config as part of this upgrade. Preserve unrelated configuration. If the target Next.js version does not support this option, skip the setting and report why.

     After completing and verifying the version update, read and follow "/tmp/next-upgrade-test/upgrade/future-defaults.md".
     Adopt these Future Defaults in order:
     - Cache Components
       - Read and follow "/tmp/next-upgrade-test/docs/01-app/02-guides/migrating-to-cache-components.md".
       - Read and follow "/tmp/next-upgrade-test/skills/next-cache-components-adoption/PROMPT.md".
     Complete each adoption. Temporary opt-outs and TODO markers are intermediate work only; do not stop until they are removed and the adoption is fully verified.

     References:
     - https://registry.npmjs.org/next/latest

     When this task ends, report its result once. After completing the requested upgrade and all applicable verification, run \`npx @next/upgrade@<cli-version> internal report-agent-upgrade <run-id> success\`. If the attempted upgrade remains unsuccessful after repairs or verification fails, run \`npx @next/upgrade@<cli-version> internal report-agent-upgrade <run-id> failure\`. If you stop for duplicate work, user cancellation, or an unavailable prerequisite, do not report success or failure. Explain the result to the user separately; never include project details or error text in the telemetry command.",
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

  it('uses only the Future Defaults guide when the version is unchanged', async () => {
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
          isApplicable: jest.fn(() => true),
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

    await spawnNextUpgrade(
      '/workspace/app',
      {
        revision: 'latest',
        verbose: false,
        agent: 'experimental-future',
      },
      null
    )

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
          expect.stringContaining('/dist/guides/future-defaults.md'),
          '/tmp/next-upgrade-test/upgrade/future-defaults.md',
        ],
      ])
    )
    expect(readFile).not.toHaveBeenCalled()
    expect(normalizedFileWriteCalls()).not.toContainEqual([
      '/tmp/next-upgrade-test/upgrade/future-defaults.md',
      expect.anything(),
    ])
    expect(normalizedBootstrapCalls()).toMatchInlineSnapshot(`
     [
       [
         "Read and follow "/tmp/next-upgrade-test/upgrade/shared.md" first. Attempt its applicable duplicate checks before changing files. If a check is unavailable, report it and continue. Stop only if you find equivalent work. Then read and follow every applicable instruction in "/tmp/next-upgrade-test/upgrade/future-defaults.md".

     We're adopting the Future Defaults available to the app in "/workspace/app", which already uses Next.js 16.4.0.

     Follow the user's worktree choice. If they do not specify, use a separate Git worktree when the app is in a Git repository. Run upgrade commands from this app's corresponding directory in that worktree. If the app is not in a Git repository, upgrade it in place.

     Set \`experimental.agentUpgrade\` to "experimental-future" in the app's Next.js config as part of this upgrade. Preserve unrelated configuration. If the target Next.js version does not support this option, skip the setting and report why.

     Adopt these Future Defaults in order:
     - Cache Components
       - Read and follow "/tmp/next-upgrade-test/docs/01-app/02-guides/migrating-to-cache-components.md".
       - Read and follow "/tmp/next-upgrade-test/skills/next-cache-components-adoption/PROMPT.md".
     Complete each adoption. Temporary opt-outs and TODO markers are intermediate work only; do not stop until they are removed and the adoption is fully verified.

     References:
     - https://registry.npmjs.org/next/latest

     When this task ends, report its result once. After completing the requested upgrade and all applicable verification, run \`npx @next/upgrade@<cli-version> internal report-agent-upgrade <run-id> success\`. If the attempted upgrade remains unsuccessful after repairs or verification fails, run \`npx @next/upgrade@<cli-version> internal report-agent-upgrade <run-id> failure\`. If you stop for duplicate work, user cancellation, or an unavailable prerequisite, do not report success or failure. Explain the result to the user separately; never include project details or error text in the telemetry command.",
       ],
     ]
    `)
  })
})

// Preserve the original config and telemetry assertions through the standalone adapters.
jest.mock('../next/config', () => ({
  loadAgentUpgradeConfig: async (directory: string) => {
    const raw = await mockLoadConfig('phase-production-build', directory, {
      rawConfig: true,
    })
    return mockNormalizeConfig(
      'phase-production-build',
      (raw as { default: unknown }).default || raw
    )
  },
}))
jest.mock('../next/telemetry', () => ({
  ...jest.requireActual('../next/telemetry'),
  createTelemetry: (_directory: string, distDir: string) => {
    return new mockTelemetry({ distDir, skipNotify: true })
  },
}))
