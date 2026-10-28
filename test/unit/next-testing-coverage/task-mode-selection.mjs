import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, mode, phase] = process.argv.slice(2),
  consumer = resolve(consumerArg),
  output = resolve(outputArg)
mkdirSync(output, { recursive: true })
if (phase !== 'child') {
  const env = { ...process.env, CI: '1', NODE_ENV: 'development' }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  const owner = await runOwnedNode(
    [fileURLToPath(import.meta.url), consumer, output, mode, 'child'],
    { cwd: consumer, env, auditDir: join(output, 'owners'), timeoutMs: 30000 }
  )
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'actual selected mode ' + mode)
  assert.equal(owner.status, 0, owner.stderr)
} else {
  const load = createRequire(join(consumer, 'package.json')),
    { createCollector } = load(
      'next/dist/experimental/testing/runner/collector'
    ),
    { createTaskTree, finalizePublicTaskModes } = load(
      'next/dist/experimental/testing/runner/tasks'
    )
  let evidence
  if (mode === 'two-arg-order') {
    const c = createCollector('mode-read-order')
    c.api.test.skip('skip', () => {})
    c.api.test.todo('todo')
    c.api.describe('nested', () => c.api.test.skip('leaf', () => {}))
    const root = c.close(),
      { tasks } = createTaskTree(root, {
        testTimeout: 5000,
        filePath: '/actual/mode-read-order.test.mjs',
      }),
      trace = []
    for (const [, task] of tasks) {
      let value = task.mode
      Object.defineProperty(task, 'mode', {
        configurable: true,
        enumerable: true,
        get() {
          trace.push('mode-get:' + task.id)
          return value
        },
        set(next) {
          trace.push('mode-set:' + task.id + ':' + next)
          value = next
        },
      })
    }
    const source = tasks,
      wrapped = {
        get(key) {
          trace.push('tasks.get:' + key.id)
          return source.get(key)
        },
        [Symbol.iterator]() {
          trace.push('tasks.iterator')
          return source[Symbol.iterator]()
        },
      },
      set = Object.getOwnPropertyDescriptor(Map.prototype, 'set')
    let result
    try {
      // eslint-disable-next-line no-extend-native -- controlled baseline order probe, restored in finally
      Object.defineProperty(Map.prototype, 'set', {
        configurable: true,
        enumerable: set.enumerable,
        get() {
          trace.push('map.set-get')
          return set.value
        },
      })
      result = finalizePublicTaskModes(root, wrapped)
    } finally {
      // eslint-disable-next-line no-extend-native -- controlled baseline order probe, restored in finally
      Object.defineProperty(Map.prototype, 'set', set)
    }
    evidence = {
      trace,
      rows: [...result].map(([node, value]) => [node.id, value]),
    }
    assert.deepEqual(
      evidence,
      JSON.parse(
        readFileSync(
          join(
            dirname(fileURLToPath(import.meta.url)),
            'fixtures/istanbul-provider/task-mode-two-arg-order.json'
          )
        )
      )
    )
  } else {
    const c = createCollector('actual-selected-' + mode)
    if (mode !== 'literal-empty') {
      c.api.test('first', () => {})
      c.api.describe('nested', () => {
        c.api.test('second', () => {})
        c.api.test.todo('todo')
      })
    }
    const root = c.close(),
      { tasks } = createTaskTree(root, { testTimeout: 5000 }),
      tests = [...tasks.keys()].filter((n) => n.type === 'test'),
      selection = new Map(
        tests.map((n) => [
          n,
          n.mode === 'todo'
            ? 'todo'
            : mode === 'one' && n.name === 'second'
              ? 'run'
              : 'skip',
        ])
      ),
      before = [...tasks].map(([n, t]) => [n, t.mode]),
      original = [...selection]
    if (mode === 'missing') selection.delete(tests[0])
    if (mode === 'foreign') {
      const other = createCollector('foreign')
      other.api.test('foreign', () => {})
      const foreign = other.close().children[0]
      selection.delete(tests[0])
      selection.set(foreign, 'skip')
    }
    if (mode === 'invalid') selection.set(tests[0], 'invalid')
    if (['missing', 'foreign', 'invalid', 'throw-undefined'].includes(mode)) {
      let thrown = false,
        error
      try {
        finalizePublicTaskModes(
          root,
          tasks,
          mode === 'throw-undefined'
            ? {
                get() {
                  // eslint-disable-next-line no-throw-literal -- preserve an actual undefined selection failure
                  throw undefined
                },
              }
            : selection
        )
      } catch (value) {
        thrown = true
        error = value
      }
      assert.equal(thrown, true)
      if (mode === 'throw-undefined') assert.equal(error, undefined)
      else assert.match(error.message, /each actual test selection/)
      assert.deepEqual(
        [...tasks].map(([n, t]) => [n, t.mode]),
        before
      )
      evidence = { mode, refused: true, actualTaskModesUnchanged: true }
    } else {
      const result = finalizePublicTaskModes(root, tasks, selection)
      assert.deepEqual([...selection], original)
      assert.equal(
        result.get(root),
        mode === 'literal-empty' || mode === 'one' ? 'run' : 'skip'
      )
      for (const test of tests) {
        assert.equal(result.get(test), selection.get(test))
        assert.strictEqual(tasks.get(test).file, [...tasks.values()][0])
        assert.equal(tasks.get(test).mode, selection.get(test))
      }
      evidence = {
        mode,
        rows: [...result].map(([n, v]) => [n.id, v]),
        selectionUnchanged: true,
        taskIdentitiesHeld: true,
      }
    }
  }
  writeFileSync(
    join(output, 'CHECKS.json'),
    JSON.stringify(evidence, null, 2) + '\n'
  )
}
