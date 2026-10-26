import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { watchFile, unwatchFile } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertOwnedNodeCompleted,
  runOwnedNode,
} from '../../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const self = fileURLToPath(import.meta.url)
const fixture = fileURLToPath(
  new URL('./fixtures/owned-source/', import.meta.url)
)
const require = createRequire(import.meta.url)

function until(check, message, timeout = 10000) {
  return new Promise((resolve, reject) => {
    let active = false
    const timer = setTimeout(() => finish(new Error(message)), timeout)
    const interval = setInterval(run, 20)
    function finish(error, value) {
      clearTimeout(timer)
      clearInterval(interval)
      error ? reject(error) : resolve(value)
    }
    async function run() {
      if (active) return
      active = true
      try {
        const value = await check()
        if (value) finish(undefined, value)
      } catch (error) {
        finish(error)
      } finally {
        active = false
      }
    }
    void run()
  })
}
function fileReady(file) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => finish(new Error(`Missing gate: ${path.basename(file)}`)),
      10000
    )
    function finish(error) {
      clearTimeout(timer)
      unwatchFile(file, changed)
      error ? reject(error) : resolve()
    }
    function changed(stat) {
      if (stat.size) finish()
    }
    watchFile(file, { interval: 20 }, changed)
  })
}
async function probe(watchPath, scenario, root) {
  const { watchTestFiles } = require(watchPath)
  const inputs = path.join(root, 'inputs')
  await mkdir(inputs)
  const controller = new AbortController()
  const changes = []
  const errors = []
  let source
  let sourceReturned = false
  let earlyDelivery = false
  const options = {
    directories: [inputs],
    outputDirectories: [],
    sourceProcess: true,
    signal: controller.signal,
    onChange(change) {
      earlyDelivery ||= !sourceReturned
      changes.push(change)
    },
    onError(error) {
      errors.push(error)
      if (scenario === 'callback-error') throw error
    },
  }
  const blocked = path.join(root, 'blocked.json')
  if (scenario === 'open-cancel') {
    const opening = watchTestFiles(options)
    await fileReady(blocked)
    const reason = new Error('Exact owned opening cancellation')
    controller.abort(reason)
    await assert.rejects(opening, (error) => error === reason)
    return { scenario, closed: true, exactCancellation: true }
  }
  if (scenario === 'death-before-open') {
    await assert.rejects(
      watchTestFiles(options),
      /engine exited before closure \(23\)/
    )
    return { scenario, closed: true, rejectedBeforeReady: true }
  }
  const opening = watchTestFiles(options)
  if (scenario === 'opening-snapshot')
    options.directories.push('/unexpected-opening-mutation')
  source = await opening
  sourceReturned = true
  let expectedCloseFailure = false
  try {
    if (scenario === 'real') {
      const dependencies = path.join(root, 'dependencies')
      const extra = path.join(root, 'extra')
      const output = path.join(inputs, 'actual-output')
      await Promise.all([mkdir(dependencies), mkdir(extra), mkdir(output)])
      const files = ['next.config.mjs', 'setup.mjs', 'serializer.mjs'].map(
        (name) => path.join(dependencies, name)
      )
      await Promise.all(
        files.map((file) =>
          writeFile(file, 'throw new Error("read-only input executed")\n')
        )
      )
      const next = {
        directories: [inputs, extra],
        outputDirectories: [output],
        dependencyFiles: files,
        artifactDirectories: [
          { parentDirectory: inputs, basenamePrefixes: ['.owned-'] },
        ],
      }
      await source.update(next)
      for (const file of files) {
        await writeFile(
          file,
          'throw new Error("updated read-only input executed")\n'
        )
        await until(
          () => changes.some((change) => change.changed.includes(file)),
          `Missing dependency ${path.basename(file)}`
        )
      }
      const nested = path.join(inputs, 'new', 'nested')
      await mkdir(nested, { recursive: true })
      const test = path.join(nested, 'added.test.mjs')
      await writeFile(test, 'throw new Error("new input executed")\n')
      await until(
        () =>
          changes.some((change) =>
            change.changed.some(
              (file) =>
                file === test ||
                file === inputs ||
                nested.startsWith(file + path.sep)
            )
          ),
        'Missing newly nested input'
      )
      const addition = path.join(extra, 'extra.test.mjs')
      await writeFile(
        addition,
        'throw new Error("updated root input executed")\n'
      )
      await until(
        () =>
          changes.some((change) =>
            change.changed.some((file) => file === addition || file === extra)
          ),
        'Missing updated root input'
      )
      await writeFile(path.join(output, 'ignored.mjs'), 'output')
      assert.equal(errors.length, 0)
      assert.equal(earlyDelivery, false)
      return {
        scenario,
        closed: true,
        dependencies: files.length,
        nested: true,
        updatedRoot: true,
        readOnly: true,
      }
    }
    if (scenario === 'operation-cleanup-error') {
      await assert.rejects(
        source.update(options),
        /operation failure delivery failed/
      )
      await source.close()
      assert.equal(
        await readFile(path.join(root, 'close-attempted'), 'utf8'),
        'attempted'
      )
      await writeFile(
        path.join(root, 'observed-errors.json'),
        JSON.stringify(
          errors.map((error) => ({ name: error.name, message: error.message })),
          null,
          2
        )
      )
      assert.ok(
        errors.some(
          (error) => error.message === 'operation failure delivery failed'
        )
      )
      assert.ok(
        errors.some(
          (error) => error.message === 'distinct native close failure'
        )
      )
      return {
        scenario,
        closed: true,
        operationErrorRetained: true,
        distinctCleanupAttempted: true,
      }
    }
    if (scenario === 'opening-snapshot') {
      const observed = JSON.parse(
        await readFile(path.join(root, 'snapshot.json'), 'utf8')
      )
      assert.deepEqual(observed.directories, [inputs])
      return { scenario, closed: true, invocationSnapshot: true }
    }
    if (scenario === 'backpressure') {
      await source.update(options)
      assert.deepEqual(
        [...new Set(changes.flatMap((change) => change.changed))],
        Array.from(
          { length: 512 },
          (_, index) => '/owned/input-' + index + '.test.mjs'
        )
      )
      assert.deepEqual(
        [...new Set(changes.flatMap((change) => change.removed))],
        Array.from(
          { length: 171 },
          (_, index) => '/owned/removed-' + index * 3 + '.test.mjs'
        )
      )
      return { scenario, closed: true, changed: 512, removed: 171 }
    }
    if (scenario === 'update-cancel') {
      const first = source.update(options)
      const second = source.update(options)
      await fileReady(blocked)
      const reason = new Error('Exact pending update cancellation')
      controller.abort(reason)
      await Promise.all([
        assert.rejects(first, (error) => error === reason),
        assert.rejects(second, (error) => error === reason),
      ])
      await source.close()
      return { scenario, closed: true, exactPendingCancellation: true }
    }
    if (scenario === 'snapshot') {
      const directories = [inputs]
      const prefixes = ['.owned-original-']
      const options = {
        directories,
        outputDirectories: [],
        artifactDirectories: [
          { parentDirectory: inputs, basenamePrefixes: prefixes },
        ],
      }
      const updating = source.update(options)
      directories.push('/unexpected-mutation')
      prefixes.push('.unexpected-')
      await updating
      const observed = JSON.parse(
        await readFile(path.join(root, 'snapshot.json'), 'utf8')
      )
      assert.deepEqual(observed.directories, [inputs])
      assert.deepEqual(observed.artifactDirectories[0].basenamePrefixes, [
        '.owned-original-',
      ])
      return { scenario, closed: true, invocationSnapshot: true }
    }
    if (scenario === 'blocked-close') {
      const started = Date.now()
      const closing = source.close()
      await fileReady(blocked)
      await closing
      assert.ok(
        Date.now() - started < 5000,
        'Existing process grace failed to reclaim blocked native close'
      )
      return { scenario, closed: true, blockedEngineReclaimed: true }
    }
    if (scenario === 'early-change') {
      await until(() => changes.length, 'Missing opening change')
      assert.equal(earlyDelivery, false)
      assert.deepEqual(changes, [
        { changed: ['/owned/early.test.mjs'], removed: [] },
      ])
      return { scenario, closed: true, earlyChangeRetained: true }
    }
    if (scenario === 'update-death') {
      await assert.rejects(
        source.update(options),
        /engine exited before closure \(31\)/
      )
      await source.close()
      assert.equal(errors.length, 1)
      return { scenario, closed: true, updateRejected: true }
    }
    if (scenario === 'occurrences' || scenario === 'callback-error') {
      await assert.rejects(source.update(options), /Owned source occurrence/)
      if (scenario === 'callback-error') {
        expectedCloseFailure = true
        await assert.rejects(source.close(), (error) => {
          assert.ok(error instanceof globalThis.AggregateError)
          assert.deepEqual(error.errors, [errors[0], errors[0]])
          return true
        })
      } else await source.close()
      assert.equal(errors.length, scenario === 'occurrences' ? 2 : 1)
      assert.ok(errors[0] instanceof TypeError)
      assert.equal(errors[0].code, 'EOWNED')
      assert.equal(errors[0].path, '/owned/input.mjs')
      assert.equal(errors[0].cause, errors[0])
      if (scenario === 'occurrences') assert.equal(errors[0], errors[1])
      return {
        scenario,
        closed: true,
        occurrences: errors.length,
        valueIdentity: true,
      }
    }
    throw new Error(`Unknown owned source scenario: ${scenario}`)
  } finally {
    if (expectedCloseFailure) await source.close().catch(() => {})
    else await source.close()
  }
}

const [mode, ...args] = process.argv.slice(2)
if (mode === '--probe') {
  const result = await probe(...args)
  process.stdout.write(JSON.stringify(result) + '\n')
} else if (mode === '--abandon') {
  const [watchPath, root] = args
  const { watchTestFiles } = require(watchPath)
  const source = await watchTestFiles({
    directories: [root],
    outputDirectories: [],
    sourceProcess: true,
    signal: new AbortController().signal,
    onChange() {},
    onError(error) {
      throw error
    },
  })
  void source.close()
  await fileReady(path.join(root, 'blocked.json'))
  process.exit(0)
} else if (mode === '--parent-death') {
  const [watchPath, root] = args
  const child = spawn(process.execPath, [self, '--abandon', watchPath, root], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  assert.deepEqual(result, { code: 0, signal: null })
  const { pid } = JSON.parse(
    await readFile(path.join(root, 'host.json'), 'utf8')
  )
  await until(
    () => {
      try {
        process.kill(pid, 0)
        return false
      } catch (error) {
        if (error.code === 'ESRCH') return true
        throw error
      }
    },
    'Owned source survived its parent IPC death',
    5000
  )
  process.stdout.write(
    JSON.stringify({
      scenario: 'parent-death',
      closed: true,
      parentDeathReclaimed: true,
    }) + '\n'
  )
} else {
  const [scenario, receiptDirectory] = args
  const root =
    receiptDirectory ??
    (await mkdtemp(path.join(tmpdir(), 'next-watch-owned-')))
  if (receiptDirectory) await mkdir(root)
  const env = { ...process.env }
  if (scenario !== 'real') {
    env.NODE_OPTIONS = [
      env.NODE_OPTIONS,
      `--require=${path.join(fixture, 'preload.cjs')}`,
    ]
      .filter(Boolean)
      .join(' ')
    env.OWNED_SOURCE_SCENARIO = scenario
    env.OWNED_SOURCE_BLOCKED = path.join(root, 'blocked.json')
    env.OWNED_SOURCE_SNAPSHOT = path.join(root, 'snapshot.json')
    env.OWNED_SOURCE_HOST_PIDFILE = path.join(root, 'host.json')
  }
  let passed = false
  try {
    const result = await runOwnedNode(
      [
        self,
        scenario === 'parent-death' ? '--parent-death' : '--probe',
        mode,
        scenario === 'parent-death' ? root : scenario,
        ...(scenario === 'parent-death' ? [] : [root]),
      ],
      {
        cwd: process.cwd(),
        env,
        auditDir: path.join(root, 'owners'),
        timeoutMs: 18000,
      }
    )
    assertOwnedNodeCompleted(result, `owned input source ${scenario}`)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.signal, null)
    process.stdout.write(result.stdout)
    passed = true
  } finally {
    if (!receiptDirectory && passed)
      await rm(root, { recursive: true, force: true })
    else if (!passed)
      process.stderr.write('Owned source failure receipts: ' + root + '\n')
  }
}
