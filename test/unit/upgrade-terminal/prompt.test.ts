import { PassThrough } from 'stream'
import { promptUpgrade } from 'next/dist/lib/upgrade/prompt'

describe('upgrade menu', () => {
  const stdin = Object.getOwnPropertyDescriptor(process, 'stdin')!
  const columns = Object.getOwnPropertyDescriptor(process.stdout, 'columns')
  const rows = Object.getOwnPropertyDescriptor(process.stdout, 'rows')
  let input: PassThrough & { isRaw: boolean; setRawMode: jest.Mock }
  let screen: string

  beforeEach(() => {
    Object.defineProperties(process.stdout, {
      columns: { configurable: true, writable: true, value: 80 },
      rows: { configurable: true, writable: true, value: 24 },
    })
    input = Object.assign(new PassThrough(), {
      isRaw: false,
      setRawMode: jest.fn(),
    })
    input.pause()
    Object.defineProperty(process, 'stdin', {
      configurable: true,
      value: input,
    })
    screen = ''
    jest.spyOn(process.stdout, 'write').mockImplementation((data: any) => {
      screen += data.toString()
      return true
    })
  })
  afterEach(() => {
    for (const [name, descriptor] of [
      ['columns', columns],
      ['rows', rows],
    ] as const) {
      if (descriptor) {
        Object.defineProperty(process.stdout, name, descriptor)
      } else {
        Reflect.deleteProperty(process.stdout, name)
      }
    }
    input.destroy()
    Object.defineProperty(process, 'stdin', stdin)
    jest.restoreAllMocks()
  })

  it.each([
    ['update', 0],
    ['skip', 1],
    ['dismiss', 2],
  ] as const)('returns %s and restores the terminal', async (action, down) => {
    const exits = process.listenerCount('exit')
    const resizes = process.stdout.listenerCount('resize')
    const pending = promptUpgrade(
      'Shared recommendation',
      new AbortController().signal
    )
    expect(screen.startsWith('\x1b[?1049h')).toBe(true)
    for (let i = 0; i < down; i++) {
      input.emit('keypress', '', { name: 'down' })
    }
    input.emit('keypress', '', { name: 'return' })
    await expect(pending).resolves.toBe(action)
    expect(screen).toContain('Shared recommendation')
    expect(screen).not.toContain('press Enter')
    expect(screen.endsWith('\x1b[?1049l\x1b[?25h')).toBe(true)
    expect(input.setRawMode.mock.calls).toEqual([[true], [false]])
    expect(input.listenerCount('keypress')).toBe(0)
    expect(input.isPaused()).toBe(true)
    expect(process.listenerCount('exit')).toBe(exits)
    expect(process.stdout.listenerCount('resize')).toBe(resizes)
  })

  it.each([
    { columns: 20, rows: 24, message: 'Narrow terminal' },
    { columns: 80, rows: 4, message: 'Short terminal' },
    { columns: 80, rows: 24, message: 'A future default\n'.repeat(40) },
    { columns: 30, rows: 10, message: '界'.repeat(90) },
    { columns: 0, rows: 0, message: 'Unknown terminal size' },
  ])(
    'keeps the complete reminder and waits for a choice ($columns × $rows)',
    async (size) => {
      process.stdout.columns = size.columns
      process.stdout.rows = size.rows
      const pending = promptUpgrade(size.message, new AbortController().signal)
      expect(screen).toContain(size.message)
      expect(screen).toContain('Upgrade now')
      expect(screen).toContain('Skip until next version')
      expect(screen).not.toContain('Continuing without upgrading.')
      expect(screen).not.toContain('\x1b[?1049l')
      screen = ''
      input.emit('keypress', '', { name: 'down' })
      expect(screen).toContain(`\x1b[H\x1b[2J${size.message}`)
      expect(screen).toContain('Skip until next version')
      input.emit('keypress', '', { name: 'return' })
      await expect(pending).resolves.toBe('skip')
      expect(screen.endsWith('\x1b[?1049l\x1b[?25h')).toBe(true)
    }
  )

  it.each([true, false])(
    'preserves selection on resize (canUpdate: %s)',
    async (canUpdate) => {
      const resizes = process.stdout.listenerCount('resize')
      const pending = promptUpgrade(
        'Reminder',
        new AbortController().signal,
        canUpdate
      )
      input.emit('keypress', '', { name: 'down' })
      const initialScreen = screen
      process.stdout.columns = 60
      process.stdout.emit('resize')
      // The cancelled cli-select promise settles before the replacement renders.
      await new Promise<void>(queueMicrotask)
      expect(screen.slice(initialScreen.length)).toContain(
        '\x1b[H\x1b[2JReminder'
      )
      process.stdout.columns = 100
      process.stdout.emit('resize')
      await new Promise<void>(queueMicrotask)
      input.emit('keypress', '', { name: 'return' })
      await expect(pending).resolves.toBe(canUpdate ? 'skip' : 'dismiss')
      expect(screen.split('\x1b[?1049h')).toHaveLength(2)
      expect(screen.split('\x1b[?1049l')).toHaveLength(2)
      expect(process.stdout.listenerCount('resize')).toBe(resizes)
    }
  )

  it.each(['abort', 'interrupt', 'escape'] as const)(
    'handles %s during a resize',
    async (action) => {
      const resizes = process.stdout.listenerCount('resize')
      const controller = new AbortController()
      const pending = promptUpgrade('Reminder', controller.signal)
      process.stdout.emit('resize')
      if (action === 'abort') {
        controller.abort()
      } else if (action === 'escape') {
        input.emit('keypress', '', { name: 'escape' })
      } else {
        input.emit('keypress', '', { name: 'c', ctrl: true })
      }
      await expect(pending).resolves.toBe(
        action === 'interrupt' ? 'interrupt' : 'skip'
      )
      expect(input.setRawMode).toHaveBeenLastCalledWith(false)
      expect(process.stdout.listenerCount('resize')).toBe(resizes)
      expect(screen.endsWith('\x1b[?1049l\x1b[?25h')).toBe(true)
    }
  )

  it('handles a resize emitted while the menu is being drawn', async () => {
    let resized = false
    jest.spyOn(process.stdout, 'write').mockImplementation((data: any) => {
      screen += data.toString()
      if (!resized && data.toString().includes('Upgrade now')) {
        resized = true
        process.stdout.columns = 60
        process.stdout.emit('resize')
      }
      return true
    })
    const pending = promptUpgrade('Reminder', new AbortController().signal)
    await new Promise<void>(queueMicrotask)
    expect(screen.split('Reminder')).toHaveLength(3)
    input.emit('keypress', '', { name: 'down' })
    input.emit('keypress', '', { name: 'return' })
    await expect(pending).resolves.toBe('skip')
  })

  it('keeps the menu open and the complete reminder after a shrink', async () => {
    const resizes = process.stdout.listenerCount('resize')
    const message =
      'Complete reminder\n\nReference: https://example.com/advisory'
    const pending = promptUpgrade(message, new AbortController().signal)
    input.emit('keypress', '', { name: 'down' })
    screen = ''
    process.stdout.rows = 4
    process.stdout.emit('resize')
    await new Promise<void>(queueMicrotask)
    expect(screen).toContain(message)
    expect(screen).toContain('Skip until next version')
    expect(screen).not.toContain('\x1b[?1049l')
    input.emit('keypress', '', { name: 'return' })
    await expect(pending).resolves.toBe('skip')
    expect(input.setRawMode).toHaveBeenLastCalledWith(false)
    expect(process.stdout.listenerCount('resize')).toBe(resizes)
  })

  it('only offers Skip and dismissal when no upgrade is available', async () => {
    const pending = promptUpgrade(
      'No eligible target.',
      new AbortController().signal,
      false
    )
    expect(screen.includes('Upgrade now')).toBe(false)
    expect(screen).toContain('Skip until next version')
    input.emit('keypress', '', { name: 'return' })
    await expect(pending).resolves.toBe('skip')
  })

  it('aborts without sending a keypress to other input consumers', async () => {
    const listener = jest.fn()
    input.on('keypress', listener)
    const controller = new AbortController()
    const pending = promptUpgrade('Reminder', controller.signal)
    controller.abort()
    await expect(pending).resolves.toBe('skip')
    expect(listener).toHaveBeenCalledTimes(0)
    expect(input.listenerCount('keypress')).toBe(1)
    expect(input.setRawMode).toHaveBeenLastCalledWith(false)
    expect(screen.endsWith('\x1b[?1049l\x1b[?25h')).toBe(true)
  })

  it('returns interruption without self-signalling', async () => {
    const kill = jest.spyOn(process, 'kill').mockReturnValue(true)
    const pending = promptUpgrade('Reminder', new AbortController().signal)
    input.emit('keypress', '', { name: 'c', ctrl: true })
    await expect(pending).resolves.toBe('interrupt')
    expect(kill).toHaveBeenCalledTimes(0)
    expect(input.setRawMode).toHaveBeenLastCalledWith(false)
    expect(screen.endsWith('\x1b[?1049l\x1b[?25h')).toBe(true)
  })

  it('restores the terminal if rendering the reminder fails', async () => {
    const exits = process.listenerCount('exit')
    const resizes = process.stdout.listenerCount('resize')
    jest.spyOn(process.stdout, 'write').mockImplementation((data: any) => {
      if (data.toString().includes('Shared recommendation')) {
        throw new Error('Rendering failed')
      }
      screen += data.toString()
      return true
    })
    await expect(
      promptUpgrade('Shared recommendation', new AbortController().signal)
    ).rejects.toThrow('Rendering failed')
    expect(input.setRawMode.mock.calls).toEqual([[true], [false]])
    expect(input.listenerCount('keypress')).toBe(0)
    expect(input.isPaused()).toBe(true)
    expect(process.listenerCount('exit')).toBe(exits)
    expect(process.stdout.listenerCount('resize')).toBe(resizes)
    expect(screen.endsWith('\x1b[?1049l\x1b[?25h')).toBe(true)
  })

  it('preserves an already raw and flowing input stream', async () => {
    input.isRaw = true
    input.resume()
    const pending = promptUpgrade('Reminder', new AbortController().signal)
    input.emit('keypress', '', { name: 'escape' })
    await expect(pending).resolves.toBe('skip')
    expect(input.setRawMode).toHaveBeenLastCalledWith(true)
    expect(input.isPaused()).toBe(false)
    expect(screen.endsWith('\x1b[?1049l\x1b[?25h')).toBe(true)
  })
})
