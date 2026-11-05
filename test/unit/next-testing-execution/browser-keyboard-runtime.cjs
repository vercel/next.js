const assert = require('node:assert/strict')
const path = require('node:path')
const { runClientKeyboard, cleanupClientKeyboard } = require(
  path.join(
    process.argv[2] || path.dirname(require.resolve('next/package.json')),
    'dist/experimental/testing/client/keyboard.js'
  )
)

function keyboard(calls) {
  return Object.fromEntries(
    ['up', 'down', 'insertText'].map((method) => [
      method,
      async (key) => {
        calls.push([method, key])
      },
    ])
  )
}
async function check(
  text,
  expectedCalls,
  { initial = [], skipRelease = true, held = [] } = {}
) {
  const calls = []
  const frozen = Object.freeze([...initial])
  const result = await runClientKeyboard(
    keyboard(calls),
    text,
    async () => {
      calls.push(['selectAll'])
    },
    frozen,
    skipRelease
  )
  assert.deepEqual(calls, expectedCalls, text)
  assert.deepEqual(result, { unreleased: held }, text)
  assert.deepEqual(frozen, initial)
}

async function main() {
  for (const key of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()')
    await check(key, [
      ['down', key],
      ['up', key],
    ])
  for (const [text, key] of [
    ['[KeyA]', 'a'],
    ['[ShiftRight]', 'Shift'],
    ['{ShiftRight}', 'ShiftRight'],
    ['{Control}', 'Control'],
    ['{ControlOrMeta}', 'ControlOrMeta'],
    ['{F1}', 'F1'],
  ])
    await check(text, [
      ['down', key],
      ['up', key],
    ])
  for (const [text, key] of [
    ['[OSLeft]', 'OS'],
    ['{Fn}', 'Fn'],
    ['{Symbol}', 'Symbol'],
    ['{future}', 'future'],
    ['[future]', 'Unknown'],
  ])
    await check(text, [['insertText', key]])

  await check('{a>0/}', [
    ['down', 'a'],
    ['up', 'a'],
  ])
  await check('{a>2/}', [
    ['down', 'a'],
    ['down', 'a'],
    ['up', 'a'],
  ])
  await check('{a>2}{/a}', [
    ['down', 'a'],
    ['down', 'a'],
    ['up', 'a'],
  ])
  await check('{Shift>}', [['down', 'Shift']], { held: ['Shift'] })
  await check(
    '{Shift>}',
    [
      ['down', 'Shift'],
      ['up', 'Shift'],
    ],
    {
      skipRelease: false,
      held: ['Shift'],
    }
  )
  await check(
    '{future>2}',
    [
      ['insertText', 'future'],
      ['insertText', 'future'],
    ],
    {
      skipRelease: false,
      held: ['future'],
    }
  )
  await check('{Fn>}', [['insertText', 'Fn']], {
    initial: ['Fn'],
    held: ['Fn'],
  })
  for (const skipRelease of [true, false]) {
    await check('{/future}', [], { initial: ['future'], skipRelease })
    await check(
      '[/ShiftRight]a[UnknownPhysicalCode]',
      [
        ['up', 'Shift'],
        ['down', 'a'],
        ['up', 'a'],
        ['insertText', 'Unknown'],
      ],
      { initial: ['Shift'], skipRelease }
    )
    await check(
      '{/ContextMenu}[PageUp][UnknownPhysicalCode]',
      [
        ['up', 'ContextMenu'],
        ['down', 'PageUp'],
        ['up', 'PageUp'],
        ['insertText', 'Unknown'],
      ],
      { initial: ['ContextMenu'], skipRelease }
    )
  }
  await check('{selectall}', [['selectAll']], { skipRelease: false })

  // Validate the complete input before releasing keys or sending any native action.
  for (const text of [
    '',
    '{a>>}',
    '[/ShiftRight]a[UnknownPhysicalCode-]',
    '{/ContextMenu}[PageUp][UnknownPhysicalCode-]',
    '[/ShiftRight]a[KeyA>9007199254740992/]',
  ]) {
    for (const skipRelease of [true, false]) {
      const calls = []
      const initial = Object.freeze(['Shift'])
      await assert.rejects(
        runClientKeyboard(
          keyboard(calls),
          text,
          async () => {
            calls.push(['selectAll'])
          },
          initial,
          skipRelease
        ),
        (error) => {
          assert.equal(error.name, 'Error')
          assert.match(
            error.message,
            /Expected|Unsupported keyboard key repetition/
          )
          return true
        }
      )
      assert.deepEqual(calls, [])
      assert.deepEqual(initial, ['Shift'])
    }
  }
  // File cleanup releases every retained native key, including unknown key names.
  for (const initial of [
    [],
    ['Shift', 'a'],
    ['Fn'],
    ['OS', 'Symbol', 'future'],
    ['Fn', 'Shift'],
  ]) {
    const calls = []
    const frozen = Object.freeze([...initial])
    assert.equal(
      await cleanupClientKeyboard(keyboard(calls), frozen),
      undefined
    )
    assert.deepEqual(
      calls,
      initial.map((key) => ['up', key])
    )
    assert.deepEqual(frozen, initial)
  }
  console.log(
    JSON.stringify({
      nativeActionsAndTextFallback: true,
      heldKeyReleaseAndCleanup: true,
      completePreflightAndFrozenStates: true,
    })
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
