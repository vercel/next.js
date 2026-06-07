import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type ServerComponentChangesMessage,
} from 'next/dist/server/dev/hot-reloader-types'
import { TurbopackServerComponentRefresh } from 'next/dist/server/dev/turbopack-server-component-refresh'

const SERVER_COMPONENT_CHANGES: ServerComponentChangesMessage = {
  type: HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
  hash: 'entry-hash',
  refreshScope: { type: 'all' as const },
  renderScope: { type: 'all' as const },
}

function createRefresh() {
  const messages = new Map<string, ServerComponentChangesMessage>()
  const flush = jest.fn()
  const scheduleFlush = jest.fn()
  const onRefreshEnqueued = jest.fn()
  let hash = 0
  const refresh = new TurbopackServerComponentRefresh({
    appDir: '/project/app',
    projectRoot: '/project',
    pageExtensions: ['tsx'],
    nextHash: () => String(++hash),
    enqueue: (id, message) => messages.set(id, message),
    flush,
    scheduleFlush,
    onRefreshEnqueued,
  })

  return {
    refresh,
    messages,
    flush,
    scheduleFlush,
    onRefreshEnqueued,
  }
}

describe('TurbopackServerComponentRefresh', () => {
  it('buffers entry messages and adds the completed target scope', () => {
    const { refresh, messages, scheduleFlush } = createRefresh()

    refresh.startBuild()
    expect(
      refresh.handleUpdate({
        type: 'owners',
        owners: ['app/dashboard/page.tsx'],
      })
    ).toBe(true)
    refresh.handleMessage('app/dashboard/page', {
      ...SERVER_COMPONENT_CHANGES,
      refreshScope: { type: 'routes', routes: ['/dashboard'] },
    })
    expect(messages.size).toBe(0)

    refresh.finishBuild()

    expect([...messages]).toEqual([
      [
        'app/dashboard/page',
        {
          ...SERVER_COMPONENT_CHANGES,
          refreshScope: { type: 'routes', routes: ['/dashboard'] },
          renderScope: {
            type: 'targets',
            targets: ['/dashboard/page'],
          },
        },
      ],
    ])
    expect(scheduleFlush).not.toHaveBeenCalled()
  })

  it('sends one synthetic refresh when the runtime update applies last', () => {
    const { refresh, messages, flush, onRefreshEnqueued } = createRefresh()

    refresh.startBuild()
    refresh.handleUpdate({
      type: 'owners',
      owners: ['app/dashboard/layout.tsx'],
    })
    refresh.finishBuild()
    expect(refresh.handleUpdateApplied()).toBe(true)

    refresh.flushAppliedUpdate()
    refresh.flushAppliedUpdate()

    expect([...messages]).toEqual([
      [
        'server-hmr',
        {
          type: HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
          hash: '1',
          refreshScope: { type: 'all' },
          renderScope: {
            type: 'targets',
            targets: ['/dashboard/layout'],
          },
        },
      ],
    ])
    expect(flush).toHaveBeenCalledTimes(1)
    expect(onRefreshEnqueued).toHaveBeenCalledTimes(1)
  })

  it('falls back to a full refresh for an unclassified update', () => {
    const { refresh, messages } = createRefresh()

    refresh.startBuild()
    expect(refresh.handleUpdate({ type: 'all' })).toBe(true)
    refresh.handleMessage('app/dashboard/page', SERVER_COMPONENT_CHANGES)
    refresh.finishBuild()

    expect([...messages.values()]).toEqual([
      {
        ...SERVER_COMPONENT_CHANGES,
        refreshScope: { type: 'all' },
        renderScope: { type: 'all' },
      },
    ])
  })

  it('ignores updates that do not affect the app-rsc graph', () => {
    const { refresh, messages } = createRefresh()

    refresh.startBuild()
    expect(refresh.handleUpdate({ type: 'unrelated' })).toBe(false)
    refresh.finishBuild()

    expect(messages.size).toBe(0)
  })

  it('emits another refresh when a server update applies after the entry refresh', () => {
    const { refresh, messages, flush } = createRefresh()

    refresh.startBuild()
    refresh.handleUpdate({
      type: 'owners',
      owners: ['app/dashboard/page.tsx'],
    })
    refresh.handleMessage('app/dashboard/page', SERVER_COMPONENT_CHANGES)
    refresh.finishBuild()

    expect(refresh.handleUpdateApplied()).toBe(true)
    refresh.flushAppliedUpdate()

    expect(messages.get('server-hmr')).toEqual({
      type: HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
      hash: '1',
      refreshScope: { type: 'all' },
      renderScope: {
        type: 'targets',
        targets: ['/dashboard/page'],
      },
    })
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('carries an applied update across a newer build', () => {
    const { refresh, messages } = createRefresh()

    refresh.startBuild()
    refresh.handleUpdate({
      type: 'owners',
      owners: ['app/dashboard/layout.tsx'],
    })
    refresh.finishBuild()
    expect(refresh.handleUpdateApplied()).toBe(true)

    refresh.startBuild()
    refresh.finishBuild()

    expect(messages.get('server-hmr')).toEqual({
      type: HMR_MESSAGE_SENT_TO_BROWSER.SERVER_COMPONENT_CHANGES,
      hash: '1',
      refreshScope: { type: 'all' },
      renderScope: {
        type: 'targets',
        targets: ['/dashboard/layout'],
      },
    })
  })
})
