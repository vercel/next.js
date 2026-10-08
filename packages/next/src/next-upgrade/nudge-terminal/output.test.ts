import { ChildProcess } from 'child_process'
import { PassThrough } from 'stream'
import { warn } from '../../build/output/log'
import { Telemetry } from '../../telemetry/storage'
import { nudgeUpgrade } from '../nudge'
import {
  closedUpgradeMenu,
  createPromptOutput,
  drainPromptOutput,
  flushUpgradeTelemetry,
  reassertRawMode,
  showUpgradeMenu,
} from './output'

jest.mock('../../build/output/log', () => ({ warn: jest.fn() }))
jest.mock('../nudge', () => ({ nudgeUpgrade: jest.fn() }))
jest.mock('../../telemetry/storage', () => ({
  Telemetry: jest.fn(() => ({ flush: jest.fn().mockResolvedValue(undefined) })),
}))

// Exercise pipe output directly; terminal input and child lifecycles have their own suites.
describe('upgrade prompt output', () => {
  let child: ChildProcess
  let writes: Array<['stdout' | 'stderr', string | Uint8Array]>

  beforeEach(() => {
    jest.clearAllMocks()
    child = Object.assign(new ChildProcess(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    })
    writes = []
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(['stdout', chunk])
      return true
    })
    jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      writes.push(['stderr', chunk])
      return true
    })
  })

  afterEach(() => {
    child.stdout?.destroy()
    child.stderr?.destroy()
    jest.restoreAllMocks()
  })

  it('releases held stdout and stderr in order and resumes forwarding', () => {
    const output = createPromptOutput()
    output.attach(child)
    const before = Buffer.from('before')
    const heldError = Buffer.from('held error')
    const heldOutput = Buffer.from('held output')
    const after = Buffer.from('after')
    child.stdout!.emit('data', before)
    output.hold()
    child.stderr!.emit('data', heldError)
    child.stdout!.emit('data', heldOutput)
    expect(writes).toEqual([['stdout', before]])
    output.release()
    child.stderr!.emit('data', after)
    output.release()
    expect(writes).toEqual([
      ['stdout', before],
      ['stderr', heldError],
      ['stdout', heldOutput],
      ['stderr', after],
    ])
  })

  it('drops older chunks when the retained output exceeds the limit', () => {
    const output = createPromptOutput()
    output.attach(child)
    output.hold()
    const old = Buffer.alloc(6 * 1024 * 1024)
    const recent = Buffer.alloc(6 * 1024 * 1024)
    child.stdout!.emit('data', old)
    child.stderr!.emit('data', recent)
    output.release()
    expect(writes).toHaveLength(1)
    expect(writes[0][0]).toBe('stderr')
    expect(writes[0][1]).toBe(recent)
    expect(warn).toHaveBeenCalledWith(
      `${old.length} bytes of earlier output were dropped while the upgrade menu was open.`
    )
  })

  it('retains a single oversized chunk', () => {
    const output = createPromptOutput()
    output.attach(child)
    output.hold()
    const chunk = Buffer.alloc(11 * 1024 * 1024)
    child.stdout!.emit('data', chunk)
    output.release()
    expect(writes).toHaveLength(1)
    expect(writes[0][0]).toBe('stdout')
    expect(writes[0][1]).toBe(chunk)
    expect(warn).not.toHaveBeenCalled()
  })

  it('discards held and subsequent output after choosing upgrade', () => {
    const output = createPromptOutput()
    output.attach(child)
    output.hold()
    child.stdout!.emit('data', Buffer.from('held'))
    output.discard()
    child.stderr!.emit('data', Buffer.from('stopping'))
    expect(writes).toEqual([])
  })

  it('drains until close and bounds a pipe kept open by a descendant', async () => {
    const closed = drainPromptOutput(child)
    child.emit('close')
    await closed
    const open = drainPromptOutput(child)
    await open
    child.stdout!.destroy()
    child.stderr!.destroy()
    await drainPromptOutput(child)
  })

  it('reasserts raw mode after a child resets the terminal', () => {
    const descriptor = Object.getOwnPropertyDescriptor(process, 'stdin')!
    const setRawMode = jest.fn()
    try {
      Object.defineProperty(process, 'stdin', {
        configurable: true,
        value: { isTTY: true, isRaw: true, setRawMode },
      })
      reassertRawMode()
      expect(setRawMode.mock.calls).toEqual([[false], [true]])
    } finally {
      Object.defineProperty(process, 'stdin', descriptor)
    }
  })

  it.each(['skip', 'update', 'interrupt'] as const)(
    'holds on render and hands the %s decision back without waiting for telemetry',
    async (action) => {
      const output = createPromptOutput()
      const hold = jest.spyOn(output, 'hold')
      const release = jest.spyOn(output, 'release')
      jest.mocked(nudgeUpgrade).mockImplementation(async (...args) => {
        args[5]!.onNudgeId!('nudge-id')
        return action
      })
      await expect(
        showUpgradeMenu(output, {
          dir: '/app',
          context: {
            distDir: '.next',
            cacheComponents: false,
            configuredPolicy: 'security',
            experimental: { agentUpgrade: 'security' },
          },
          command: 'build',
          signal: new AbortController().signal,
          initialAssessment: null,
          telemetryDisabled: undefined,
        })
      ).resolves.toEqual(
        action === 'update'
          ? { policy: 'security', nudgeId: 'nudge-id' }
          : action === 'interrupt'
            ? 'interrupt'
            : null
      )
      expect(hold).toHaveBeenCalledTimes(1)
      expect(release).toHaveBeenCalledTimes(action === 'update' ? 0 : 1)
      expect(
        jest.mocked(Telemetry).mock.results[0].value.flush
      ).toHaveBeenCalledTimes(1)
    }
  )

  it('bounds waiting for a stalled menu and telemetry flush', async () => {
    const pending = new Promise<void>(() => {})
    jest
      .mocked(Telemetry)
      .mockImplementationOnce(
        () => ({ flush: () => pending }) as unknown as Telemetry
      )
    jest.mocked(nudgeUpgrade).mockResolvedValue('skip')
    await showUpgradeMenu(createPromptOutput(), {
      dir: '/app',
      context: {
        distDir: '.next',
        cacheComponents: false,
        configuredPolicy: 'security',
        experimental: { agentUpgrade: 'security' },
      },
      command: 'dev',
      signal: new AbortController().signal,
      initialAssessment: null,
      telemetryDisabled: undefined,
    })
    const waiting = Promise.all([
      closedUpgradeMenu(pending),
      flushUpgradeTelemetry(),
    ])
    await waiting
  })
})
