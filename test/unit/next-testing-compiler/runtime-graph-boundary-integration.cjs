const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { spawn } = require('node:child_process')

const repo = path.resolve(__dirname, '../../..')
const target = process.argv[2]
assert.ok(
  [
    'commonjs',
    'compiled-cjs-runtime-negative-query',
    'compiled-cjs-runtime-negative-fragment',
    'compiled-cjs-runtime-negative-unresolved',
    'compiled-cjs-runtime-negative-mixed-esm',
    'compiled-cjs-runtime-negative-mixed-native',
    'compiled-cjs-runtime-negative-self',
    'compiled-cjs-runtime-negative-foreign',
    'compiled-cjs-runtime-negative-promise',
    'compiled-cjs-runtime-negative-then',
    'compiled-cjs-runtime-negative-computed',
    'compiled-cjs-runtime-negative-spread',
    'compiled-cjs-runtime-negative-history',
    'compiled-cjs-runtime-negative-unresolved-require',
    'compiled-cjs-runtime-negative-multiple-require',
    'compiled-cjs-runtime-negative-dynamic-require',
    'compiled-cjs-runtime-negative-throw-only',

    'cjs-actual-reset-negative-query',
    'cjs-actual-reset-negative-fragment',
    'cjs-actual-reset-negative-unresolved',
    'cjs-actual-reset-negative-esm',
    'cjs-actual-reset-negative-leaf',
    'cjs-actual-reset-negative-builtin',
    'cjs-actual-reset-negative-self',
    'cjs-actual-reset-negative-foreign',
    'cjs-actual-reset-negative-mixed-promise',

    'cjs-reset-negative-unresolved',
    'cjs-reset-negative-external',
    'cjs-reset-negative-esm',
    'cjs-reset-negative-multiple',
    'cjs-reset-negative-foreign',
    'cjs-reset-negative-client-directive',
    'cjs-reset-negative-query',
    'cjs-reset-negative-multiple-resolved',
    'cjs-reset-export-promise',
    'cjs-reset-export-array',
    'cjs-reset-export-then',
    'cjs-reset-export-computed',
    'cjs-reset-export-spread',
    'cjs-reset-export-getter',
    'cjs-reset-export-prototype',
    'cjs-reset-export-repeated',
    'cjs-reset-export-escaped-callable',
    'cjs-reset-export-reassigned-callable',
    'cjs-reset-export-computed-callable',
    'cjs-reset-export-mixed-promise-leaf',
    'cross-foreign-literal',
    'cross-native-foreign',
    'cross-target',
    'async-module',
    'native-alias',
    'framework-alias',
    'bare-dependency',

    'then',
    'unresolved',
    'dynamic',
    'computed',
    'require',
    'query',
    'foreign',
    'entry-cycle',
    'helper',
    'symlink',
  ].includes(target)
)
const source = path.join(__dirname, 'runtime-graph-boundaries', target)
const expected = JSON.parse(
  fs.readFileSync(path.join(source, 'expected-diagnostic.json'), 'utf8')
)
const fixture = fs.mkdtempSync(
  path.join(repo, '.next-test-runtime-graph-boundary-')
)
const pins = new Map()
for (const name of fs.readdirSync(source)) {
  const destination = path.join(fixture, name.replace(/\.txt$/, ''))
  const bytes = fs.readFileSync(path.join(source, name))
  fs.writeFileSync(destination, bytes)
  pins.set(destination, createHash('sha256').update(bytes).digest('hex'))
}
if (!fs.existsSync(path.join(fixture, 'next.config.mjs')))
  fs.writeFileSync(path.join(fixture, 'next.config.mjs'), 'export default {}\n')
if (target === 'symlink')
  fs.symlinkSync('real.mjs', path.join(fixture, 'peer.mjs'))
fs.writeFileSync(
  path.join(fixture, 'next.test.config.json'),
  JSON.stringify({
    maxWorkers: 1,
    projects: [{ name: target, environment: 'node', include: ['*.test.mjs'] }],
  })
)
const modules = path.join(fixture, 'node_modules')
fs.mkdirSync(modules)
for (const name of fs.readdirSync(path.join(repo, 'node_modules'))) {
  fs.symlinkSync(
    path.join(repo, 'node_modules', name),
    path.join(modules, name)
  )
}
const env = {
  ...process.env,
  NODE_ENV: 'development',
  NEXT_TELEMETRY_DISABLED: '1',
  FORCE_COLOR: '0',
}
delete env.CI
const child = spawn(
  process.execPath,
  [
    path.join(repo, 'packages/next/dist/bin/next'),
    'test',
    fixture,
    '--run',
    '--reporter',
    'json',
    '--outputFile',
    'result.json',
  ],
  { cwd: fixture, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
)
const stdout = []
const stderr = []
child.stdout.on('data', (chunk) => stdout.push(chunk))
child.stderr.on('data', (chunk) => stderr.push(chunk))
let forced = false
let killTimer
const deadline = setTimeout(() => {
  forced = true
  process.kill(-child.pid, 'SIGTERM')
  killTimer = setTimeout(() => process.kill(-child.pid, 'SIGKILL'), 5000)
}, 120000)
;(async () => {
  let close
  try {
    close = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code, signal }))
    })
    clearTimeout(deadline)
    clearTimeout(killTimer)
    const report = JSON.parse(
      fs.readFileSync(path.join(fixture, 'result.json'), 'utf8')
    )
    const diagnostics = report.next.events
      .filter(
        (event) =>
          event.type === 'diagnostic' && event.diagnostic.severity === 'error'
      )
      .map((event) => event.diagnostic.message)
    const bodyOutput = report.next.events.some(
      (event) =>
        event.type === 'output' &&
        (event.text.includes('WS2_GRAPH_BOUNDARY_BODY') ||
          ((target.startsWith('cjs-reset-') ||
            target.startsWith('compiled-cjs-runtime-negative-')) &&
            event.text.includes('WS2_CJS_NEGATIVE_BODY')) ||
          (target === 'cross-foreign-literal' &&
            event.text.includes('WS2_CROSS_FOREIGN:')) ||
          (target === 'cjs-actual-reset-negative-leaf' &&
            event.text.includes('WS2_CJS_NEGATIVE_BODY')))
    )
    process.stdout.write(
      JSON.stringify({
        close,
        forced,
        total: report.numTotalTests,
        passed: report.numPassedTests,
        bodyOutput,
        diagnostics,
      }) + '\n'
    )
    if (target === 'cjs-actual-reset-negative-leaf') {
      assert.deepEqual(close, { code: 0, signal: null })
      assert.equal(forced, false)
      assert.equal(report.success, true)
      assert.equal(report.numTotalTests, 1)
      assert.equal(report.numPassedTests, 1)
      assert.equal(report.numFailedTests, 0)
      assert.equal(bodyOutput, true)
      assert.deepEqual(diagnostics, [])
      assert.deepEqual(
        report.testResults.flatMap((file) =>
          file.assertionResults.map((test) => ({
            name: test.fullName,
            status: test.status,
            failureMessages: test.failureMessages,
          }))
        ),
        [
          {
            name: 'does not execute an uncertified CommonJS actual reset graph',
            status: 'passed',
            failureMessages: [],
          },
        ]
      )
      assert.deepEqual(
        report.next.events
          .filter((event) => event.type === 'output')
          .flatMap((event) =>
            event.text
              .split('\n')
              .filter((line) => line === 'WS2_CJS_NEGATIVE_BODY')
              .map((text) => ({ stream: event.stream, text }))
          ),
        [{ stream: 'stdout', text: 'WS2_CJS_NEGATIVE_BODY' }]
      )
      for (const [destination, digest] of pins) {
        assert.equal(
          createHash('sha256')
            .update(fs.readFileSync(destination))
            .digest('hex'),
          digest
        )
      }
      return
    }
    if (target === 'cross-target') {
      const rows = report.next.events
        .filter((event) => event.type === 'output')
        .flatMap((event) =>
          event.text
            .split('\n')
            .filter((line) =>
              line.startsWith('WS2_EXTERNAL_GRAPH_CROSS_TARGET:')
            )
            .map((line) => ({
              stream: event.stream,
              value: JSON.parse(line.slice(line.indexOf(':') + 1)),
            }))
        )
      assert.deepEqual(close, { code: 0, signal: null })
      assert.equal(forced, false)
      assert.equal(report.success, true)
      assert.equal(report.numTotalTests, 1)
      assert.equal(report.numPassedTests, 1)
      assert.equal(report.numFailedTests, 0)
      assert.equal(bodyOutput, true)
      assert.deepEqual(diagnostics, [])
      assert.deepEqual(rows, [
        {
          stream: 'stdout',
          value: { calls: [1, 1], values: ['mock-peer', 'mock-peer'] },
        },
      ])
      for (const [destination, digest] of pins) {
        assert.equal(
          createHash('sha256')
            .update(fs.readFileSync(destination))
            .digest('hex'),
          digest
        )
      }
      return
    }
    assert.deepEqual(close, { code: 1, signal: null })
    assert.equal(forced, false)
    assert.equal(report.numTotalTests, 0)
    assert.equal(report.numPassedTests, 0)
    assert.equal(bodyOutput, false)
    assert.ok(diagnostics.join('\n').includes(expected.includes))
    for (const [file, digest] of pins) {
      assert.equal(
        createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
        digest
      )
    }
  } finally {
    clearTimeout(deadline)
    clearTimeout(killTimer)
    if (close && !forced) fs.rmSync(fixture, { recursive: true, force: true })
    if (forced || !close) {
      process.stderr.write(Buffer.concat(stdout))
      process.stderr.write(Buffer.concat(stderr))
    }
  }
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
