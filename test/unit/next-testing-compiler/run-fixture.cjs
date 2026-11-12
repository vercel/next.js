const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const {
  resolveFixturePath,
  fixtureFiles,
} = require('../../lib/next-testing-fixtures.cjs')

const fixtures = {
  'builtin-factory': [3, 'WS2_BUILTIN_RAW:'],
  'virtual-import': [3, 'WS2_VIRTUAL_IMPORT_RAW:'],
  'virtual-bare': [4, 'WS2_VIRTUAL_RAW:'],
  'cjs-actual-cache': [3, 'WS2_CJS_CACHE_RAW:'],
  'cjs-factory': [3, 'WS2_CJS_FACTORY_RAW:'],
  'cjs-import-mock': [4, 'WS2_CJS_MOCK_RAW:'],
  'cjs-reset': [3, 'WS2_CJS_RESET_RAW:'],
}

async function main() {
  const name = process.argv[2]
  assert(Object.hasOwn(fixtures, name), 'Expected a compiler fixture name')
  const [expectedCount, prefix] = fixtures[name]
  const repo = path.resolve(__dirname, '../../..')
  const source = path.join(__dirname, name)
  const output = fs.mkdtempSync(
    path.join(os.tmpdir(), 'next-compiler-fixture-')
  )
  const files = fixtureFiles(source)
    .filter((file) => !file.startsWith('pristine'))
    .map((file) => ({
      target: file.replace(/\.txt$/, ''),
      bytes: fs.readFileSync(resolveFixturePath(path.join(source, file))),
    }))
  let actual
  let complete = false
  try {
    const { runCompilerCase } = await import(
      '../../lib/next-testing-case-runner.mjs'
    )
    await runCompilerCase({
      repo,
      output,
      mode: 'development',
      files,
      expectedCount,
      timeoutMs: 120000,
      config: {
        maxWorkers: 1,
        projects: [{ name, environment: 'node', include: ['*.test.mjs'] }],
      },
      check(report) {
        const cases = report.testResults.flatMap(
          (file) => file.assertionResults
        )
        const rows = report.next.events
          .filter((event) => event.type === 'output')
          .flatMap((event) =>
            event.text
              .split('\n')
              .filter((line) => line.startsWith(prefix))
              .map((line) => ({
                stream: event.stream,
                value: JSON.parse(line.slice(prefix.length)),
              }))
          )
        const diagnostics = report.next.events.filter(
          (event) =>
            event.type === 'diagnostic' && event.diagnostic.severity === 'error'
        )
        assert.equal(rows.length, expectedCount)
        assert.deepEqual(diagnostics, [])
        actual = {
          close: { code: 0, signal: null },
          forced: false,
          rows,
          cases: cases.map((test) => ({
            name: test.fullName,
            status: test.status,
            failureMessages: test.failureMessages,
          })),
          diagnostics,
        }
      },
    })
    complete = true
    console.log(JSON.stringify(actual))
  } finally {
    if (complete) fs.rmSync(output, { recursive: true, force: true })
    else console.error('Compiler fixture evidence retained at ' + output)
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
