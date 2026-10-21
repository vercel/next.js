'use strict'
const assert = require('node:assert/strict')
const { once, getEventListeners } = require('node:events')
const {
  renderToNodeFlightStream,
} = require('next/dist/server/app-render/stream-ops.node')
const {
  createNodeDebugChannel,
} = require('next/dist/server/app-render/debug-channel-server.node')
const {
  createRouteDebugChannelCollector,
} = require('next/dist/experimental/testing/rsc/route-debug-channel')

const controls = []
let completedControls = false
process.once('beforeExit', () => {
  if (!completedControls) {
    console.error(
      'Owned Flight controls did not complete:',
      controls.map((value) => value.kind)
    )
    process.exitCode = 1
  }
})
function setup(options = {}) {
  const controller = new AbortController()
  if (options.alreadyAborted) controller.abort(options.alreadyAborted)
  const pair = options.debug === false ? undefined : createNodeDebugChannel()
  const collector = pair && createRouteDebugChannelCollector()
  if (pair) collector.setReactDebugChannel(pair.clientSide, 'html', 'request')
  options.onDebugPair?.({ pair, collector, controller })
  const state = {
    aborts: [],
    target: undefined,
    pipeCalls: 0,
    closed: undefined,
  }
  const endDebug = () => {
    if (pair && !pair.serverSide.writableEnded) pair.serverSide.end()
  }
  const end = (bytes) => {
    if (!state.target.destroyed && !state.target.writableEnded)
      state.target.end(bytes)
    endDebug()
  }
  const component = {
    renderToReadableStream() {
      throw new Error('The Node control must use the Node producer')
    },
    renderToPipeableStream() {
      if (options.factoryError) throw options.factoryError
      return {
        pipe(target) {
          state.target = target
          state.pipeCalls++
          state.closed = new Promise((resolve) => target.once('close', resolve))
          if (options.pipeError) throw options.pipeError
          return target
        },
        abort(reason) {
          state.aborts.push(reason)
          if (options.onAbort) options.onAbort({ state, end, endDebug }, reason)
          else end('actual aborted producer tail')
        },
      }
    },
  }
  const foreign = new AbortController()
  const opts = {
    signal: controller.signal,
    ...(pair && { debugChannel: pair.serverSide }),
  }
  const stream = renderToNodeFlightStream(
    component,
    {},
    {},
    opts,
    options.owned === false
      ? undefined
      : options.foreign
        ? foreign.signal
        : controller.signal
  )
  return { state, controller, stream, collector, end, endDebug }
}
async function readAll(stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}
async function joined(fixture) {
  await fixture.state.closed
  await fixture.collector?.close()
  assert.equal(getEventListeners(fixture.controller.signal, 'abort').length, 0)
}
;(async () => {
  for (const variant of ['default', 'foreign', 'no-debug']) {
    const fixture = setup({
      owned: variant !== 'default',
      foreign: variant === 'foreign',
      debug: variant !== 'no-debug',
    })
    assert.equal(fixture.state.target, fixture.stream)
    const body = readAll(fixture.stream)
    fixture.end(Buffer.from('unchanged default bytes'))
    assert.equal((await body).toString(), 'unchanged default bytes')
    await joined(fixture)
    controls.push({
      kind: variant,
      originalDestination: true,
      listenersClosed: true,
    })
  }
  {
    const fixture = setup(),
      bytes = Buffer.alloc(64 * 1024, 71)
    assert.notEqual(fixture.state.target, fixture.stream)
    fixture.state.target.write(bytes)
    assert.equal(fixture.state.target.isPaused(), true)
    const body = readAll(fixture.stream)
    fixture.end()
    assert.deepEqual(await body, bytes)
    await joined(fixture)
    controls.push({
      kind: 'owned real byte backpressure',
      allBytesExact: true,
      privateJoined: true,
    })
  }
  {
    const fixture = setup(),
      reason = new Error('actual public cancellation')
    const error = once(fixture.stream, 'error')
    fixture.stream.destroy(reason)
    assert.equal((await error)[0], reason)
    await joined(fixture)
    assert.equal(fixture.state.target.readableEnded, true)
    assert.equal(fixture.state.aborts.length, 1)
    assert.equal(fixture.state.aborts[0].name, 'ResponseAborted')
    controls.push({
      kind: 'early unread cancel',
      originalReason: true,
      privateJoined: true,
    })
  }
  {
    const reason = new Error('actual already aborted signal'),
      fixture = setup({ alreadyAborted: reason })
    assert.equal(fixture.state.aborts[0], reason)
    assert.equal(
      (await readAll(fixture.stream)).toString(),
      'actual aborted producer tail'
    )
    await joined(fixture)
    controls.push({
      kind: 'already aborted signal',
      originalReason: true,
      privateJoined: true,
    })
  }
  {
    const fixture = setup(),
      failure = new Error('actual public transform write failure')
    fixture.stream._transform = (_chunk, _encoding, callback) =>
      callback(failure)
    const error = once(fixture.stream, 'error')
    fixture.state.target.write(Buffer.from('actual producer bytes'))
    assert.equal((await error)[0], failure)
    await joined(fixture)
    controls.push({
      kind: 'actual transform write error',
      originalError: true,
      privateJoined: true,
    })
  }
  {
    const failure = new Error('actual private producer failure'),
      fixture = setup()
    const error = once(fixture.stream, 'error')
    fixture.state.target.destroy(failure)
    fixture.endDebug()
    assert.equal((await error)[0], failure)
    await joined(fixture)
    controls.push({
      kind: 'private producer error',
      originalError: true,
      privateJoined: true,
    })
  }
  {
    const outputError = new Error('actual output failure'),
      sourceError = new Error('independent source failure')
    const fixture = setup({
      onAbort({ state, endDebug }) {
        endDebug()
        setImmediate(() => state.target.destroy(sourceError))
      },
    })
    const error = once(fixture.stream, 'error')
    fixture.stream.destroy(outputError)
    const actual = (await error)[0]
    assert.deepEqual(actual.errors, [outputError, sourceError])
    assert.equal(actual.errors[0], outputError)
    assert.equal(actual.errors[1], sourceError)
    await joined(fixture)
    controls.push({
      kind: 'independent output and source errors',
      originalIdentitiesAndOrder: true,
      privateJoined: true,
    })
  }
  {
    const outputError = new Error('actual output failure'),
      abortError = new Error('actual abort callback failure')
    const fixture = setup({
      onAbort({ endDebug }) {
        endDebug()
        throw abortError
      },
    })
    const error = once(fixture.stream, 'error')
    fixture.stream.destroy(outputError)
    const actual = (await error)[0]
    assert.deepEqual(actual.errors, [outputError, abortError])
    assert.equal(actual.errors[0], outputError)
    assert.equal(actual.errors[1], abortError)
    await joined(fixture)
    controls.push({
      kind: 'abort throws',
      originalIdentitiesAndOrder: true,
      privateJoined: true,
    })
  }
  {
    const first = new Error('actual signal abort failure'),
      second = new Error('independent destroy abort failure')
    let calls = 0
    const fixture = setup({
      onAbort({ endDebug }) {
        endDebug()
        throw ++calls === 1 ? first : second
      },
    })
    const error = once(fixture.stream, 'error')
    fixture.controller.abort(new Error('actual signal reason'))
    const actual = (await error)[0]
    assert.deepEqual(actual.errors, [first, second])
    assert.equal(actual.errors[0], first)
    assert.equal(actual.errors[1], second)
    await joined(fixture)
    controls.push({
      kind: 'independent signal and destroy abort errors',
      originalIdentitiesAndOrder: true,
      privateJoined: true,
    })
  }
  {
    const fixture = setup(),
      error = once(fixture.stream, 'error')
    fixture.state.target.destroy()
    fixture.endDebug()
    assert.equal((await error)[0].code, 'ERR_STREAM_PREMATURE_CLOSE')
    await joined(fixture)
    controls.push({
      kind: 'private close without EOF',
      actualNodePrematureClose: true,
      privateJoined: true,
    })
  }
  {
    const failure = new Error('actual partial pipe acquisition failure'),
      fixture = setup({ pipeError: failure })
    const error = once(fixture.stream, 'error')
    assert.equal((await error)[0], failure)
    await joined(fixture)
    controls.push({
      kind: 'partial pipe acquisition',
      originalError: true,
      privateJoined: true,
    })
  }
  {
    const failure = new Error('actual producer factory acquisition failure')
    let acquired
    assert.throws(
      () =>
        setup({
          factoryError: failure,
          onDebugPair(value) {
            acquired = value
          },
        }),
      (actual) => actual === failure
    )
    // The fixture owns this unused writer: the throwing factory acquired no
    // producer or private destination, so no production reader is ended here.
    acquired.pair.serverSide.end()
    await acquired.collector.close()
    assert.equal(
      getEventListeners(acquired.controller.signal, 'abort').length,
      0
    )
    controls.push({
      kind: 'producer factory acquisition',
      originalError: true,
      noPrivateStreamAcquired: true,
    })
  }
  completedControls = true
  process.stdout.write(
    JSON.stringify({ runtime: process.version, controls }) + '\n'
  )
})().catch((error) => {
  completedControls = true
  console.error(error)
  process.exitCode = 1
})
