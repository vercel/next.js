import assert from 'node:assert/strict'

/** Compare real FIFO streams without inventing an interprocess dispatch ack. */
export function assertModuleStartCausalOrder(actual, expected, heldRows) {
  for (const rows of [actual, expected, heldRows]) {
    assert(Array.isArray(rows))
    assert(
      rows.every((row) => row && ['author', 'reporter'].includes(row.actor))
    )
  }
  for (const actor of ['reporter', 'author'])
    assert.deepEqual(
      actual.filter((row) => row.actor === actor),
      expected.filter((row) => row.actor === actor),
      'complete ' + actor + ' stream, with every original field retained'
    )
  const index = (event) =>
    actual.findIndex((row) => row.actor === 'reporter' && row.event === event)
  const start = index('start'),
    end = index('end'),
    returned = index('start-return'),
    finished = index('run-end')
  assert(start >= 0 && start < end && end < returned && returned < finished)
  assert(
    actual.every((row, ordinal) => row.actor !== 'author' || ordinal < end),
    'actual authored effects must close before ModuleEnd'
  )
  assert(
    heldRows.some((row) => row.actor === 'reporter' && row.event === 'start')
  )
  assert(
    heldRows.some((row) => row.actor === 'reporter' && row.event === 'end')
  )
  assert(
    !heldRows.some(
      (row) =>
        row.actor === 'reporter' &&
        ['start-return', 'run-end'].includes(row.event)
    ),
    'the actual Start promise remains held through End'
  )
}
