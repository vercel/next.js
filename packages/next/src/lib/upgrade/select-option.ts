import { emitKeypressEvents } from 'readline'

import { dim } from '../picocolors'

type SelectOptions = {
  values: Record<string, string>
  defaultValue: number
  selected: string
  unselected: string
  indentation: number
  valueRenderer: (value: string, selected: boolean) => string
  firstPrompt: boolean
}

// Escape moves back; Ctrl+C cancels the entire handoff.
export async function selectOption({
  values,
  defaultValue,
  selected,
  unselected,
  indentation,
  valueRenderer,
  firstPrompt,
}: SelectOptions): Promise<{ id: string } | null | undefined> {
  const entries = Object.entries(values)
  let selectedIndex = defaultValue
  let rendered = false
  const wasRaw = process.stdin.isRaw
  const wasPaused = process.stdin.isPaused()

  function clear(): void {
    if (rendered) {
      process.stdout.write(`\x1b[${entries.length + 1}A\r\x1b[0J`)
    }
    process.stdout.write('\x1b[?25h')
  }

  function render(): void {
    if (rendered) {
      process.stdout.write(`\x1b[${entries.length + 1}A\r\x1b[0J`)
    }
    const choices = entries.map(([, label], index) => {
      const active = index === selectedIndex
      return `${' '.repeat(indentation)}${active ? selected : unselected} ${valueRenderer(label, active)}`
    })
    const backLabel = firstPrompt ? 'cancel' : 'go back'
    process.stdout.write(
      `${choices.join('\n')}\n\n  ${dim(`Press Enter to confirm or Esc to ${backLabel}`)}`
    )
    rendered = true
  }

  emitKeypressEvents(process.stdin)
  process.stdin.setRawMode(true)
  process.stdout.write('\x1b[?25l')
  render()
  process.stdin.resume()

  return new Promise((resolve) => {
    function finish(value: { id: string } | null | undefined): void {
      process.stdin.removeListener('keypress', onKeypress)
      process.stdin.setRawMode(wasRaw ?? false)
      if (wasPaused) {
        process.stdin.pause()
      }
      clear()
      resolve(value)
    }

    function onKeypress(
      _character: string,
      key: { name?: string; ctrl?: boolean }
    ): void {
      if (key.name === 'up' && selectedIndex > 0) {
        selectedIndex--
        render()
      } else if (key.name === 'down' && selectedIndex < entries.length - 1) {
        selectedIndex++
        render()
      } else if (key.name === 'return') {
        finish({ id: entries[selectedIndex][0] })
      } else if (key.name === 'escape') {
        finish(undefined)
      } else if (key.name === 'c' && key.ctrl) {
        finish(null)
      }
    }

    process.stdin.on('keypress', onKeypress)
  })
}
