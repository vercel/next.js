const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  { createRequire } = require('node:module')
const [project, mode = 'poll-ownership', output] = process.argv.slice(2)
assert(project)
assert(['poll-ownership', 'poll-hook-admission'].includes(mode))
const hook = mode === 'poll-hook-admission',
  req = createRequire(path.join(project, 'package.json')),
  packageRoot = path.dirname(req.resolve('next/package.json')),
  model = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, 'fixtures/poll-ownership', mode + '.json')
    )
  )
req(path.join(packageRoot, 'dist/server/node-environment-baseline'))
const runner = req(packageRoot + '/dist/experimental/testing/runner'),
  vitest = req(packageRoot + '/dist/experimental/testing/vitest'),
  primitives = req(packageRoot + '/dist/compiled/next-test-primitives'),
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-poll-owned-component-')),
  file = runner.initializeTestFile({
    fileId: 'actual-owned-poll-file',
    filePath: path.join(dir, 'actual.test.mjs'),
  }),
  rows = [],
  cases = []
const authored = model.body,
  header = hook
    ? "import{expect,test,beforeAll,beforeEach,afterEach,afterAll}from'vitest'\n"
    : "import{expect,test}from'vitest'\n"
assert(authored.startsWith(header))
const body =
    '"use strict";const{expect,test,beforeAll,beforeEach,afterEach,afterAll}=vitest;\n' +
    authored.slice(header.length),
  capture = {
    log(content) {
      assert(content.startsWith('EXPECT_STATE_ROW '))
      rows.push(JSON.parse(content.slice(17)))
    },
  }
async function main() {
  let controls = 0
  try {
    await file.collect(async () => {
      new Function('vitest', 'console', body)(vitest, capture)
      if (!hook) {
        file.api.test(
          'actual pending start is owned once',
          async ({ expect }) => {
            let release, ready
            const started = new Promise((r) => (ready = r)),
              held = new Promise((r) => (release = r))
            let starts = 0,
              callbacks = 0
            const initial = expect.poll(
              () => {
                callbacks++
                return 1
              },
              { timeout: 100, interval: 1 }
            )
            primitives.chai.util.flag(
              initial,
              '_poll.onStart',
              async ({ assertion }) => {
                starts++
                assert.equal(
                  typeof primitives.chai.util.flag(assertion, '_poll.fn'),
                  'function'
                )
                assert.equal(
                  primitives.chai.util.flag(assertion, '_poll.timeout'),
                  100
                )
                assert.equal(
                  primitives.chai.util.flag(assertion, '_poll.interval'),
                  1
                )
                ready()
                await held
              }
            )
            const matched = initial.toBe(1)
            assert.equal(starts, 0)
            const work = matched.then(() => {})
            try {
              await started
              assert.equal(starts, 1)
              assert.equal(callbacks, 0)
            } finally {
              release()
            }
            await work
            await matched
            assert.equal(starts, 1)
            assert.equal(callbacks, 1)
            controls++
          }
        )
        for (const kind of ['error', 'undefined'])
          file.api.test(
            'actual start rejection ' + kind,
            async ({ expect }) => {
              const reason =
                kind === 'error'
                  ? new Error('owned start rejection')
                  : undefined
              let callbacks = 0,
                observed = false,
                value
              const initial = expect.poll(
                () => {
                  callbacks++
                  return 1
                },
                { timeout: 100, interval: 1 }
              )
              primitives.chai.util.flag(initial, '_poll.onStart', () =>
                Promise.reject(reason)
              )
              try {
                await initial.toBe(1)
              } catch (error) {
                observed = true
                value = error
              }
              assert(observed)
              assert.equal(value, reason)
              assert.equal(callbacks, 0)
              controls++
            }
          )
        file.api.test(
          'actual bind getter receiver once',
          async ({ expect }) => {
            let gets = 0,
              calls = 0,
              callbackCalls = 0
            const nativeBind = Function.prototype.bind
            const callback = function () {
              callbackCalls++
              assert.equal(typeof this.assert, 'function')
              return 1
            }
            Object.defineProperty(callback, 'bind', {
              get() {
                gets++
                assert.equal(this, callback)
                return function (receiver) {
                  calls++
                  assert.equal(this, callback)
                  return Reflect.apply(nativeBind, this, [receiver])
                }
              },
            })
            const initial = expect.poll(callback, { timeout: 100, interval: 1 })
            assert.equal(gets, 1)
            assert.equal(calls, 1)
            assert.equal(callbackCalls, 0)
            const matched = initial.toBe(1)
            assert.equal(callbackCalls, 0)
            await matched
            assert.equal(callbackCalls, 1)
            assert.equal(gets, 1)
            assert.equal(calls, 1)
            controls++
          }
        )
        file.api.test(
          'bind failure preserves original identity',
          ({ expect }) => {
            const reason = { owned: 'bind failure' }
            const callback = () => 1
            Object.defineProperty(callback, 'bind', {
              get() {
                throw reason
              },
            })
            let observed = false,
              value
            try {
              expect.poll(callback)
            } catch (error) {
              observed = true
              value = error
            }
            assert(observed)
            assert.equal(value, reason)
            controls++
          }
        )
        file.api.test(
          'independent actual starts retain reused error',
          async ({ expect }) => {
            const reason = new Error('same actual reason')
            let starts = 0,
              callbacks = 0
            const initial = expect.poll(
              () => {
                callbacks++
                return 1
              },
              { timeout: 100, interval: 1 }
            )
            primitives.chai.util.flag(initial, '_poll.onStart', () => {
              starts++
              throw reason
            })
            const first = initial.toBe(1),
              second = initial.toBe(1)
            assert.notEqual(first, second)
            const seen = await Promise.all([
              first.catch((e) => e),
              second.catch((e) => e),
            ])
            assert.equal(starts, 2)
            assert.equal(callbacks, 0)
            assert.equal(seen[0], reason)
            assert.equal(seen[1], reason)
            controls++
          }
        )
        file.api.test(
          'predicate rejection stays an actual rejection',
          async ({ expect }) => {
            const reason = new RangeError('owned predicate failure')
            let callbacks = 0,
              seen = false,
              value
            const matched = expect
              .poll(
                () => {
                  callbacks++
                  throw reason
                },
                { timeout: 0, interval: 0 }
              )
              .toBe(1)
            try {
              await matched
            } catch (error) {
              seen = true
              value = error
            }
            assert(seen)
            assert.equal(value, reason)
            assert.equal(callbacks, 1)
            controls++
          }
        )
      }
    })
    const result = await file.run({
      runId: 'actual-poll-owned-run',
      signal: new AbortController().signal,
      onCaseResult(_task, value) {
        cases.push({
          name: value.name,
          status: value.status,
          errors: value.errors.map((e) => ({
            phase: e.phase,
            name: e.error?.name ?? null,
            message: e.error?.message ?? String(e.error),
            stack: e.error?.stack ?? null,
          })),
        })
      },
    })
    await file.dispose()
    const reference = model.rows
    if (hook) {
      assert.deepEqual(rows, reference)
      assert.equal(cases.length, 1)
      assert.equal(cases[0].status, 'passed')
    } else {
      assert.deepEqual(rows, reference)
      assert.equal(controls, 7)
      assert.equal(cases.length, 10)
      assert.equal(cases.filter((c) => c.status === 'passed').length, 9)
      assert.equal(cases.filter((c) => c.status === 'failed').length, 1)
    }
    const receipt = {
      profile: mode,
      actualFile: true,
      noFabricatedCaseResults: true,
      originalAuthoredBodyHeldApartFromImportBinding: true,
      rows,
      cases,
      controls,
      interrupted: result.interrupted,
      scratchModuleOverlayOnly: false,
      physicalDisposalJoined: true,
    }
    if (output)
      fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n')
    console.log(
      JSON.stringify({
        mode,
        cases: cases.length,
        controls,
        passed: cases.filter((c) => c.status === 'passed').length,
        failed: cases.filter((c) => c.status === 'failed').length,
        exactGenuineAuthorRows: true,
      })
    )
  } finally {
    await file.dispose()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
