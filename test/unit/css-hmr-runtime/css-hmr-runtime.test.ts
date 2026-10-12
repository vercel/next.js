/** @jest-environment jsdom */

import type {
  ClientOptions,
  WebSocketMessage,
} from '../../../turbopack/crates/turbopack-ecmascript-runtime/js/src/browser/dev/hmr-client/hmr-client'

const listenersGlobal = '__HMR_BASELINE_TEST_LISTENERS'

type HmrClient =
  typeof import('../../../turbopack/crates/turbopack-ecmascript-runtime/js/src/browser/dev/hmr-client/hmr-client')

function setup(initialHmrVersion?: string, greeting?: string) {
  jest.resetModules()
  const client: HmrClient = require('../../../turbopack/crates/turbopack-ecmascript-runtime/js/src/browser/dev/hmr-client/hmr-client')
  let receive!: (message: WebSocketMessage) => void
  const sent: { type: string; path: string; hmrVersion?: string }[] = []
  const callback = jest.fn()
  const hooks = {
    beforeRefresh: jest.fn(),
    refresh: jest.fn(),
    buildOk: jest.fn(),
    issues: jest.fn(),
  }
  client.setHooks(hooks)
  ;(globalThis as any)[listenersGlobal] = [['entry.js', callback]]
  const options: ClientOptions = {
    initialHmrVersion,
    addMessageListener(listener) {
      receive = listener
      if (greeting !== undefined) {
        listener({
          type: 'turbopack-connected',
          data: { hmrVersion: greeting },
        })
      }
    },
    sendMessage: (message) => sent.push(JSON.parse(message)),
    onUpdateError: jest.fn(),
    chunkUpdateListenersGlobal: listenersGlobal,
  }
  client.connect(options)
  return {
    client,
    receive: (message: WebSocketMessage) => receive(message),
    sent,
    options,
    hooks,
    callback,
  }
}

afterEach(() => {
  delete (globalThis as any)[listenersGlobal]
})

describe('initial document HMR baseline', () => {
  it('uses the initial version for listeners registered before the socket greeting', () => {
    const { receive, sent, hooks } = setup('3')
    expect(sent).toEqual([
      { type: 'turbopack-subscribe', path: 'entry.js', hmrVersion: '3' },
    ])
    receive({ type: 'turbopack-connected', data: { hmrVersion: '4' } })
    expect(sent[1].hmrVersion).toBe('3')
    for (const hook of Object.values(hooks)) expect(hook).not.toHaveBeenCalled()
  })

  it('keeps the HTML fallback when a newer greeting is synchronously replayed', () => {
    const { sent } = setup('3', '4')
    expect(sent[0].hmrVersion).toBe('3')
  })

  it('subscribes without manufacturing a mismatch when HTML and greeting match', () => {
    const { sent } = setup('0', '0')
    expect(sent[0].hmrVersion).toBe('0')
  })

  it('retains the connection baseline for documents without the marker', () => {
    const { sent, receive } = setup()
    expect(sent[0].hmrVersion).toBeUndefined()
    receive({ type: 'turbopack-connected', data: { hmrVersion: '4' } })
    expect(sent[1].hmrVersion).toBe('4')
    receive({ type: 'turbopack-connected', data: { hmrVersion: '5' } })
    expect(sent[2].hmrVersion).toBe('4')
  })

  it('retains a previously observed socket version across reconnections', () => {
    const { sent, receive } = setup('3', '3')
    receive({ type: 'server-component-changes', hmrVersion: '4' })
    receive({ type: 'turbopack-connected', data: { hmrVersion: '5' } })
    expect(sent[sent.length - 1].hmrVersion).toBe('4')
  })

  it('does not reset observed state to the HTML fallback if connect is called again', () => {
    const { client, sent, receive, options } = setup('3', '3')
    receive({ type: 'server-component-changes', hmrVersion: '4' })
    ;(globalThis as any)[listenersGlobal] = [['another-entry.js', jest.fn()]]
    client.connect(options)
    expect(sent[sent.length - 1].hmrVersion).toBe('4')
  })

  it('still forwards issue messages without treating initialization as a successful refresh', () => {
    const { receive, hooks } = setup('3', '3')
    receive({
      type: 'turbopack-message',
      hmrVersion: '3',
      data: {
        type: 'issues',
        resource: { path: 'entry.js' },
        issues: [{ severity: 'error', title: 'Compilation failed' }],
      },
    })
    expect(hooks.issues).toHaveBeenCalled()
    expect(hooks.buildOk).not.toHaveBeenCalled()
    expect(hooks.beforeRefresh).not.toHaveBeenCalled()
    expect(hooks.refresh).not.toHaveBeenCalled()
  })
})
