import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { assertModuleStartCausalOrder } from './module-start-causal.mjs'
const [output] = process.argv.slice(2),
  input = JSON.parse(
    readFileSync(
      new URL('./fixtures/module-start-public/success.json', import.meta.url)
    )
  ),
  expected = input.genuine.development.rows
const originalModel = JSON.stringify(expected)
const end = expected.findIndex(
    (row) => row.actor === 'reporter' && row.event === 'end'
  ),
  held = expected.slice(0, end + 1)
assertModuleStartCausalOrder(expected, expected, held)
const shifted = structuredClone(expected),
  fixture = shifted.findIndex(
    (row) => row.actor === 'author' && row.event === 'file-fixture-setup'
  ),
  [row] = shifted.splice(fixture, 1),
  start = shifted.findIndex(
    (row) => row.actor === 'reporter' && row.event === 'start'
  )
shifted.splice(start, 0, row)
assertModuleStartCausalOrder(
  shifted,
  expected,
  shifted.slice(
    0,
    shifted.findIndex(
      (row) => row.actor === 'reporter' && row.event === 'end'
    ) + 1
  )
)
let rejected = 0
const fault = (change) => {
  const actual = structuredClone(expected),
    pending = structuredClone(held)
  change(actual, pending)
  assert.throws(() => assertModuleStartCausalOrder(actual, expected, pending))
  rejected++
}
fault((rows) => {
  rows.find((row) => row.event === 'start').state = 'passed'
})
fault((rows) => {
  rows.splice(
    rows.findIndex((row) => row.actor === 'author' && row.event === 'body'),
    1
  )
})
fault((rows) => {
  rows.find((row) => row.event === 'start').unowned = true
})
fault((rows) => {
  rows.splice(1, 0, structuredClone(rows[0]))
})
fault((rows) => {
  const index = rows.findLastIndex((row) => row.actor === 'author'),
    [row] = rows.splice(index, 1)
  rows.splice(rows.findIndex((row) => row.event === 'end') + 1, 0, row)
})
fault((_, pending) =>
  pending.splice(
    pending.findIndex((row) => row.event === 'end'),
    1
  )
)
fault((_, pending) =>
  pending.push(
    structuredClone(expected.find((row) => row.event === 'start-return'))
  )
)
fault((rows) => rows.push({ actor: 'unknown', event: 'unowned' }))
fault((rows) => {
  const first = rows.findIndex((row) => row.event === 'end'),
    last = rows.findIndex((row) => row.event === 'start-return')
  ;[rows[first], rows[last]] = [rows[last], rows[first]]
})
fault((rows) => {
  const first = rows.findIndex((row) => row.event === 'body'),
    last = rows.findIndex((row) => row.event === 'file-fixture-setup')
  ;[rows[first], rows[last]] = [rows[last], rows[first]]
})
fault((rows) => {
  delete rows.find((row) => row.event === 'start').errors
})
assert.equal(JSON.stringify(expected), originalModel)
writeFileSync(
  output,
  JSON.stringify(
    {
      acceptedExactAndUnawaitedInterleaving: 2,
      rejectedFieldOrderOwnerAndCausalFaults: rejected,
      everyOriginalRowFieldRetained: true,
      modelUnchanged: true,
    },
    null,
    2
  ) + '\n'
)
