const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createHash } = require('node:crypto')
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
const model = JSON.parse(fs.readFileSync(path.join(input, 'reference.json')))
const body = fs.readFileSync(path.join(input, model.source), 'utf8')
assert.equal(createHash('sha256').update(body).digest('hex'), model.bodySHA256)
const header = body.slice(0, body.indexOf('\n') + 1)
assert(header.startsWith('import {') && header.endsWith("from 'vitest'\n"))
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-chai-name-component-'))
const file = runner.initializeTestFile({
  fileId: 'actual-chai-name',
  filePath: path.join(dir, 'actual.test.mjs'),
})
const rows = [],
  cases = []
async function main() {
  try {
    let captured
    await file.collect(async () => {
      captured = new Function(
        'vitest',
        'console',
        '"use strict";const{expect,test,chai,afterAll}=vitest;\n' +
          body.slice(header.length) +
          (family.startsWith('proxify')
            ? '\nreturn { base: () => base, alias: () => alias, accessorReads: () => reads }'
            : '\nreturn { names, accessor: () => accessor, getter: () => getter, setter: () => setter, inputReads: () => inputNameReads, accessorReads: () => reads }')
      )(vitest, {
        log(content) {
          assert(content.startsWith('POLL_OWNERSHIP_ROW '))
          rows.push(JSON.parse(content.slice(19)))
        },
      })
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
    await file.dispose()
    assert.deepEqual(rows, model.rows)
    assert.deepEqual(
      cases.map(({ name, state }) => ({ name, state })),
      model.caseCallbacks ?? model.cases
    )
    assert(cases.every((v) => v.state === 'passed' && v.errors.length === 0))
    if (family.startsWith('proxify')) {
      for (const callable of [captured.base(), captured.alias()]) {
        assert.equal(callable.name, '')
        assert.equal(Object.hasOwn(callable, 'name'), false)
      }
    } else {
      assert.deepEqual(captured.names(), model.rows.at(-1).names)
      const descriptor = Object.getOwnPropertyDescriptor(
        captured.accessor(),
        'name'
      )
      assert.equal(descriptor.get, captured.getter())
      assert.equal(descriptor.set, captured.setter())
      assert.equal(captured.inputReads(), 0)
    }
    assert.equal(captured.accessorReads(), 2)
    if (output)
      fs.writeFileSync(
        output,
        JSON.stringify(
          {
            rows,
            cases,
            actualFileDisposalJoined: true,
            actualNameReadsAfterDispose: true,
          },
          null,
          2
        ) + '\n'
      )
    process.stdout.write(
      JSON.stringify({
        cases: cases.length,
        completeGenuineRows: rows.length,
        actualFileDisposalJoined: true,
        actualNameReadsAfterDispose: true,
      }) + '\n'
    )
  } finally {
    await file.dispose()
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
