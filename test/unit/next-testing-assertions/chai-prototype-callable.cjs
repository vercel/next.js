const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createHash } = require('node:crypto')
const { createRequire } = require('node:module')
const [project, family, output] = process.argv.slice(2)
assert(
  project &&
    [
      'prototype',
      'owners',
      'dispatch',
      'identity',
      'overwrite-static',
      'overwrite-utility',
      'native-alias',
      'super-this',
      'subject',
    ].includes(family)
)
const req = createRequire(path.join(project, 'package.json'))
const next = path.dirname(req.resolve('next/package.json'))
req(next + '/dist/server/node-environment-baseline')
const runner = req(next + '/dist/experimental/testing/runner')
const vitest = req(next + '/dist/experimental/testing/vitest')
const input =
  family === 'identity'
    ? path.join(__dirname, 'fixtures/poll-takeover-descriptor/identity')
    : path.join(__dirname, 'fixtures/chai-prototype-callable', family)
const model = JSON.parse(fs.readFileSync(path.join(input, 'reference.json')))
const body = fs.readFileSync(path.join(input, model.source), 'utf8')
assert.equal(createHash('sha256').update(body).digest('hex'), model.bodySHA256)
const header = body.slice(0, body.indexOf('\n') + 1)
assert(header.startsWith('import {') && header.endsWith("from 'vitest'\n"))
const dir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'next-chai-callable-component-')
)
const file = runner.initializeTestFile({
  fileId: 'actual-chai-callable-' + family,
  filePath: path.join(dir, 'actual.test.mjs'),
})
const rows = [],
  cases = []
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
    })
    const result = await file.run({
      runId: 'actual-chai-callable-run',
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
    if (output)
      fs.writeFileSync(
        output,
        JSON.stringify(
          { family, rows, cases, actualFileDisposalJoined: true },
          null,
          2
        ) + '\n'
      )
    process.stdout.write(
      JSON.stringify({
        family,
        cases: cases.length,
        completeGenuineRows: rows.length,
        actualFileDisposalJoined: true,
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
