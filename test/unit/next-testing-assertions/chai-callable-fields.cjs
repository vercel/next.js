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
const input = path.join(__dirname, 'fixtures/chai-callable-fields', family)
const model = JSON.parse(fs.readFileSync(path.join(input, 'reference.json')))
const body = fs.readFileSync(path.join(input, model.source), 'utf8')
assert.equal(createHash('sha256').update(body).digest('hex'), model.bodySHA256)
const header = body.slice(0, body.indexOf('\n') + 1)
assert(header.startsWith('import {') && header.endsWith("from 'vitest'\n"))
const dir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'next-chai-fields-component-')
)
const file = runner.initializeTestFile({
  fileId: 'actual-chai-fields',
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
          '\nreturn { authored: () => authored, getter: () => getter, setter: () => setter, marker, field, reads: () => reads, writes: () => writes }'
      )(vitest, {
        log(content) {
          assert(content.startsWith('POLL_OWNERSHIP_ROW '))
          rows.push(JSON.parse(content.slice(19)))
        },
      })
    })
    const result = await file.run({
      runId: 'actual-chai-fields-run',
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
    const before = Object.getOwnPropertyDescriptors(captured.authored())
    await file.dispose()
    const after = Object.getOwnPropertyDescriptors(captured.authored())
    assert.deepEqual(
      Reflect.ownKeys(after).map(String),
      model.rows.at(-1).enumeration.ownKeys.value
    )
    for (const key of Reflect.ownKeys(before)) {
      assert.deepEqual(
        Reflect.ownKeys(after[key]),
        Reflect.ownKeys(before[key])
      )
      for (const part of Reflect.ownKeys(before[key]))
        assert.equal(after[key][part], before[key][part])
    }
    assert.equal(after.authoredReadonly.value, captured.marker)
    assert.equal(after.authoredReadonly.writable, false)
    assert.equal(after.authoredReadonly.configurable, false)
    assert.equal(after.authoredAccessor.get, captured.getter())
    assert.equal(after.authoredAccessor.set, captured.setter())
    assert.equal(after[captured.field].value, 73)
    assert.deepEqual(
      Object.keys(captured.authored()),
      model.rows.at(-1).enumeration.enumerableKeys.value
    )
    assert.equal(
      Object.getOwnPropertyDescriptor(
        captured.authored(),
        'absentCallableField'
      ),
      undefined
    )
    assert.equal(captured.reads(), 0)
    assert.equal(captured.writes(), 0)
    const facts = {
      cases: cases.length,
      completeGenuineRows: rows.length,
      actualFileDisposalJoined: true,
      actualDescriptorIdentityAfterDispose: true,
      noGetterReads: true,
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
