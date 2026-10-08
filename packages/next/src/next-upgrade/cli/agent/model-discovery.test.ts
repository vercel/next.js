import * as Log from '../../../build/output/log'
jest.mock('../../../build/output/log', () => ({
  warn: jest.fn(),
  error: jest.fn(),
}))
import { EventEmitter } from 'events'
import { getHarnessModels } from './model-discovery'

jest.mock('next/dist/compiled/cross-spawn', () => jest.fn())
const crossSpawn =
  require('next/dist/compiled/cross-spawn') as typeof import('next/dist/compiled/cross-spawn')

describe('upgrade model discovery protocol', () => {
  const discover = getHarnessModels

  function probe(
    onRequest: (message: any, respond: (value: unknown) => void) => void
  ) {
    const child = Object.assign(new EventEmitter(), {
      stdin: Object.assign(new EventEmitter(), {
        write: jest.fn((line: string) => {
          onRequest(JSON.parse(line), (value) => {
            const json = JSON.stringify(value) + '\n'
            // Exercise both split frames and multiple frames in one chunk.
            child.stdout.emit('data', json.slice(0, 5))
            child.stdout.emit('data', json.slice(5))
          })
        }),
        end: jest.fn(),
      }),
      stdout: Object.assign(new EventEmitter(), { setEncoding: jest.fn() }),
      stderr: new EventEmitter(),
      kill: jest.fn((_signal: string) => {
        process.nextTick(() => child.emit('close', null, 'SIGTERM'))
        return true
      }),
    })
    crossSpawn.mockImplementation(() => {
      process.nextTick(() => child.emit('spawn'))
      return child
    })
    return child
  }

  beforeEach(() => jest.resetAllMocks())
  afterEach(() => jest.useRealTimers())

  it('initializes Codex and follows pagination using opaque model IDs and advertised efforts', async () => {
    const requests: any[] = []
    const child = probe((message, respond) => {
      requests.push(message)
      if (message.method === 'initialize') {
        respond({ method: 'unrelated/notification', params: {} })
        respond({ id: message.id, result: {} })
      } else if (message.method === 'model/list') {
        respond({
          id: message.id,
          result: message.params.cursor
            ? {
                data: [
                  {
                    model: 'new-model',
                    displayName: 'New model',
                    description: 'Useful',
                    isDefault: true,
                    supportedReasoningEfforts: [
                      { reasoningEffort: 'future-effort' },
                    ],
                  },
                ],
                nextCursor: null,
              }
            : {
                data: [
                  { model: 'hidden', hidden: true },
                  {
                    model: 'first',
                    supportedReasoningEfforts: [{ reasoningEffort: 'low' }],
                  },
                ],
                nextCursor: 'page-2',
              },
        })
      }
    })
    expect(await discover('codex', '/agents/codex', '/project')).toEqual([
      {
        id: 'first',
        label: 'first',
        description: '',
        efforts: ['low'],
        isDefault: false,
      },
      {
        id: 'new-model',
        label: 'New model',
        description: 'Useful',
        efforts: ['future-effort'],
        isDefault: true,
      },
    ])
    expect(requests.map((request) => request.method)).toEqual([
      'initialize',
      'initialized',
      'model/list',
      'model/list',
    ])
    expect(requests[3].params).toEqual({
      includeHidden: false,
      cursor: 'page-2',
    })
    expect(crossSpawn).toHaveBeenCalledWith('/agents/codex', ['app-server'], {
      cwd: '/project',
      stdio: 'pipe',
    })
    expect(child.stdin.end).toHaveBeenCalled()
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('reads Claude aliases, descriptions, default choice, and effort capabilities', async () => {
    const child = probe((message, respond) => {
      expect(message.type).toBe('control_request')
      expect(message.request).toEqual({ subtype: 'initialize' })
      respond({ type: 'system', subtype: 'init' })
      respond({
        type: 'control_response',
        response: { request_id: 'unrelated', subtype: 'error' },
      })
      respond({
        type: 'control_response',
        response: {
          request_id: message.request_id,
          subtype: 'success',
          response: {
            models: [
              {
                value: 'default',
                resolvedModel: 'concrete-model',
                displayName: 'Recommended',
                description: 'Latest',
                supportedEffortLevels: ['low', 'high'],
              },
              {
                value: 'haiku',
                supportsEffort: false,
                supportedEffortLevels: ['high'],
              },
              { value: 'older' },
            ],
          },
        },
      })
    })
    expect(await discover('claude', '/agents/claude', '/project')).toEqual([
      {
        id: 'default',
        label: 'Recommended',
        description: 'Latest',
        efforts: ['low', 'high'],
        isDefault: true,
      },
      {
        id: 'haiku',
        label: 'haiku',
        description: '',
        efforts: [],
        isDefault: false,
      },
      {
        id: 'older',
        label: 'older',
        description: '',
        efforts: [],
        isDefault: false,
      },
    ])
    expect(crossSpawn).toHaveBeenCalledWith(
      '/agents/claude',
      [
        '-p',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--verbose',
        '--no-session-persistence',
      ],
      { cwd: '/project', stdio: 'pipe' }
    )
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it.each(['codex', 'claude'] as const)(
    'returns no models for an empty %s catalog',
    async (name) => {
      probe((message, respond) => {
        if (message.method === 'initialize')
          respond({ id: message.id, result: {} })
        if (message.method === 'model/list')
          respond({ id: message.id, result: { data: [] } })
        if (message.type === 'control_request')
          respond({
            type: 'control_response',
            response: {
              request_id: message.request_id,
              subtype: 'success',
              response: { models: [] },
            },
          })
      })
      expect(await discover(name, '/agent', '/project')).toEqual([])
    }
  )

  it.each([
    'malformed JSON',
    'unexpected format',
    'protocol error',
    'repeated cursor',
  ])('handles %s and cleans up', async (failure) => {
    const child = probe((message, respond) => {
      if (message.method === 'initialize') {
        if (failure === 'malformed JSON') child.stdout.emit('data', '{\n')
        else respond({ id: message.id, result: {} })
      } else if (message.method === 'model/list') {
        respond(
          failure === 'protocol error'
            ? { id: message.id, error: { code: -1 } }
            : {
                id: message.id,
                result:
                  failure === 'unexpected format'
                    ? {}
                    : { data: [], nextCursor: 'same' },
              }
        )
      }
    })
    expect(await discover('codex', '/agent', '/project')).toEqual([])
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('handles a Claude initialization error', async () => {
    probe((message, respond) =>
      respond({
        type: 'control_response',
        response: {
          request_id: message.request_id,
          subtype: 'error',
          error: 'private diagnostic',
        },
      })
    )
    expect(await discover('claude', '/agent', '/project')).toEqual([])
  })

  it('handles process and stdin errors without warnings', async () => {
    const child = probe(() => child.stdin.emit('error', new Error('EPIPE')))
    expect(await discover('codex', '/agent', '/project')).toEqual([])
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    child.kill.mockClear()
    const failed = probe(() => failed.emit('error', new Error('ENOENT')))
    expect(await discover('codex', '/agent', '/project')).toEqual([])
    expect(Log.warn).not.toHaveBeenCalled()
    expect(Log.error).not.toHaveBeenCalled()
  })

  it('handles a thrown spawn error and an early process exit', async () => {
    crossSpawn.mockImplementation(() => {
      throw new Error('spawn failed')
    })
    expect(await discover('codex', '/agent', '/project')).toEqual([])
    const child = probe(() => child.emit('close', 1, null))
    expect(await discover('codex', '/agent', '/project')).toEqual([])
  })

  it('bounds output from both stdout and stderr', async () => {
    const child = probe(() => {
      child.stdout.emit('data', ' '.repeat(10 * 1024 * 1024))
      child.stderr.emit('data', Buffer.alloc(11 * 1024 * 1024))
    })
    expect(await discover('codex', '/agent', '/project')).toEqual([])
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('bounds the whole probe and force-kills a process that ignores termination', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] })
    const child = probe(() => {})
    child.kill.mockImplementation((signal) => {
      if (signal === 'SIGKILL')
        process.nextTick(() => child.emit('close', null, signal))
      return true
    })
    const result = discover('codex', '/agent', '/project')
    await new Promise<void>((resolve) => process.nextTick(resolve))
    jest.advanceTimersByTime(5000)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    jest.advanceTimersByTime(250)
    expect(await result).toEqual([])
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    expect(jest.getTimerCount()).toBe(0)
  })

  it('cancels a running probe through its abort signal', async () => {
    const controller = new AbortController()
    const child = probe(() => controller.abort())
    expect(
      await discover('claude', '/agent', '/project', controller.signal)
    ).toBeNull()
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('does not spawn a probe whose signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    expect(
      await discover('codex', '/agent', '/project', controller.signal)
    ).toBeNull()
    expect(crossSpawn).not.toHaveBeenCalled()
  })

  it.each(['SIGINT', 'SIGTERM', 'SIGHUP'] as const)(
    'cancels and removes listeners on %s',
    async (signal) => {
      const initial = process.listenerCount(signal)
      // Jest's process.on is bound to the host process; its copied emitter
      // does not dispatch those listeners through process.emit.
      const child = probe(() => {
        const listener = process.listeners(signal).at(-1)!
        listener(signal)
      })
      expect(await discover('codex', '/agent', '/project')).toBeNull()
      expect(child.kill).toHaveBeenCalledWith('SIGTERM')
      expect(process.listenerCount(signal)).toBe(initial)
    }
  )
})
