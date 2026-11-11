const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const fs = require('node:fs/promises')
const os = require('node:os')

const nextDirectory = process.argv[2]
const mode = process.argv[3]
const identity = {
  runId: 'actual-record-run',
  entryId: 'actual-record-entry',
  revision: 'actual-record-revision',
}
let nativeLoads = 0
Module._extensions['.node'] = () => {
  nativeLoads++
  throw new Error('Native loading is forbidden in record transport controls.')
}
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const event = (name, artifact = false) => ({
  version: 1,
  ...identity,
  timestamp: 1,
  caseId: 'actual-record-case',
  attempt: { id: 'actual-record-attempt', retry: 0, repeat: 0 },
  ...(artifact
    ? { type: 'test-artifact', artifact: { type: 'unit:record', name } }
    : {
        type: 'test-annotation',
        annotation: { message: name, type: 'notice' },
      }),
})
const valueFor = (request) =>
  request.event.type === 'test-annotation'
    ? { type: 'internal:annotation', annotation: request.event.annotation }
    : request.event.artifact
const response = (request, outcome) => ({
  type: 'test-recorded',
  requestId: request.requestId,
  ...identity,
  outcome,
})

async function clientControl(kind) {
  const { createTestRecordClient } = require(
    path.join(nextDirectory, 'dist/experimental/testing/execution/test-records')
  )
  const signal = new AbortController()
  const sent = []
  const allSent = deferred()
  const failure = new Error('one record send failed')
  const client = createTestRecordClient({
    identity,
    signal: signal.signal,
    send: async (request) => {
      sent.push(request)
      if (sent.length === 3) allSent.resolve()
      if (kind === 'send failure' && sent.length === 2) throw failure
    },
  })
  if (kind === 'concurrent') {
    const input = [event('one'), event('two'), event('artifact', true)]
    const operations = input.map((value) => client.record(value))
    await allSent.promise
    assert.equal(client.pending, 3)
    assert.equal(new Set(sent.map((request) => request.requestId)).size, 3)
    assert(sent.every((request) => Number.isSafeInteger(request.requestId)))
    assert(sent.every((request) => request.requestId > 0))
    assert.deepEqual(
      sent.map((request) => request.event),
      input
    )
    assert(sent[0].requestId < sent[1].requestId)
    assert(sent[1].requestId < sent[2].requestId)
    const returned = sent.map(valueFor)
    let flushed = false
    const flushing = client.flush().then(() => {
      flushed = true
    })
    await Promise.resolve()
    assert.equal(flushed, false)
    const completed = []
    operations.forEach((operation, index) =>
      operation.then(() => completed.push(index))
    )
    for (const index of [2, 1, 0]) {
      client.receive(
        response(sent[index], { kind: 'return', value: returned[index] })
      )
      await operations[index]
      if (index !== 0) assert.equal(flushed, false)
    }
    await flushing
    assert.equal(flushed, true)
    assert.deepEqual(completed, [2, 1, 0])
    assert.deepEqual(await Promise.all(operations), returned)
    assert.equal(client.pending, 0)
    client.close()
    return { requests: 3, responseOrder: [2, 1, 0], flushJoined: true }
  }
  if (kind === 'raw outcomes') {
    const reasons = [
      new Error('record error'),
      'primitive',
      42,
      { detail: 1 },
      [1, 2],
      undefined,
      null,
      false,
      0,
      '',
    ]
    for (const reason of reasons) {
      const pending = client.record(event('failure'))
      const observed = pending.then(
        () => ({ rejected: false }),
        (error) => ({ rejected: true, error })
      )
      const request = sent.at(-1)
      client.receive(response(request, { kind: 'throw', error: reason }))
      const outcome = await observed
      assert.equal(outcome.rejected, true)
      assert.equal(outcome.error, reason)
      assert.equal(client.pending, 0)
    }
    const pending = client.record(event('undefined artifact', true))
    client.receive(response(sent.at(-1), { kind: 'return', value: undefined }))
    assert.equal(await pending, undefined)
    assert.equal(client.pending, 0)
    client.close()
    return { rawFailures: reasons.length, rawUndefined: true }
  }
  if (kind === 'send failure') {
    const first = client.record(event('first'))
    const second = client.record(event('second'))
    const rejected = second.then(
      () => ({ failed: false }),
      (error) => ({ failed: true, error })
    )
    const value = valueFor(sent[0])
    client.receive(response(sent[0], { kind: 'return', value }))
    assert.equal(await first, value)
    assert.deepEqual(await rejected, { failed: true, error: failure })
    assert.equal(client.pending, 0)
    client.close()
    return { isolatedSendFailure: true }
  }
  if (kind === 'identity faults') {
    const first = client.record(event('one'))
    const second = client.record(event('two'))
    const third = client.record(event('three', true))
    const settled = Promise.allSettled([first, second, third])
    for (const key of ['runId', 'entryId', 'revision']) {
      assert.throws(() =>
        client.receive({
          ...response(sent[0], { kind: 'return', value: valueFor(sent[0]) }),
          [key]: 'foreign-owner',
        })
      )
      assert.equal(client.pending, 3)
    }
    assert.throws(() =>
      client.receive({
        ...response(sent[0], { kind: 'return', value: valueFor(sent[0]) }),
        requestId: sent[2].requestId + 1,
      })
    )
    assert.equal(client.pending, 3)
    const value = valueFor(sent[0])
    client.receive(response(sent[0], { kind: 'return', value }))
    assert.throws(() =>
      client.receive(response(sent[0], { kind: 'return', value }))
    )
    assert.equal(client.pending, 2)
    const closed = new Error('explicit client close')
    client.close(closed)
    assert.equal(client.pending, 0)
    const outcomes = await settled
    assert.equal(outcomes[0].status, 'fulfilled')
    assert.equal(outcomes[0].value, value)
    assert.equal(outcomes[1].status, 'rejected')
    assert.equal(outcomes[1].reason, closed)
    assert.equal(outcomes[2].status, 'rejected')
    assert.equal(outcomes[2].reason, closed)
    return {
      refusedForeignOrDuplicateResponses: 5,
      otherRequestsPreserved: true,
    }
  }
  if (kind === 'abort') {
    const one = client.record(event('one'))
    const two = client.record(event('two', true))
    const observed = Promise.allSettled([one, two])
    const reason = new Error('actual record owner aborted')
    signal.abort(reason)
    assert.equal(client.pending, 0)
    for (const outcome of await observed) {
      assert.equal(outcome.status, 'rejected')
      assert.equal(outcome.reason, reason)
    }
    await assert.rejects(
      Promise.resolve().then(() => client.record(event('after abort'))),
      (error) => error === reason
    )
    assert.equal(sent.length, 2)
    client.receive(
      response(sent[0], { kind: 'return', value: valueFor(sent[0]) })
    )
    assert.equal(client.pending, 0)
    client.close()
    return { abortedRequests: 2, noLateRequest: true }
  }
  throw new Error('Unknown record client control: ' + kind)
}

async function executorControl(kind) {
  const processFile = path.join(
    nextDirectory,
    'dist/experimental/testing/execution/process.js'
  )
  const originalLoad = Module._load
  let driver
  Module._load = function (request, parent, isMain) {
    const target =
      request.startsWith('.') && parent
        ? path.resolve(path.dirname(parent.filename), request) +
          (path.extname(request) ? '' : '.js')
        : request
    if (target === processFile)
      return { runTestProcess: (...args) => driver(...args) }
    return Reflect.apply(originalLoad, this, [request, parent, isMain])
  }
  const { executeWithEnvironment } = require(
    path.join(nextDirectory, 'dist/experimental/testing/execution/execute')
  )
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'next-record-transport-')
  )
  try {
    const profile = {
      id: 'record-direct',
      mode: 'development',
      environment: 'node',
      runtime: 'nodejs',
      bundler: 'turbopack',
    }
    const entry = {
      id: identity.entryId,
      file: path.join(root, 'actual.test.mjs'),
      profile,
    }
    const artifact = {
      version: 2,
      kind: 'node',
      entryId: entry.id,
      revision: identity.revision,
      profile,
      rootDir: root,
      entryPath: 'entry.cjs',
      files: [],
      diagnostics: [],
    }
    const controller = new AbortController()
    const events = [],
      callbacks = [],
      responses = []
    const options = {
      entry,
      runId: identity.runId,
      projectDir: root,
      setupFiles: [],
      signal: controller.signal,
      fileTimeout: 5000,
      testTimeout: 1000,
      hookTimeout: 1000,
      captureTaskResults: true,
      captureTestRecords: true,
      onEvent(value) {
        events.push(value)
      },
      async onTestRecord(value) {
        callbacks.push(value)
        return valueFor({ event: value })
      },
    }
    const complete = (host) =>
      host.onMessage({
        type: 'complete',
        result: { entryId: entry.id, status: 'passed', durationMs: 1 },
      })
    const start = (host) => {
      assert.equal(Object.hasOwn(host.input.options, 'onTestRecord'), false)
      host.onReady(
        async (reply) => {
          responses.push(reply)
        },
        () => {}
      )
    }
    if (kind === 'executor cohort admission') {
      const childProcess = require('node:child_process')
      const originalFork = childProcess.fork
      let forks = 0
      childProcess.fork = () => {
        forks++
        throw new Error('Unexpected cohort worker launch')
      }
      try {
        const { executeCohortWithEnvironment } = require(
          path.join(
            nextDirectory,
            'dist/experimental/testing/execution/execute-cohort'
          )
        )
        for (const input of [
          { ...options, onTestRecord: undefined },
          { ...options, captureTestRecords: undefined },
        ])
          await assert.rejects(
            executeCohortWithEnvironment({}, [input], process.env),
            /record callbacks.*isolated file worker/i
          )
        assert.equal(forks, 0)
        return { refusedBeforeCohortLaunch: 2, actualForks: 0 }
      } finally {
        childProcess.fork = originalFork
      }
    }
    if (kind === 'executor default') {
      delete options.captureTestRecords
      delete options.onTestRecord
      const input = [event('legacy annotation'), event('legacy artifact', true)]
      driver = async (_file, host) => {
        assert.equal(
          Object.hasOwn(host.input.options, 'captureTestRecords'),
          false
        )
        const {
          signal: _signal,
          onEvent: _onEvent,
          ...expectedOptions
        } = options
        assert.deepEqual(host.input.options, {
          ...expectedOptions,
          snapshotUpdateMode: 'none',
          updateSnapshots: false,
        })
        start(host)
        for (const value of input)
          host.onMessage({ type: 'event', event: value })
        complete(host)
        return { reason: 'exit', code: 0, signal: null }
      }
      const result = await executeWithEnvironment(
        artifact,
        options,
        process.env
      )
      assert.equal(result.status, 'passed')
      assert.deepEqual(
        events.filter((value) => input.includes(value)),
        input
      )
      assert.equal(responses.length, 0)
      return {
        unchangedGenericRecords: 2,
        noRPCResponse: true,
        defaultWorkerInputExact: true,
      }
    }
    if (kind === 'executor concurrent') {
      const gates = [deferred(), deferred(), deferred()]
      const entered = deferred()
      const replied = [deferred(), deferred(), deferred()]
      const input = [event('one'), event('two'), event('artifact', true)]
      const values = input.map((value, index) => ({
        ...valueFor({ event: value }),
        changedByCallback: index,
      }))
      options.onTestRecord = async (value) => {
        const index = input.indexOf(value)
        assert.notEqual(index, -1)
        assert.equal(events.filter((item) => item === value).length, 1)
        callbacks.push(value)
        if (callbacks.length === 3) entered.resolve()
        return gates[index].promise
      }
      driver = async (_file, host) => {
        assert.equal(host.input.options.captureTestRecords, true)
        host.onReady(
          async (reply) => {
            responses.push(reply)
            replied[reply.requestId - 1].resolve(reply)
          },
          () => {}
        )
        assert.equal(Object.hasOwn(host.input.options, 'onTestRecord'), false)
        for (const [index, value] of input.entries())
          host.onMessage({
            type: 'test-record',
            requestId: index + 1,
            event: value,
          })
        await entered.promise
        assert.equal(responses.length, 0)
        for (const index of [2, 1, 0]) {
          gates[index].resolve(values[index])
          const reply = await replied[index].promise
          assert.deepEqual(
            reply,
            response(
              { requestId: index + 1 },
              { kind: 'return', value: values[index] }
            )
          )
        }
        complete(host)
        return { reason: 'exit', code: 0, signal: null }
      }
      const result = await executeWithEnvironment(
        artifact,
        options,
        process.env
      )
      assert.equal(result.status, 'passed')
      assert.deepEqual(callbacks, input)
      assert.deepEqual(
        responses.map((reply) => reply.requestId),
        [3, 2, 1]
      )
      assert.equal(
        events.filter(
          (value) =>
            value.type === 'test-annotation' || value.type === 'test-artifact'
        ).length,
        3
      )
      return {
        actualEvents: 3,
        callbacks: 3,
        responseOrder: [3, 2, 1],
        callbackStrippedFromInput: true,
      }
    }
    if (kind === 'executor raw outcomes') {
      const reasons = [
        new Error('authored callback failed'),
        'primitive',
        42,
        { detail: 1 },
        [1],
        undefined,
        null,
        false,
        0,
        '',
      ]
      const input = reasons.map((_, index) => event(String(index)))
      input.push(event('undefined success', true))
      const responseWaiters = input.map(() => deferred())
      options.onTestRecord = async (value) => {
        callbacks.push(value)
        const index = input.indexOf(value)
        if (index < reasons.length) throw reasons[index]
        return undefined
      }
      driver = async (_file, host) => {
        host.onReady(
          async (reply) => {
            responses.push(reply)
            responseWaiters[reply.requestId - 1].resolve(reply)
          },
          () => {}
        )
        for (const [index, value] of input.entries()) {
          host.onMessage({
            type: 'test-record',
            requestId: index + 1,
            event: value,
          })
          const reply = await responseWaiters[index].promise
          if (index < reasons.length) {
            assert.equal(reply.outcome.kind, 'throw')
            assert.equal(Object.hasOwn(reply.outcome, 'error'), true)
            assert.equal(reply.outcome.error, reasons[index])
          } else {
            assert.equal(reply.outcome.kind, 'return')
            assert.equal(reply.outcome.value, undefined)
          }
        }
        complete(host)
        return { reason: 'exit', code: 0, signal: null }
      }
      const result = await executeWithEnvironment(
        artifact,
        options,
        process.env
      )
      assert.equal(result.status, 'passed')
      assert.equal(
        events.filter((value) => value.type === 'diagnostic').length,
        0
      )
      assert.equal(callbacks.length, input.length)
      return {
        explicitRawThrownOutcomes: reasons.length,
        undefinedSuccess: true,
        noGenericReporterFailure: true,
      }
    }
    if (kind === 'executor abort' || kind === 'executor owner close') {
      const entered = deferred(),
        release = deferred(),
        callbackClosed = deferred()
      const input = event('held owned record')
      options.onTestRecord = async (value) => {
        callbacks.push(value)
        entered.resolve()
        try {
          return await release.promise
        } finally {
          callbackClosed.resolve()
        }
      }
      driver = async (_file, host) => {
        start(host)
        host.onMessage({ type: 'test-record', requestId: 1, event: input })
        await entered.promise
        if (kind === 'executor abort')
          controller.abort(new Error('actual file owner aborted'))
        complete(host)
        return kind === 'executor abort'
          ? { reason: 'cancelled', code: null, signal: 'SIGTERM' }
          : { reason: 'exit', code: 0, signal: null }
      }
      const result = await executeWithEnvironment(
        artifact,
        options,
        process.env
      )
      assert.equal(
        result.status,
        kind === 'executor abort' ? 'cancelled' : 'passed'
      )
      assert.equal(callbacks.length, 1)
      assert.equal(responses.length, 0)
      release.resolve(valueFor({ event: input }))
      await callbackClosed.promise
      await Promise.resolve()
      assert.equal(responses.length, 0)
      return {
        actualEvents: 1,
        heldCallbackObserved: true,
        noAcknowledgementAfterOwnerClosed: true,
      }
    }
    if (kind === 'executor admission') {
      let launches = 0
      driver = async () => {
        launches++
        throw new Error('Unexpected file worker launch')
      }
      const requests = [
        { options: { onTestRecord: undefined } },
        { options: { captureTestRecords: false } },
        { options: { captureTestRecords: undefined } },
        { options: { collectOnly: true } },
        { options: { userCancelSignal: new AbortController().signal } },
        { options: { coverage: { kind: 'node-v8' } } },
        { artifact: { cohort: {} } },
        { entry: { file: path.join(root, 'typed.test.ts') } },
        {
          artifact: {
            kind: 'rsc',
            profile: { ...profile, environment: 'rsc' },
          },
          entry: { profile: { ...profile, environment: 'rsc' } },
        },
      ]
      for (const change of requests) {
        const nextEntry = { ...entry, ...change.entry }
        await assert.rejects(
          executeWithEnvironment(
            { ...artifact, ...change.artifact },
            { ...options, entry: nextEntry, ...change.options },
            process.env
          ),
          /record|direct|isolated|callback/i
        )
      }
      assert.equal(launches, 0)
      return { refusedBeforeLaunch: requests.length }
    }
    if (kind === 'executor faults') {
      let refused = 0
      const malformed = [
        (request) => ({ ...request, requestId: 0 }),
        (request) => ({ ...request, requestId: -1 }),
        (request) => ({
          ...request,
          event: { ...request.event, runId: 'foreign' },
        }),
        (request) => ({
          ...request,
          event: { ...request.event, entryId: 'foreign' },
        }),
        (request) => ({
          ...request,
          event: { ...request.event, revision: 'foreign' },
        }),
        (request) => ({ ...request, event: { ...request.event, version: 2 } }),
        (request) => ({
          ...request,
          event: {
            ...request.event,
            type: 'output',
            stream: 'stdout',
            text: 'forged',
          },
        }),
      ]
      driver = async (_file, host) => {
        start(host)
        for (const change of malformed) {
          assert.throws(() =>
            host.onMessage(
              change({
                type: 'test-record',
                requestId: 1,
                event: event('invalid'),
              })
            )
          )
          refused++
        }
        complete(host)
        return { reason: 'exit', code: 0, signal: null }
      }
      const result = await executeWithEnvironment(
        artifact,
        options,
        process.env
      )
      assert.equal(result.status, 'passed')
      assert.equal(callbacks.length, 0)
      assert.equal(responses.length, 0)
      assert.equal(
        events.filter(
          (value) =>
            value.type === 'test-annotation' || value.type === 'test-artifact'
        ).length,
        0
      )
      return { rejectedBeforeCallbackOrEvent: refused }
    }
    throw new Error('Unknown executor control: ' + kind)
  } finally {
    Module._load = originalLoad
    await fs.rm(root, { recursive: true, force: true })
  }
}

async function main() {
  assert(
    nextDirectory && mode,
    'Expected Next package directory and control mode.'
  )
  const result = await (mode.startsWith('executor ')
    ? executorControl(mode)
    : clientControl(mode))
  assert.equal(nativeLoads, 0)
  console.log(
    JSON.stringify({ mode, ...result, nativeLoads, protocolOnly: true })
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
