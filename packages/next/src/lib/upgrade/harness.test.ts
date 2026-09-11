import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import spawn from 'next/dist/compiled/cross-spawn'
import { launchHarness, selectHarness } from './harness'

jest.mock('next/dist/compiled/cross-spawn', () => ({
  __esModule: true,
  default: jest.fn(),
}))

describe('upgrade harness', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    jest.resetAllMocks()
    jest.useRealTimers()
  })
  it.each(['codex', 'claude', 'claude-code'])(
    'returns work to active %s even with no binary on PATH',
    (active) => {
      expect(selectHarness(active, [], false).kind).toBe('handoff')
    }
  )
  it('launches the sole harness and only offers a chooser in a terminal', () => {
    expect(selectHarness(null, ['codex'], false)).toEqual({
      kind: 'launch',
      harness: 'codex',
    })
    expect(selectHarness(null, ['codex', 'claude'], true).kind).toBe('choose')
    expect(selectHarness(null, ['codex', 'claude'], false).kind).toBe(
      'fallback'
    )
    expect(selectHarness(null, [], true).kind).toBe('fallback')
    expect(selectHarness('unsupported-agent', ['codex'], true).kind).toBe(
      'fallback'
    )
  })
  it.each([0, 7])(
    'formats the Claude receipt without hiding exit code %i',
    async (exitCode) => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {})
      const on = jest.spyOn(process, 'on')
      const removeListener = jest.spyOn(process, 'removeListener')
      const child = Object.assign(new EventEmitter(), {
        kill: jest.fn(),
        stdout: new PassThrough(),
      })
      jest
        .mocked(spawn)
        .mockReturnValue(child as unknown as ReturnType<typeof spawn>)
      const result = launchHarness(
        'claude',
        'Read /tmp/run/security-upgrade.md',
        '/app'
      )
      expect(spawn).toHaveBeenCalledWith(
        'claude',
        [
          '--bg',
          '--model',
          'claude-haiku-4-5',
          'Read /tmp/run/security-upgrade.md',
        ],
        {
          cwd: '/app',
          stdio: ['inherit', 'pipe', 'inherit'],
        }
      )
      child.stdout.write('backgrounded · a8e2d191\n  clau')
      child.stdout.write('de stop a8e2d191\n  claude attach a8e2d191\n')
      child.stdout.end('  claude logs a8e2d191\n  claude agents\n')
      const onTerminate = on.mock.calls.find(
        ([signal]) => signal === 'SIGTERM'
      )?.[1]
      expect(onTerminate).toBeDefined()
      onTerminate!()
      expect(child.kill).toHaveBeenCalledWith('SIGTERM')
      child.emit('close', exitCode, null)
      await expect(result).resolves.toBe(exitCode)
      const output = log.mock.calls.map(([line]) => line).join('\n')
      const command = process.platform === 'win32' ? 'claude' : 'command claude'
      expect(output).toContain(`${command} stop a8e2d191`)
      expect(output).toContain(`${command} attach a8e2d191`)
      expect(output).toContain(`${command} logs a8e2d191`)
      if (exitCode === 0) {
        expect(output).toContain('running in background')
        expect(output).toContain('a8e2d191')
        expect(output).not.toContain('backgrounded ·')
      } else {
        expect(output).toContain('backgrounded · a8e2d191')
        expect(output).not.toContain('running in background')
      }
      expect(removeListener).toHaveBeenCalledWith('SIGTERM', onTerminate)
    }
  )
  it('propagates launch failures', async () => {
    const child = new EventEmitter()
    jest
      .mocked(spawn)
      .mockReturnValue(child as unknown as ReturnType<typeof spawn>)
    const result = launchHarness('claude', 'prompt', '/app')
    child.emit('error', new Error('ENOENT'))
    await expect(result).rejects.toThrow('ENOENT')
  })
})
