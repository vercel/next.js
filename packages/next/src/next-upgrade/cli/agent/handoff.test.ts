import { ChildProcess } from 'child_process'
import { access, stat } from 'fs/promises'
import cliSelect from 'next/dist/compiled/cli-select'
import { resolve as resolvePath } from 'path'
import * as Log from '../../../build/output/log'
import { getAgentName } from '../../../telemetry/agent-name'
import { handoffUpgrade } from './handoff'
import { getHarnessModels } from './model-discovery'

jest.mock('fs/promises', () => ({ access: jest.fn(), stat: jest.fn() }))
jest.mock('../../../build/output/log', () => ({
  bootstrap: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}))
jest.mock('../../../telemetry/agent-name', () => ({ getAgentName: jest.fn() }))
jest.mock('next/dist/compiled/cli-select', () => ({
  __esModule: true,
  default: jest.fn(),
}))
jest.mock('next/dist/compiled/cross-spawn', () =>
  Object.assign(jest.fn(), { sync: jest.fn() })
)
jest.mock('../../../lib/picocolors', () => ({
  bold: (text: string) => text,
  cyan: (text: string) => text,
  dim: (text: string) => text,
}))
jest.mock('./model-discovery', () => ({ getHarnessModels: jest.fn() }))
const crossSpawn = jest.mocked(
  require('next/dist/compiled/cross-spawn') as typeof import('next/dist/compiled/cross-spawn')
)
// Use the promise overload; handoff only consumes the selected id.
const select = jest.mocked(
  cliSelect as (
    options: Parameters<typeof cliSelect>[0]
  ) => Promise<{ id: string | number }>
)
const restoreDescriptors: Array<() => void> = []
function expectedHarnessPath(name: string): string {
  const extension =
    process.platform === 'win32'
      ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
          .split(';')
          .filter(Boolean)[0]
      : ''
  return resolvePath('/agents', `${name}${extension}`)
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

describe('agent upgrade handoff', () => {
  const originalPath = process.env.PATH
  const originalExitCode = process.exitCode
  beforeEach(() => {
    jest.resetAllMocks()
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
      signal: null,
      pid: 1,
      output: [],
      stderr: Buffer.alloc(0),
      stdout:
        '  --approve-for-me  Route approval requests through automatic review\n  --permission-mode <mode>  Permission mode to use for the session\n                                        (choices: "acceptEdits", "auto", "manual")',
    })
    jest.mocked(getAgentName).mockResolvedValue('codex')
    process.exitCode = undefined
  })
  afterEach(() => {
    if (originalPath === undefined) {
      delete process.env.PATH
    } else {
      process.env.PATH = originalPath
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
        .mockResolvedValueOnce({ id: agent })
        .mockResolvedValueOnce({ id: model })
        .mockResolvedValueOnce({ id: effort })
        .mockResolvedValueOnce({ id: 'yes' })
        .mockResolvedValueOnce({ id: 'no' })
      crossSpawn.mockImplementation(() => {
        const child = new ChildProcess()
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
      .mockResolvedValueOnce({ id: 'codex' })
      .mockResolvedValueOnce({ id: 'gpt-5.6-terra' })
      .mockResolvedValueOnce({ id: 'default' })
      .mockResolvedValueOnce({ id: 'yes' })
      .mockResolvedValueOnce({ id: 'no' })
    crossSpawn.mockImplementation(() => {
      const child = new ChildProcess()
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
      const child = new ChildProcess()
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
        const child = new ChildProcess()
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
      const child = new ChildProcess()
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
      const child = new ChildProcess()
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
      .mockResolvedValueOnce({ id: agent })
      .mockResolvedValueOnce({
        id: agent === 'codex' ? 'gpt-5.6-terra' : 'opus',
      } as never)
      .mockResolvedValueOnce({ id: 'high' })
      .mockResolvedValueOnce({ id: useAuto })
      .mockResolvedValueOnce({ id: 'no' })
    crossSpawn.mockImplementation(() => {
      const child = new ChildProcess()
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
      return {
        status: 0,
        signal: null,
        pid: 1,
        output: [],
        stderr: Buffer.alloc(0),
        stdout: '  --ask-for-approval <APPROVAL_POLICY>',
      }
    })
    select
      .mockResolvedValueOnce({ id: 'codex' })
      .mockResolvedValueOnce({ id: 'gpt-5.6-terra' })
      .mockResolvedValueOnce({ id: 'high' })
      .mockResolvedValueOnce({ id: 'no' })
    crossSpawn.mockImplementation(() => {
      const child = new ChildProcess()
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
      signal: null,
      pid: 1,
      output: [],
      stderr: Buffer.alloc(0),
      stdout:
        '  --permission-mode <mode>  Permission mode to use for the session\n                                        (choices: "default", "acceptEdits", "plan", "dontAsk", "bypassPermissions")',
    })
    select
      .mockResolvedValueOnce({ id: 'claude' })
      .mockResolvedValueOnce({ id: 'opus' })
      .mockResolvedValueOnce({ id: 'high' })
      .mockResolvedValueOnce({ id: 'no' })
    crossSpawn.mockImplementation(() => {
      const child = new ChildProcess()
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
      .mockResolvedValueOnce({ id: 'codex' })
      .mockResolvedValueOnce({ id: 'gpt-5.6-terra' })
      .mockResolvedValueOnce({ id: 'high' })
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
      const child = new ChildProcess()
      process.nextTick(() => child.emit('close', 0, null))
      return child
    })

    await handoffUpgrade('Upgrade prompt', '/workspace/app', null)

    expect(jest.mocked(getHarnessModels).mock.calls).toHaveLength(2)
    expect(
      crossSpawn.sync.mock.calls.filter(([, args]) => args?.[0] === '--help')
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
      const child = new ChildProcess()
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
      const child = new ChildProcess()
      process.nextTick(() => child.emit('close', 0, null))
      return child
    })

    await handoffUpgrade('Upgrade prompt', '/workspace/app', null)

    expect(
      crossSpawn.sync.mock.calls.filter(([, args]) => args?.[0] === '--help')
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
      return {
        status: 0,
        signal: null,
        pid: 1,
        output: [],
        stderr: Buffer.alloc(0),
        stdout: '  --ask-for-approval <APPROVAL_POLICY>',
      }
    })
    select
      .mockResolvedValueOnce({ id: 'codex' })
      .mockResolvedValueOnce({ id: 'gpt-5.6-terra' })
      .mockResolvedValueOnce({ id: 'high' })
      .mockRejectedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'max' })
      .mockResolvedValueOnce({ id: 'no' })
    crossSpawn.mockImplementation(() => {
      const child = new ChildProcess()
      process.nextTick(() => child.emit('close', 0, null))
      return child
    })

    await handoffUpgrade('Upgrade prompt', '/workspace/app', null)

    expect(
      crossSpawn.sync.mock.calls.filter(([, args]) => args?.[0] === '--help')
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
      return {
        status: 0,
        signal: null,
        pid: 1,
        output: [],
        stderr: Buffer.alloc(0),
        stdout: '  --approve-for-me',
      }
    })
    select
      .mockResolvedValueOnce({ id: 'codex' })
      .mockResolvedValueOnce({ id: 'gpt-5.6-terra' })
      .mockResolvedValueOnce({ id: 'high' })
      .mockResolvedValueOnce({ id: 'yes' })
      .mockResolvedValueOnce({ id: 'yes' })
    crossSpawn.mockImplementation(() => {
      const child = new ChildProcess()
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
})
