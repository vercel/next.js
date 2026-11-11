const assert = require('node:assert/strict')
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os')
const { createRequire } = require('node:module'),
  { createHash } = require('node:crypto')
const [project, output, family] = process.argv.slice(2)
assert(
  project &&
    [
      'lowered-arguments',
      'lowered-array',
      'lowered-null',
      'builder-lowered',
      'test-lowered',
      'table-lowered',
    ].includes(family)
)
const req = createRequire(path.join(project, 'package.json')),
  next = path.dirname(req.resolve('next/package.json'))
req(next + '/dist/server/node-environment-baseline')
const runner = req(next + '/dist/experimental/testing/runner'),
  vitest = req(next + '/dist/experimental/testing/vitest')
const input = path.join(__dirname, 'fixtures/lowered-fixture', family),
  model = JSON.parse(fs.readFileSync(path.join(input, 'reference.json'))),
  body = fs.readFileSync(path.join(input, model.source), 'utf8')
assert.equal(createHash('sha256').update(body).digest('hex'), model.bodySHA256)
const header = body.slice(0, body.indexOf('\n') + 1)
assert(header.startsWith('import {') && header.endsWith("from 'vitest'\n"))
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-lowered-fixture-')),
  file = runner.initializeTestFile({
    fileId: 'actual-lowered-fixture',
    filePath: path.join(dir, 'actual.test.mjs'),
  }),
  rows = [],
  cases = []
;(async () => {
  try {
    let captured
    await file.collect(async () => {
      captured = new Function(
        'vitest',
        'console',
        '"use strict";const{test,afterAll}=vitest;\n' +
          body.slice(header.length) +
          '\nreturn {trace}'
      )(vitest, {
        log(content) {
          assert(content.startsWith('POLL_OWNERSHIP_ROW '))
          rows.push(JSON.parse(content.slice(19)))
        },
      })
    })
    const result = await file.run({
      runId: 'actual-lowered-fixture-run',
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
    assert(cases.every((x) => x.state === 'passed' && x.errors.length === 0))
    await file.dispose()
    assert.deepEqual(captured.trace, model.rows.at(-1).trace)
    const facts = {
      family,
      cases: cases.length,
      completeGenuineRows: rows.length,
      actualFileDisposalJoined: true,
      actualFixtureSetupAndCleanupJoined: true,
      originalLoweredFunctionsExecuted: true,
    }
    if (output)
      fs.writeFileSync(
        output,
        JSON.stringify({ rows, cases, ...facts }, null, 2) + '\n'
      )
    console.log(JSON.stringify(facts))
  } finally {
    await file.dispose()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
