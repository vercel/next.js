const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createRequire } = require('node:module')
const [project, output] = process.argv.slice(2)
assert(project)
const req = createRequire(path.join(project, 'package.json'))
const next = path.dirname(req.resolve('next/package.json'))
req(next + '/dist/server/node-environment-baseline')
const { initializeTestFile } = req(next + '/dist/experimental/testing/runner')
const { chai, expect, test } = req(next + '/dist/experimental/testing/vitest')
const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), 'next-chai-async-file-')
)
const held = []
let callbacks = 0
const files = []
const closed = /scope|closed|finished|active|operation|disposed/i
;(async () => {
  try {
    const file = initializeTestFile({
      fileId: 'chai-async-origin',
      filePath: path.join(directory, 'origin.test.mjs'),
    })
    files.push(file)
    await file.collect(async () => {
      chai.Assertion.addMethod(
        'nextAsyncReceiverGuard',
        async function (expected) {
          callbacks++
          await Promise.resolve()
          const subject = chai.util.flag(this, 'object')
          this.assert(
            subject === expected,
            'expected #{this} to async equal #{exp}',
            'expected #{this} not to async equal #{exp}',
            expected,
            subject
          )
          return this
        }
      )
      for (const useProxy of [true, false])
        for (const kind of ['raw', 'global', 'local', 'constructor'])
          for (const proxified of [false, true]) {
            test(`${useProxy}-${kind}-${proxified}`, async (context) => {
              const previous = chai.config.useProxy
              chai.config.useProxy = useProxy
              try {
                const input =
                  kind === 'raw'
                    ? chai.expect(1)
                    : kind === 'global'
                      ? expect(1)
                      : kind === 'local'
                        ? context.expect(1)
                        : new chai.Assertion(1)
                const assertion = proxified ? chai.util.proxify(input) : input
                const value = await assertion.nextAsyncReceiverGuard(1)
                assert.equal(value, assertion)
                held.push({ value, method: value.nextAsyncReceiverGuard })
              } finally {
                chai.config.useProxy = previous
              }
            })
          }
    })
    const result = await file.run({
      runId: 'chai-async-origin-run',
      signal: new AbortController().signal,
    })
    assert.equal(result.interrupted, false)
    assert.deepEqual(result.errors, [])
    assert.deepEqual(
      result.cases.map((x) => x.status),
      Array(16).fill('passed')
    )
    assert.equal(held.length, 16)
    assert.equal(callbacks, 16)
    await file.dispose()
    for (const entry of held) {
      assert.throws(() => entry.value.nextAsyncReceiverGuard, closed)
      assert.throws(() => Reflect.apply(entry.method, entry.value, [1]), closed)
    }
    const later = initializeTestFile({
      fileId: 'chai-async-foreign',
      filePath: path.join(directory, 'foreign.test.mjs'),
    })
    files.push(later)
    await later.collect(async () => {
      test('foreign-file', () => {
        for (const entry of held)
          assert.throws(
            () => chai.util.proxify(entry.value).nextAsyncReceiverGuard(1),
            closed
          )
      })
    })
    const foreign = await later.run({
      runId: 'chai-async-foreign-run',
      signal: new AbortController().signal,
    })
    assert.equal(foreign.interrupted, false)
    assert.deepEqual(foreign.errors, [])
    assert.deepEqual(
      foreign.cases.map((x) => x.status),
      ['passed']
    )
    assert.equal(callbacks, 16)
    await later.dispose()
    const facts = {
      cases: 17,
      sameAsyncReceiverIdentities: 16,
      latePropertyGuards: 16,
      lateInvocationGuards: 16,
      foreignGuards: 16,
      callbacks,
      actualFileDisposalJoined: true,
    }
    if (output) fs.writeFileSync(output, JSON.stringify(facts, null, 2) + '\n')
    console.log(JSON.stringify(facts))
  } finally {
    for (const file of files) await file.dispose()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
