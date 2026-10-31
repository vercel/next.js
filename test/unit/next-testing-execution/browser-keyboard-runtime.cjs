const assert = require('node:assert/strict')
const path = require('node:path')
const { runClientKeyboard, cleanupClientKeyboard } = require(
  path.join(
    process.argv[2] || path.dirname(require.resolve('next/package.json')),
    'dist/experimental/testing/client/keyboard.js'
  )
)
const reference = require('./fixtures/keyboard-parser/runtime-reference.json')
async function main() {
  for (const record of reference.cases) {
    const calls = []
    const keyboard = Object.fromEntries(
      ['up', 'down', 'insertText'].map((method) => [
        method,
        async (key) => {
          calls.push([method, key])
        },
      ])
    )
    const initial = Object.freeze([...record.initial])
    let actual
    try {
      const value =
        record.kind === 'run'
          ? await runClientKeyboard(
              keyboard,
              record.text,
              async () => {
                calls.push(['selectAll'])
              },
              initial,
              record.skipRelease
            )
          : await cleanupClientKeyboard(keyboard, initial)
      actual = {
        calls,
        ...(record.kind === 'run'
          ? { result: value }
          : { returnedUndefined: value === undefined }),
      }
    } catch (error) {
      actual = { calls, error: { name: error.name, message: error.message } }
    }
    assert.deepEqual(actual, record.expected, JSON.stringify(record))
    assert.deepEqual(initial, record.initial)
  }
  const hugeCalls = []
  await assert.rejects(
    runClientKeyboard(
      Object.fromEntries(
        ['up', 'down', 'insertText'].map((method) => [
          method,
          async (key) => {
            hugeCalls.push([method, key])
          },
        ])
      ),
      '[/ShiftRight]a[KeyA>9007199254740992/]',
      async () => {},
      Object.freeze(['Shift'])
    )
  )
  assert.deepEqual(hugeCalls, [])
  console.log(
    JSON.stringify({
      runtimeCases: reference.cases.length,
      completePreflightAndFrozenStates: true,
      distinctFileAndTypeRelease: true,
      exactPinnedNativeCallContract: true,
      existingLargeRepeatGuardRetained: true,
    })
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
