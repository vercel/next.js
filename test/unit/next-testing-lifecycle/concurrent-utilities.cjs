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
      'utility-stubs',
      'utility-config-counter',
      'utility-config-clock',
      'utility-require-registration',
      'utility-require-capture-rows',
      'utility-require-physical-flow',
    ].includes(family)
)
const req = createRequire(path.join(project, 'package.json')),
  next = path.dirname(req.resolve('next/package.json'))
req(next + '/dist/server/node-environment-baseline')
const runner = req(next + '/dist/experimental/testing/runner'),
  vitest = req(next + '/dist/experimental/testing/vitest')
const input = path.join(__dirname, 'fixtures/concurrent-utilities', family),
  model = JSON.parse(fs.readFileSync(path.join(input, 'reference.json'))),
  body = fs.readFileSync(path.join(input, model.source), 'utf8')
assert.equal(createHash('sha256').update(body).digest('hex'), model.bodySHA256)
const header = body.slice(0, body.indexOf('\n') + 1)
assert(header.startsWith('import {') && header.endsWith("from 'vitest'\n"))
const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'next-concurrent-utilities-')
  ),
  file = runner.initializeTestFile({
    fileId: 'actual-concurrent-utilities',
    filePath: path.join(dir, 'actual.test.mjs'),
  }),
  rows = [],
  cases = [],
  taskNames = new Map(),
  attempts = []
;(async () => {
  try {
    await file.collect(async () => {
      new Function(
        'vitest',
        'console',
        '"use strict";const{test,describe,afterAll,vi,expect}=vitest;\n' +
          body.slice(header.length)
      )(vitest, {
        log(content) {
          assert(content.startsWith('POLL_OWNERSHIP_ROW '))
          rows.push(JSON.parse(content.slice(19)))
        },
      })
    })
    const result = await file.run({
      runId: 'actual-concurrent-utilities-run',
      signal: new AbortController().signal,
      onCaseEnd(value) {
        attempts.push({ caseId: value.caseId, errors: value.errors.slice() })
      },
      onCaseResult(task, value) {
        assert.equal(task.name, value.testName)
        taskNames.set(value.caseId, task.name)
        cases.push(value)
      },
    })
    assert.equal(result.interrupted, false)
    assert.deepEqual(result.errors, [])
    assert.deepEqual(rows, model.rows)
    const projectError = (error) =>
      error === undefined
        ? { message: 'undefined', hasStack: false }
        : {
            name: error.name,
            message: error.message,
            hasStack: typeof error.stack === 'string',
          }
    const failures = (value) =>
      attempts
        .filter((attempt) => attempt.caseId === value.caseId)
        .flatMap((attempt) => attempt.errors)
    const callbacks = cases.map((value) => ({
      name: taskNames.get(value.caseId),
      state: value.status,
      errors: failures(value).map((error) => projectError(error.error)),
    }))
    assert.deepEqual(callbacks, model.caseCallbacks)
    let undefinedFailures = 0,
      sameCapturedErrorRetryCases = 0
    for (const value of cases) {
      const errors = failures(value)
      for (const error of errors)
        if (error.error === undefined) {
          assert(Object.hasOwn(error, 'error'))
          undefinedFailures++
        }
      if (family === 'utility-require-capture-rows') {
        assert.equal(errors.length, 2)
        assert(errors[0].error instanceof Error)
        assert.strictEqual(errors[0].error, errors[1].error)
        assert(!errors[0].error.stack.includes('assertionCountErrors'))
        sameCapturedErrorRetryCases++
      }
    }
    assert.equal(
      undefinedFailures,
      family === 'utility-require-registration'
        ? 3
        : family === 'utility-config-counter'
          ? 1
          : 0
    )
    assert.equal(
      sameCapturedErrorRetryCases,
      family === 'utility-require-capture-rows' ? 3 : 0
    )
    await file.dispose()
    const facts = {
      family,
      cases: cases.length,
      completeGenuineRows: rows.length,
      primitiveUndefinedFailures: undefinedFailures,
      sameCapturedErrorRetryCases,
      actualFileDisposalJoined: true,
      exactGenuineFailureProjection: true,
    }
    if (output)
      fs.writeFileSync(
        output,
        JSON.stringify({ rows, callbacks, ...facts }, null, 2) + '\n'
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
