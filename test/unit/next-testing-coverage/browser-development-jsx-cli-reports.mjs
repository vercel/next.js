import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  rmSync,
  existsSync,
  readdirSync,
} from 'node:fs'
import { join, resolve, basename, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
const [
  consumerArg,
  browserProjectArg,
  destArg,
  sourceKind = 'jsx',
  mode = 'development',
] = process.argv.slice(2)
assert.equal(mode, 'development')
assert(['tsx', 'jsx'].includes(sourceKind))
assert(sourceKind !== 'mts' || mode === 'development')
assert(
  mode === 'production' ||
    ['javascript', 'typescript', 'mts', 'tsx', 'jsx'].includes(sourceKind)
)
assert(['javascript', 'typescript', 'mts', 'tsx', 'jsx'].includes(sourceKind))
const subjectName =
    sourceKind === 'tsx' || sourceKind === 'jsx'
      ? 'subject.' + sourceKind
      : sourceKind === 'mts'
        ? 'subject.mts'
        : sourceKind === 'typescript'
          ? 'subject.ts'
          : 'subject.mjs',
  unimportedName =
    sourceKind === 'tsx' || sourceKind === 'jsx'
      ? 'unimported.' + sourceKind
      : sourceKind === 'mts'
        ? 'unimported.mts'
        : sourceKind === 'typescript'
          ? 'unimported.ts'
          : 'unimported.mjs',
  entryName =
    sourceKind === 'tsx' || sourceKind === 'jsx'
      ? 'contract.test.mjs'
      : 'contract.case.mjs'
assert(
  consumerArg && browserProjectArg && destArg,
  'Expected Next consumer, Browser dependency project and output directory'
)
const consumer = resolve(consumerArg),
  destination = resolve(destArg),
  here = dirname(fileURLToPath(import.meta.url)),
  browserProject = resolve(browserProjectArg)
const req = createRequire(join(consumer, 'package.json')),
  browserRequire = createRequire(join(browserProject, 'package.json')),
  sdkRoot = dirname(browserRequire.resolve('playwright/package.json')),
  sdk = JSON.parse(readFileSync(join(sdkRoot, 'package.json'), 'utf8')).version,
  bin = join(req.resolve('next/package.json'), '../dist/bin/next')
if (!process.argv.includes('--source'))
  for (const name of ['vitest', 'vite']) assert.throws(() => req.resolve(name))
const expected = JSON.parse(
  readFileSync(
    join(
      here,
      'fixtures/browser-production/public-' +
        (mode === 'development' ? 'development-' : '') +
        sourceKind +
        '.expected.json'
    ),
    'utf8'
  )
)
assert(expected.sdks.includes(sdk))
assert.equal(expected.mode, mode)
const records = expected.profiles,
  results = [],
  source =
    sourceKind === 'mts'
      ? join(here, 'fixtures/browser-development-mts')
      : sourceKind === 'tsx' || sourceKind === 'jsx'
        ? join(
            here,
            sourceKind === 'jsx'
              ? 'fixtures/jsx-standard/basic'
              : 'fixtures/jsx-owners-public/fragment'
          )
        : join(
            here,
            '../app-dir/next-testing-stable-release-gaps/fixtures/' +
              (sourceKind === 'typescript'
                ? 'coverage-compiler-source-typescript'
                : 'coverage-browser')
          )
mkdirSync(destination, { recursive: true })
const hash = (file) =>
    createHash('sha256').update(readFileSync(file)).digest('hex'),
  canonical = (map) =>
    Object.fromEntries(
      Object.entries(map).map(([file, data]) => [
        basename(file),
        { ...data, path: basename(file) },
      ])
    )
const coverageText = (stdout) => {
  const index = stdout.search(/^-{3,}\|/m)
  assert(index >= 0, 'Actual table')
  return stdout.slice(index).trim()
}
for (const record of records) {
  const output = join(destination, record.name)
  mkdirSync(output)
  const fixture = mkdtempSync(
    join(consumer, '.public-browser-coverage-matrix-')
  )
  try {
    for (const [name, file] of Object.entries(expected.sourceFiles)) {
      const original = join(
        source,
        (file.fixture ?? name) +
          (['mts', 'tsx', 'jsx'].includes(sourceKind) ? '.txt' : '')
      )
      assert.equal(hash(original), file.sha256)
      writeFileSync(join(fixture, name), readFileSync(original))
      assert.equal(hash(join(fixture, name)), file.sha256)
    }
    mkdirSync(join(fixture, 'node_modules'))
    symlinkSync(sdkRoot, join(fixture, 'node_modules/playwright'))
    if (!Object.hasOwn(expected.sourceFiles, 'package.json'))
      writeFileSync(join(fixture, 'package.json'), '{}\n')
    writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({
          turbopack: { root: consumer },
          experimental: { turbopackSharedRuntime: true },
        }) +
        '\n'
    )
    writeFileSync(
      join(fixture, 'next.test.config.json'),
      JSON.stringify({
        test: {
          mode,
          include: [entryName],
          browser: { enabled: true },
          coverage: record.config,
        },
      }) + '\n'
    )
    mkdirSync(join(fixture, 'app'))
    writeFileSync(
      join(fixture, 'app/layout.jsx'),
      'export default function Layout({children}){return <html><body>{children}</body></html>}\n'
    )
    writeFileSync(
      join(fixture, 'app/page.jsx'),
      'export default function Page(){return <p>Public Browser configured coverage</p>}\n'
    )
    const reports = join(fixture, record.directory)
    mkdirSync(reports)
    writeFileSync(join(reports, 'sentinel.txt'), 'keep-me\n')
    const env = {
      ...process.env,
      NODE_ENV: mode,
      CI: '1',
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
      TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    }
    for (const key of [
      'NODE_OPTIONS',
      'NODE_PATH',
      'PLAYWRIGHT_BROWSERS_PATH',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    ])
      delete env[key]
    const command = [
        bin,
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--outputFile=result.json',
        ...record.flags,
      ],
      owner = await runOwnedNode(command, {
        cwd: fixture,
        env,
        auditDir: join(output, 'owners'),
        timeoutMs: 180000,
      })
    for (const [name, value] of Object.entries({
      'owner.json': JSON.stringify(owner, null, 2) + '\n',
      'stdout.log': owner.stdout,
      'stderr.log': owner.stderr,
    }))
      writeFileSync(join(output, name), value)
    // Preserve actual failed results before the fixture is removed in finally.
    for (const [source, retained] of [
      [join(fixture, 'result.json'), 'raw-machine.json'],
      [join(reports, 'coverage-final.json'), 'raw-coverage.json'],
    ])
      if (existsSync(source))
        writeFileSync(join(output, retained), readFileSync(source))
    assertOwnedNodeCompleted(
      owner,
      'Actual public production Browser coverage ' + record.name
    )
    assert.equal(owner.status, record.exitCode, owner.stdout + owner.stderr)
    const report = JSON.parse(
        readFileSync(join(fixture, 'result.json'), 'utf8')
      ),
      cases = report.testResults.map((file) => ({
        file: basename(file.name),
        status: file.status,
        cases: file.assertionResults.map((test) =>
          Object.fromEntries(
            [
              'ancestorTitles',
              'fullName',
              'status',
              'title',
              'failureMessages',
              'meta',
              'tags',
              'benchmarks',
            ]
              .filter((key) => key in test)
              .map((key) => [key, test[key]])
          )
        ),
      }))
    assert.deepEqual(cases, record.cases)
    const actualFile = join(reports, 'coverage-final.json'),
      actual = existsSync(actualFile)
        ? canonical(JSON.parse(readFileSync(actualFile, 'utf8')))
        : null
    writeFileSync(
      join(output, 'actual-coverage.json'),
      JSON.stringify(actual, null, 2) + '\n'
    )
    assert.deepEqual(actual, record.coverage)
    assert.equal(
      existsSync(join(reports, 'sentinel.txt')),
      record.sentinelRetained
    )
    if (record.name === 'defaults') {
      for (const file of [
        'index.html',
        subjectName + '.html',
        unimportedName + '.html',
        'clover.xml',
        'base.css',
      ])
        assert(existsSync(join(reports, file)), file)
      for (const [file, sha] of Object.entries(record.assetHashes))
        assert.equal(hash(join(reports, file)), sha, file)
      const html = readFileSync(join(reports, 'index.html'), 'utf8')
      for (const [, link] of html.matchAll(/(?:href|src)="([^"#:]+)"/g))
        assert(existsSync(join(reports, link.split('?')[0])), link)
      assert(
        readFileSync(join(reports, 'clover.xml'), 'utf8').includes(subjectName)
      )
    }
    if (record.reports.includes('coverage-summary.json')) {
      const canonicalSummary = (value) =>
        Object.fromEntries(
          Object.entries(value).map(([file, data]) => [
            file === 'total' ? 'total' : basename(file),
            data,
          ])
        )
      assert.deepEqual(
        canonicalSummary(
          JSON.parse(
            readFileSync(join(reports, 'coverage-summary.json'), 'utf8')
          )
        ),
        record.summary
      )
    }
    if (record.reports.includes('lcov.info'))
      assert.equal(
        readFileSync(join(reports, 'lcov.info'), 'utf8'),
        record.lcov
      )
    if (
      record.name === 'defaults' ||
      record.name === 'explicit' ||
      record.name === 'threshold99'
    )
      assert.equal(coverageText(owner.stdout), record.coverageText)
    const diagnosticLines = (text) =>
      text.split('\n').filter((line) => line.includes('Coverage for '))
    assert.deepEqual(diagnosticLines(owner.stderr), record.thresholdDiagnostics)
    for (const [name, file] of Object.entries(expected.sourceFiles))
      assert.equal(hash(join(fixture, name)), file.sha256)
    const result = {
      sdk,
      name: record.name,
      status: 'passed',
      exitCode: owner.status,
      wholeCasesEqual: true,
      wholeCoverageEqual: true,
      sentinelRetained: record.sentinelRetained,
      reports: readdirSync(reports).sort(),
    }
    writeFileSync(
      join(output, 'result.json'),
      JSON.stringify(result, null, 2) + '\n'
    )
    results.push(result)
    console.log(JSON.stringify(result))
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}
writeFileSync(
  join(destination, 'result.json'),
  JSON.stringify({ sdk, status: 'passed', profiles: results }, null, 2) + '\n'
)
