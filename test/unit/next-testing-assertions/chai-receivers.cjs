const assert = require('node:assert/strict')
const fs = require('node:fs'),
  path = require('node:path'),
  os = require('node:os')
const { createRequire } = require('node:module'),
  { createHash } = require('node:crypto')
const [project, output, family] = process.argv.slice(2)
assert(project && ['dispatch', 'classes', 'null'].includes(family))
const req = createRequire(path.join(project, 'package.json')),
  next = path.dirname(req.resolve('next/package.json'))
req(next + '/dist/server/node-environment-baseline')
const runner = req(next + '/dist/experimental/testing/runner'),
  vitest = req(next + '/dist/experimental/testing/vitest')
const input = path.join(__dirname, 'fixtures/chai-receivers', family),
  model = JSON.parse(fs.readFileSync(path.join(input, 'reference.json'))),
  body = fs.readFileSync(path.join(input, model.source), 'utf8')
assert.equal(createHash('sha256').update(body).digest('hex'), model.bodySHA256)
const header = body.slice(0, body.indexOf('\n') + 1)
assert.equal(header, "import { test, chai, expect } from 'vitest'\n")
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-chai-receivers-')),
  file = runner.initializeTestFile({
    fileId: 'actual-chai-receivers',
    filePath: path.join(dir, 'actual.test.mjs'),
  }),
  rows = [],
  cases = []
;(async () => {
  try {
    await file.collect(async () => {
      new Function(
        'vitest',
        'console',
        '"use strict";const{test,chai,expect}=vitest;\n' +
          body.slice(header.length)
      )(vitest, {
        log(line) {
          assert(line.startsWith('POLL_OWNERSHIP_ROW '))
          rows.push(JSON.parse(line.slice(19)))
        },
      })
    })
    const result = await file.run({
      runId: 'actual-chai-receivers-run',
      signal: new AbortController().signal,
      onCaseResult(task, value) {
        cases.push({
          name: task.name,
          state: value.status,
          errors: value.errors.map(({ error }) => ({
            name: error.name,
            message: error.message,
            hasStack: typeof error.stack === 'string',
          })),
        })
      },
    })
    assert.equal(result.interrupted, false)
    assert.deepEqual(result.errors, [])
    assert.deepEqual(rows, model.rows)
    assert.deepEqual(cases, model.caseCallbacks)
    await file.dispose()
    const facts = {
      family,
      cases: cases.length,
      completeGenuineRows: rows.length,
      exactGenuineRowsAndNativeErrors: true,
      actualFileDisposalJoined: true,
    }
    if (output)
      fs.writeFileSync(
        output,
        JSON.stringify({ rows, callbacks: cases, ...facts }, null, 2) + '\n'
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
