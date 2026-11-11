import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

// Explicit resource matrix: each invocation requires the selected SDK's actual
// paired Chromium or Firefox installation. The general unit suite stays pure.
const filename = fileURLToPath(import.meta.url)
const repository = join(dirname(filename), '../../..')
const projectDir = resolve(process.argv[2] ?? repository)
const requestedEngine = process.argv[3]
assert(['chromium', 'firefox'].includes(requestedEngine))
if (process.argv[4] !== '--child') {
  const auditDir = await mkdtemp(join(tmpdir(), 'next-frame-brand-owner-'))
  try {
    const result = await runOwnedNode(
      [filename, projectDir, requestedEngine, '--child'],
      {
        cwd: repository,
        env: process.env,
        auditDir: join(auditDir, 'processes'),
        timeoutMs: 60000,
      }
    )
    assertOwnedNodeCompleted(result, 'Owned Browser child Frame')
    assert.equal(result.status, 0, result.stdout + result.stderr)
    process.stdout.write(result.stdout)
  } finally {
    await rm(auditDir, { recursive: true, force: true })
  }
} else {
  await verify()
}

async function verify() {
  const require = createRequire(join(repository, 'package.json'))
  const requireFromProject = createRequire(join(projectDir, 'package.json'))
  const version = requireFromProject('playwright/package.json').version
  const {
    createClientServer,
  } = require('next/dist/experimental/testing/client/server')
  const {
    createClientEngineBrand,
  } = require('next/dist/experimental/testing/client/engine-brand')
  const {
    createBrowserHost,
    connectBrowserHost,
  } = require('next/dist/experimental/testing/browser/host')
  const authored =
    "globalThis.firstAuthoredBrand=globalThis[Symbol.for('next.test.engine-promise-brand.v1')](Promise.resolve(17));globalThis.actualRealm={topIsSelf:window.top===window.self,parentIsSelf:window.parent===window.self,parentIsTop:window.parent===window.top};"
  const hash = (text) => createHash('sha256').update(text).digest('hex')
  const root = await mkdtemp(join(tmpdir(), 'next-test-child-brand-')),
    output = join(root, 'output'),
    sourceFile = join(root, 'contract.case.mjs'),
    rows = []
  try {
    await mkdir(join(output, 'static'), { recursive: true })
    await writeFile(sourceFile, authored)
    await writeFile(join(output, 'static/entry.js'), authored)
    const artifact = {
      version: 2,
      kind: 'browser',
      entryId: 'entry',
      revision: 'revision',
      sourceHash: hash(authored),
      profile: {
        id: 'client',
        environment: 'browser',
        mode: 'development',
        browserClient: true,
      },
      rootDir: output,
      entryPath: 'descriptor.json',
      files: ['static/entry.js'],
      diagnostics: [],
      client: {
        version: 1,
        asyncScope: 'promise-continuations-v1',
        sourceFile,
        scripts: ['static/entry.js'],
        styles: [],
        outputs: [{ path: 'static/entry.js', sha256: hash(authored) }],
      },
    }
    const configuration = {
      version: 1,
      runId: 'run',
      entryId: 'entry',
      revision: 'revision',
      ownerToken: 'child-brand',
      filePath: sourceFile,
      sourceHash: artifact.sourceHash,
      projectDir: root,
      snapshotUpdateMode: 'none',
      testTimeout: 1000,
      hookTimeout: 1000,
    }
    for (const engine of [requestedEngine]) {
      let host, remote, context, server, brand, removeObserver
      let holdClose = false,
        beforeInstallReplay = 0,
        afterFactReplay = 0
      const delayedClose = [],
        savedClose = [],
        delayedInstall = []
      const closedPackets = [],
        targetClosedPackets = [],
        errors = [],
        controller = new AbortController(),
        facts = []
      try {
        server = await createClientServer({
          artifact,
          configuration,
          testFrame: true,
          onMessage() {},
          onFailure(error) {
            errors.push(String(error))
          },
        })
        host = await createBrowserHost({
          projectDir,
          engine,
          ownedFrames: true,
          signal: controller.signal,
        })
        remote = await connectBrowserHost({
          projectDir,
          engine,
          wsEndpoint: host.wsEndpoint,
        })
        context = await remote.newContext({
          viewport: { width: 640, height: 480 },
        })
        const page = await context.newPage()
        await page.goto(server.hostURL)
        const frame = await (
          await page.locator('iframe').elementHandle()
        ).contentFrame()
        assert(frame)
        const owner = host.frameOwner(context, page, frame)
        if (engine === 'firefox')
          removeObserver = owner.rdp.onPacket((packet) => {
            if (packet.type === 'next-test-native-hook-window-closed')
              closedPackets.push(packet)
            if (packet.type === 'target-destroyed-form')
              targetClosedPackets.push(packet)
            return false
          })
        let pageOwner =
          engine === 'firefox'
            ? host.firefoxPageOwner(context, page)
            : undefined
        function flushDelayed() {
          if (!delayedClose.length || !delayedInstall.length) return
          const closes = delayedClose.splice(0),
            installs = delayedInstall.splice(0)
          beforeInstallReplay++
          for (const { record, packet } of closes)
            if (record.active) record.listener(packet)
          holdClose = false
          for (const { listener, packet } of installs) listener(packet)
        }
        if (pageOwner) {
          const actual = pageOwner
          pageOwner = {
            ...actual,
            rdp: {
              ...actual.rdp,
              onPacket(listener) {
                const record = { listener, active: true }
                const remove = actual.rdp.onPacket((packet) => {
                  if (
                    holdClose &&
                    packet.type === 'next-test-native-hook-window-closed'
                  ) {
                    const entry = { record, packet }
                    savedClose.push(entry)
                    delayedClose.push(entry)
                    queueMicrotask(flushDelayed)
                    return false
                  }
                  return listener(packet)
                })
                return () => {
                  record.active = false
                  remove()
                }
              },
            },
            async openNativeSession(signal) {
              const session = await actual.openNativeSession(signal)
              return {
                ...session,
                onPacket(listener) {
                  return session.onPacket((packet) => {
                    let installed = false
                    if (
                      packet.type === 'evaluationResult' &&
                      typeof packet.result === 'string'
                    ) {
                      try {
                        installed =
                          JSON.parse(packet.result)?.installed === true
                      } catch {}
                    }
                    if (holdClose && installed) {
                      delayedInstall.push({ listener, packet })
                      queueMicrotask(flushDelayed)
                      return false
                    }
                    return listener(packet)
                  })
                },
              }
            },
          }
        }
        brand = createClientEngineBrand({
          context,
          page,
          frameOwner: owner,
          url: server.url,
          signal: controller.signal,
          onFailure: (error) => errors.push(String(error)),
          ...(pageOwner ? { firefoxOwner: pageOwner } : {}),
        })
        await brand.start()
        assert.equal(
          await page.evaluate(
            () =>
              typeof globalThis[Symbol.for('next.test.engine-promise-brand.v1')]
          ),
          'undefined'
        )
        await frame.goto(server.url, { waitUntil: 'load' })
        assert.equal(
          await frame.evaluate(() => globalThis.firstAuthoredBrand),
          1
        )
        facts.push(brand.fact())
        assert.deepEqual(await frame.evaluate(() => globalThis.actualRealm), {
          topIsSelf: false,
          parentIsSelf: false,
          parentIsTop: true,
        })
        const vectors = await frame.evaluate(() => {
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
        await frame.waitForFunction(() =>
          window.__probeUnhandled.includes('owned-rejection')
        )
        assert.deepEqual(
          await frame.evaluate(() =>
            window.__probeUnhandled.map((value) =>
              typeof value === 'string'
                ? value
                : { name: value.name, message: value.message }
            )
          ),
          [{ name: 'Error', message: 'Authored proxy trap' }, 'owned-rejection']
        )
        const transitions = await frame.evaluate(async () => {
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
        const ordinary = await frame.evaluate(checkOrder, false),
          classified = await frame.evaluate(checkOrder, true)
        assert.deepEqual(classified, ordinary)
        assert.deepEqual(
          ordinary,
          Array.from({ length: 64 }, () => ({
            actual: 1,
            trace: ['before', 'after', 'promise-job', 'microtask', 'awaited'],
          }))
        )
        assert.equal(
          await frame.evaluate(() => {
            debugger
            return 'unknown-resumed'
          }),
          'unknown-resumed'
        )
        await frame.evaluate(() => {
          const button = document.createElement('button')
          button.textContent = 'native child input'
          button.addEventListener('click', (event) => {
            window.childInput = {
              trusted: event.isTrusted,
              brand: globalThis[
                Symbol.for('next.test.engine-promise-brand.v1')
              ](Promise.resolve(1)),
            }
          })
          document.body.append(button)
        })
        await frame.getByRole('button', { name: 'native child input' }).click()
        assert.deepEqual(await frame.evaluate(() => window.childInput), {
          trusted: true,
          brand: 1,
        })
        const beforeForeign = brand.fact()
        await page.evaluate(() => {
          const foreign = document.createElement('iframe')
          foreign.id = 'foreign-control'
          document.body.append(foreign)
        })
        const foreign = await (
          await page.locator('#foreign-control').elementHandle()
        ).contentFrame()
        assert(foreign)
        await foreign.evaluate(() => {
          globalThis.foreignActual = Promise.resolve(1)
        })
        await page
          .locator('#foreign-control')
          .evaluate((element) => element.remove())
        assert.deepEqual(brand.fact(), beforeForeign)
        assert.equal(
          await frame.evaluate(() =>
            globalThis[Symbol.for('next.test.engine-promise-brand.v1')](
              Promise.resolve(1)
            )
          ),
          1
        )
        await frame.evaluate(() => {
          window.parent.__heldOldClassifier =
            globalThis[Symbol.for('next.test.engine-promise-brand.v1')]
        })
        if (engine === 'firefox') holdClose = true
        await frame.goto(server.url, { waitUntil: 'load' })
        assert.equal(
          await frame.evaluate(() => globalThis.firstAuthoredBrand),
          1
        )
        facts.push(brand.fact())
        const stale = await page.evaluate(() => {
          try {
            return { value: window.__heldOldClassifier(Promise.resolve(1)) }
          } catch (error) {
            return { name: error.name, message: error.message }
          }
        })
        assert.deepEqual(stale, {
          name: 'Error',
          message: 'Browser Mode engine Promise decision is unavailable.',
        })
        assert.equal(
          await frame.evaluate(() =>
            globalThis[Symbol.for('next.test.engine-promise-brand.v1')](
              Promise.resolve(1)
            )
          ),
          1
        )
        if (engine === 'firefox') {
          assert.equal(beforeInstallReplay, 1)
          const fresh = brand.fact()
          for (const { record, packet } of savedClose)
            if (record.active) {
              record.listener(packet)
              afterFactReplay++
            }
          assert(afterFactReplay > 0)
          assert.deepEqual(brand.fact(), fresh)
          assert.equal(
            await frame.evaluate(() =>
              globalThis[Symbol.for('next.test.engine-promise-brand.v1')](
                Promise.resolve(1)
              )
            ),
            1
          )
        }
        assert.notEqual(
          facts[0].executionContextId,
          facts[1].executionContextId
        )
        assert.notEqual(facts[0].scriptId, facts[1].scriptId)
        assert.equal(facts[0].frameId, facts[1].frameId)
        assert.deepEqual(errors, [])
        controller.abort(new Error('actual child execution cancelled'))
        const closing = brand.close()
        assert.equal(brand.close(), closing)
        await Promise.all([
          closing,
          page
            .locator('iframe')
            .first()
            .evaluate((element) => element.remove()),
        ])
        assert(frame.isDetached())
        assert.throws(() => owner.assertCurrent())
        assert.equal(
          await page.evaluate(() => {
            debugger
            return 'retained host alive'
          }),
          'retained host alive'
        )
        await context.close()
        context = undefined
        await brand.afterOwnersClosed()
        brand = undefined
        rows.push({
          engine,
          sdk: version,
          frames: facts.map(({ scriptId, executionContextId, frameId }) => ({
            scriptId,
            executionContextId,
            frameId,
          })),
          firstAuthoredNative: true,
          nativeVectors: 19,
          nativeAwaitTimerTransitions: 128,
          nativeJobOrderTransitions: 64,
          unhandledPreserved: true,
          nativeInput: true,
          twoNavigations: true,
          windowClosedEvents: closedPackets.length,
          targetClosedEvents: targetClosedPackets.length,
          foreignContextRetainsSelectedFacts: true,
          staleOldClassifierCannotBorrowNewRealm: true,
          staleCloseBeforeInstallReturn: beforeInstallReplay,
          staleCloseAfterNewFact: afterFactReplay,
          concurrentExplicitDisposeAndWindowClose: true,
          abortCleanup: true,
          errors,
        })
      } catch (error) {
        console.error(
          JSON.stringify({ engine, failures: errors, message: String(error) })
        )
        throw error
      } finally {
        const cleanup = []
        for (const close of [
          () => brand?.close(),
          () => context?.close(),
          () => brand?.afterOwnersClosed(),
          () => removeObserver?.(),
          () => remote?.close(),
          () => host?.dispose(),
          () => server?.dispose(),
        ]) {
          try {
            await close()
          } catch (error) {
            cleanup.push(String(error))
          }
        }
        assert.deepEqual(cleanup, [])
      }
    }
    const result = { sdk: version, rows, closed: true }
    console.log(JSON.stringify(result))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
