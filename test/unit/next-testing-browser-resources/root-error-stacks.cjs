const assert = require('node:assert/strict')
const {
  createClientResultCollector,
} = require('next/dist/experimental/testing/client/results')
const modes = [
  'absent-stack',
  'empty-stack',
  'null-stacks',
  'authored-stacks',
  'authored-empty-stacks',
  'mapped-stack',
  'missing-map-coordinate',
  'throwing-map',
  'absent-errors',
  'empty-errors',
  'child-only-pack',
  'pending-root',
  'collected-only',
]
for (const mode of modes) {
  const artifact = {
    version: 2,
    kind: 'browser',
    entryId: 'entry',
    revision: 'revision',
    profile: {
      id: 'browser',
      environment: 'browser',
      mode: 'development',
      browserClient: true,
      runtime: 'nodejs',
      bundler: 'turbopack',
    },
    client: { sourceFile: '/project/stacks.test.mjs', scripts: [], styles: [] },
    files: [],
  }
  const calls = []
  const collector = createClientResultCollector(
    artifact,
    { runId: 'run', captureTaskResults: true },
    (stack) => {
      calls.push(stack)
      if (mode === 'throwing-map') throw new Error('owned mapping unavailable')
      return [
        {
          file: '/project/stacks.test.mjs',
          line: 7,
          ...(mode === 'missing-map-coordinate' ? {} : { column: 11 }),
          methodName: 'actualMethod',
          original: true,
        },
      ]
    }
  )
  const child = {
    id: 'entry/0',
    type: 'test',
    name: 'child',
    fullName: 'stacks.test.mjs > child',
    fullTestName: 'child',
    parentSuiteId: null,
    mode: 'run',
    meta: {},
    tags: [],
  }
  const tree = {
    id: 'entry',
    type: 'suite',
    name: 'stacks.test.mjs',
    fullName: 'stacks.test.mjs',
    parentSuiteId: null,
    mode: 'run',
    meta: {},
    tags: [],
    tasks: [child],
    filepath: artifact.client.sourceFile,
    projectName: 'browser',
  }
  const declarations = [
    { type: 'suite', id: 'entry', parentId: null, name: '', mode: 'run' },
    {
      type: 'test',
      id: 'entry/0',
      parentId: 'entry',
      name: 'child',
      mode: 'run',
    },
  ]
  if (mode === 'collected-only')
    tree.result = {
      state: 'fail',
      errors: [{ message: 'collection failure', stack: '' }],
    }
  const beforeCollected = structuredClone(tree)
  collector.accept({ type: 'collected', declarations, taskTree: tree })
  assert.deepEqual(
    collector.events[0].taskTree,
    beforeCollected,
    mode + ' collected graph stays exact'
  )
  if (mode === 'collected-only') continue
  const error = {
    name: 'FixtureError',
    message: 'actual root fields',
    ...(mode === 'absent-stack' ? {} : { stack: '' }),
    payload: { retained: true },
    cause: {
      name: 'CauseError',
      message: 'cause fields',
      stack: 'cause stack is not parsed',
    },
  }
  if (
    [
      'mapped-stack',
      'throwing-map',
      'missing-map-coordinate',
      'authored-stacks',
      'authored-empty-stacks',
    ].includes(mode)
  )
    error.stack = 'actual raw stack'
  if (mode === 'null-stacks') error.stacks = null
  if (mode === 'authored-stacks')
    error.stacks = [
      {
        method: 'authored',
        file: 'authored.ts',
        line: 4,
        column: 6,
        metadata: 'retained',
      },
    ]
  if (mode === 'authored-empty-stacks') error.stacks = []
  tree.result = {
    state: mode === 'pending-root' ? 'run' : 'fail',
    errors: [error],
  }
  if (mode === 'absent-errors') delete tree.result.errors
  if (mode === 'empty-errors') tree.result.errors = []
  child.result = {
    state: 'fail',
    errors: [{ message: 'child stays exact', stack: 'unmapped child stack' }],
  }
  const message = {
    type: 'task-update',
    taskTree: tree,
    taskUpdateIds: mode === 'child-only-pack' ? ['entry/0'] : ['entry'],
    caseResults: [],
  }
  const before = structuredClone(message)
  collector.accept(message)
  assert.deepEqual(message, before, mode + ' received message stays unchanged')
  const event = collector.events.findLast(
    (value) => value.type === 'task-update'
  )
  assert.deepEqual(
    event.taskTree.tasks,
    before.taskTree.tasks,
    mode + ' child task fields stay exact'
  )
  const result = event.taskTree.result
  if (mode === 'absent-errors')
    assert(!Object.prototype.hasOwnProperty.call(result, 'errors'))
  else if (mode === 'empty-errors') assert.deepEqual(result.errors, [])
  else if (mode === 'child-only-pack' || mode === 'pending-root')
    assert.deepEqual(result, before.taskTree.result)
  else {
    const expected = structuredClone(error)
    if (!expected.stacks)
      expected.stacks =
        mode === 'mapped-stack'
          ? [
              {
                method: 'actualMethod',
                file: '/project/stacks.test.mjs',
                line: 7,
                column: 11,
              },
            ]
          : []
    assert.deepEqual(
      result.errors,
      [expected],
      mode + ' exact root fields/enrichment'
    )
  }
  const mapped = [
    'mapped-stack',
    'throwing-map',
    'missing-map-coordinate',
  ].includes(mode)
  assert.deepEqual(
    calls,
    mapped ? ['actual raw stack'] : [],
    mode + ' only owned top-level stack is parsed'
  )
}
process.stdout.write(
  JSON.stringify({
    comparisons: modes.length,
    receivedAndCollectedGraphsUnchanged: true,
    rootPackAndFinalResultOnly: true,
    absentErrorsPropertyPreserved: true,
    childSnapshotsUntouched: true,
    authoredStacksAndRawMetadataHeld: true,
    actualTopLevelFramesOnly: true,
    missingCoordinatesNeverInvented: true,
    mapperFailurePreservesRawError: true,
  }) + '\n'
)
