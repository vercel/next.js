const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createHash } = require('node:crypto')
const { createRequire } = require('node:module')
const [project, output] = process.argv.slice(2)
assert(project)
const req = createRequire(path.join(project, 'package.json'))
const next = path.dirname(req.resolve('next/package.json'))
req(next + '/dist/server/node-environment-baseline')
const runner = req(next + '/dist/experimental/testing/runner')
const vitest = req(next + '/dist/experimental/testing/vitest')
const input = path.join(__dirname, 'fixtures/poll-takeover-descriptor/effects')
const model = JSON.parse(fs.readFileSync(path.join(input, 'reference.json')))
const body = fs.readFileSync(path.join(input, model.source), 'utf8')
assert.equal(createHash('sha256').update(body).digest('hex'), model.bodySHA256)
const header = "import { expect, test, chai, afterAll } from 'vitest'\n"
assert(body.startsWith(header))
const dir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'next-callable-tag-component-')
)
const file = runner.initializeTestFile({
  fileId: 'actual-callable-tag',
  filePath: path.join(dir, 'actual.test.mjs'),
})
const TAG = '__vitest_poll_takeover__'
const rows = [],
  cases = []
let held, absent
async function main() {
  try {
    await file.collect(async () => {
      new Function(
        'vitest',
        'console',
        '"use strict";const{expect,test,chai,afterAll}=vitest;\n' +
          body.slice(header.length)
      )(vitest, {
        log(content) {
          assert(content.startsWith('POLL_OWNERSHIP_ROW '))
          rows.push(JSON.parse(content.slice(19)))
        },
      })
      file.api.test(
        'actual readonly metadata after file disposal',
        ({ expect }) => {
          function tagged() {
            return { pass: true, message: () => 'owned' }
          }
          Object.defineProperty(tagged, TAG, { value: true })
          expect.extend({
            toAfterDisposeTag: tagged,
            toAfterDisposeAbsent() {
              return { pass: true, message: () => 'owned absent' }
            },
          })
          held = vitest.chai.Assertion.prototype.toAfterDisposeTag
          absent = vitest.chai.Assertion.prototype.toAfterDisposeAbsent
        }
      )
    })
    const result = await file.run({
      runId: 'actual-callable-tag-run',
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
    await file.dispose()
    assert.deepEqual(rows, model.rows)
    assert.deepEqual(
      cases.slice(0, 3).map(({ name, state }) => ({ name, state })),
      model.cases
    )
    assert.equal(cases.length, 4)
    assert(
      cases.every(
        (value) => value.state === 'passed' && value.errors.length === 0
      )
    )
    assert.deepEqual(Object.getOwnPropertyDescriptor(held, TAG), {
      value: true,
      writable: false,
      configurable: false,
      enumerable: false,
    })
    assert.equal(Object.getOwnPropertyDescriptor(absent, TAG), undefined)
    if (output)
      fs.writeFileSync(
        output,
        JSON.stringify(
          {
            rows,
            cases,
            actualFileDisposalJoined: true,
            afterDisposeTag: Object.getOwnPropertyDescriptor(held, TAG),
          },
          null,
          2
        ) + '\n'
      )
    process.stdout.write(
      JSON.stringify({
        cases: 3,
        completeGenuineRows: 4,
        afterDisposeControl: 1,
        realDescriptorsAndGetterIdentity: true,
        noAdditionalGetterCalls: true,
        retainedMetadataAfterDispose: true,
        invocationCodeUnchanged: true,
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
