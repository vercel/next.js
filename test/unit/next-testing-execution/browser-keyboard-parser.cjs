const assert = require('node:assert/strict')
const path = require('node:path')
const {
  parseClientKeyboard: parse,
  isNativeClientKeyboardKey: nativeKey,
} = require(
  path.join(
    process.argv[2] || path.dirname(require.resolve('next/package.json')),
    'dist/experimental/testing/client/keyboard-primitives.js'
  )
)

const press = (code, key, extra = {}, modifiers = {}) => ({
  keyDef: { code, key, ...extra },
  releasePrevious: false,
  releaseSelf: true,
  repeat: 1,
  ...modifiers,
})

// Characters, named keys and physical codes must select the same key definition.
for (const key of 'abcdefghijklmnopqrstuvwxyz') {
  const code = `Key${key.toUpperCase()}`
  assert.deepEqual(parse(key), [press(code, key)])
  assert.deepEqual(parse(`[${code}]`), parse(key))
  assert.deepEqual(parse(`{${key.toUpperCase()}}`), parse(key))
  assert.deepEqual(parse(key.toUpperCase()), [
    press(code, key.toUpperCase(), { shiftKey: true }),
  ])
}
for (const key of '0123456789') {
  assert.deepEqual(parse(key), [press(`Digit${key}`, key)])
  assert.deepEqual(parse(`[Digit${key}]`), parse(key))
}
for (const [digit, key] of [...')!@#$%^&*('].entries())
  assert.deepEqual(parse(key), [
    press(`Digit${digit}`, key, { shiftKey: true }),
  ])

for (const [text, code, key, extra] of [
  ['{Enter}', 'Enter', 'Enter'],
  ['{ArrowLeft}', 'ArrowLeft', 'ArrowLeft'],
  ['{Shift}', 'ShiftLeft', 'Shift', { location: 1 }],
  ['[ShiftRight]', 'ShiftRight', 'Shift', { location: 2 }],
  ['{AltGraph}', 'AltRight', 'AltGraph'],
  ['[OSLeft]', 'OSLeft', 'OS', { location: 1 }],
  ['[OSRight]', 'OSRight', 'OS', { location: 2 }],
  ['[Fn]', 'Fn', 'Fn'],
  ['{Symbol}', 'Symbol', 'Symbol'],
  ['{{', 'BracketLeft', '{', { shiftKey: true }],
  ['[[', 'BracketLeft', '['],
])
  assert.deepEqual(parse(text), [press(code, key, extra)])

// Unknown descriptors remain usable; they are distinct from malformed grammar.
assert.deepEqual(parse('{future}'), [press('Unknown', 'future')])
assert.deepEqual(parse('[future]'), [press('future', 'Unknown')])
assert.deepEqual(parse('{ShiftRight}'), [press('Unknown', 'ShiftRight')])
assert.deepEqual(parse('{\\>}'), [press('Unknown', '>')])
for (let value = 0; value < 32; value++) {
  const key = String.fromCharCode(value)
  assert.deepEqual(parse(key), [press('Unknown', key)])
}

for (const text of ['{a>0/}', '[KeyA>000/]'])
  assert.deepEqual(parse(text), [press('KeyA', 'a')])
assert.deepEqual(parse('{a>2/}'), [press('KeyA', 'a', {}, { repeat: 2 })])
assert.deepEqual(parse('{a>2}{/a}'), [
  press('KeyA', 'a', {}, { repeat: 2, releaseSelf: false }),
  press('KeyA', 'a', {}, { releasePrevious: true }),
])
assert.equal(parse('{a>9007199254740992/}')[0].repeat, 9007199254740992)
const trailing = parse('[KeyA>2/]trailing')
assert.deepEqual(trailing[0], press('KeyA', 'a', {}, { repeat: 2 }))
assert.equal(
  trailing
    .slice(1)
    .map(({ keyDef }) => keyDef.key)
    .join(''),
  'trailing'
)
for (const [text, prefix] of [
  ['', 'Expected key descriptor'],
  ['{', 'Expected key descriptor'],
  ['{}', 'Expected key descriptor'],
  ['[]', 'Expected key descriptor'],
  ['[/]', 'Expected key descriptor'],
  ['{future-key}', 'Expected repeat modifier or release modifier'],
  ['[foo-bar]', 'Expected repeat modifier or release modifier'],
  ['{a>>}', 'Expected repeat modifier'],
  ['[KeyA>1.5]', 'Expected release modifier'],
])
  assert.throws(parse.bind(null, text), (error) => {
    assert.equal(error.name, 'Error')
    assert(error.message.startsWith(prefix))
    assert(error.message.includes(JSON.stringify(text)))
    return true
  })

for (const key of [
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  'Escape',
  'Enter',
  'Tab',
  'Space',
  ' ',
  '\n',
  'Shift',
  'ShiftLeft',
  'Control',
  'AltGraph',
  'Meta',
  'ArrowUp',
  'F1',
  'ControlOrMeta',
])
  assert.equal(nativeKey(key), true, key)
for (const key of ['Unknown', 'future', 'Fn', 'Symbol', 'OS', 'selectall'])
  assert.equal(nativeKey(key), false, key)
for (const [left, right, same] of [
  ['a', '[KeyA]', true],
  ['{A}', 'a', true],
  ['A', '[KeyA]', false],
  ['[AltRight]', '{Alt}', false],
  ['[OSRight]', '{OS}', false],
  ['[Fn]', '{Fn}', true],
  ['{future}', '{future}', false],
  ['[future]', '[future]', false],
])
  assert.equal(parse(left)[0].keyDef === parse(right)[0].keyDef, same)

console.log(
  JSON.stringify({
    characterAndPhysicalMappings: true,
    grammarModifiersAndErrors: true,
    nativeMembershipAndKeyIdentity: true,
  })
)
