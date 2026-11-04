/* eslint-disable no-empty-pattern -- Suite hooks require an explicit fixture context. */
const assert = require('node:assert/strict')
const runner = require('next/dist/experimental/testing/runner')
const {
  createCollector,
} = require('next/dist/experimental/testing/runner/collector')

const mode = process.argv[2]
const allowed = [
  'default',
  'authored',
  'deleted',
  'frozen',
  'descriptor',
  'collection-failure',
  'shared',
]
assert(allowed.includes(mode))
let checks = 0
const states = []
async function one(index, worker) {
  const options = {
    fileId: `label-${mode}-${index}`,
    filePath: `/owned/label-${mode}-${index}.test.mjs`,
  }
  const file = worker
    ? worker.createFile(options)
    : runner.initializeTestFile(options)
  let root
  let meta
  let actualFile
  let bodies = 0
  let hooks = 0
  const authoredValue = { index }
  const fault = new Error('authored collection failure')
  const held = () => {
    assert.equal(root.meta, meta)
    assert.equal(Object.getPrototypeOf(meta), null)
    if (mode === 'deleted')
      assert.equal(Object.hasOwn(meta, '__vitest_label__'), false)
    else if (mode === 'authored')
      assert.equal(meta.__vitest_label__, authoredValue)
    else {
      assert.equal(Object.hasOwn(meta, '__vitest_label__'), true)
      assert.equal(meta.__vitest_label__, undefined)
    }
    assert.equal(meta.authored, authoredValue)
    checks++
  }
  try {
    let rejected
    try {
      await file.collect(async () => {
        const node = file.api.test('top-level', ({ task }) => {
          bodies++
          assert.equal(task.file, actualFile)
          assert.equal(task.file.meta, meta)
          assert.equal(Object.hasOwn(task.meta, '__vitest_label__'), false)
          held()
        })
        root = node.suite
        meta = root.meta
        assert.equal(Object.getPrototypeOf(meta), null)
        assert.deepEqual(
          Object.getOwnPropertyDescriptor(meta, '__vitest_label__'),
          {
            value: undefined,
            writable: true,
            enumerable: true,
            configurable: true,
          }
        )
        assert.deepEqual(Object.keys(meta), ['__vitest_label__'])
        assert.equal(Object.hasOwn(node.meta, '__vitest_label__'), false)
        checks++
        meta.authored = authoredValue
        if (mode === 'authored') meta.__vitest_label__ = authoredValue
        if (mode === 'deleted') delete meta.__vitest_label__
        if (mode === 'frozen') Object.freeze(meta)
        if (mode === 'descriptor')
          Object.defineProperty(meta, '__vitest_label__', {
            value: undefined,
            enumerable: false,
            writable: false,
            configurable: false,
          })
        held()
        file.api.beforeAll(({}, suite) => {
          hooks++
          assert.equal(suite, actualFile)
          assert.equal(suite.meta, meta)
          held()
        })
        file.api.describe('child', () => {
          file.api.test('nested', ({ task }) => {
            bodies++
            assert.equal(task.file, actualFile)
            assert.equal(task.file.meta, meta)
            assert.equal(Object.hasOwn(task.meta, '__vitest_label__'), false)
            assert.equal(
              Object.hasOwn(task.suite.meta, '__vitest_label__'),
              false
            )
            assert.equal(Object.hasOwn(task.suite.meta, 'authored'), false)
            held()
          })
        })
        if (mode === 'collection-failure') throw fault
      })
    } catch (error) {
      rejected = error
    }
    if (mode === 'collection-failure') {
      assert.equal(rejected, fault)
      assert.equal(bodies, 0)
      assert.equal(hooks, 0)
      held()
    } else {
      assert.equal(rejected, undefined)
      const result = await file.run({
        runId: 'label-meta',
        signal: new AbortController().signal,
        onCollected(task) {
          actualFile = task
          assert.equal(task.meta, meta)
          held()
        },
      })
      assert.equal(result.errors.length, 0)
      assert.deepEqual(
        result.cases.map((task) => task.status),
        ['passed', 'passed']
      )
      assert.equal(bodies, 2)
      assert.equal(hooks, 1)
      held()
    }
  } finally {
    await file.dispose()
  }
  held()
  states.push(meta)
}
async function main() {
  const raw = createCollector('private-collector')
  assert.equal(Object.hasOwn(raw.root.meta, '__vitest_label__'), false)
  await raw.settle()
  raw.close()
  if (mode === 'shared') {
    const worker = runner.initializeTestWorker({ workerId: 'label-worker' })
    try {
      await one(0, worker)
      await one(1, worker)
    } finally {
      await worker.dispose()
    }
    assert.notEqual(states[0], states[1])
    assert.notEqual(states[0].authored, states[1].authored)
  } else await one(0)
  process.stdout.write(
    JSON.stringify({
      mode,
      checks,
      files: states.length,
      actualFileMetaIdentity: true,
      originalCollectorUnchanged: true,
      actualNode: process.version,
      actualExecutable: process.execPath,
      childInheritanceAbsent: true,
    })
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
