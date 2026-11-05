const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createRequire } = require('node:module')
const [project, output, family = 'default'] = process.argv.slice(2)
assert(
  project &&
    ['default', 'disabled', 'forwarding', 'forwarding-disabled'].includes(
      family
    )
)
const req = createRequire(path.join(project, 'package.json'))
const next = path.dirname(req.resolve('next/package.json'))
req(next + '/dist/server/node-environment-baseline')
const runner = req(next + '/dist/experimental/testing/runner')
const vitest = req(next + '/dist/experimental/testing/vitest')
const input = path.join(__dirname, 'fixtures/chai-callable-data', family)
const body = fs.readFileSync(path.join(input, 'runtime.test.mjs.txt'), 'utf8')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-chai-data-'))
const file = runner.initializeTestFile({
  fileId: 'actual-chai-data',
  filePath: path.join(dir, 'actual.test.mjs'),
})
const cases = []
async function main() {
  try {
    let captured
    await file.collect(async () => {
      captured = new Function(
        'vitest',
        'assert',
        '"use strict";const{expect,test,chai,afterAll}=vitest;\n' +
          body.split('\n').slice(2).join('\n') +
          '\nreturn { host: () => host, payload, marker, callerError, foreign, retained, aliasRetained, directAlias: () => directAlias, originalInput: () => originalInput, neverGetter, neverReads: () => neverReads, payloadReads: () => payloadReads }'
      )(vitest, assert)
    })
    const result = await file.run({
      runId: 'actual-chai-data-run',
      signal: new AbortController().signal,
      onCaseResult(_task, value) {
        cases.push({
          name: value.name,
          state: value.status,
          errors: value.errors,
        })
      },
    })
    assert.equal(result.interrupted, false)
    assert.deepEqual(result.errors, [])
    assert.equal(cases.length, family.startsWith('forwarding') ? 3 : 2)
    assert.equal(new Set(cases.map((value) => value.name)).size, cases.length)
    assert(
      cases.every(
        (value) => value.state === 'passed' && value.errors.length === 0
      )
    )
    const before = Object.getOwnPropertyDescriptors(captured.host())
    await file.dispose()
    const after = Object.getOwnPropertyDescriptors(captured.host())
    assert.deepEqual(Reflect.ownKeys(after), Reflect.ownKeys(before))
    for (const key of Reflect.ownKeys(before))
      for (const part of Reflect.ownKeys(before[key]))
        assert.equal(after[key][part], before[key][part])
    assert.equal(after.neverField.get, captured.neverGetter)
    assert.equal(Object.keys(captured.retained).length, 4)
    for (const fn of Object.values(captured.retained)) {
      assert.equal(fn, captured.payload)
      assert.equal(
        Reflect.apply(fn, captured.foreign, ['after-dispose']),
        captured.marker
      )
      assert.throws(
        () => Reflect.apply(fn, undefined, ['throw']),
        (error) => error === captured.callerError
      )
    }
    const outcome = (fn) => {
      try {
        Reflect.apply(fn, captured.originalInput(), ['after-dispose'])
        return { ok: true }
      } catch (error) {
        return { ok: false, name: error.name, message: error.message }
      }
    }
    const direct = outcome(captured.directAlias())
    assert.equal(direct.ok, false)
    assert.equal(Object.keys(captured.aliasRetained).length, 4)
    for (const fn of Object.values(captured.aliasRetained)) {
      assert.equal(fn, captured.directAlias())
      assert.deepEqual(outcome(fn), direct)
    }
    for (const key of [
      'fixedAlias',
      'configurableAlias',
      'writableAlias',
      'mutableAlias',
    ])
      assert.deepEqual(outcome(after[key].value), direct)
    assert.equal(captured.neverReads(), 0)
    assert.equal(captured.payloadReads(), 0)
    const facts = {
      cases: cases.length,
      behaviorAssertions: true,
      actualFileDisposalJoined: true,
      retainedCallerFunctionsAfterDispose: true,
      publicAliasOwnershipAfterDispose: true,
      neverCalledMetadataGetters: true,
    }
    if (output)
      fs.writeFileSync(
        output,
        JSON.stringify({ cases, ...facts }, null, 2) + '\n'
      )
    process.stdout.write(JSON.stringify(facts) + '\n')
  } finally {
    await file.dispose()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
