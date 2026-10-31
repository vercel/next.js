const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createHash } = require('node:crypto')
const { createRequire } = require('node:module')
const [project, output, family = 'default'] = process.argv.slice(2)
assert(project && ['default', 'disabled'].includes(family))
const req = createRequire(path.join(project, 'package.json'))
const next = path.dirname(req.resolve('next/package.json'))
req(next + '/dist/server/node-environment-baseline')
const runner = req(next + '/dist/experimental/testing/runner')
const vitest = req(next + '/dist/experimental/testing/vitest')
const input = path.join(__dirname, 'fixtures/chai-callable-intrinsic', family)
const model = JSON.parse(fs.readFileSync(path.join(input, 'reference.json')))
const body = fs.readFileSync(path.join(input, model.source), 'utf8')
assert.equal(createHash('sha256').update(body).digest('hex'), model.bodySHA256)
const header = body.slice(0, body.indexOf('\n') + 1)
assert(header.startsWith('import {') && header.endsWith("from 'vitest'\n"))
const dir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'next-chai-intrinsic-component-')
)
const file = runner.initializeTestFile({
  fileId: 'actual-chai-intrinsic',
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
          '\nreturn { held, retained, intrinsic, getter: () => getter, getterTarget: () => getterTarget, getterReads: () => getterReads, readonly: chai.Assertion.prototype.intrinsicReadonly }'
      )(vitest, {
        log(content) {
          assert(content.startsWith('POLL_OWNERSHIP_ROW '))
          rows.push(JSON.parse(content.slice(19)))
        },
      })
    })
    const result = await file.run({
      runId: 'actual-chai-intrinsic-run',
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
    assert.deepEqual(rows, model.rows)
    assert.deepEqual(
      cases.map(({ name, state }) => ({ name, state })),
      model.caseCallbacks ?? model.cases
    )
    assert(
      cases.every(
        (value) => value.state === 'passed' && value.errors.length === 0
      )
    )
    await file.dispose()
    assert.equal(captured.intrinsic, Function.prototype.toString)
    assert.equal(captured.getterReads(), 4)
    for (const [label, target] of Object.entries(captured.held)) {
      const method = captured.retained[label]
      assert.equal(method, captured.intrinsic)
      assert.equal(
        Reflect.apply(method, target, []),
        Reflect.apply(captured.intrinsic, target, [])
      )
      for (const receiver of [undefined, null, {}, 73])
        assert.throws(() => Reflect.apply(method, receiver, []), TypeError)
    }
    assert.equal(
      Object.getOwnPropertyDescriptor(captured.getterTarget(), 'toString').get,
      captured.getter()
    )
    assert.equal(
      Object.getOwnPropertyDescriptor(captured.readonly, 'toString').value,
      captured.intrinsic
    )
    assert.equal(captured.getterReads(), 4)
    const facts = {
      cases: cases.length,
      completeGenuineRows: rows.length,
      actualFileDisposalJoined: true,
      retainedIntrinsicAfterDispose: true,
      exactNativeReceiverErrorsAfterDispose: true,
      noAdditionalGetterReads: true,
    }
    if (output)
      fs.writeFileSync(
        output,
        JSON.stringify({ rows, cases, ...facts }, null, 2) + '\n'
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
