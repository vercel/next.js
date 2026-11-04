const assert = require('node:assert/strict')
const { serialize, deserialize } = require('node:v8')
const clone = (value) => deserialize(serialize(value))
function deferred() {
  let resolve, reject
  const promise = new Promise((done, failed) => {
    resolve = done
    reject = failed
  })
  return { promise, resolve, reject }
}
function record(index = 0, type = 'test-annotation') {
  return {
    type,
    version: 1,
    runId: 'record-run',
    timestamp: 100 + index,
    entryId: 'record-file',
    revision: 'record-revision',
    caseId: 'record-case',
    attempt: { id: 'record-attempt', retry: 0, repeat: 0 },
    ...(type === 'test-annotation'
      ? { annotation: { message: 'annotation-' + index, type: 'notice' } }
      : { artifact: { type: 'test:record', value: index } }),
  }
}
const profile = {
  id: 'record-node',
  mode: 'development',
  environment: 'node',
  runtime: 'nodejs',
  bundler: 'turbopack',
}
const entry = { id: 'record-file', file: '/project/record.case.mjs', profile }
const artifact = {
  version: 2,
  kind: 'node',
  entryId: entry.id,
  profile,
  revision: 'record-revision',
  rootDir: '/project/artifact',
  entryPath: 'entry.js',
  files: ['entry.js'],
  diagnostics: [],
}
function execution(signal) {
  return {
    runId: 'record-run',
    projectDir: '/project',
    entry,
    setupFiles: [],
    testTimeout: 1000,
    hookTimeout: 1000,
    fileTimeout: 1000,
    signal,
    onEvent() {},
    captureTaskResults: true,
    captureTestRecords: true,
  }
}
const result = { entryId: entry.id, status: 'passed', durationMs: 1 }

module.exports = async function verify(kind, dependencies) {
  const {
    createExecutionBrokerHost,
    createExecutionBrokerClient,
    createTestRecordForwarder,
    createTestRecordReceipts,
    setExecutor,
  } = dependencies
  if (kind === 'scoped wrapper') {
    const current = createTestRecordForwarder(),
      event = record(),
      other = record(1)
    const before = Object.getOwnPropertyDescriptors(event),
      failure = new Error('nested delivery')
    assert.equal(current.id(event), undefined)
    current.forward('outer', event, () => {
      assert.equal(current.id(event), 'outer')
      assert.equal(current.id(other), undefined)
      assert.throws(
        () =>
          current.forward('inner', other, () => {
            assert.equal(current.id(other), 'inner')
            throw failure
          }),
        (error) => error === failure
      )
      assert.equal(current.id(event), 'outer')
      assert.equal(current.id(other), undefined)
      assert.throws(
        () => current.forward('duplicate', event, () => {}),
        /Invalid test record forwarding scope/
      )
      assert.equal(current.id(other), undefined)
      assert.throws(
        () => current.forward('duplicate', event, () => {}),
        /Invalid test record forwarding scope/
      )
    })
    assert.equal(current.id(event), undefined)
    assert.deepEqual(Object.getOwnPropertyDescriptors(event), before)
    return
  }
  if (
    [
      'duplicate wrapper',
      'foreign wrapper',
      'unrequested wrapper',
      'callback serialization',
      'unsupported cohort',
    ].includes(kind)
  ) {
    const controller = new AbortController(),
      launched = deferred()
    const sent = [],
      observed = []
    const client = createExecutionBrokerClient({
      allowCohorts: true,
      forwardTestRecordEvent(_id, event, deliver) {
        observed.push(event)
        deliver()
      },
      async send(message) {
        sent.push(message)
        if (message.action === 'execute') launched.resolve(message)
      },
    })
    const options = execution(controller.signal)
    options.onEvent = () => {}
    try {
      if (kind === 'callback serialization') {
        options.onTestRecord = async () => undefined
        await assert.rejects(
          client.execute(artifact, options),
          /remain in the actual parent/
        )
        assert.equal(sent.length, 0)
      } else if (kind === 'unsupported cohort') {
        await assert.rejects(
          client.executeCohort({ artifacts: [artifact] }, [options]),
          /isolated file workers/
        )
        assert.equal(sent.length, 0)
      } else {
        if (kind === 'unrequested wrapper') delete options.captureTestRecords
        const pending = client.execute(artifact, options)
        void pending.catch(() => {})
        const request = await launched.promise
        const event = record()
        const message = {
          type: 'execution-broker-response',
          id: request.id,
          action: 'test-record-event',
          recordId: 'one-record',
          event,
        }
        if (kind === 'foreign wrapper') event.runId = 'foreign-run'
        client.handle(message)
        if (kind === 'duplicate wrapper') client.handle(clone(message))
        client.handle({
          type: 'execution-broker-response',
          id: request.id,
          action: 'result',
          result,
        })
        await assert.rejects(pending)
        assert.equal(observed.length, kind === 'duplicate wrapper' ? 1 : 0)
        assert.equal(
          sent.filter((value) => value.action === 'cancel').length,
          1
        )
      }
    } finally {
      client.disconnect(new Error('wrapper control closed'))
    }
    return
  }
  if (
    [
      'foreign receipt',
      'duplicate receipt',
      'abort receipt',
      'already aborted receipt',
      'collector failure',
      'ignored observer return',
    ].includes(kind)
  ) {
    const controller = new AbortController(),
      worker = new AbortController()
    const receipts = createTestRecordReceipts(controller.signal),
      expected = record()
    const alreadyAborted = new Error('worker was already aborted')
    if (kind === 'already aborted receipt') worker.abort(alreadyAborted)
    let delivered = 0
    const waiting = receipts.wait('actual-record', expected, worker.signal)
    void waiting.catch(() => {})
    try {
      if (kind === 'foreign receipt') {
        const wrong = { ...clone(expected), caseId: 'foreign-case' }
        assert.throws(() =>
          receipts.receive('actual-record', wrong, () => delivered++)
        )
        assert.equal(delivered, 0)
      } else if (kind === 'duplicate receipt') {
        const received = clone(expected)
        await receipts.receive('actual-record', received, () => delivered++)
        assert.equal(await waiting, received)
        assert.equal(delivered, 1)
        assert.throws(() =>
          receipts.receive('actual-record', clone(expected), () => delivered++)
        )
        assert.equal(delivered, 1)
      } else if (
        kind === 'abort receipt' ||
        kind === 'already aborted receipt'
      ) {
        const reason =
          kind === 'already aborted receipt'
            ? alreadyAborted
            : new Error('actual worker aborted')
        if (!worker.signal.aborted) worker.abort(reason)
        await assert.rejects(waiting, (error) => error === reason)
        assert.equal(receipts.pending, 0)
        receipts.receive('actual-record', clone(expected), () => delivered++)
        assert.equal(
          delivered,
          1,
          'the real late event still reaches its observer'
        )
        const nextExpected = record(1),
          nextActual = clone(nextExpected)
        const next = receipts.wait(
          'next-record',
          nextExpected,
          new AbortController().signal
        )
        receipts.receive('next-record', nextActual, () => delivered++)
        assert.equal(await next, nextActual)
        assert.equal(delivered, 2)
      } else if (kind === 'collector failure') {
        const reason = new Error('actual collector failed')
        try {
          await receipts.receive('actual-record', clone(expected), () => {
            delivered++
            throw reason
          })
        } catch (error) {
          assert.equal(error, reason)
        }
        await assert.rejects(waiting, (error) => error === reason)
        assert.equal(delivered, 1)
      } else {
        const received = clone(expected)
        let reads = 0
        const ignored = Object.defineProperty({}, 'then', {
          get() {
            reads++
            throw new Error('observer return must stay ignored')
          },
        })
        receipts.receive('actual-record', received, () => {
          delivered++
          return ignored
        })
        assert.equal(await waiting, received)
        assert.equal(delivered, 1)
        assert.equal(reads, 0)
      }
    } finally {
      const reason = new Error('receipt test closed')
      receipts.close(reason)
      await waiting.catch(() => {})
      assert.equal(receipts.pending, 0)
    }
    return
  }
  if (
    ![
      'concurrent records',
      'raw outcomes',
      'omitted records',
      'parent authority',
      'unowned parent',
    ].includes(kind)
  )
    throw new Error('Unknown broker record control ' + kind)
  const controller = new AbortController(),
    current = createTestRecordForwarder()
  const receipts = createTestRecordReceipts(controller.signal)
  const sent = [],
    childEvents = [],
    parentEvents = [],
    callbackEntries = []
  const gates = [deferred(), deferred(), deferred()],
    allEntered = deferred()
  let client,
    callbackIndex = 0,
    executorCalls = 0
  const captured = !['omitted records', 'unowned parent'].includes(kind)
  const host = createExecutionBrokerHost({
    signal: controller.signal,
    ...(captured
      ? {
          captureTestRecords: true,
          onTestRecord(_artifact, _options, event, recordId, signal) {
            return receipts
              .wait(recordId, event, signal)
              .then(async (actual) => {
                assert.notEqual(actual, event)
                assert.equal(parentEvents.includes(actual), true)
                assert.equal(
                  actual,
                  parentEvents.find(
                    (value) => value.timestamp === actual.timestamp
                  )
                )
                const index = callbackIndex++
                callbackEntries.push(index)
                if (callbackEntries.length === 3) allEntered.resolve()
                if (kind === 'concurrent records') {
                  await gates[index].promise
                  const value =
                    actual.type === 'test-annotation'
                      ? actual.annotation
                      : actual.artifact
                  value.mutated = index
                  return actual.type === 'test-annotation'
                    ? { type: 'internal:annotation', annotation: value }
                    : value
                }
                if (kind === 'raw outcomes') {
                  if (index === 0) throw { native: ['original', 42] }
                  if (index === 1) return undefined
                  throw 'original primitive'
                }
                return actual.type === 'test-annotation'
                  ? {
                      type: 'internal:annotation',
                      annotation: actual.annotation,
                    }
                  : actual.artifact
              })
          },
        }
      : {}),
    async send(message) {
      sent.push(message)
      client.handle(clone(message))
    },
  })
  client = createExecutionBrokerClient({
    forwardTestRecordEvent(recordId, event, deliver) {
      current.forward(recordId, event, deliver)
    },
    async send(message) {
      // A logical callback must never cross the compiler broker channel.
      if (message.action === 'execute')
        assert.equal(Object.hasOwn(message.options, 'onTestRecord'), false)
      host.handle(clone(message))
    },
  })
  const options = execution(controller.signal)
  options.onEvent = (event) => {
    childEvents.push(event)
    const id = current.id(event),
      actual = clone(event)
    if (id === undefined) parentEvents.push(actual)
    else receipts.receive(id, actual, () => parentEvents.push(actual))
  }
  if (kind === 'omitted records') delete options.captureTestRecords
  setExecutor(async (_artifact, actualOptions) => {
    executorCalls++
    const events = [record(0), record(1), record(2, 'test-artifact')]
    if (!captured) {
      assert.equal(Object.hasOwn(actualOptions, 'onTestRecord'), false)
      for (const event of events) actualOptions.onEvent(event)
      return result
    }
    assert.equal(typeof actualOptions.onTestRecord, 'function')
    for (const event of events) actualOptions.onEvent(event)
    const operations = events.map((event) => actualOptions.onTestRecord(event))
    if (kind === 'concurrent records') {
      await allEntered.promise
      assert.deepEqual(callbackEntries, [0, 1, 2])
      gates[2].resolve()
      await operations[2]
      gates[1].resolve()
      await operations[1]
      gates[0].resolve()
      const resolved = await Promise.all(operations)
      assert.equal(resolved[0].annotation, parentEvents[0].annotation)
      assert.equal(resolved[1].annotation, parentEvents[1].annotation)
      assert.equal(resolved[2], parentEvents[2].artifact)
      assert.deepEqual(
        resolved.map((value) => value.annotation?.mutated ?? value.mutated),
        [0, 1, 2]
      )
    } else if (kind === 'raw outcomes') {
      const settled = await Promise.allSettled(operations)
      assert.deepEqual(settled, [
        { status: 'rejected', reason: { native: ['original', 42] } },
        { status: 'fulfilled', value: undefined },
        { status: 'rejected', reason: 'original primitive' },
      ])
    } else await Promise.all(operations)
    return result
  })
  try {
    if (kind === 'parent authority' || kind === 'unowned parent') {
      // The actual host callback authority cannot be downgraded by the compiler.
      if (kind === 'parent authority') delete options.captureTestRecords
      await assert.rejects(client.execute(artifact, options))
      assert.equal(executorCalls, 0)
      return
    }
    assert.deepEqual(await client.execute(artifact, options), result)
    assert.equal(executorCalls, 1)
    assert.equal(childEvents.length, 3)
    assert.equal(parentEvents.length, 3)
    assert.equal(receipts.pending, 0)
    const occurrences = sent.filter(
      (message) => message.action === (captured ? 'test-record-event' : 'event')
    )
    assert.equal(occurrences.length, 3)
    for (const message of occurrences) {
      assert.equal(Object.hasOwn(message.event, 'recordId'), false)
      assert.equal(Object.hasOwn(message, 'recordId'), captured)
    }
    assert.equal(
      sent.some((message) => message.action === 'error'),
      false
    )
  } finally {
    for (const gate of gates) gate.resolve()
    receipts.close(new Error('broker record test closed'))
    await host.close().catch(() => {})
    client.disconnect(new Error('broker record test disconnected'))
  }
}
