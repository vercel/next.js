const assert = require('node:assert/strict')
const path = require('node:path')
const { parseClientKeyboard, isNativeClientKeyboardKey } = require(
  path.join(
    process.argv[2] || path.dirname(require.resolve('next/package.json')),
    'dist/experimental/testing/client/keyboard-primitives.js'
  )
)
const reference = require('./fixtures/keyboard-parser/reference.json')
for (const record of reference.cases) {
  let actual
  try {
    actual = { text: record.text, value: parseClientKeyboard(record.text) }
  } catch (error) {
    actual = {
      text: record.text,
      error: { name: error.name, message: error.message },
    }
  }
  assert.deepEqual(actual, record, JSON.stringify(record.text))
}
for (const record of reference.membership)
  assert.equal(isNativeClientKeyboardKey(record.key), record.native, record.key)
for (const record of reference.identities)
  assert.equal(
    parseClientKeyboard(record.left)[0].keyDef ===
      parseClientKeyboard(record.right)[0].keyDef,
    record.same,
    JSON.stringify(record)
  )
console.log(
  JSON.stringify({
    parserInputs: reference.cases.length,
    nativeMemberships: reference.membership.length,
    actualIdentityPairs: reference.identities.length,
    purePinnedPrimitive: true,
    noAdapterAdmissionClaim: true,
  })
)
