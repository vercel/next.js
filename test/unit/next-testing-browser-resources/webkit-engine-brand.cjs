const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { createServer } = require('node:http')
const { mkdir, writeFile } = require('node:fs/promises')
const { resolve, join } = require('node:path')

async function main() {
  const [sourceArg, browserArg, outputArg] = process.argv.slice(2)
  assert(sourceArg && browserArg && outputArg)
  const source = resolve(sourceArg)
  const projectDir = resolve(browserArg)
  const output = resolve(outputArg)
  await mkdir(output, { recursive: true })
  const load = createRequire(join(source, 'package.json'))
  const { createBrowserHost, connectBrowserHost } = load(
    'next/dist/experimental/testing/browser/host'
  )
  const { createClientEngineBrand } = load(
    'next/dist/experimental/testing/client/engine-brand'
  )
  const errors = []
  const closed = []
  let host, browser, context, brand, server
  let outcome
  try {
    server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end('<!doctype html><title>Actual WebKit engine</title>')
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${server.address().port}/actual`
    host = await createBrowserHost({
      projectDir,
      engine: 'webkit',
      headless: true,
      signal: new AbortController().signal,
    })
    browser = await connectBrowserHost({
      projectDir,
      engine: 'webkit',
      wsEndpoint: host.wsEndpoint,
      timeout: 30000,
    })
    context = await browser.newContext()
    const page = await context.newPage()
    const owner = host.webKitPageOwner(context, page)
    brand = createClientEngineBrand({
      context,
      page,
      url,
      signal: new AbortController().signal,
      onFailure: (error) => errors.push(error),
      webKitOwner: owner,
    })
    await brand.start()
    await page.goto(url)
    const fact = brand.fact()
    assert(Number.isSafeInteger(fact.executionContextId))
    assert.equal(fact.frameId, owner.mainFrameId())
    assert(fact.source.includes('const classify = function enginePromiseBrand'))
    const result = await page.evaluate(() => {
      const classify =
        globalThis[Symbol.for('next.test.engine-promise-brand.v1')]
      let tagReads = 0
      let proxyTraps = 0
      let thenReads = 0
      const ownThen = Promise.resolve(1)
      Object.defineProperty(ownThen, 'then', {
        get() {
          thenReads++
          return Promise.prototype.then
        },
      })
      const rejected = Promise.reject(new Error('controlled rejection'))
      Promise.prototype.then.call(rejected, undefined, () => {})
      const values = {
        native: Promise.resolve(1),
        pending: new Promise(() => {}),
        subclass: new (class P extends Promise {})(() => {}),
        fakeTag: { [Symbol.toStringTag]: 'Promise' },
        fakePrototype: Object.create(Promise.prototype),
        proxy: new Proxy(Promise.resolve(1), {}),
        plain: { status: 'pending' },
        fakeGetter: Object.defineProperty({}, Symbol.toStringTag, {
          get() {
            tagReads++
            return 'Promise'
          },
        }),
        proxyTraps: new Proxy(Promise.resolve(1), {
          getPrototypeOf() {
            proxyTraps++
            return Promise.prototype
          },
          ownKeys() {
            proxyTraps++
            return []
          },
          get(target, key) {
            proxyTraps++
            return Reflect.get(target, key)
          },
        }),
        ownThen,
        rejected,
        generator: (function* () {})(),
        map: new Map(),
        set: new Set(),
        weakMap: new WeakMap(),
      }
      const rows = Object.entries(values).map(([label, value]) => ({
        label,
        decision: classify(value),
      }))
      return { rows, tagReads, proxyTraps, thenReads }
    })
    assert.deepEqual(
      result.rows.map((row) => row.decision),
      [1, 1, 2, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0]
    )
    assert.equal(result.tagReads, 0)
    assert.equal(result.proxyTraps, 0)
    assert.equal(result.thenReads, 0)
    assert.deepEqual(errors, [])
    outcome = { result, nativeContext: true, sameNativeFrame: true }
    await writeFile(
      join(output, 'result.json'),
      JSON.stringify(outcome, null, 2)
    )
  } finally {
    // Each lease closes even if an earlier assertion or cleanup fails.
    const cleanupErrors = []
    for (const [name, dispose] of [
      ['classifier', () => brand?.afterOwnersClosed()],
      ['context', () => context?.close()],
      ['connection', () => browser?.close()],
      ['host', () => host?.dispose()],
      ['server', () => server && new Promise((done) => server.close(done))],
    ]) {
      try {
        await dispose()
        closed.push(name)
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    await writeFile(
      join(output, 'cleanup.json'),
      JSON.stringify({ closed, errors: cleanupErrors.map(String) }, null, 2)
    )
    if (cleanupErrors.length)
      throw new AggregateError(cleanupErrors, 'Actual WebKit cleanup failed.')
  }
  assert.equal(closed.length, 5)
  console.log(JSON.stringify({ ...outcome, allOwnersClosed: true }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
