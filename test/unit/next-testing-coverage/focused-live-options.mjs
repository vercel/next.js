import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [consumerArg, outputArg, phase] = process.argv.slice(2),
  consumer = path.resolve(consumerArg),
  output = path.resolve(outputArg)
fs.mkdirSync(output, { recursive: true })
if (phase !== 'child') {
  const env = { ...process.env, CI: '1', NODE_ENV: 'development' }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  const owner = await runOwnedNode(
    [fileURLToPath(import.meta.url), consumer, output, 'child'],
    {
      cwd: consumer,
      env,
      auditDir: path.join(output, 'owners'),
      timeoutMs: 30000,
    }
  )
  fs.writeFileSync(
    path.join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  fs.writeFileSync(path.join(output, 'stdout.log'), owner.stdout)
  fs.writeFileSync(path.join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(
    owner,
    'actual captured excluded-only declaration options'
  )
  assert.equal(owner.status, 0, owner.stderr)
} else {
  const load = createRequire(consumer + '/package.json'),
    { createCollector } = load(
      'next/dist/experimental/testing/runner/collector'
    ),
    { createTaskTree } = load('next/dist/experimental/testing/runner/tasks'),
    { captureReporterTaskTree } = load(
      'next/dist/experimental/testing/reporting/live-tasks'
    ),
    { createLiveReporterTaskStore } = load(
      'next/dist/experimental/testing/reporting/custom-reporter-live-tasks'
    )
  let controls = 0
  const make = async (mode) => {
    const c = createCollector('live-only-' + mode)
    if (mode === 'active' || mode === 'root-skip')
      c.api.test.only('target', () => {})
    else {
      const outer = mode.startsWith('todo')
        ? c.api.describe.todo
        : c.api.describe.skip
      outer('outer', () => {
        if (mode.endsWith('suite'))
          c.api.describe.only('target', () => c.api.test('leaf', () => {}))
        else if (mode === 'non-only') c.api.test('target', () => {})
        else c.api.test.only('target', () => {})
      })
    }
    await c.settle()
    const { file } = createTaskTree(c.close(), {
      filePath: '/actual/' + mode + '.test.mjs',
      projectName: 'actual',
      testTimeout: 5000,
    })
    if (mode === 'root-skip') file.mode = 'skip'
    let target
    const find = (task) => {
      if (task.name === 'target') target = task
      task.tasks?.forEach(find)
    }
    find(file)
    if (mode === 'result-present') target.result = { state: 'skip' }
    const tree = captureReporterTaskTree(file)
    return { tree, targetId: target.id }
  }
  for (const [mode, expected] of [
    ['skip-test', 'only'],
    ['todo-test', 'only'],
    ['skip-suite', 'only'],
    ['todo-suite', 'only'],
    ['active', 'run'],
    ['root-skip', 'run'],
    ['result-present', 'run'],
    ['non-only', 'run'],
  ]) {
    const { tree, targetId } = await make(mode),
      store = createLiveReporterTaskStore('/actual'),
      module = store.update(tree)
    const find = (view) =>
      view.id === targetId
        ? view
        : [...(view.children ?? [])].map(find).find(Boolean)
    const view = find(module),
      options = view.options
    assert.equal(options.mode, expected)
    const updated = structuredClone(tree)
    updated.result = { state: 'run' }
    store.update(updated)
    assert.strictEqual(find(store.get(tree.id)).options, options)
    assert.equal(options.mode, expected)
    controls++
  }
  const { tree, targetId } = await make('skip-test'),
    store = createLiveReporterTaskStore('/actual'),
    module = store.update(tree),
    view = store.case(tree.id, targetId),
    options = view.options
  for (const kind of ['missing-parent', 'cycle-parent', 'duplicate-id']) {
    const changed = structuredClone(tree),
      target = changed.tasks[0].tasks[0]
    if (kind === 'missing-parent') target.parentSuiteId = 'absent'
    if (kind === 'cycle-parent')
      changed.tasks[0].parentSuiteId = changed.tasks[0].id
    if (kind === 'duplicate-id')
      changed.tasks.push(structuredClone(changed.tasks[0]))
    assert.throws(() => store.update(changed))
    assert.strictEqual(store.get(tree.id), module)
    assert.strictEqual(store.case(tree.id, targetId).options, options)
    assert.equal(options.mode, 'only')
    controls++
  }
  fs.writeFileSync(
    path.join(output, 'CHECKS.json'),
    JSON.stringify(
      {
        controls,
        actualCollectorTaskSnapshots: true,
        onlyNoResultExplicitExcludedSuite: true,
        rootFileExclusionDoesNotQualify: true,
        activeOnlyAndNontargetNormalizationPreserved: true,
        cachedOptionsIdentityHeld: true,
        malformedGraphRefusalsAtomic: true,
        noResultOrStateInvented: true,
      },
      null,
      2
    ) + '\n'
  )
}
