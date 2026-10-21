import type { Keyboard } from 'playwright'

type KeyAction = {
  key: string
  releasePrevious: boolean
  releaseSelf: boolean
  repeat: number
}
const namedKeys = new Map(
  [
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Backspace',
    'Delete',
    'Home',
    'End',
    'Enter',
    'Tab',
    'Escape',
    'Space',
    'Shift',
    'Control',
    'Alt',
    'Meta',
    'ControlOrMeta',
  ].map((key) => [key.toLowerCase(), key])
)
// The reference provider resolves a physical code to its default key before
// sending that key through the same native keyboard and held-key state.
const physicalKeys = new Map(
  [
    ...Array.from('abcdefghijklmnopqrstuvwxyz', (key) => [
      `Key${key.toUpperCase()}`,
      key,
    ]),
    ...Array.from('0123456789', (key) => [`Digit${key}`, key]),
    ['BracketLeft', '['],
    ['BracketRight', ']'],
    ['Space', ' '],
    ...[
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Backspace',
      'Delete',
      'Home',
      'End',
      'Enter',
      'Tab',
      'Escape',
    ].map((key) => [key, key]),
    ['ShiftLeft', 'Shift'],
    ['ShiftRight', 'Shift'],
    ['ControlLeft', 'Control'],
    ['ControlRight', 'Control'],
    ['AltLeft', 'Alt'],
    ['AltRight', 'Alt'],
    ['MetaLeft', 'Meta'],
    ['MetaRight', 'Meta'],
  ].map(([code, key]) => [code.toLowerCase(), key])
)
const nativeKey = (key: string) =>
  namedKeys.has(key.toLowerCase()) || /^[\x20-\x7e]$/.test(key)

/** Parse the qualified text, editing and held-key subset before native input. */
function keyActions(text: string): KeyAction[] {
  if (!text) throw new Error('Expected a keyboard key descriptor.')
  const actions: KeyAction[] = []
  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    if (character !== '{' && character !== '[') {
      actions.push({
        key: character,
        releasePrevious: false,
        releaseSelf: true,
        repeat: 1,
      })
      continue
    }
    if (text[index + 1] === character) {
      actions.push({
        key: character,
        releasePrevious: false,
        releaseSelf: true,
        repeat: 1,
      })
      index++
      continue
    }
    const end = text.indexOf(character === '[' ? ']' : '}', index + 1)
    if (end === -1)
      throw new Error('Expected a closing keyboard key descriptor.')
    const descriptor = text.slice(index + 1, end)
    const parts = /^(\/)?([^>/]+?)(?:>(\d+))?([>/])?$/.exec(descriptor)
    if (!parts)
      throw new Error('Unsupported keyboard key descriptor: ' + descriptor)
    const [, releasePrevious, name, repetitions, release] = parts
    const key =
      character === '['
        ? physicalKeys.get(name.toLowerCase())
        : (namedKeys.get(name.toLowerCase()) ??
          (name === 'selectall' || (name.length === 1 && !'/>{['.includes(name))
            ? name
            : undefined))
    const repeat = Math.max(Number(repetitions ?? 1), 1)
    if (!key || !Number.isSafeInteger(repeat))
      throw new Error('Unsupported keyboard key descriptor: ' + descriptor)
    actions.push({
      key,
      releasePrevious: !!releasePrevious,
      releaseSelf: release ? release === '/' : !repetitions,
      repeat,
    })
    index = end
  }
  return actions
}

export async function cleanupClientKeyboard(
  keyboard: Keyboard,
  unreleased: readonly string[]
) {
  for (const key of unreleased) if (nativeKey(key)) await keyboard.up(key)
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
    const { key, releasePrevious, releaseSelf, repeat } = action
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
  if (!skipRelease) await cleanupClientKeyboard(keyboard, [...pressed])
  return { unreleased: [...pressed] }
}
