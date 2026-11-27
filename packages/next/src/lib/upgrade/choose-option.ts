import type { Key } from 'readline'

import cliSelect from 'next/dist/compiled/cli-select'

import * as Log from '../../build/output/log'
import { bold, cyan, dim } from '../picocolors'

// Input the terminal buffered before a menu opened reaches it at once.
const staleInputMs = 100

// Resolves to undefined for Esc and to null for Ctrl+C.
export async function chooseOption({
  question,
  values,
  defaultValue,
  firstPrompt,
}: {
  question: string
  values: Record<string, string>
  defaultValue: number
  firstPrompt: boolean
}): Promise<string | null | undefined> {
  Log.bootstrap('')
  Log.bootstrap(`  ${question}`)
  Log.bootstrap(
    `  ${dim(`Use ↑/↓ to choose, Enter to confirm, or Esc to ${firstPrompt ? 'cancel' : 'go back'}.`)}\n`
  )
  let interrupted = false
  const openedAt = Date.now()
  const onKeypress = (_text: string, key: Key) => {
    if (key.ctrl && key.name === 'c') {
      interrupted = true
    }

    // Enter typed while the terminal is in normal mode arrives as a line feed.
    // One that arrives as the menu opens was typed before it, while no menu
    // was showing, so it must not confirm a choice the user has not seen.
    if (key.name === 'enter' && Date.now() - openedAt >= staleInputMs) {
      process.stdin.emit('keypress', '\r', { ...key, name: 'return' })
    }
  }

  process.stdin.on('keypress', onKeypress)
  // An agent CLI started by `next upgrade` can put the shared terminal back
  // in normal mode while a menu is open; arrows then wait for Enter, which
  // arrives as a line feed the menu ignores. Keep raw mode while it is open.
  // Node skips setting a mode it thinks is already set, so toggle.
  const reassert = setInterval(() => {
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false)
      process.stdin.setRawMode(true)
    }
  }, 200)
  reassert.unref()
  try {
    const { id } = await cliSelect({
      values,
      defaultValue,
      selected: cyan('❯'),
      unselected: ' ',
      indentation: 2,
      // The menu erases itself by counting lines, so an option that wraps in a
      // narrow terminal would leave rows behind. Keep each option on one row,
      // after the indentation and the marker.
      valueRenderer: (value: string, selected: boolean) => {
        const width = (process.stdout.columns || 80) - 5
        const line =
          value.length <= width
            ? value
            : `${value.slice(0, Math.max(width - 1, 1)).trimEnd()}…`
        return selected ? cyan(bold(line)) : line
      },
    })
    if (typeof id !== 'string') {
      return undefined
    }

    Log.bootstrap(`  ${cyan('❯')} ${cyan(bold(values[id]))}`)
    return id
  } catch (error) {
    if (error !== undefined) {
      throw error
    }

    return interrupted ? null : undefined
  } finally {
    clearInterval(reassert)
    process.stdin.removeListener('keypress', onKeypress)
  }
}
