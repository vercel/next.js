const assert = require('node:assert/strict')
const scopes = require('next/dist/experimental/testing/client/async-context')
const {
  bindNativePromiseStaticCall: bind,
} = require('next/dist/experimental/testing/client/promise-static-call')
const {
  registerBrowserActionIdentity,
} = require('next/dist/experimental/testing/client/browser-action-identity')

const original = Object.fromEntries(
  ['all', 'resolve'].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(Promise, name),
  ])
)
const failures = [],
  trace = [],
  releases = new Map()
const scope = (name) =>
  scopes.createAsyncScope(
    {
      kind: 'attempt',
      context: {
        id: 'actual/' + name,
        fileId: 'entry',
        testId: 'entry/' + name,
        name,
        retry: 0,
        repeat: 0,
        signal: new AbortController().signal,
      },
    },
    (error) => failures.push(error)
  )

class SDKAction {
  constructor(name) {
    this.name = name
    this.operation = new Promise((resolve) => releases.set(name, resolve))
    registerBrowserActionIdentity(this, identity)
  }
  then(resolve, reject) {
    scopes.assertBrowserApiScope('utility')
    trace.push(['start', this.name, scopes.getOriginatingAttempt().id])
    return this.operation.then((value) => {
      trace.push(['settle', this.name, scopes.getOriginatingAttempt().id])
      resolve(value)
    }, reject)
  }
}
const identity = {
  prototypes: [SDKAction.prototype],
  then: Object.getOwnPropertyDescriptor(SDKAction.prototype, 'then'),
}

async function main() {
  // The consumer can first enter an authored module after setup replacements.
  // Bootstrap captures must still distinguish those replacements from natives.
  const consumerPath = require.resolve(
    'next/dist/experimental/testing/client/promise-static-call'
  )
  const replacementCalls = [],
    marker = {}
  try {
    Promise.all = function (input) {
      replacementCalls.push(['all', this === Promise, input])
      return marker
    }
    Promise.resolve = function (input) {
      replacementCalls.push(['resolve', this === Promise, input])
      return marker
    }
    delete require.cache[consumerPath]
    const late = require(consumerPath).bindNativePromiseStaticCall
    assert.equal(late(Promise, 'all')('original all input'), marker)
    assert.equal(late(Promise, 'resolve')('original resolve input'), marker)
    assert.deepEqual(replacementCalls, [
      ['all', true, 'original all input'],
      ['resolve', true, 'original resolve input'],
    ])
  } finally {
    for (const name of ['all', 'resolve'])
      Object.defineProperty(Promise, name, original[name])
    delete require.cache[consumerPath]
  }
  const a = scope('A'),
    b = scope('B'),
    aa = [new SDKAction('A1'), new SDKAction('A2')],
    bb = [new SDKAction('B1'), new SDKAction('B2')]
  const savedQueue = globalThis.queueMicrotask
  let first, second
  try {
    globalThis.queueMicrotask = () => {
      throw new Error('The authored queue must not schedule native adoption')
    }
    first = a.run(() => bind(Promise, 'all')(aa))
    second = b.run(() => bind(Promise, 'all')(bb))
  } finally {
    globalThis.queueMicrotask = savedQueue
  }
  assert.equal(first.constructor, Promise)
  assert.equal(second.constructor, Promise)
  await new Promise(savedQueue)
  assert.deepEqual(trace, [
    ['start', 'A1', 'actual/A'],
    ['start', 'A2', 'actual/A'],
    ['start', 'B1', 'actual/B'],
    ['start', 'B2', 'actual/B'],
  ])
  for (const name of ['B2', 'A1', 'B1', 'A2']) releases.get(name)(name)
  assert.deepEqual(await first, ['A1', 'A2'])
  assert.deepEqual(await second, ['B1', 'B2'])
  assert.deepEqual(trace.slice(4), [
    ['settle', 'B2', 'actual/B'],
    ['settle', 'A1', 'actual/A'],
    ['settle', 'B1', 'actual/B'],
    ['settle', 'A2', 'actual/A'],
  ])
  assert.equal(scopes.getOriginatingAttempt(), undefined)

  const noncallable = new SDKAction('noncallable')
  Object.defineProperty(noncallable, 'then', { value: 42 })
  assert.equal(await bind(Promise, 'resolve')(noncallable), noncallable)
  const deleted = new SDKAction('deleted')
  const descriptor = Object.getOwnPropertyDescriptor(
    SDKAction.prototype,
    'then'
  )
  let deletedPromise
  try {
    delete SDKAction.prototype.then
    deletedPromise = bind(Promise, 'resolve')(deleted)
  } finally {
    Object.defineProperty(SDKAction.prototype, 'then', descriptor)
  }
  assert.equal(await deletedPromise, deleted)
  const getter = new SDKAction('getter'),
    raw = new Error('original getter failure')
  let reads = 0
  Object.defineProperty(getter, 'then', {
    get() {
      reads++
      throw raw
    },
  })
  await assert.rejects(
    bind(Promise, 'resolve')(getter),
    (error) => error === raw
  )
  assert.equal(reads, 1)

  const closed = scope('closed'),
    closedAction = new SDKAction('closed')
  closed.close()
  await assert.rejects(
    closed.run(() => bind(Promise, 'resolve')(closedAction)),
    /closed attempt scope "closed"/
  )
  assert.equal(failures.length, 1)
  assert.equal(await bind(Promise, 'resolve')(), undefined)
  for (const name of ['all', 'resolve'])
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(Promise, name),
      original[name]
    )
  a.close()
  b.close()
  process.stdout.write(
    JSON.stringify({
      actualPrivateScopes: true,
      constructorCarriesNoScope: true,
      exactInterleavedStartAndSettlementOrigins: true,
      nativeQueueIndependentOfAuthoredReplacement: true,
      mutatedThenDelegatesOriginalIdentity: true,
      rawGetterIdentityAndSingleRead: true,
      closedScopeStillRefused: true,
      staticIntrinsicsUnchanged: true,
    }) + '\n'
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
