/*
 * MIT License
 *
 * Copyright (c) 2021-Present VoidZero Inc. and Vitest contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
// Pure keyboard parsing/default data from @vitest/browser 5.0.4.
// Native key membership from @vitest/browser-playwright 5.0.4.
// No browser provider, assertion registry, controller or Vite is loaded here.

type KeyDefinition = {
  key: string
  code: string
  shiftKey?: boolean
  location?: number
}

type Descriptor = {
  type: string
  descriptor: string
  consumedLength: number
  releasePrevious: boolean
  releaseSelf?: boolean
  repeat: number
}

export interface ParsedClientKeyboardAction {
  keyDef: KeyDefinition
  releasePrevious: boolean
  releaseSelf: boolean
  repeat: number
}

const DOM_KEY_LOCATION = { STANDARD: 0, LEFT: 1, RIGHT: 2, NUMPAD: 3 }

const defaultKeyMap: KeyDefinition[] = [
  // alphanumeric block - writing system
  ...'0123456789'.split('').map((c) => ({
    code: `Digit${c}`,
    key: c,
  })),
  ...')!@#$%^&*('.split('').map((c, i) => ({
    code: `Digit${i}`,
    key: c,
    shiftKey: true,
  })),
  ...'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => ({
    code: `Key${c.toUpperCase()}`,
    key: c,
  })),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => ({
    code: `Key${c}`,
    key: c,
    shiftKey: true,
  })),
  {
    code: 'BracketLeft',
    key: '[',
  },
  {
    code: 'BracketLeft',
    key: '{',
    shiftKey: true,
  },
  {
    code: 'BracketRight',
    key: ']',
  },
  {
    code: 'BracketRight',
    key: '}',
    shiftKey: true,
  },
  // alphanumeric block - functional
  {
    code: 'Space',
    key: ' ',
  },
  {
    code: 'AltLeft',
    key: 'Alt',
    location: DOM_KEY_LOCATION.LEFT,
  },
  {
    code: 'AltRight',
    key: 'Alt',
    location: DOM_KEY_LOCATION.RIGHT,
  },
  {
    code: 'ShiftLeft',
    key: 'Shift',
    location: DOM_KEY_LOCATION.LEFT,
  },
  {
    code: 'ShiftRight',
    key: 'Shift',
    location: DOM_KEY_LOCATION.RIGHT,
  },
  {
    code: 'ControlLeft',
    key: 'Control',
    location: DOM_KEY_LOCATION.LEFT,
  },
  {
    code: 'ControlRight',
    key: 'Control',
    location: DOM_KEY_LOCATION.RIGHT,
  },
  {
    code: 'MetaLeft',
    key: 'Meta',
    location: DOM_KEY_LOCATION.LEFT,
  },
  {
    code: 'MetaRight',
    key: 'Meta',
    location: DOM_KEY_LOCATION.RIGHT,
  },
  {
    code: 'OSLeft',
    key: 'OS',
    location: DOM_KEY_LOCATION.LEFT,
  },
  {
    code: 'OSRight',
    key: 'OS',
    location: DOM_KEY_LOCATION.RIGHT,
  },
  {
    code: 'ContextMenu',
    key: 'ContextMenu',
  },
  {
    code: 'Tab',
    key: 'Tab',
  },
  {
    code: 'CapsLock',
    key: 'CapsLock',
  },
  {
    code: 'Backspace',
    key: 'Backspace',
  },
  {
    code: 'Enter',
    key: 'Enter',
  },
  // function
  {
    code: 'Escape',
    key: 'Escape',
  },
  // arrows
  {
    code: 'ArrowUp',
    key: 'ArrowUp',
  },
  {
    code: 'ArrowDown',
    key: 'ArrowDown',
  },
  {
    code: 'ArrowLeft',
    key: 'ArrowLeft',
  },
  {
    code: 'ArrowRight',
    key: 'ArrowRight',
  },
  // control pad
  {
    code: 'Home',
    key: 'Home',
  },
  {
    code: 'End',
    key: 'End',
  },
  {
    code: 'Delete',
    key: 'Delete',
  },
  {
    code: 'PageUp',
    key: 'PageUp',
  },
  {
    code: 'PageDown',
    key: 'PageDown',
  },
  // Special keys that are not part of a default US-layout but included for specific behavior
  {
    code: 'Fn',
    key: 'Fn',
  },
  {
    code: 'Symbol',
    key: 'Symbol',
  },
  {
    code: 'AltRight',
    key: 'AltGraph',
  },
]

const bracketDict: Record<string, string> = {
  '{': '}',
  '[': ']',
}
/**
 * Read the next key definition from user input
 *
 * Describe key per `{descriptor}` or `[descriptor]`.
 * Everything else will be interpreted as a single character as descriptor - e.g. `a`.
 * Brackets `{` and `[` can be escaped by doubling - e.g. `foo[[bar` translates to `foo[bar`.
 * A previously pressed key can be released per `{/descriptor}`.
 * Keeping the key pressed can be written as `{descriptor>}`.
 * When keeping the key pressed you can choose how long the key is pressed `{descriptor>3}`.
 * You can then release the key per `{descriptor>3/}` or keep it pressed and continue with the next key.
 */ function readNextDescriptor(text: string): Descriptor {
  let pos = 0
  const startBracket = text[pos] in bracketDict ? text[pos] : ''
  pos += startBracket.length
  const isEscapedChar = new RegExp(`^\\${startBracket}{2}`).test(text)
  const type = isEscapedChar ? '' : startBracket
  return {
    type,
    ...(type === '' ? readPrintableChar(text, pos) : readTag(text, pos, type)),
  }
}
function readPrintableChar(
  text: string,
  pos: number
): Omit<Descriptor, 'type'> {
  const descriptor = text[pos]
  assertDescriptor(descriptor, text, pos)
  pos += descriptor.length
  return {
    consumedLength: pos,
    descriptor,
    releasePrevious: false,
    releaseSelf: true,
    repeat: 1,
  }
}
function readTag(
  text: string,
  pos: number,
  startBracket: string
): Omit<Descriptor, 'type'> {
  let _ref: string | undefined
  let _text_slice_match: RegExpMatchArray | null
  let _text_slice_match1: RegExpMatchArray | null
  const releasePreviousModifier = text[pos] === '/' ? '/' : ''
  pos += releasePreviousModifier.length
  const escapedDescriptor = startBracket === '{' && text[pos] === '\\'
  pos += Number(escapedDescriptor)
  const descriptor = escapedDescriptor
    ? text[pos]
    : (_text_slice_match = text
          .slice(pos)
          .match(startBracket === '{' ? /^\w+|^[^}>/]/ : /^\w+/)) === null ||
        _text_slice_match === void 0
      ? void 0
      : _text_slice_match[0]
  assertDescriptor(descriptor, text, pos)
  pos += descriptor.length
  const repeatModifier =
    (_ref =
      (_text_slice_match1 = text.slice(pos).match(/^>\d+/)) === null ||
      _text_slice_match1 === void 0
        ? void 0
        : _text_slice_match1[0]) !== null && _ref !== void 0
      ? _ref
      : ''
  pos += repeatModifier.length
  const releaseSelfModifier =
    text[pos] === '/' || (!repeatModifier && text[pos] === '>') ? text[pos] : ''
  pos += releaseSelfModifier.length
  const expectedEndBracket = bracketDict[startBracket]
  const endBracket = text[pos] === expectedEndBracket ? expectedEndBracket : ''
  if (!endBracket) {
    throw new Error(
      getErrorMessage(
        [
          !repeatModifier && 'repeat modifier',
          !releaseSelfModifier && 'release modifier',
          `"${expectedEndBracket}"`,
        ]
          .filter(Boolean)
          .join(' or '),
        text[pos],
        text
      )
    )
  }
  pos += endBracket.length
  return {
    consumedLength: pos,
    descriptor,
    releasePrevious: !!releasePreviousModifier,
    // eslint-disable-next-line no-restricted-syntax -- Preserve the pinned parser's method lookup.
    repeat: repeatModifier ? Math.max(Number(repeatModifier.substr(1)), 1) : 1,
    releaseSelf: hasReleaseSelf(releaseSelfModifier, repeatModifier),
  }
}
function assertDescriptor(
  descriptor: string | undefined,
  text: string,
  pos: number
): asserts descriptor is string {
  if (!descriptor) {
    throw new Error(getErrorMessage('key descriptor', text[pos], text))
  }
}
function hasReleaseSelf(
  releaseSelfModifier: string,
  repeatModifier: string
): boolean | undefined {
  if (releaseSelfModifier) {
    return releaseSelfModifier === '/'
  }
  if (repeatModifier) {
    return false
  }
}
function getErrorMessage(
  expected: string,
  found: string | undefined,
  text: string
): string {
  return `Expected ${expected} but found "${found !== null && found !== void 0 ? found : ''}" in "${text}"
    See ${`https://testing-library.com/docs/user-event/keyboard`}
    for more information about how userEvent parses your input.`
}

/**
 * Parse key definitions per `keyboardMap`
 *
 * Keys can be referenced by `{key}` or `{special}` as well as physical locations per `[code]`.
 * Everything else will be interpreted as a typed character - e.g. `a`.
 * Brackets `{` and `[` can be escaped by doubling - e.g. `foo[[bar` translates to `foo[bar`.
 * Keeping the key pressed can be written as `{key>}`.
 * When keeping the key pressed you can choose how long (how many keydown and keypress) the key is pressed `{key>3}`.
 * You can then release the key per `{key>3/}` or keep it pressed and continue with the next key.
 */ function parseKeyDefWithMap(
  keyboardMap: KeyDefinition[],
  text: string
): ParsedClientKeyboardAction[] {
  const defs = []
  do {
    let _keyboardMap_find: KeyDefinition | undefined
    const {
      type,
      descriptor,
      consumedLength,
      releasePrevious,
      releaseSelf = true,
      repeat,
    } = readNextDescriptor(text)
    const keyDef =
      (_keyboardMap_find = keyboardMap.find((def) => {
        if (type === '[') {
          let _def_code: string
          return (
            ((_def_code = def.code) === null || _def_code === void 0
              ? void 0
              : _def_code.toLowerCase()) === descriptor.toLowerCase()
          )
        } else if (type === '{') {
          let _def_key: string
          return (
            ((_def_key = def.key) === null || _def_key === void 0
              ? void 0
              : _def_key.toLowerCase()) === descriptor.toLowerCase()
          )
        }
        return def.key === descriptor
      })) !== null && _keyboardMap_find !== void 0
        ? _keyboardMap_find
        : {
            key: 'Unknown',
            code: 'Unknown',
            [type === '[' ? 'code' : 'key']: descriptor,
          }
    defs.push({
      keyDef,
      releasePrevious,
      releaseSelf,
      repeat,
    })
    text = text.slice(consumedLength)
  } while (text)
  return defs
}

export function parseClientKeyboard(
  text: string
): ParsedClientKeyboardAction[] {
  return parseKeyDefWithMap(defaultKeyMap, text)
}

const nativeKeys = new Set<string>([
  'Escape',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
  'Backquote',
  '`',
  '~',
  'Digit1',
  '1',
  '!',
  'Digit2',
  '2',
  '@',
  'Digit3',
  '3',
  '#',
  'Digit4',
  '4',
  '$',
  'Digit5',
  '5',
  '%',
  'Digit6',
  '6',
  '^',
  'Digit7',
  '7',
  '&',
  'Digit8',
  '8',
  '*',
  'Digit9',
  '9',
  '(',
  'Digit0',
  '0',
  ')',
  'Minus',
  '-',
  '_',
  'Equal',
  '=',
  '+',
  'Backslash',
  '\\',
  '|',
  'Backspace',
  'Tab',
  'KeyQ',
  'q',
  'Q',
  'KeyW',
  'w',
  'W',
  'KeyE',
  'e',
  'E',
  'KeyR',
  'r',
  'R',
  'KeyT',
  't',
  'T',
  'KeyY',
  'y',
  'Y',
  'KeyU',
  'u',
  'U',
  'KeyI',
  'i',
  'I',
  'KeyO',
  'o',
  'O',
  'KeyP',
  'p',
  'P',
  'BracketLeft',
  '[',
  '{',
  'BracketRight',
  ']',
  '}',
  'CapsLock',
  'KeyA',
  'a',
  'A',
  'KeyS',
  's',
  'S',
  'KeyD',
  'd',
  'D',
  'KeyF',
  'f',
  'F',
  'KeyG',
  'g',
  'G',
  'KeyH',
  'h',
  'H',
  'KeyJ',
  'j',
  'J',
  'KeyK',
  'k',
  'K',
  'KeyL',
  'l',
  'L',
  'Semicolon',
  ';',
  ':',
  'Quote',
  "'",
  '"',
  'Enter',
  '\n',
  '\r',
  'ShiftLeft',
  'Shift',
  'KeyZ',
  'z',
  'Z',
  'KeyX',
  'x',
  'X',
  'KeyC',
  'c',
  'C',
  'KeyV',
  'v',
  'V',
  'KeyB',
  'b',
  'B',
  'KeyN',
  'n',
  'N',
  'KeyM',
  'm',
  'M',
  'Comma',
  ',',
  '<',
  'Period',
  '.',
  '>',
  'Slash',
  '/',
  '?',
  'ShiftRight',
  'ControlLeft',
  'Control',
  'MetaLeft',
  'Meta',
  'AltLeft',
  'Alt',
  'Space',
  ' ',
  'AltRight',
  'AltGraph',
  'MetaRight',
  'ContextMenu',
  'ControlRight',
  'PrintScreen',
  'ScrollLock',
  'Pause',
  'PageUp',
  'PageDown',
  'Insert',
  'Delete',
  'Home',
  'End',
  'ArrowLeft',
  'ArrowUp',
  'ArrowRight',
  'ArrowDown',
  'NumLock',
  'NumpadDivide',
  'NumpadMultiply',
  'NumpadSubtract',
  'Numpad7',
  'Numpad8',
  'Numpad9',
  'Numpad4',
  'Numpad5',
  'Numpad6',
  'NumpadAdd',
  'Numpad1',
  'Numpad2',
  'Numpad3',
  'Numpad0',
  'NumpadDecimal',
  'NumpadEnter',
  'ControlOrMeta',
])

export function isNativeClientKeyboardKey(key: string): boolean {
  return nativeKeys.has(key)
}
