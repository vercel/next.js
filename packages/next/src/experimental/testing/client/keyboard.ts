import type { Keyboard } from 'playwright'
import {
  parseClientKeyboard,
  isNativeClientKeyboardKey as nativeKey,
} from './keyboard-primitives'

function keyActions(text: string) {
  const actions = parseClientKeyboard(text)
  // Keep the existing complete preflight before touching native held-key state.
  for (const action of actions)
    if (!Number.isSafeInteger(action.repeat))
      throw new Error('Unsupported keyboard key repetition.')
  return actions
}

/** File cleanup forwards every retained key to the actual native provider. */
export async function cleanupClientKeyboard(
  keyboard: Keyboard,
  unreleased: readonly string[]
) {
  for (const key of unreleased) await keyboard.up(key)
}

/** Native keyboard input owns events, selection and component render turns. */
export async function runClientKeyboard(
  keyboard: Keyboard,
  text: string,
  selectAll: () => Promise<unknown>,
  unreleased: readonly string[] = [],
  skipRelease = true
): Promise<{ unreleased: string[] }> {
  const pressed = new Set(unreleased)
  for (const action of keyActions(text)) {
    const {
      keyDef: { key },
      releasePrevious,
      releaseSelf,
      repeat,
    } = action
    if (pressed.has(key)) {
      if (nativeKey(key)) await keyboard.up(key)
      pressed.delete(key)
    }
    if (releasePrevious) continue
    if (key === 'selectall') {
      await selectAll()
      continue
    }
    for (let index = 0; index < repeat; index++) {
      if (nativeKey(key)) await keyboard.down(key)
      else await keyboard.insertText(key)
    }
    if (releaseSelf) {
      if (nativeKey(key)) await keyboard.up(key)
    } else pressed.add(key)
  }
  // The reference releases native keys here while retaining instance bookkeeping.
  if (!skipRelease)
    for (const key of pressed) if (nativeKey(key)) await keyboard.up(key)
  return { unreleased: [...pressed] }
}
