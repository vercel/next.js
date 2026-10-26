import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg, name, phase] = process.argv.slice(2)
const consumer = resolve(consumerArg),
  output = resolve(outputArg)
mkdirSync(output, { recursive: true })
if (phase !== 'child') {
  const env = { ...process.env, CI: '1', NODE_ENV: 'development' }
  delete env.NODE_OPTIONS
  delete env.NODE_PATH
  const owner = await runOwnedNode(
    [fileURLToPath(import.meta.url), consumer, output, name, 'child'],
    {
      cwd: consumer,
      env,
      auditDir: join(output, 'owners'),
      timeoutMs: 30000,
    }
  )
  writeFileSync(
    join(output, 'owner.json'),
    JSON.stringify(owner, null, 2) + '\n'
  )
  writeFileSync(join(output, 'stdout.log'), owner.stdout)
  writeFileSync(join(output, 'stderr.log'), owner.stderr)
  assertOwnedNodeCompleted(owner, 'actual CLI signal ownership ' + name)
  assert.equal(owner.status, 0, owner.stderr)
} else {
  const load = createRequire(join(consumer, 'package.json'))
  const fixture = mkdtempSync(join(consumer, '.next-v8-signal-owner-'))
  const foreign = new Error('Test run interrupted.')
  const cleanup = new Error('independent actual configuration cleanup failure')
  const lock = new Error('independent actual unlock failure')
  let configDisposals = 0,
    unlocks = 0,
    invoked = 0,
    ownReason
  let interrupt,
    term,
    removalMatched = false,
    secondDeliveryHadHandler
  const originalExit = process.exitCode
  const originalOnce = process.once,
    originalRemove = process.removeListener
  process.once = function (event, listener) {
    if (new Error().stack.includes('next-test-runner.js')) {
      if (event === 'SIGINT') interrupt = listener
      if (event === 'SIGTERM') term = listener
    }
    return Reflect.apply(originalOnce, this, arguments)
  }
  process.removeListener = function (event, listener) {
    if (
      event === 'SIGINT' &&
      listener === interrupt &&
      new Error().stack.includes('next-test-runner.js')
    )
      removalMatched = true
    return Reflect.apply(originalRemove, this, arguments)
  }
  const replace = (specifier, transform) => {
    const file = load.resolve(specifier)
    if (specifier.endsWith('/orchestrator')) {
      const mock = new Module(file)
      mock.filename = file
      mock.loaded = true
      mock.exports = transform({})
      load.cache[file] = mock
    } else {
      const actual = load(file)
      load.cache[file].exports = { ...actual, ...transform(actual) }
    }
  }
  replace('next/dist/experimental/testing/config', (actual) => ({
    async openTestConfiguration(...args) {
      const owner = await actual.openTestConfiguration(...args)
      return {
        ...owner,
        async dispose(...args) {
          configDisposals++
          await Reflect.apply(owner.dispose, owner, args)
          if (name === 'cleanup') throw cleanup
        },
      }
    },
  }))
  replace('next/dist/experimental/testing/scheduling', (actual) => ({
    async acquireTestRunLock(...args) {
      const owner = await actual.acquireTestRunLock(...args)
      return {
        ...owner,
        async unlock(...args) {
          unlocks++
          await Reflect.apply(owner.unlock, owner, args)
          if (name === 'lock') throw lock
        },
      }
    },
  }))
  replace('next/dist/experimental/testing/orchestrator', () => ({
    async runTests(_dir, _projects, options) {
      invoked++
      assert(interrupt && term)
      assert.notEqual(interrupt, term)
      if (name === 'preexisting-reporter') options.reporter.onError(foreign)
      process.emit('SIGINT')
      ownReason = options.signal.reason
      assert(options.signal.aborted)
      assert.equal(process.listeners('SIGINT').includes(interrupt), false)
      if (name === 'second-delivery') {
        secondDeliveryHadHandler = process.emit('SIGINT')
        assert.equal(secondDeliveryHadHandler, false)
        assert.equal(options.signal.reason, ownReason)
      }
      if (name === 'preexisting-reporter') assert.equal(ownReason, foreign)
      if (name === 'same-message') throw foreign
      if (name === 'aggregate')
        throw new globalThis.AggregateError(
          [ownReason, cleanup],
          'independent host failure'
        )
      options.signal.throwIfAborted()
    },
  }))
  try {
    writeFileSync(
      join(fixture, 'contract.test.mjs'),
      '// no Native/body execution in this host-ownership component\n'
    )
    writeFileSync(
      join(fixture, 'next.test.config.json'),
      JSON.stringify({
        projects: [
          {
            name: 'signal',
            include: ['contract.test.mjs'],
            coverage: {
              enabled: name !== 'disabled',
              ...(name === 'istanbul' ? { provider: 'istanbul' } : {}),
              include: [],
              reporter: ['none'],
            },
          },
        ],
      })
    )
    const { nextTestRunner } = load('next/dist/cli/next-test-runner')
    let rejected
    try {
      await nextTestRunner(fixture, {
        run: true,
        reporter: ['json'],
        outputFile: join(output, 'cases.json'),
      })
    } catch (error) {
      rejected = error
    }
    writeFileSync(
      join(output, 'OBSERVED.json'),
      JSON.stringify(
        {
          name,
          invoked,
          configDisposals,
          unlocks,
          rejected: rejected && {
            name: rejected.name,
            message: rejected.message,
            stack: rejected.stack,
          },
          exitCode: process.exitCode,
        },
        null,
        2
      ) + '\n'
    )
    assert.equal(invoked, 1)
    assert.equal(configDisposals, 1)
    assert.equal(unlocks, 1)
    assert.equal(removalMatched, true)
    assert.equal(process.listeners('SIGINT').includes(interrupt), false)
    assert.equal(process.listeners('SIGTERM').includes(term), false)
    if (name === 'first' || name === 'second-delivery') {
      assert.equal(rejected, undefined)
      assert.equal(process.exitCode, 130)
    } else if (name === 'cleanup') assert.equal(rejected, cleanup)
    else if (name === 'lock') assert.equal(rejected, lock)
    else if (name === 'same-message' || name === 'preexisting-reporter')
      assert.equal(rejected, foreign)
    else if (name === 'aggregate') {
      assert(rejected instanceof globalThis.AggregateError)
      assert.deepEqual(rejected.errors, [ownReason, cleanup])
    } else {
      assert(['disabled', 'istanbul'].includes(name))
      assert.equal(rejected, ownReason)
      assert.notEqual(process.exitCode, 130)
    }
    writeFileSync(
      join(output, 'CHECKS.json'),
      JSON.stringify(
        {
          name,
          actualCLIControllerAndFinally: true,
          exactReasonIdentity: true,
          independentFailuresPropagate: true,
          listenersRemoved: true,
          firstReasonNotReplaced: true,
          actualConfigAndLockJoined: true,
          noNativeOrCoverageFactsInvented: true,
        },
        null,
        2
      ) + '\n'
    )
  } finally {
    process.once = originalOnce
    process.removeListener = originalRemove
    if (interrupt) process.removeListener('SIGINT', interrupt)
    if (term) process.removeListener('SIGTERM', term)
    process.exitCode = originalExit
    rmSync(fixture, { recursive: true, force: true })
  }
}
