const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const repo = path.resolve(__dirname, '../../..')
const { createHash } = require('node:crypto')
const group = process.argv[2]
const ordinaryEsmNamespaceGroups = {
  'cjs-import-mock-hidden-flag-body-definitions': {
    cases: 2,
    prefix: 'WS2_CALLABLE_',
  },
  'cjs-import-mock-hidden-flag-callable': { cases: 9, prefix: 'WS2_CALLABLE_' },
  'cjs-import-mock-hidden-flag-inherited': {
    cases: 2,
    prefix: 'WS2_CALLABLE_',
  },
  'cjs-import-mock-hidden-flag-definition-observation': {
    cases: 2,
    prefix: 'WS2_CALLABLE_',
  },
  'cjs-import-mock-hidden-flag-all-definitions': {
    cases: 2,
    prefix: 'WS2_CALLABLE_',
  },
  'cjs-import-mock-hidden-flag-publication-proxy': {
    cases: 3,
    prefix: 'WS2_CALLABLE_',
  },
  'cjs-import-mock-self-default-publication': {
    cases: 9,
    prefix: 'WS2_CALLABLE_',
  },
  'cjs-import-mock-self-default-inherited': {
    cases: 2,
    prefix: 'WS2_CALLABLE_',
  },
  'cjs-import-mock-strict-receiver': {
    cases: 2,
    prefix: 'WS2_CALLABLE_MUTATION:',
  },
  'cjs-import-mock-inherited-flag': {
    cases: 2,
    prefix: 'WS2_CALLABLE_MUTATION:',
  },
  'cjs-import-mock-publication-mutation': {
    cases: 6,
    prefix: 'WS2_CALLABLE_MUTATION:',
  },
  'cjs-import-mock-async-publication-mutation': {
    cases: 18,
    prefix: 'WS2_CALLABLE_MUTATION:',
  },
  'cjs-import-mock-publication-namespace': {
    cases: 4,
    prefix: 'WS2_CALLABLE_MUTATION:',
  },
  'cjs-import-mock-certified-async': {
    cases: 4,
    prefix: 'WS2_CALLABLE_',
  },
  'cjs-import-mock-callable-order': {
    cases: 7,
    prefix: 'WS2_CALLABLE_AUTOMATIC:',
  },
  'static-import-original-callback-shape': {
    cases: 1,
    prefix: 'WS2_STATIC_CALLBACK_SHAPE:',
  },
  'cjs-function-expression-dependency-reset': {
    cases: 3,
    prefix: 'WS2_CJS_FUNCTION_EXPRESSION:',
  },
  'cjs-function-expression-cycle-reset': {
    cases: 3,
    prefix: 'WS2_CJS_FUNCTION_EXPRESSION:',
  },
  'cjs-function-expression-dependency-runtime': {
    cases: 3,
    prefix: 'WS2_CJS_FUNCTION_EXPRESSION:',
  },
  'cjs-function-expression-cycle-runtime': {
    cases: 3,
    prefix: 'WS2_CJS_FUNCTION_EXPRESSION:',
  },
  'runtime-namespace-ordinary-tla': { cases: 3, prefix: 'WS2_ESM_NAMESPACE:' },
  'runtime-import-original-callback-shape': {
    cases: 1,
    prefix: 'WS2_CALLBACK_SHAPE:',
  },
  'runtime-namespace-compiled-loader-error': {
    cases: 2,
    prefix: 'WS2_CJS_RUNTIME:',
  },
  'runtime-namespace-compiled-pending-lifetimes': {
    cases: 8,
    prefix: 'WS2_CJS_RUNTIME:',
  },
  'runtime-namespace-esm-transitions': { cases: 6, prefix: 'WS2_CJS_RUNTIME:' },
  'runtime-namespace-ordinary-values': {
    cases: 4,
    prefix: 'WS2_ESM_NAMESPACE:',
  },
  'runtime-namespace-ordinary-hygiene': {
    cases: 2,
    prefix: 'WS2_ESM_NAMESPACE:',
  },
}
const compiledCjsRuntimeGroups = {
  'runtime-registration-leaf-object-invalidation-v1': 2,
  'runtime-registration-leaf-callable-invalidation-v1': 2,
  'runtime-registration-dependency-invalidation-v1': 2,
  'runtime-registration-esm-transitions-invalidation-v1': 2,
  'runtime-registration-builtin-transitions-invalidation-v1': 2,

  'runtime-registration-leaf-object-no-reset': 2,
  'runtime-registration-leaf-callable-no-reset': 2,
  'runtime-registration-dependency-no-reset': 2,
  'runtime-registration-cycle-no-reset': 2,
  'runtime-registration-nonleaf-callable-plain-no-reset': 2,
  'runtime-registration-nonleaf-callable-cycle-no-reset': 2,
  'runtime-registration-leaf-object-transitions-v2': 6,
  'runtime-registration-dependency-transitions-v2': 6,
  'runtime-registration-builtin-transitions': 6,
  'runtime-registration-esm-demand-literal-v5': 1,

  'compiled-cjs-runtime-leaf-object': 8,
  'compiled-cjs-runtime-leaf-callable': 8,
  'compiled-cjs-runtime-dependency': 8,
  'compiled-cjs-runtime-cycle': 8,
  'compiled-cjs-runtime-nonleaf-callable-plain': 8,
  'compiled-cjs-runtime-nonleaf-callable-cycle': 8,
  'compiled-cjs-runtime-leaf-object-lifetimes': 4,
  'compiled-cjs-runtime-leaf-callable-lifetimes': 4,
  'compiled-cjs-runtime-dependency-lifetimes': 4,
  'compiled-cjs-runtime-cycle-lifetimes': 4,
  'compiled-cjs-runtime-nonleaf-callable-plain-lifetimes': 4,
  'compiled-cjs-runtime-nonleaf-callable-cycle-lifetimes': 4,
  'compiled-cjs-runtime-leaf-object-esmflag': 8,
  'compiled-cjs-runtime-leaf-object-default': 8,
  'compiled-cjs-runtime-leaf-callable-esmflag': 8,
}
const cjsActualResetGroups = {
  'cjs-reset-actual-dependency': 2,
  'cjs-reset-actual-cycle': 2,
  'cjs-reset-actual-nonleaf-callable-plain': 2,
  'cjs-reset-actual-nonleaf-callable-cycle': 2,
  'cjs-reset-actual-dependency-actual-only': 1,
  'cjs-reset-actual-dependency-unused-only': 1,
  'cjs-reset-actual-cycle-actual-only': 1,
  'cjs-reset-actual-cycle-unused-only': 1,
  'cjs-reset-actual-nonleaf-callable-plain-actual-only': 1,
  'cjs-reset-actual-nonleaf-callable-plain-unused-only': 1,
  'cjs-reset-actual-nonleaf-callable-cycle-actual-only': 1,
  'cjs-reset-actual-nonleaf-callable-cycle-unused-only': 1,
  'cjs-reset-actual-dependency-mutation': 1,
  'cjs-reset-actual-cycle-mutation': 1,
  'cjs-reset-actual-nonleaf-callable-plain-mutation': 1,
  'cjs-reset-actual-nonleaf-callable-cycle-mutation': 1,
}
const cjsResetGroups = {
  'cjs-reset-dependency': 1,
  'cjs-reset-direct-dependency': 1,
  'cjs-reset-cycle': 1,
  'cjs-reset-static-held-dependency': 1,
  'cjs-reset-unused-dependency': 1,
  'cjs-reset-unused-cycle': 1,
  'cjs-reset-nonleaf-callable-plain': 1,
  'cjs-reset-nonleaf-callable-cycle': 1,
  'cjs-reset-nonleaf-callable-static': 1,
  'cjs-reset-nonleaf-callable-unused': 1,
  'cjs-reset-nonleaf-member-object': 1,
  'cjs-reset-nonleaf-member-callable': 1,
}
const crossTargetGroups = {
  'compiled-native-order-before': 1,
  'compiled-native-order-after': 1,
  'compiled-native-namespace-before': 1,
  'compiled-native-namespace-after': 1,
  'compiled-native-cross-target': 13,
  'compiled-native-cross-lifetime': 5,
  'compiled-cross-namespace-shadow': 1,
  'compiled-cross-target': 12,
  'compiled-cross-lifetime': 4,
  'compiled-cross-namespace': 4,
  'compiled-cross-namespace-cycle': 1,
  'compiled-cross-namespace-reset': 1,
  'compiled-cross-namespace-getter': 1,
  'factory-cause-cjs': 1,
  'factory-cause-esm': 1,
  'factory-cause-builtin': 1,
  'factory-cause-compiled': 1,
}
assert.ok(
  [
    ...Object.keys(crossTargetGroups),
    ...Object.keys(cjsResetGroups),
    ...Object.keys(cjsActualResetGroups),
    ...Object.keys(ordinaryEsmNamespaceGroups),
    ...Object.keys(compiledCjsRuntimeGroups),
    'external',
    'external-control',
    'external-graph',
    'external-conditions',
    'external-actual',
    'unmock-after',
    'unmock-before',
    'unmock-only',
    'builtin-actual',
    'builtin-control',
    'compiled-builtin',
    'compiled-external',
    'builtin-unmock-after',
    'builtin-unmock-before',
    'builtin-unmock-only',
    'runtime-cjs',
    'runtime-esm',
    'runtime-builtin',
    'runtime-ownership',
    'runtime-ownership-no-reset',
    'compiled-runtime',
    'compiled-purethrow',
    'compiled-esm-graph',
    'compiled-esm-graph-alias',
    'compiled-parallel-fast',
    'static-runtime-cjs-unused',
    'static-runtime-esm-unused',
    'static-runtime-builtin-unused',
    'static-runtime-cjs',
    'static-runtime-esm',
    'static-runtime-builtin',
    'static-runtime-cjs-failure',
    'static-runtime-cjs-pending-resolve',
    'static-runtime-cjs-pending-reject',
    'static-runtime-cjs-unmock-first',
    'static-runtime-esm-failure',
    'static-runtime-esm-pending-resolve',
    'static-runtime-esm-pending-reject',
    'static-runtime-esm-unmock-first',
    'static-runtime-builtin-failure',
    'static-runtime-builtin-pending-resolve',
    'static-runtime-builtin-pending-reject',
    'static-runtime-builtin-unmock-first',
  ].includes(group)
)
const source = path.join(__dirname, 'external-package', group)
const previousExpectedCount =
  group === 'compiled-esm-graph'
    ? 7
    : ['runtime-cjs', 'runtime-esm', 'runtime-builtin'].includes(group)
      ? 6
      : ['compiled-runtime', 'compiled-purethrow'].includes(group)
        ? 4
        : group === 'compiled-parallel-fast'
          ? 2
          : ['external', 'external-actual', 'builtin-actual'].includes(group)
            ? 3
            : ['external-control', 'builtin-control'].includes(group)
              ? 2
              : 1
const expectedCount =
  ordinaryEsmNamespaceGroups[group]?.cases ??
  compiledCjsRuntimeGroups[group] ??
  cjsActualResetGroups[group] ??
  crossTargetGroups[group] ??
  cjsResetGroups[group] ??
  previousExpectedCount
const fixture = fs.mkdtempSync(path.join(repo, '.next-test-external-package-'))
const pins = new Map()
function copyTree(from, to, literalSuffix = true) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      copyTree(
        path.join(from, entry.name),
        path.join(to, entry.name),
        literalSuffix
      )
    } else {
      assert.equal(entry.isFile(), true)
      const name = literalSuffix ? entry.name.replace(/\.txt$/, '') : entry.name
      const target = path.join(to, name)
      fs.copyFileSync(path.join(from, entry.name), target)
      pins.set(
        target,
        createHash('sha256').update(fs.readFileSync(target)).digest('hex')
      )
    }
  }
}
copyTree(source, fixture)
const modules = path.join(fixture, 'node_modules')
fs.mkdirSync(modules)
for (const name of fs.readdirSync(path.join(repo, 'node_modules'))) {
  fs.symlinkSync(
    path.join(repo, 'node_modules', name),
    path.join(modules, name)
  )
}
const packages = path.join(fixture, 'external-packages')
for (const name of fs.existsSync(packages) ? fs.readdirSync(packages) : []) {
  copyTree(path.join(packages, name), path.join(modules, name), false)
}
fs.writeFileSync(
  path.join(fixture, 'next.test.config.json'),
  JSON.stringify({
    maxWorkers: 1,
    projects: [
      {
        name: group,
        environment: 'node',
        include: ['*.test.mjs'],
      },
    ],
  })
)
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
let forced = false
let killTimer
child.stdout.on('data', (chunk) => stdout.push(chunk))
child.stderr.on('data', (chunk) => stderr.push(chunk))
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
    const rows = report.next.events
      .filter((event) => event.type === 'output')
      .flatMap((event) =>
        event.text
          .split('\n')
          .filter((line) =>
            line.startsWith(
              ordinaryEsmNamespaceGroups[group]?.prefix ??
                (compiledCjsRuntimeGroups[group]
                  ? 'WS2_CJS_RUNTIME:'
                  : cjsActualResetGroups[group]
                    ? 'WS2_CJS_ACTUAL_RESET:'
                    : crossTargetGroups[group]
                      ? 'WS2_CROSS_'
                      : cjsResetGroups[group] &&
                          group.startsWith('cjs-reset-nonleaf-')
                        ? 'WS2_CJS_NONLEAF_'
                        : 'WS2_EXTERNAL')
            )
          )
          .map((line) => {
            const index = line.indexOf(':')
            return {
              stream: event.stream,
              prefix: line.slice(0, index),
              value: JSON.parse(line.slice(index + 1)),
            }
          })
      )
    const cases = report.testResults.flatMap((file) => file.assertionResults)
    const actual = {
      pid: child.pid,
      close,
      forced,
      rows,
      cases: cases.map((test) => ({
        name: test.fullName,
        status: test.status,
        failureMessages: test.failureMessages,
      })),
      diagnostics: report.next.events.filter(
        (event) =>
          event.type === 'diagnostic' && event.diagnostic.severity === 'error'
      ),
    }
    process.stdout.write(
      JSON.stringify({
        ...actual,
        diagnostics: actual.diagnostics.map(({ diagnostic }) => ({
          phase: diagnostic.phase,
          severity: diagnostic.severity,
          name: diagnostic.name,
          message: diagnostic.message.split('\n')[0],
        })),
      }) + '\n'
    )
    assert.deepEqual(close, { code: 0, signal: null })
    assert.equal(forced, false)
    assert.equal(report.success, true)
    assert.equal(report.numTotalTests, expectedCount)
    assert.equal(report.numPassedTests, expectedCount)
    assert.equal(report.numFailedTests, 0)
    assert.equal(report.numPendingTests, 0)
    assert.equal(report.numTodoTests, 0)
    assert.deepEqual(actual.diagnostics, [])
    for (const [target, digest] of pins) {
      assert.equal(
        createHash('sha256').update(fs.readFileSync(target)).digest('hex'),
        digest
      )
    }
    assert.deepEqual(
      actual.cases,
      JSON.parse(
        fs.readFileSync(path.join(source, 'pristine-cases.json'), 'utf8')
      )
    )
    assert.deepEqual(
      cases.map((test) => test.status),
      Array(expectedCount).fill('passed')
    )
    assert.deepEqual(
      cases.map((test) => test.failureMessages),
      Array.from({ length: expectedCount }, () => [])
    )
    const versionedGolden = `pristine-rows-node${Number(process.versions.node.split('.')[0])}.json`
    assert.deepEqual(
      rows,
      JSON.parse(
        fs.readFileSync(
          path.join(
            source,
            fs.existsSync(path.join(source, versionedGolden))
              ? versionedGolden
              : 'pristine-rows.json'
          ),
          'utf8'
        )
      )
    )
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
