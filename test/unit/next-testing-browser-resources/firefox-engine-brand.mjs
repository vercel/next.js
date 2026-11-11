import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const filename = fileURLToPath(import.meta.url)
const repository = join(dirname(filename), '../../..')
const projectDir = process.argv[2] ?? repository
if (process.argv[3] !== '--child') {
  const auditDir = await mkdtemp(join(tmpdir(), 'next-firefox-brand-'))
  try {
    // The outer owner joins even a broken/paused child and its real browser.
    const result = await runOwnedNode([filename, projectDir, '--child'], {
      cwd: repository,
      env: process.env,
      auditDir: join(auditDir, 'processes'),
      timeoutMs: 60_000,
    })
    assertOwnedNodeCompleted(result, 'Firefox engine-brand resources')
    assert.equal(result.status, 0, result.stdout + result.stderr)
    process.stdout.write(result.stdout)
  } finally {
    await rm(auditDir, { recursive: true, force: true })
  }
} else {
  await verify()
}

function deferred() {
  let resolve
  const promise = new Promise((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

async function verify() {
  const require = createRequire(join(repository, 'package.json'))
  const requireFromProject = createRequire(join(projectDir, 'package.json'))
  const sdk = requireFromProject('playwright')
  const net = require('node:net')
  const {
    createFirefoxBrowserHost,
  } = require('next/dist/experimental/testing/browser/firefox-host')
  const {
    connectBrowserHost,
  } = require('next/dist/experimental/testing/browser/host')
  const {
    createClientEngineBrand,
  } = require('next/dist/experimental/testing/client/engine-brand')
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html')
    response.end(
      '<html><body><script>window.firstAuthoredBrand=globalThis[Symbol.for("next.test.engine-promise-brand.v1")](Promise.resolve(7))</script>owned Firefox native bridge</body></html>'
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = 'http://127.0.0.1:' + server.address().port
  let controller = new AbortController()
  let host, browser, nativeBrowser, rdpSocket
  const brands = [],
    contexts = [],
    facts = [],
    failures = [],
    pauses = []
  const rows = [],
    configurationCalls = [],
    overlayMessages = []
  let vectors, unhandled
  async function acquire() {
    controller = new AbortController()
    let socketPath
    const createConnection = net.createConnection
    net.createConnection = function (...args) {
      const socket = createConnection.apply(this, args)
      if (args[0] === socketPath) rdpSocket = socket
      return socket
    }
    const firefox = Object.create(sdk.firefox)
    firefox.launch = async (options) => {
      socketPath = options.args[1]
      nativeBrowser = await sdk.firefox.launch(options)
      return nativeBrowser
    }
    try {
      host = await createFirefoxBrowserHost(
        { signal: controller.signal },
        { ...sdk, firefox }
      )
      browser = await connectBrowserHost({
        projectDir,
        wsEndpoint: host.wsEndpoint,
        engine: 'firefox',
      })
    } finally {
      net.createConnection = createConnection
    }
  }
  async function fixture(changeOwner) {
    const context = await browser.newContext()
    contexts.push(context)
    const page = await context.newPage()
    const signal = new AbortController()
    const actualOwner = host.firefoxPageOwner(context, page)
    page.on('console', (message) => {
      if (message.text().includes('paused-debugger.js'))
        overlayMessages.push(message.text())
    })
    const recordingOwner = {
      ...actualOwner,
      rdp: {
        ...actualOwner.rdp,
        async request(to, type, fields) {
          configurationCalls.push({ phase: 'request', to, type, fields })
          const result = await actualOwner.rdp.request(to, type, fields)
          configurationCalls.push({ phase: 'reply', to, type })
          return result
        },
      },
    }
    const errors = []
    const failed = deferred()
    const brand = createClientEngineBrand({
      context,
      page,
      url,
      signal: signal.signal,
      firefoxOwner: changeOwner ? changeOwner(recordingOwner) : recordingOwner,
      onFailure(error) {
        errors.push(error)
        failed.resolve(error)
      },
    })
    brands.push(brand)
    await brand.start()
    return { context, page, signal, owner: actualOwner, brand, errors, failed }
  }
  async function disposeFixture(item) {
    await item.brand.close()
    await item.context.close()
    await item.brand.afterOwnersClosed()
  }
  try {
    await acquire()
    const first = await fixture()
    const { page, brand } = first
    const configured = configurationCalls.findIndex(
      (call) => call.phase === 'request' && call.type === 'updateConfiguration'
    )
    assert.ok(configured >= 0)
    assert.deepEqual(configurationCalls[configured].fields, {
      configuration: { pauseOverlay: false },
    })
    const applied = configurationCalls.findIndex(
      (call) => call.phase === 'reply' && call.type === 'updateConfiguration'
    )
    const watched = configurationCalls.findIndex(
      (call) => call.phase === 'request' && call.type === 'watchTargets'
    )
    assert.ok(configured < applied && applied < watched)
    rows.push('thread-configuration-before-targets')
    first.owner.rdp.onPacket((packet) => {
      if (packet.type === 'paused')
        pauses.push(packet.frame?.displayName ?? 'registration')
      return false
    })
    await page.goto(url + '/one')
    assert.equal(await page.evaluate(() => window.firstAuthoredBrand), 1)
    facts.push(brand.fact())
    vectors = await page.evaluate(() => {
      const trace = [],
        results = []
      const classify =
        globalThis[Symbol.for('next.test.engine-promise-brand.v1')]
      const nativePrototype = Promise.prototype
      const check = (label, value, expected) =>
        results.push({ label, actual: classify(value), expected })
      const watched = (label) =>
        new Proxy(
          {},
          new Proxy(
            {},
            {
              get(_target, key) {
                return () => {
                  trace.push(label + ':' + String(key))
                  throw Error('Authored proxy trap')
                }
              },
            }
          )
        )
      check('undefined', undefined, 0)
      check('null', null, 0)
      check('number', 17, 0)
      check('native-pending', new Promise(() => {}), 1)
      check('native-fulfilled', Promise.resolve(7), 1)
      check('fake-prototype', Object.create(nativePrototype), 0)
      check(
        'tag-getter',
        Object.defineProperty({}, Symbol.toStringTag, {
          get() {
            trace.push('tag-getter')
            return 'Promise'
          },
        }),
        0
      )
      check('tag-value', { [Symbol.toStringTag]: 'Promise' }, 0)
      check(
        'then-getter',
        Object.defineProperty({}, 'then', {
          get() {
            trace.push('then-getter')
            throw Error('Do not observe then')
          },
        }),
        0
      )
      check(
        'thenable',
        {
          then() {
            trace.push('then-call')
          },
        },
        0
      )
      check('proxy-object', watched('object'), 0)
      check(
        'proxy-promise',
        new Proxy(
          Promise.resolve(4),
          new Proxy(
            {},
            {
              get(_target, key) {
                return () => {
                  trace.push('promise:' + String(key))
                  throw Error('Authored proxy trap')
                }
              },
            }
          )
        ),
        0
      )
      const revoked = Proxy.revocable(Promise.resolve(1), {})
      revoked.revoke()
      check('revoked-proxy', revoked.proxy, 0)
      class Sub extends Promise {}
      check('subclass', Sub.resolve(1), 2)
      const constructor = Promise.resolve(1)
      Object.defineProperty(constructor, 'constructor', {
        get() {
          trace.push('constructor')
          throw Error('Do not observe constructor')
        },
      })
      check('constructor-getter', constructor, 1)
      const custom = Promise.resolve(1)
      Object.setPrototypeOf(custom, {})
      check('custom-prototype', custom, 2)
      const iframe = document.createElement('iframe')
      document.body.append(iframe)
      check('foreign-realm', iframe.contentWindow.Promise.resolve(1), 2)
      iframe.remove()
      const payload = watched('fulfilled-payload')
      check('fulfilled-proxy-payload', Promise.resolve(payload), 1)
      window.__probeUnhandled = []
      window.addEventListener('unhandledrejection', (event) => {
        window.__probeUnhandled.push(event.reason)
        event.preventDefault()
      })
      check('native-rejected', Promise.reject('owned-rejection'), 1)
      return { results, trace }
    })
    for (const row of vectors.results)
      assert.equal(row.actual, row.expected, row.label)
    assert.equal(vectors.results.length, 19)
    assert.deepEqual(vectors.trace, ['fulfilled-payload:get'])
    await page.waitForFunction(() =>
      window.__probeUnhandled.includes('owned-rejection')
    )
    unhandled = await page.evaluate(() =>
      window.__probeUnhandled.map((value) =>
        typeof value === 'string'
          ? value
          : { name: value.name, message: value.message }
      )
    )
    assert.deepEqual(unhandled, [
      { name: 'Error', message: 'Authored proxy trap' },
      'owned-rejection',
    ])
    const transitions = await page.evaluate(async () => {
      const classify =
        globalThis[Symbol.for('next.test.engine-promise-brand.v1')]
      const rows = []
      for (let index = 0; index < 128; index++) {
        const value = Promise.resolve(index)
        const actual = classify(value)
        const resolved = await value
        await new Promise((resolve) => setTimeout(resolve, 0))
        rows.push([index, actual, resolved])
      }
      return rows
    })
    assert.deepEqual(
      transitions,
      Array.from({ length: 128 }, (_, index) => [index, 1, index])
    )
    const checkOrder = async (useClassifier) => {
      const classify =
        globalThis[Symbol.for('next.test.engine-promise-brand.v1')]
      const rows = []
      for (let index = 0; index < 64; index++) {
        const trace = []
        Promise.resolve().then(() => trace.push('promise-job'))
        queueMicrotask(() => trace.push('microtask'))
        trace.push('before')
        const actual = useClassifier ? classify(Promise.resolve(index)) : 1
        trace.push('after')
        await Promise.resolve()
        trace.push('awaited')
        rows.push({ actual, trace })
      }
      return rows
    }
    const ordinaryOrder = await page.evaluate(checkOrder, false)
    const classifiedOrder = await page.evaluate(checkOrder, true)
    assert.deepEqual(classifiedOrder, ordinaryOrder)
    assert.deepEqual(
      ordinaryOrder,
      Array.from({ length: 64 }, () => ({
        actual: 1,
        trace: ['before', 'after', 'promise-job', 'microtask', 'awaited'],
      }))
    )
    rows.push('native-timer-128', 'native-job-order-64')

    assert.equal(
      await page.evaluate(() => {
        debugger
        return 'unrelated-resumed'
      }),
      'unrelated-resumed'
    )
    await page.evaluate(() => {
      const button = document.createElement('button')
      button.textContent = 'Owned native click'
      button.addEventListener('click', (event) => {
        window.__nativeClick = {
          trusted: event.isTrusted,
          brand: globalThis[Symbol.for('next.test.engine-promise-brand.v1')](
            Promise.resolve(3)
          ),
        }
      })
      document.body.append(button)
    })
    await page.getByRole('button', { name: 'Owned native click' }).click()
    assert.deepEqual(await page.evaluate(() => window.__nativeClick), {
      trusted: true,
      brand: 1,
    })
    assert.deepEqual(overlayMessages, [])
    rows.push('native-click-paused-handler')
    await page.goto(url + '/two')
    assert.equal(await page.evaluate(() => window.firstAuthoredBrand), 1)
    facts.push(brand.fact())
    assert.notEqual(facts[0].executionContextId, facts[1].executionContextId)
    assert.notEqual(facts[0].scriptId, facts[1].scriptId)
    assert.equal(facts[0].frameId, facts[1].frameId)

    assert.deepEqual(first.errors, [])
    rows.push(
      'native-brand-19',
      'first-authored-code',
      'navigation-reregistration',
      'unrelated-debugger'
    )

    const second = await fixture()
    await second.page.goto(url + '/other-page')
    assert.equal(await second.page.evaluate(() => window.firstAuthoredBrand), 1)
    assert.notEqual(second.brand.fact().frameId, brand.fact().frameId)
    assert.notEqual(second.owner.browserId(), first.owner.browserId())
    assert.throws(
      () => host.firefoxPageOwner(first.context, second.page),
      /outside its live/
    )
    assert.deepEqual(second.errors, [])
    const closedNative = second.brand.close()
    assert.equal(second.brand.close(), closedNative)
    await closedNative
    assert.throws(() => second.brand.fact(), /classifier is closed/)
    await disposeFixture(second)
    assert.throws(() => second.owner.assertCurrent(), /closed or changed/)
    assert.equal(
      await page.evaluate(() =>
        globalThis[Symbol.for('next.test.engine-promise-brand.v1')](
          Promise.resolve(1)
        )
      ),
      1
    )
    await disposeFixture(first)
    rows.push(
      'multiple-pages',
      'wrong-context-rejected',
      'closed-page-rejected'
    )

    for (const phase of ['registration', 'setup-reply', 'installed']) {
      const reached = deferred(),
        release = deferred()
      let resumeCount = 0
      const delayed = []
      const item = await fixture((owner) => ({
        ...owner,
        async openNativeSession(signal) {
          const session = await owner.openNativeSession(signal)
          return {
            ...session,
            async request(to, type, fields) {
              const reply = await session.request(to, type, fields)
              if (phase === 'setup-reply' && type === 'evaluateJSAsync') {
                reached.resolve()
                await release.promise
              }
              return reply
            },
            onPacket(listener) {
              let active = true
              const remove = session.onPacket((packet) => {
                if (
                  phase === 'installed' &&
                  packet.type === 'evaluationResult' &&
                  typeof packet.result === 'string' &&
                  JSON.parse(packet.result).installed === true
                ) {
                  reached.resolve()
                  delayed.push(
                    release.promise.then(() => active && listener(packet))
                  )
                  return false
                }
                return listener(packet)
              })
              return () => {
                active = false
                remove()
              }
            },
          }
        },
        rdp: {
          ...owner.rdp,
          async request(to, type, fields) {
            if (type === 'resume') resumeCount++
            const reply = await owner.rdp.request(to, type, fields)
            if (phase === 'registration' && type === 'source') {
              reached.resolve()
              await release.promise
            }
            return reply
          },
        },
      }))
      const navigation = item.page.goto(url + '/cancel-' + phase).then(
        () => ({ ok: true }),
        (error) => ({ error: error.message })
      )
      await reached.promise
      item.signal.abort(new Error('Owned cancellation during ' + phase))
      // Closing while paused races its normal finally-resume on the real thread.
      release.resolve()
      await navigation
      await Promise.all(delayed)
      await disposeFixture(item)
      assert.deepEqual(item.errors, [])
      assert.ok(
        resumeCount >= 2,
        phase + ': both close/finally resume paths joined'
      )
      rows.push('abort-' + phase)
    }

    const cancelledExecution = await fixture()
    await cancelledExecution.page.goto(url + '/execution-abort')
    controller.abort(new Error('Owned execution cancellation'))
    cancelledExecution.signal.abort(controller.signal.reason)
    await disposeFixture(cancelledExecution)
    assert.deepEqual(cancelledExecution.errors, [])
    await browser.close()
    await host.dispose()
    rows.push('execution-abort-cleanup')

    await acquire()
    const lostRdp = await fixture()
    await lostRdp.page.goto(url + '/lost-rdp')
    assert.ok(rdpSocket)
    rdpSocket.destroy()
    assert.match(
      (await lostRdp.failed.promise).message,
      /debugger disconnected/
    )
    await lostRdp.context.close()
    lostRdp.brand.close()
    await lostRdp.brand.afterOwnersClosed()
    await browser.close()
    await host.dispose()
    rows.push('unexpected-rdp-exit')

    await acquire()
    const cleanupFailure = new Error('Controlled auxiliary cleanup failure')
    let denyCleanup = false
    const failedCleanup = await fixture((owner) => ({
      ...owner,
      openNativeSession(signal) {
        if (denyCleanup) throw cleanupFailure
        return owner.openNativeSession(signal)
      },
    }))
    await failedCleanup.page.goto(url + '/cleanup-after-transport-loss')
    denyCleanup = true
    rdpSocket.destroy()
    assert.match(
      (await failedCleanup.failed.promise).message,
      /debugger disconnected/
    )
    await failedCleanup.brand.close()
    await failedCleanup.context.close()
    await assert.rejects(failedCleanup.brand.afterOwnersClosed(), (error) => {
      assert.equal(error.name, 'AggregateError')
      assert.deepEqual(error.errors, [cleanupFailure])
      return true
    })
    // This negative control's exact cleanup failure was asserted after its
    // context joined; the outer cleanup must not rethrow that expected error.
    brands.splice(brands.indexOf(failedCleanup.brand), 1)
    await browser.close()
    await host.dispose()
    rows.push('cleanup-failure-after-transport-loss')

    await acquire()
    const lostBrowser = await fixture()
    await lostBrowser.page.goto(url + '/lost-browser')
    await nativeBrowser.close()
    assert.match(
      (await lostBrowser.failed.promise).message,
      /debugger disconnected/
    )
    await disposeFixture(lostBrowser)
    assert.throws(() => lostBrowser.owner.assertCurrent(), /closed or changed/)
    await assert.rejects(host.dispose(), (error) => {
      assert.equal(error.name, 'BrowserFixtureError')
      assert.equal(error.errors.length, 1)
      assert.match(error.errors[0].message, /browser.unbind.*closed/)
      return true
    })
    // The failed host is already fully joined; its actual cleanup failure is
    // asserted above rather than rethrown by the final idempotent cleanup.
    host = undefined
    browser = undefined
    rows.push('unexpected-browser-exit')
  } finally {
    for (const brand of brands) brand.close()
    const errors = []
    for (const close of [
      ...brands.map((brand) => () => brand.close()),
      ...contexts.map((context) => () => context.close()),
      () => browser?.close(),
      () => host?.dispose(),
      ...brands.map((brand) => () => brand.afterOwnersClosed()),
      () => new Promise((resolve) => server.close(resolve)),
    ]) {
      try {
        await close()
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length)
      throw new globalThis.AggregateError(
        errors,
        'Firefox engine-brand cleanup failed'
      )
  }
  assert.deepEqual(rows, [
    'thread-configuration-before-targets',
    'native-timer-128',
    'native-job-order-64',
    'native-click-paused-handler',
    'native-brand-19',
    'first-authored-code',
    'navigation-reregistration',
    'unrelated-debugger',
    'multiple-pages',
    'wrong-context-rejected',
    'closed-page-rejected',
    'abort-registration',
    'abort-setup-reply',
    'abort-installed',
    'execution-abort-cleanup',
    'unexpected-rdp-exit',
    'cleanup-failure-after-transport-loss',
    'unexpected-browser-exit',
  ])
  assert.equal(vectors.results.length, 19)
  assert.ok(vectors.results.every((row) => row.actual === row.expected))
  assert.deepEqual(vectors.trace, ['fulfilled-payload:get'])
  assert.deepEqual(unhandled, [
    { name: 'Error', message: 'Authored proxy trap' },
    'owned-rejection',
  ])
  assert.equal(facts.length, 2)
  console.log(
    JSON.stringify({
      rows,
      vectors: vectors.results,
      trace: vectors.trace,
      unhandled,
      navigations: facts.length,
      paused: pauses.length,
      failures,
      closed: true,
    })
  )
}
