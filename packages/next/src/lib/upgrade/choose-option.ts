import type { Key } from 'readline'

import cliSelect from 'next/dist/compiled/cli-select'

import * as Log from '../../build/output/log'
import { bold, cyan, dim } from '../picocolors'

// The menus of `next upgrade --agent` and `next upgrade --ci` look the same.

export function showQuestion(question: string, firstPrompt = false) {
  Log.bootstrap('')
  Log.bootstrap(`  ${question}`)
  Log.bootstrap(
    `  ${dim(`Use ↑/↓ to choose, Enter to confirm, or Esc to ${firstPrompt ? 'cancel' : 'go back'}.`)}\n`
  )
}

export function showAnswer(answer: string) {
  Log.bootstrap(`  ${cyan('❯')} ${cyan(bold(answer))}`)
}

// Resolves to undefined for Esc and to null for Ctrl+C.
export async function selectOption(
  values: Record<string, string>,
  defaultValue: number
): Promise<string | null | undefined> {
  let interrupted = false
  const onKeypress = (_text: string, key: Key) => {
    if (key.ctrl && key.name === 'c') {
      interrupted = true
    }
  }
  process.stdin.on('keypress', onKeypress)
  try {
    const { id } = await cliSelect({
      values,
      defaultValue,
      selected: cyan('❯'),
      unselected: ' ',
      indentation: 2,
      valueRenderer: (value: string, selected: boolean) =>
        selected ? cyan(bold(value)) : value,
    })
    return typeof id === 'string' ? id : undefined
  } catch (error) {
    if (error !== undefined) {
      throw error
    }
    return interrupted ? null : undefined
  } finally {
    process.stdin.removeListener('keypress', onKeypress)
  }
}

export async function chooseOption(
  question: string,
  values: Record<string, string>,
  defaultValue: number,
  firstPrompt = false
): Promise<string | null | undefined> {
  showQuestion(question, firstPrompt)
  const id = await selectOption(values, defaultValue)
  if (typeof id === 'string') {
    showAnswer(values[id])
  }
  return id
}
