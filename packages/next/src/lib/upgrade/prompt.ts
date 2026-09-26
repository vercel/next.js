import { emitKeypressEvents, type Key } from 'readline'
import { PassThrough } from 'stream'
import cliSelect from 'next/dist/compiled/cli-select'
import { bold, cyan } from '../picocolors'

export type UpgradeAction = 'update' | 'skip' | 'dismiss' | 'interrupt'

export async function promptUpgrade(
  message: string,
  signal: AbortSignal,
  canUpdate: boolean = true
): Promise<UpgradeAction> {
  if (signal.aborted) {
    return 'skip'
  }
  const input = process.stdin
  const terminal = process.stdout
  const values = {
    ...(canUpdate ? { update: 'Upgrade now' } : {}),
    skip: 'Skip',
    dismiss: 'Skip until next version',
  }
  const labels = Object.values(values)
  const heading = `${message}\n\n`
  const wasRaw = input.isRaw ?? false
  const wasFlowing = input.readableFlowing
  // Isolate cancellation from other consumers of stdin. cli-select can close
  // this stream without changing the real terminal's original raw/flow state.
  const keys = Object.assign(new PassThrough(), { setRawMode() {} })
  let interrupted = false
  let cancelled = false
  let resized = false
  let selectedIndex = 0
  const renderValue = (value: string, selected: boolean) => {
    if (value === labels[0]) {
      // We own this screen. Redraw from the top instead of relying on
      // cli-select's one-row-per-choice cursor movement when choices wrap.
      terminal.write(`\x1b[H\x1b[2J${heading}`)
    }
    if (selected) {
      selectedIndex = labels.indexOf(value)
    }
    return selected ? cyan(bold(value)) : value
  }
  const cancel = () => {
    cancelled = true
    keys.emit('keypress', '', { name: 'escape' })
  }
  let suspended = false
  const onSuspend = () => {
    if (suspended) {
      return
    }
    suspended = true
    input.setRawMode(wasRaw)
    terminal.write('\x1b[?1049l\x1b[?25h')
  }
  const onContinue = () => {
    if (!suspended) {
      return
    }
    suspended = false
    terminal.write('\x1b[?1049h')
    input.setRawMode(true)
    input.resume()
    // Recreate the menu after returning to its alternate screen.
    onResize()
  }
  const onKey = (text: string, key: Key) => {
    if (process.platform !== 'win32' && key?.ctrl && key.name === 'z') {
      // Raw mode delivers Ctrl+Z as a key instead of SIGTSTP.
      onSuspend()
      process.kill(process.pid, 'SIGTSTP')
      return
    }
    if (key?.ctrl && key.name === 'c') {
      interrupted = true
    }
    if (key?.name === 'escape') {
      cancelled = true
    }
    keys.emit('keypress', text, key)
  }
  const onResize = () => {
    resized = true
    // A terminal write can emit resize while cli-select is still opening.
    // Wait until its selection callback is installed before cancelling it.
    queueMicrotask(() => {
      if (resized && !restored) {
        keys.emit('keypress', '', { name: 'escape' })
      }
    })
  }
  let restored = false
  let screenRestored: Promise<void> | null = null
  const restore = () => {
    if (restored) {
      return
    }
    restored = true
    input.removeListener('keypress', onKey)
    terminal.removeListener('resize', onResize)
    signal.removeEventListener('abort', cancel)
    process.removeListener('exit', restore)
    process.removeListener('SIGTSTP', onSuspend)
    process.removeListener('SIGCONT', onContinue)
    keys.destroy()
    try {
      input.setRawMode(wasRaw)
    } finally {
      if (wasFlowing !== true) {
        input.pause()
      }
      screenRestored = new Promise<void>((resolve, reject) => {
        terminal.write('\x1b[?1049l\x1b[?25h', (error) => {
          if (error) {
            reject(error)
          } else {
            resolve()
          }
        })
      })
    }
  }
  // CLI signal handlers may exit synchronously, before the promise settles.
  process.once('exit', restore)
  if (process.platform !== 'win32') {
    // An external SIGTSTP must restore the menu before the supervisor stops
    // this process and its PTY child.
    process.prependListener('SIGTSTP', onSuspend)
    process.on('SIGCONT', onContinue)
  }
  try {
    // Keep startup output on the normal screen while the menu owns the terminal.
    terminal.write('\x1b[?1049h')
    emitKeypressEvents(input)
    input.on('keypress', onKey)
    terminal.on('resize', onResize)
    signal.addEventListener('abort', cancel, { once: true })
    input.setRawMode(true)
    input.resume()
    while (true) {
      resized = false
      const selection = cliSelect({
        values,
        defaultValue: selectedIndex,
        selected: cyan('❯'),
        unselected: ' ',
        indentation: 2,
        cleanup: true,
        // cli-select types inputStream as a WriteStream, but only consumes
        // keypress events and the raw-mode methods supplied by this proxy.
        inputStream: keys as unknown as NodeJS.WriteStream,
        outputStream: terminal,
        valueRenderer: renderValue,
      })
      if (signal.aborted || cancelled) {
        cancel()
      }
      try {
        const { id } = await selection
        return signal.aborted || cancelled ? 'skip' : (id as UpgradeAction)
      } catch (error) {
        // cli-select rejects without a reason for Escape / Ctrl+C.
        if (error) {
          throw error
        }
        if (!resized || signal.aborted || cancelled || interrupted) {
          return interrupted ? 'interrupt' : 'skip'
        }
      }
    }
  } finally {
    restore()
    if (screenRestored) {
      // Replay uses fd writes, which can overtake pending stdout writes on
      // Windows. Finish leaving the prompt screen before returning to replay.
      await screenRestored
    }
  }
}
