const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createRequire } = require('node:module')
const [project, output, family = 'default'] = process.argv.slice(2)
assert(
  project &&
    ['default', 'proxy-disabled', 'proxify', 'proxify-disabled'].includes(
      family
    )
)
const req = createRequire(path.join(project, 'package.json'))
const next = path.dirname(req.resolve('next/package.json'))
req(next + '/dist/server/node-environment-baseline')
const runner = req(next + '/dist/experimental/testing/runner')
const vitest = req(next + '/dist/experimental/testing/vitest')
const input = path.join(__dirname, 'fixtures/chai-callable-name', family)
const body = fs.readFileSync(path.join(input, 'runtime.test.mjs.txt'), 'utf8')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-chai-name-'))
const file = runner.initializeTestFile({
  fileId: 'actual-chai-name',
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
          '\nreturn ' +
          (family.startsWith('proxify')
            ? '{ base: () => base, alias: () => alias, accessorReads: () => reads }'
            : '{ names, accessor: () => accessor, getter: () => getter, setter: () => setter, inputReads: () => inputNameReads, accessorReads: () => reads }') +
          ''
      )(vitest, assert)
    })
    const result = await file.run({
      runId: 'actual-chai-name-run',
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
    assert.equal(cases.length, family.startsWith('proxify') ? 2 : 3)
    assert.equal(new Set(cases.map((value) => value.name)).size, cases.length)
    assert(
      cases.every(
        (value) => value.state === 'passed' && value.errors.length === 0
      )
    )
    const before = family.startsWith('proxify') ? undefined : captured.names()
    await file.dispose()
    if (family.startsWith('proxify')) {
      for (const callable of [captured.base(), captured.alias()]) {
        assert.equal(callable.name, '')
        assert.equal(Object.hasOwn(callable, 'name'), false)
      }
    } else {
      assert.deepEqual(captured.names(), before)
      const descriptor = Object.getOwnPropertyDescriptor(
        captured.accessor(),
        'name'
      )
      assert.equal(descriptor.get, captured.getter())
      assert.equal(descriptor.set, captured.setter())
      assert.equal(captured.inputReads(), 0)
    }
    assert.equal(captured.accessorReads(), 2)
    const facts = {
      cases: cases.length,
      behaviorAssertions: true,
      actualFileDisposalJoined: true,
      actualNameReadsAfterDispose: true,
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
