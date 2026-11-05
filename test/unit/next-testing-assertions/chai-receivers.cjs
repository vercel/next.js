const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { createRequire } = require('node:module')
const [project, output, family] = process.argv.slice(2)
assert(project && ['dispatch', 'classes', 'null', 'unchanged'].includes(family))
const req = createRequire(path.join(project, 'package.json'))
const next = path.dirname(req.resolve('next/package.json'))
req(next + '/dist/server/node-environment-baseline')
const runner = req(next + '/dist/experimental/testing/runner')
const vitest = req(next + '/dist/experimental/testing/vitest')
const input = path.join(__dirname, 'fixtures/chai-receivers', family)
const reference = undefined
const body = fs.readFileSync(path.join(input, 'runtime.test.ts.txt'), 'utf8')
const ts = req('typescript')
const parsed = ts.createSourceFile(
  'fixture.ts',
  body,
  ts.ScriptTarget.Latest,
  true
)
const code = ts.transpileModule(
  parsed.statements
    .filter((statement) => !ts.isImportDeclaration(statement))
    .map((statement) => statement.getFullText(parsed))
    .join(''),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }
).outputText
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-chai-receivers-'))
const file = runner.initializeTestFile({
  fileId: 'actual-chai-receivers-' + family,
  filePath: path.join(dir, 'actual.test.mjs'),
})
const cases = [],
  rows = []
;(async () => {
  try {
    await file.collect(async () => {
      new Function(
        'vitest',
        'assert',
        'console',
        '"use strict";const{expect,test,chai,afterAll}=vitest;\n' + code
      )(vitest, assert, {
        log(line) {
          assert(reference && line.startsWith('POLL_OWNERSHIP_ROW '))
          rows.push(JSON.parse(line.slice(19)))
        },
      })
    })
    const result = await file.run({
      runId: 'actual-chai-receivers-run',
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
    assert.equal(
      cases.length,
      { dispatch: 28, classes: 24, null: 16, unchanged: 1 }[family]
    )
    assert(
      cases.every(
        (value) => value.state === 'passed' && value.errors.length === 0
      ),
      cases
        .flatMap((value) =>
          value.errors.map(
            (item) =>
              item.error?.stack ?? item.error?.message ?? String(item.error)
          )
        )
        .join('\n')
    )
    if (reference) assert.deepEqual(rows, reference.rows)
    await file.dispose()
    const facts = {
      family,
      cases: cases.length,
      behaviorAssertions: true,
      actualFileDisposalJoined: true,
    }
    if (output)
      fs.writeFileSync(
        output,
        JSON.stringify({ cases, ...facts }, null, 2) + '\n'
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
