import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
require('next/dist/server/node-environment-baseline')
const {
  createCollector,
} = require('next/dist/experimental/testing/runner/collector')
const {
  runCollected,
} = require('next/dist/experimental/testing/runner/lifecycle')
const {
  getCollectionTaskView,
} = require('next/dist/experimental/testing/runner/tasks')
const [mode, output] = process.argv.slice(2)
const c = createCollector('owned:modes'),
  events = [],
  bodies = []
c.api.beforeAll(() => events.push('before-all'))
c.api.afterAll(() => events.push('after-all'))
const excluded = () => {
  c.api.test.skip('skipped', () => bodies.push('BAD'))
  c.api.test.todo('retained todo')
}
if (mode === 'skip-todo-empty' || mode === 'todo-skip-empty') {
  const outer = mode === 'skip-todo-empty' ? 'skip' : 'todo'
  const inner = outer === 'skip' ? 'todo' : 'skip'
  c.api.describe[outer]('outer', () => {
    c.api.describe[inner]('explicit excluded', () => {
      c.api.describe('implicit empty', () => {})
    })
  })
} else if (mode === 'nested') c.api.describe('nested', excluded)
else if (mode === 'todo-suite') c.api.describe.todo('todo suite')
else if (mode === 'mixed') {
  c.api.test('runs', () => bodies.push('runs'))
  excluded()
} else if (mode === 'focus') {
  c.api.test.only('focused', () => bodies.push('focused'))
  c.api.test('other', () => bodies.push('BAD'))
} else if (mode === 'filter') c.api.test('filtered', () => bodies.push('BAD'))
else excluded()
await c.settle()
const root = c.close(),
  privateModes = new Map(),
  cached = new Map()
function remember(node) {
  privateModes.set(node, node.mode)
  cached.set(
    node,
    getCollectionTaskView(root, node, {
      filePath: '/owned/modes.case.mjs',
      testTimeout: 10000,
    })
  )
  if (node.type === 'suite') node.children.forEach(remember)
}
remember(root)
const controller = new AbortController()
if (mode === 'cancelled')
  controller.abort(new Error('owned pre-existing abort'))
let initial, finalFile
const caseModes = []
const result = await runCollected(
  root,
  {
    runId: 'owned-modes',
    signal: controller.signal,
    filePath: '/owned/modes.case.mjs',
    ...(mode === 'absent'
      ? {}
      : { finalizePublicTaskModes: mode === 'truthy' ? 'true' : true }),
    ...(mode === 'filter' ? { testNamePattern: 'never' } : {}),
    onCollected(file) {
      assert.equal(file, cached.get(root))
      initial = {
        mode: file.mode,
        children: file.tasks.map((t) => ({
          name: t.name,
          mode: t.mode,
          children: t.tasks?.map((t) => ({ name: t.name, mode: t.mode })),
        })),
      }
    },
    onCaseResult(task, test) {
      caseModes.push([task.name, task.mode, test.mode])
    },
    onSuiteEnd(suite, file) {
      if (suite.suiteId === root.id)
        finalFile = { mode: file.mode, status: suite.status }
    },
  },
  () => {}
)
for (const [node, originalMode] of privateModes) {
  assert.equal(node.mode, originalMode)
  assert.equal(
    getCollectionTaskView(root, node, {
      filePath: '/owned/modes.case.mjs',
      testTimeout: 10000,
    }),
    cached.get(node)
  )
}
if (mode === 'mixed') {
  assert.equal(initial.mode, 'run')
  assert.deepEqual(bodies, ['runs'])
  assert.deepEqual(events, ['before-all', 'after-all'])
  assert.equal(result.errors.length, 0)
  assert.equal(finalFile.status, 'passed')
} else if (mode === 'focus') {
  assert.equal(initial.mode, 'run')
  assert.deepEqual(bodies, ['focused'])
} else if (mode === 'filter') {
  assert.equal(initial.mode, 'run')
  assert.equal(initial.children[0].mode, 'run')
  assert.deepEqual(bodies, [])
} else if (mode === 'absent' || mode === 'truthy') {
  assert.equal(initial.mode, 'run')
  assert.deepEqual(caseModes, [
    ['skipped', 'skip', 'skip'],
    ['retained todo', 'todo', 'todo'],
  ])
} else {
  assert.equal(initial.mode, 'skip')
  assert.deepEqual(bodies, [])
  assert.deepEqual(events, [])
  assert.equal(result.errors.length, 0)
  if (mode === 'nested') {
    assert.equal(initial.children[0].mode, 'skip')
    assert.deepEqual(initial.children[0].children, [
      { name: 'skipped', mode: 'skip' },
      { name: 'retained todo', mode: 'todo' },
    ])
  }
  if (mode === 'skip-todo-empty' || mode === 'todo-skip-empty') {
    const untouched = root.children[0].children[0].children[0]
    assert.equal(cached.get(untouched).mode, 'run')
    assert.equal(cached.get(untouched).result, undefined)
    assert.deepEqual(caseModes, [])
  } else if (mode !== 'todo-suite')
    assert.deepEqual(caseModes, [
      ['skipped', 'skip', 'skip'],
      ['retained todo', 'todo', 'todo'],
    ])
  assert.equal(finalFile.mode, 'skip')
  assert.equal(finalFile.status, mode === 'cancelled' ? 'cancelled' : 'skipped')
  if (mode === 'cancelled') assert.equal(result.interrupted, true)
}
writeFileSync(
  output,
  JSON.stringify(
    {
      mode,
      initial,
      finalFile,
      caseModes,
      bodies,
      events,
      privateDeclarationsUnchanged: true,
      cachedIdentitiesHeld: true,
      actualPlanUsedByExecution: true,
    },
    null,
    2
  ) + '\n'
)
