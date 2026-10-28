'use strict'
const assert = require('node:assert/strict')
const {
  decodeClientRpcValue,
  hasVoidClientRpcReply,
} = require('next/dist/experimental/testing/client/rpc-call')
const kinds = [
  'output',
  'collected',
  'case-start',
  'case-end',
  'case-final',
  'task-update',
  'suite-end',
  'failure',
  'complete',
]
const methods = [
  'keyboardCleanup',
  'wheel',
  'tab',
  'dragAndDrop',
  'click',
  'dblClick',
  'tripleClick',
  'unhover',
  'hover',
  'fill',
  'clear',
  'selectOptions',
  'upload',
]
for (const type of kinds)
  assert.equal(
    decodeClientRpcValue(hasVoidClientRpcReply({ type }), null),
    undefined
  )
for (const method of methods)
  assert.equal(
    decodeClientRpcValue(
      hasVoidClientRpcReply({ type: 'browser-command', command: { method } }),
      null
    ),
    undefined
  )
for (const message of [
  { type: 'snapshot' },
  { type: 'artifact' },
  { type: 'future' },
  ...['type', 'keyboard', 'future-state'].map((method) => ({
    type: 'browser-command',
    command: { method },
  })),
])
  assert.equal(decodeClientRpcValue(hasVoidClientRpcReply(message), null), null)
const marker = new Error('original property error')
const opaque = Object.freeze({
  get untouched() {
    throw marker
  },
})
for (const value of [opaque, marker, undefined, false, 0, '', 'public', NaN])
  assert(Object.is(decodeClientRpcValue(false, value), value))
assert.throws(
  () =>
    hasVoidClientRpcReply({
      get type() {
        throw marker
      },
    }),
  (error) => error === marker
)
for (const [method, mutatedMethod, expected] of [
  ['click', 'keyboard', undefined],
  ['keyboard', 'click', null],
]) {
  const message = { type: 'browser-command', command: { method } }
  const voidReply = hasVoidClientRpcReply(message)
  message.command.method = mutatedMethod
  assert.equal(decodeClientRpcValue(voidReply, null), expected)
}
process.stdout.write(
  JSON.stringify({
    knownVoidKindsOnly: true,
    immutableReplyKindAtActualStart: true,
    snapshotArtifactAndStateNullsHeld: true,
    allNonNullValuesUntouched: true,
    originalErrorsHeld: true,
  }) + '\n'
)
