import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertOwnedNodeCompleted,
  runOwnedNode,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [nextProjectArg, browserProjectArg, outputArg] = process.argv.slice(2)
assert(nextProjectArg && browserProjectArg && outputArg)
const nextProject = resolve(nextProjectArg)
const browserProject = resolve(browserProjectArg)
const output = resolve(outputArg)
const require = createRequire(join(nextProject, 'package.json'))
const browserRequire = createRequire(join(browserProject, 'package.json'))
const sdkRoot = dirname(browserRequire.resolve('playwright/package.json'))
const sdk = browserRequire('playwright/package.json').version
const here = dirname(fileURLToPath(import.meta.url))
const source = join(here, 'fixtures/locator-elements')
const expected = JSON.parse(
  readFileSync(join(source, 'elements.expected.json'))
)
assert(expected.reference.sdks.includes(sdk))
const hash = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex')
assert.equal(hash(join(source, 'elements.test.mjs.txt')), expected.sourceSHA256)
const next = require.resolve('next/dist/bin/next')
mkdirSync(output, { recursive: true })
const results = []
for (const mode of ['development', 'production']) {
  const destination = join(output, mode)
  mkdirSync(destination)
  const fixture = mkdtempSync(join(nextProject, '.locator-elements-fixture-'))
  try {
    copyFileSync(
      join(source, 'elements.test.mjs.txt'),
      join(fixture, 'elements.test.mjs')
    )
    mkdirSync(join(fixture, 'node_modules'))
    symlinkSync(sdkRoot, join(fixture, 'node_modules/playwright'))
    writeFileSync(
      join(fixture, 'package.json'),
      '{"private":true,"type":"module"}\n'
    )
    writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({
          turbopack: { root: nextProject },
          experimental: { turbopackSharedRuntime: true },
        }) +
        '\n'
    )
    mkdirSync(join(fixture, 'app'))
    writeFileSync(
      join(fixture, 'app/layout.jsx'),
      'export default function Layout({children}){return <html><body>{children}</body></html>}\n'
    )
    writeFileSync(
      join(fixture, 'app/page.jsx'),
      'export default function Page(){return <p>Locator element/query contract</p>}\n'
    )
    writeFileSync(
      join(fixture, 'next.test.config.json'),
      JSON.stringify({
        test: {
          mode,
          include: ['elements.test.mjs'],
          testTimeout: 5000,
          hookTimeout: 5000,
          fileTimeout: 30000,
          browser: { enabled: true, headless: true },
        },
      }) + '\n'
    )
    const result = await runOwnedNode(
      [
        next,
        'test',
        '--run',
        '--reporter',
        'json',
        '--outputFile',
        join(destination, 'cases.json'),
      ],
      {
        cwd: fixture,
        env: {
          ...process.env,
          NODE_ENV: mode,
          CI: '1',
          NEXT_TELEMETRY_DISABLED: '1',
        },
        auditDir: join(destination, 'audit'),
        timeoutMs: 60000,
      }
    )
    writeFileSync(
      join(destination, 'owner.json'),
      JSON.stringify(result, null, 2) + '\n'
    )
    writeFileSync(join(destination, 'stdout.log'), result.stdout)
    writeFileSync(join(destination, 'stderr.log'), result.stderr)
    assertOwnedNodeCompleted(result, mode)
    assert.equal(result.status, 0)
    assert.equal(result.signal, null)
    assert.equal(result.timedOut, false)
    const machine = JSON.parse(readFileSync(join(destination, 'cases.json')))
    const rows = machine.next.events
      .filter((event) => event.type === 'output' && event.stream === 'stdout')
      .flatMap((event) => event.text.split('\n'))
      .filter((line) => line.startsWith('ELEMENT_RAW '))
      .map((line) => JSON.parse(line.slice('ELEMENT_RAW '.length)))
    writeFileSync(
      join(destination, 'rows.json'),
      JSON.stringify(rows, null, 2) + '\n'
    )
    assert.equal(machine.success, true)
    assert.equal(machine.numTotalTests, 11)
    assert.equal(machine.numPassedTests, 11)
    assert.equal(machine.next.summary.errors, 0)
    assert.equal(rows.length, expected.records[mode].length)
    assert.deepEqual(rows.slice(0, -1), expected.records[mode].slice(0, -1))
    // Preserve the existing ownership boundary separately from reference parity.
    assert.deepEqual(rows.at(-1), expected.retainedForeignDocumentGuard)
    const cases = machine.testResults.flatMap((file) =>
      file.assertionResults.map((test) => ({
        ancestorTitles: test.ancestorTitles,
        fullName: test.fullName,
        status: test.status,
        title: test.title,
        failureMessages: test.failureMessages,
      }))
    )
    assert.deepEqual(cases, expected.cases[mode])
    assert.equal(
      hash(join(fixture, 'elements.test.mjs')),
      expected.sourceSHA256
    )
    results.push({
      mode,
      sdk,
      cases: cases.length,
      referenceExactOwnedDocumentRows: rows.length - 1,
      foreignGuardRetained: true,
      foreignReferenceDifferenceOpen: true,
    })
  } finally {
    rmSync(fixture, { recursive: true, force: true })
    writeFileSync(
      join(destination, 'cleanup.json'),
      JSON.stringify({ fixture, removed: true }) + '\n'
    )
  }
}
writeFileSync(
  join(output, 'CHECKS.json'),
  JSON.stringify({ results, sourceSHA256: expected.sourceSHA256 }, null, 2) +
    '\n'
)
console.log(JSON.stringify({ results }))
