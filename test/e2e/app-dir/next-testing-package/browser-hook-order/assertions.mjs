import assert from 'node:assert/strict'

export function hookProfiles(browsers) {
  const scenarios = []
  for (const order of ['stack', 'list', 'parallel'])
    for (const limit of [null, 1])
      scenarios.push({
        kind: 'async-ordering',
        order,
        limit,
        suite: 'ordering',
        source: 'async-hooks',
        prefix: 'BROWSER_HOOK_SEQUENCE:',
      })
  for (const order of ['list', 'parallel'])
    scenarios.push({
      kind: 'getter-' + order,
      order,
      limit: null,
      suite: 'ordering',
      source: 'failed-registration-' + order,
      prefix: 'TASK_QUEUE_CONSUMER:',
    })
  for (const kind of ['user-cancel', 'hook-deadline', 'async-suite-ordering'])
    for (const order of ['stack', 'list', 'parallel'])
      for (const limit of order === 'parallel' ? [null, 1] : [null])
        scenarios.push({
          kind,
          order,
          limit,
          suite: kind === 'async-suite-ordering' ? 'ordering' : 'resources',
          source: kind === 'async-suite-ordering' ? 'suite-hooks' : kind,
          prefix:
            kind === 'user-cancel'
              ? 'HOOK_CANCEL_ROWS:'
              : kind === 'hook-deadline'
                ? 'HOOK_DEADLINE_ROWS:'
                : 'BROWSER_HOOK_SEQUENCE:',
        })
  return browsers.flatMap((browser) =>
    ['development', 'production'].flatMap((mode) =>
      scenarios.map((scenario) => ({
        ...scenario,
        browser,
        mode,
        label: `${browser}-${mode}-${scenario.kind}-${scenario.order}-${scenario.limit ?? 'default'}`,
      }))
    )
  )
}

function asyncStages(prefix, reverse, parallel) {
  const labels = reverse ? ['two', 'one'] : ['one', 'two']
  return parallel
    ? ['start', 'end'].flatMap((phase) =>
        labels.map((label) => `${prefix}-${label}-${phase}`)
      )
    : labels.flatMap((label) =>
        ['start', 'end'].map((phase) => `${prefix}-${label}-${phase}`)
      )
}

/** Check scheduling effects, callback identity, and release after cancellation. */
export function assertHookRows(profile, observed) {
  const rows = observed.flat(),
    { kind, order, limit } = profile
  const parallel = order === 'parallel' && limit !== 1
  const reverse = order === 'stack'
  if (kind === 'async-ordering' || kind === 'async-suite-ordering') {
    const suite = kind === 'async-suite-ordering'
    const stages = [
      ...asyncStages(suite ? 'before-all' : 'before', false, parallel),
      'body',
      ...asyncStages(suite ? 'after-all' : 'after', reverse, parallel),
      ...asyncStages('cleanup', reverse, parallel),
      ...(suite
        ? []
        : [
            ...asyncStages('finished', true, false),
            ...asyncStages('failed', reverse, parallel),
          ]),
    ]
    assert.deepEqual(
      rows.map((row) => row.stage),
      stages
    )
    if (!suite) assert(rows.every((row) => row.sameContext === true))
    return
  }
  if (kind.startsWith('getter-')) {
    // Array implementation details are incidental; registration effects are not.
    const semantic = rows.filter(
      (row) => !['map', 'slice', 'reverse'].includes(row.stage)
    )
    assert.deepEqual(
      semantic.map((row) => row.stage),
      [
        'body-return',
        'afterEach',
        'first-failed',
        'live-refused',
        'live-refused',
        'appended',
        ...(order === 'list'
          ? ['appended-global', 'appended-retained', 'appended-manual']
          : []),
      ]
    )
    assert.deepEqual(semantic.find((row) => row.stage === 'afterEach').errors, [
      'actual controlled body failure',
    ])
    assert.equal(
      semantic.find((row) => row.stage === 'first-failed').receiverUndefined,
      true
    )
    assert.deepEqual(
      semantic
        .filter((row) => row.stage === 'live-refused')
        .map(({ name, message }) => ({ name, message })),
      ['onTestFinished', 'onTestFailed'].map((name) => ({
        name,
        message: `Cannot call "${name}" inside a test hook.`,
      }))
    )
    return
  }
  if (kind === 'user-cancel') {
    assert.deepEqual(
      rows.map((row) => row.stage),
      [
        'before-one-start',
        ...(parallel ? ['before-two'] : []),
        'before-one-abort',
        'before-one-end',
        ...(parallel ? [] : ['before-two']),
        'unexpected-body',
        'after-each',
        ...(reverse
          ? ['cleanup-two', 'cleanup-one']
          : ['cleanup-one', 'cleanup-two']),
        'finished',
      ]
    )
    assert.equal(rows[0].aborted, false)
    assert(
      rows
        .slice(1)
        .every(
          (row) =>
            row.aborted ===
            (parallel && row.stage === 'before-two' ? false : true)
        )
    )
    return
  }
  assert.equal(kind, 'hook-deadline')
  assert.deepEqual(
    rows.map((row) => row.stage),
    [
      'before-one-start',
      ...(order === 'parallel' ? ['before-two'] : []),
      'after-each-start',
      'before-one-end',
      'after-each-end',
      'finished',
      'failed',
    ]
  )
  assert.equal(rows[0].aborted, false)
  assert(
    rows
      .slice(1)
      .every(
        (row) =>
          row.aborted ===
          (parallel && row.stage === 'before-two' ? false : true)
      )
  )
}
