import cliSelect from 'next/dist/compiled/cli-select'
import { selectOption } from 'next/dist/lib/upgrade/choose-option'

jest.mock('next/dist/compiled/cli-select', () => ({
  __esModule: true,
  default: jest.fn(),
}))

type SelectOptions = {
  valueRenderer: (value: string, selected: boolean) => string
}

const select = cliSelect as unknown as jest.Mock<
  Promise<{ id: string }>,
  [SelectOptions]
>

describe('upgrade menus', () => {
  const stdin = process.stdin as NodeJS.ReadStream & {
    isRaw: boolean
    setRawMode: (mode: boolean) => NodeJS.ReadStream
  }
  const original = {
    columns: process.stdout.columns,
    isTTY: stdin.isTTY,
    isRaw: stdin.isRaw,
    setRawMode: stdin.setRawMode,
  }

  afterEach(() => {
    jest.useRealTimers()
    select.mockReset()
    process.stdout.columns = original.columns
    stdin.isTTY = original.isTTY
    stdin.isRaw = original.isRaw
    stdin.setRawMode = original.setRawMode
  })

  it('keeps each option on one row of a narrow terminal', async () => {
    process.stdout.columns = 30
    select.mockImplementation(async ({ valueRenderer }) => {
      // Strip the colors the selected option gets.
      const plain = (text: string) =>
        text.replace(new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, 'g'), '')
      const long = 'Default (recommended) · Use the default model'
      expect(plain(valueRenderer(long, false))).toBe('Default (recommended) ·…')
      expect(plain(valueRenderer(long, true))).toBe('Default (recommended) ·…')
      // After the indentation and the marker, the option fits the row.
      expect(valueRenderer(long, false).length).toBeLessThanOrEqual(30 - 5)
      expect(valueRenderer('Short', false)).toBe('Short')
      return { id: 'one' }
    })
    await expect(selectOption({ one: 'One' }, 0)).resolves.toBe('one')
  })

  it.each([
    ['typed while the menu is open as Enter', 150, ['enter', 'return']],
    // Enter pressed while no menu was open is buffered and arrives at once.
    ['typed before the menu opened as nothing', 0, ['enter']],
  ] as const)('reads a line feed %s', async (_, delay, expected) => {
    const keys: string[] = []
    const record = (_text: string, key: { name?: string }) => {
      keys.push(key.name ?? '')
    }
    const opened = Date.now()
    const now = jest.spyOn(Date, 'now').mockReturnValue(opened)
    process.stdin.on('keypress', record)
    try {
      select.mockImplementation(async () => {
        now.mockReturnValue(opened + delay)
        // A terminal in normal mode sends Enter as a line feed.
        process.stdin.emit('keypress', '\n', { name: 'enter' })
        return { id: 'one' }
      })
      await selectOption({ one: 'One' }, 0)
    } finally {
      process.stdin.removeListener('keypress', record)
      now.mockRestore()
    }
    expect(keys).toEqual(expected)
  })

  it('turns raw mode back on while the menu is open', async () => {
    jest.useFakeTimers()
    const modes: boolean[] = []
    stdin.isTTY = true
    stdin.isRaw = true
    stdin.setRawMode = (mode: boolean) => {
      modes.push(mode)
      return stdin
    }
    let close: (value: { id: string }) => void = () => {}
    select.mockImplementation(
      () =>
        new Promise((resolve) => {
          close = resolve
        })
    )
    const choice = selectOption({ one: 'One' }, 0)
    jest.advanceTimersByTime(200)
    // Node skips setting a mode it thinks is set, so the menu toggles it.
    expect(modes).toEqual([false, true])
    close({ id: 'one' })
    await expect(choice).resolves.toBe('one')
    // The menu stops once it closes.
    jest.advanceTimersByTime(1000)
    expect(modes).toEqual([false, true])
  })
})
