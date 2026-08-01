import { join } from 'node:path'
import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import type { Project } from '../../../build/swc/types'
import { registerEditTransactionTools } from './edit-transaction'

type ToolResult = {
  isError?: boolean
  content: Array<{ type: 'text'; text: string }>
}
type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>

function setup() {
  const handlers = new Map<string, ToolHandler>()
  const server = {
    registerTool(name: string, _definition: unknown, handler: ToolHandler) {
      handlers.set(name, handler)
    },
  } as unknown as McpServer
  let nextNativeToken = 1
  const project = {
    beginEditTransaction: jest.fn(async () => nextNativeToken++),
    renewEditTransaction: jest.fn(async () => true),
    endEditTransaction: jest.fn(async () => ({
      accepted: true,
      flushed: true,
    })),
  } as unknown as Project

  registerEditTransactionTools(
    server,
    '/repo/project',
    '/repo',
    {
      appDir: '/repo/project/app',
      pagesDir: '/repo/project/pages',
      pageExtensions: ['js', 'jsx', 'ts', 'tsx'],
    },
    () => project
  )

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await handlers.get(name)!(args)
    return {
      isError: result.isError === true,
      value: JSON.parse(result.content[0].text),
    }
  }

  return { call, project }
}

describe('MCP edit transaction tools', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it('keeps leases independent of wall-clock adjustments', async () => {
    jest.useFakeTimers({ now: 1_000_000 })
    const { call } = setup()
    const started = await call('begin_edit_transaction', {
      changedPaths: ['app/component.tsx'],
    })
    expect(started.value.leaseMs).toBe(4_000)
    expect(started.value.maximumDurationMs).toBe(60_000)

    // System time can jump independently of the monotonic timer used by both lease cleanup and the
    // native watcher. Neither direction may expire or extend this transaction.
    jest.setSystemTime(1)
    const afterBackwardJump = await call('renew_edit_transaction', {
      token: started.value.token,
    })
    expect(afterBackwardJump.value.status).toBe('renewed')
    expect(afterBackwardJump.value.leaseMs).toBe(4_000)

    jest.setSystemTime(10_000_000)
    const afterForwardJump = await call('renew_edit_transaction', {
      token: started.value.token,
    })
    expect(afterForwardJump.value.status).toBe('renewed')
    expect(afterForwardJump.value.leaseMs).toBe(4_000)
    await call('end_edit_transaction', { token: started.value.token })
  })

  it('enforces the active-token limit without wall-clock timing', async () => {
    const { call } = setup()
    const accepted = []
    for (let index = 0; index < 32; index++) {
      const result = await call('begin_edit_transaction', {
        changedPaths: ['app/component.tsx'],
      })
      expect(result.isError).toBe(false)
      accepted.push(result.value.token as string)
    }

    const rejected = await call('begin_edit_transaction', {
      changedPaths: ['app/component.tsx'],
    })
    expect(rejected.isError).toBe(true)
    expect(rejected.value.error).toContain(
      'Too many active edit transactions (limit 32)'
    )

    for (const token of accepted) {
      await call('end_edit_transaction', { token })
    }
  })

  it('submits abandoned changed paths without later tool traffic', async () => {
    jest.useFakeTimers({ now: 1_000_000 })
    const { call, project } = setup()
    const changedPaths = ['app/new-component', 'app/new-component/value.ts']
    const abandoned = await call('begin_edit_transaction', { changedPaths })
    expect(abandoned.isError).toBe(false)

    // No intervening tool call drives cleanup. The conservative JavaScript lease timer settles the
    // native token with its authoritative paths and retains only an opaque expired marker.
    jest.advanceTimersByTime(4_000)
    await Promise.resolve()
    await Promise.resolve()
    expect(project.endEditTransaction).toHaveBeenCalledWith(1, [
      join('project', 'app', 'new-component'),
      join('project', 'app', 'new-component', 'value.ts'),
    ])

    const lateEnd = await call('end_edit_transaction', {
      token: abandoned.value.token,
    })
    expect(lateEnd.value.status).toBe('expired')
    expect(project.endEditTransaction).toHaveBeenCalledTimes(1)
  })

  it('retains the changed-path budget until the shared native batch flushes', async () => {
    const { call, project } = setup()
    const largeChangedPathSet = (prefix: string) =>
      Array.from(
        { length: 160 },
        (_, index) => `${prefix}/${index}-${'x'.repeat(3_900)}`
      )
    const anchor = await call('begin_edit_transaction', { changedPaths: [] })
    const first = await call('begin_edit_transaction', {
      changedPaths: largeChangedPathSet('app/first'),
    })
    ;(project.endEditTransaction as jest.Mock).mockResolvedValueOnce({
      accepted: true,
      flushed: false,
    })
    expect(
      (await call('end_edit_transaction', { token: first.value.token })).value
        .status
    ).toBe('held_by_other_transaction')

    const bounded = await call('begin_edit_transaction', {
      changedPaths: largeChangedPathSet('app/second'),
    })
    expect(bounded.isError).toBe(true)
    expect(bounded.value.error).toContain(
      'Too much retained changed-path data (limit 1048576 characters)'
    )

    expect(
      (await call('end_edit_transaction', { token: anchor.value.token })).value
        .status
    ).toBe('flushed')
    const afterFlush = await call('begin_edit_transaction', {
      changedPaths: largeChangedPathSet('app/second'),
    })
    expect(afterFlush.isError).toBe(false)
    await call('end_edit_transaction', { token: afterFlush.value.token })
  })

  it('keeps batch accounting when a rejected end did not flush', async () => {
    jest.useFakeTimers({ now: 1_000_000 })
    const monotonicNow = jest.spyOn(performance, 'now').mockReturnValue(0)
    const { call, project } = setup()
    const largeChangedPathSet = (prefix: string) =>
      Array.from(
        { length: 160 },
        (_, index) => `${prefix}/${index}-${'x'.repeat(3_900)}`
      )
    const older = await call('begin_edit_transaction', {
      changedPaths: largeChangedPathSet('app/older'),
    })
    monotonicNow.mockReturnValue(1_000)
    await call('begin_edit_transaction', { changedPaths: [] })
    ;(project.endEditTransaction as jest.Mock)
      .mockResolvedValueOnce({ accepted: false, flushed: false })
      .mockRejectedValueOnce(new Error('newer native token still held'))

    // Simulate an event-loop stall past both conservative JavaScript leases. Native time can still
    // have the newer token active when the older rejected end is acknowledged.
    monotonicNow.mockReturnValue(5_000)
    const bounded = await call('begin_edit_transaction', {
      changedPaths: largeChangedPathSet('app/new'),
    })
    expect(bounded.isError).toBe(true)
    expect(bounded.value.error).toContain(
      'Too much retained changed-path data (limit 1048576 characters)'
    )
    expect(project.endEditTransaction).toHaveBeenCalledTimes(2)
    expect(
      (await call('end_edit_transaction', { token: older.value.token })).value
        .status
    ).toBe('expired')
  })

  it('releases batch accounting when a rejected final end still flushed', async () => {
    jest.useFakeTimers({ now: 1_000_000 })
    const monotonicNow = jest.spyOn(performance, 'now').mockReturnValue(0)
    const { call, project } = setup()
    const largeChangedPathSet = (prefix: string) =>
      Array.from(
        { length: 160 },
        (_, index) => `${prefix}/${index}-${'x'.repeat(3_900)}`
      )
    await call('begin_edit_transaction', {
      changedPaths: largeChangedPathSet('app/expired'),
    })
    ;(project.endEditTransaction as jest.Mock).mockResolvedValueOnce({
      accepted: false,
      flushed: true,
    })

    // The token expired during an event-loop stall, but native settlement was still the final
    // flush. That independent flush bit must release the shared changed-path budget immediately.
    monotonicNow.mockReturnValue(5_000)
    const afterFlush = await call('begin_edit_transaction', {
      changedPaths: largeChangedPathSet('app/after-flush'),
    })
    expect(afterFlush.isError).toBe(false)
    expect(project.endEditTransaction).toHaveBeenCalledTimes(1)

    await call('end_edit_transaction', { token: afterFlush.value.token })
  })

  it('reclaims stale batch accounting after failed settlement ages out', async () => {
    jest.useFakeTimers({ now: 1_000_000 })
    const { call, project } = setup()
    const largeChangedPathSet = (prefix: string) =>
      Array.from(
        { length: 160 },
        (_, index) => `${prefix}/${index}-${'x'.repeat(3_900)}`
      )
    ;(project.endEditTransaction as jest.Mock).mockRejectedValueOnce(
      new Error('native settlement failed')
    )
    const abandoned = await call('begin_edit_transaction', {
      changedPaths: largeChangedPathSet('app/abandoned'),
    })

    jest.advanceTimersByTime(4_000)
    await Promise.resolve()
    await Promise.resolve()
    const bounded = await call('begin_edit_transaction', {
      changedPaths: largeChangedPathSet('app/bounded'),
    })
    expect(bounded.isError).toBe(true)

    // The recovery payload remains available for a late end for 60 seconds. Once it ages out, the
    // shared native maximum has also elapsed, so stale accounting must not wedge future begins.
    jest.advanceTimersByTime(60_000)
    const reclaimed = await call('begin_edit_transaction', {
      changedPaths: largeChangedPathSet('app/reclaimed'),
    })
    expect(reclaimed.isError).toBe(false)
    expect(
      (await call('end_edit_transaction', { token: abandoned.value.token }))
        .value.status
    ).toBe('unknown')
    await call('end_edit_transaction', { token: reclaimed.value.token })
  })

  it('serializes timer cleanup behind an in-flight native renewal', async () => {
    jest.useFakeTimers({ now: 1_000_000 })
    const { call, project } = setup()
    let finishRenewal: ((renewed: boolean) => void) | undefined
    ;(project.renewEditTransaction as jest.Mock).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishRenewal = resolve
        })
    )
    const started = await call('begin_edit_transaction', {
      changedPaths: ['app/component.tsx'],
    })

    jest.advanceTimersByTime(3_000)
    const renewal = call('renew_edit_transaction', {
      token: started.value.token,
    })
    await Promise.resolve()
    await Promise.resolve()
    jest.advanceTimersByTime(1_000)
    finishRenewal!(true)
    expect((await renewal).value.status).toBe('renewed')

    // Cleanup fired at the old four-second deadline while native renewal was pending. It must run
    // after renewal and observe the extended lease, rather than moving the token to the expired map.
    const stillActive = await call('renew_edit_transaction', {
      token: started.value.token,
    })
    expect(stillActive.value.status).toBe('renewed')
    await call('end_edit_transaction', { token: started.value.token })
  })

  it('caps cumulative renewals at the advertised maximum duration', async () => {
    jest.useFakeTimers({ now: 1_000_000 })
    const { call, project } = setup()
    const started = await call('begin_edit_transaction', {
      changedPaths: ['app/component.tsx'],
    })
    expect(started.value.maximumDurationMs).toBe(60_000)

    for (let renewal = 0; renewal < 19; renewal++) {
      jest.advanceTimersByTime(3_000)
      const result = await call('renew_edit_transaction', {
        token: started.value.token,
      })
      expect(result.value.status).toBe('renewed')
    }

    const rotated = await call('begin_edit_transaction', {
      changedPaths: ['app/another.ts'],
    })
    expect(rotated.value.maximumDurationMs).toBe(3_000)

    jest.advanceTimersByTime(3_000)
    for (const token of [started.value.token, rotated.value.token]) {
      const expired = await call('renew_edit_transaction', { token })
      expect(expired.value.status).toBe('expired')
    }
    expect(project.renewEditTransaction).toHaveBeenCalledTimes(19)
  })

  it('rejects paths controlled by independent dev-server watchers before begin', async () => {
    const { call, project } = setup()
    for (const changedPath of [
      '.env.local',
      'tsconfig.json',
      'jsconfig.json',
      'next.config.js',
      'app/page.tsx',
      'app/api/route.ts',
      'app/layout.tsx',
      'app/icon.tsx',
      'pages/index.tsx',
      'middleware.ts',
      'src/instrumentation.ts',
    ]) {
      const result = await call('begin_edit_transaction', {
        changedPaths: [changedPath],
      })
      expect(result.isError).toBe(true)
      expect(result.value.error).toContain(
        'watched outside the Turbopack source transaction'
      )
    }
    expect(project.beginEditTransaction).not.toHaveBeenCalled()
  })

  it('submits the changed paths declared before editing', async () => {
    const { call, project } = setup()
    const started = await call('begin_edit_transaction', {
      changedPaths: ['app/new-component', 'app/new-component/value.ts'],
    })
    const ended = await call('end_edit_transaction', {
      token: started.value.token,
    })

    expect(ended.value.status).toBe('flushed')
    expect(project.endEditTransaction).toHaveBeenCalledWith(1, [
      join('project', 'app', 'new-component'),
      join('project', 'app', 'new-component', 'value.ts'),
    ])
  })
})
