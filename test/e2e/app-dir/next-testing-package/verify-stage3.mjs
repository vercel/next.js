import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  copyFileSync,
  existsSync,
  cpSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { delimiter, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { assertBrowserArtifacts } from './browser-artifact-verifier.mjs'
import {
  readResultEvents,
  assertSuccessfulRun,
} from './result-event-verifier.mjs'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'

// Run a single accepted increment without rerunning other expensive profiles.
const [preparedArg, outputArg, phase, expectedCoverageArg] =
  process.argv.slice(2)
assert(
  preparedArg &&
    outputArg &&
    [
      'production',
      'production-node',
      'production-rsc',
      'production-browser',
      'mounting',
      'coverage',
    ].includes(phase),
  'Usage: node verify-stage3.mjs <prepared-package-dir> <new-evidence-dir> <production-node|production-rsc|production-browser|production|mounting|coverage> [reviewed-coverage-expectations.json]'
)
const browserPhase = phase === 'production-browser' || phase === 'mounting'
const phaseDirectory =
  phase === 'coverage'
    ? 'line-coverage'
    : phase.startsWith('production')
      ? 'production'
      : phase
const configPhase = phase.startsWith('production') ? 'production' : phase
assert(
  phase !== 'coverage' || expectedCoverageArg,
  'Coverage requires independently reviewed exact line expectations'
)
const fixture = dirname(fileURLToPath(import.meta.url))
const preparedDir = realpathSync(preparedArg)
const prepared = JSON.parse(
  readFileSync(join(preparedDir, 'prepared.json'), 'utf8')
)
const consumer = realpathSync(prepared.consumer)
assert.equal(consumer, realpathSync(join(preparedDir, 'consumer')))
const output = resolve(outputArg)
mkdirSync(output)
const digest = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex')
const save = (name, value) =>
  writeFileSync(join(output, name), JSON.stringify(value, null, 2))
const runtime = {
  version: process.version,
  executable: realpathSync(process.execPath),
  executableSha256: digest(realpathSync(process.execPath)),
}
assert.deepEqual(
  runtime,
  prepared.runtime,
  'Consumer runtime changed after immutable installation'
)
save('runtime.json', runtime)
for (const [file, hash] of Object.entries(prepared.manifests))
  assert.equal(digest(join(preparedDir, file)), hash)
const archive = JSON.parse(
  readFileSync(join(preparedDir, 'archive-verification.json'), 'utf8')
)
function inventory(root, directory = root, result = {}) {
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name)
    const stat = lstatSync(path)
    assert(!stat.isSymbolicLink(), `Unexpected package symlink: ${path}`)
    if (stat.isDirectory()) inventory(root, path, result)
    else {
      assert(stat.isFile())
      result[relative(root, path)] = digest(path)
    }
  }
  return result
}
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
for (const key of [
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_ENV',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[key]
const commands = []
async function run(name, args, extraEnv = {}, expectedStatus = 0) {
  const result = await runOwnedNode(args, {
    cwd: consumer,
    env: { ...env, ...extraEnv },
    auditDir: join(output, `processes-${name}`),
    timeoutMs: 300000,
  })
  const log = result.stdout + result.stderr
  writeFileSync(join(output, `${name}.log`), log)
  commands.push({
    name,
    executable: process.execPath,
    args,
    cwd: consumer,
    status: result.status,
    nodeVersion: process.version,
    expectedStatus,
  })
  save('commands.json', commands)
  assertOwnedNodeCompleted(result, name)
  assert.equal(result.status, expectedStatus, `${name}: see retained log`)
  return { stdout: result.stdout, log: stripVTControlCharacters(log) }
}
const require = createRequire(join(consumer, 'package.json'))
if (browserPhase) {
  const npmExecutable = (process.env.PATH ?? '')
    .split(delimiter)
    .map((directory) => join(directory, 'npm'))
    .find((file) => existsSync(file))
  assert(npmExecutable, 'npm must be on PATH')
  const npmCli = realpathSync(npmExecutable)
  assert(npmCli.endsWith('/npm-cli.js'))
  const artifact = prepared.artifacts['@next/playwright']
  assert.equal(digest(artifact.path), artifact.sha256)
  await run('browser-dependencies', [
    npmCli,
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    'playwright@1.61.0',
    `file:${artifact.path}`,
  ])
} else {
  for (const name of ['playwright', '@next/playwright'])
    assert.throws(
      () => require.resolve(name),
      `${phase} must run before browser dependencies are installed`
    )
}
const installed = {}
for (const [name, expected] of Object.entries(archive.packages)) {
  if (name === '@next/playwright' && !browserPhase) continue
  const root = realpathSync(join(consumer, 'node_modules', name))
  assert(root.startsWith(consumer + '/'))
  installed[name] = inventory(root)
  assert.deepEqual(
    installed[name],
    expected.files,
    `Installed bytes changed: ${name}`
  )
}
save('installed-files.json', installed)
for (const name of ['vitest', 'vite'])
  assert.throws(() => require.resolve(name))
const native = realpathSync(require.resolve('@next/swc-darwin-arm64'))
assert.equal(native, prepared.native.path)
assert.equal(digest(native), prepared.native.sha256)
const cli = realpathSync(require.resolve('next/dist/bin/next'))
assert(cli.startsWith(consumer + '/'))
for (const file of [
  'app',
  'next.config.js',
  phaseDirectory,
  `tsconfig.${phase}.json`,
]) {
  cpSync(join(fixture, file), join(consumer, file), { recursive: true })
}
if (phase === 'mounting') {
  copyFileSync(
    join(fixture, 'next.mounting.config.js'),
    join(consumer, 'next.config.js')
  )
}
copyFileSync(
  join(fixture, `next.test.${configPhase}.json`),
  join(consumer, 'next.test.config.json')
)
const authored = {}
for (const directory of ['app', phaseDirectory])
  Object.assign(
    authored,
    Object.fromEntries(
      Object.entries(inventory(join(consumer, directory))).map(
        ([file, hash]) => [`${directory}/${file}`, hash]
      )
    )
  )
for (const file of [
  'next.config.js',
  'next.test.config.json',
  `tsconfig.${phase}.json`,
])
  authored[file] = digest(join(consumer, file))
save('consumer-source.json', authored)
let coverageExpectations
if (phase === 'coverage') {
  coverageExpectations = JSON.parse(readFileSync(expectedCoverageArg, 'utf8'))
  assert.deepEqual(Object.keys(coverageExpectations.files).sort(), [
    'line-coverage/label.ts',
    'line-coverage/price.ts',
  ])
  for (const [file, expected] of Object.entries(coverageExpectations.files)) {
    assert.equal(
      authored[file],
      expected.sha256,
      `Reviewed source identity: ${file}`
    )
    for (const lines of [expected.executableLines, expected.coveredLines]) {
      assert(lines.every((line) => Number.isInteger(line) && line > 0))
      assert.deepEqual(
        lines,
        [...new Set(lines)].sort((a, b) => a - b)
      )
    }
    assert(
      expected.coveredLines.every((line) =>
        expected.executableLines.includes(line)
      )
    )
  }
}
const config = `tsconfig.${phase}.json`
const expectedFiles = {
  'production-node': [
    'production/node-js.case.js',
    'production/node-ts.case.ts',
    'production/subject.ts',
  ],
  'production-rsc': [
    'production/rsc.case.tsx',
    'production/server-subject.tsx',
  ],
  production: [
    'production/node-js.case.js',
    'production/node-ts.case.ts',
    'production/subject.ts',
    'production/rsc.case.tsx',
    'production/server-subject.tsx',
  ],
  'production-browser': ['production/browser.case.ts'],
  mounting: [
    'mounting/counter.tsx',
    'mounting/fixture.tsx',
    'mounting/mount-js.case.js',
    'mounting/mount-ts.case.ts',
    'mounting/unsupported-js.types.js',
    'mounting/unsupported-ts.types.ts',
  ],
  coverage: [
    'line-coverage/first.case.ts',
    'line-coverage/retry.case.js',
    'line-coverage/price.ts',
    'line-coverage/label.ts',
  ],
}[phase]
const publicEntries = [
  'vitest',
  ...(browserPhase ? ['browser'] : []),
  ...(phase === 'production' || phase === 'production-rsc' ? ['rsc'] : []),
]
for (const resolution of ['bundler', 'node16']) {
  const args = [
    require.resolve('typescript/bin/tsc'),
    '-p',
    config,
    '--moduleResolution',
    resolution,
    '--module',
    resolution === 'bundler' ? 'esnext' : 'node16',
  ]
  const shown = await run(`type-config-${resolution}`, [
    ...args,
    '--showConfig',
  ])
  const actualConfig = JSON.parse(shown.stdout)
  for (const flag of ['strict', 'allowJs', 'checkJs', 'noEmit'])
    assert.equal(actualConfig.compilerOptions[flag], true)
  assert.equal(actualConfig.compilerOptions.skipLibCheck, false)
  assert.equal(actualConfig.compilerOptions.paths, undefined)
  assert.equal(actualConfig.compilerOptions.baseUrl, undefined)
  const { stdout } = await run(`types-${resolution}`, [...args, '--listFiles'])
  const included = stdout
    .trim()
    .split(/\r?\n/)
    .map((file) => realpathSync(file))
  for (const file of expectedFiles)
    assert(
      included.includes(realpathSync(join(consumer, file))),
      `Missing authoring input: ${file}`
    )
  const declarations = publicEntries.map((entry) =>
    realpathSync(require.resolve(`next/experimental/testing/${entry}.d.ts`))
  )
  for (const file of declarations)
    assert(included.includes(file), `Missing public declaration: ${file}`)
  assert(
    included.every((file) => file.startsWith(consumer + '/')),
    'TypeScript resolved outside the clean consumer'
  )
  save(`type-inputs-${resolution}.json`, {
    expectedFiles,
    declarations,
    included,
    compilerOptions: actualConfig.compilerOptions,
  })
}
const audit = join(output, 'audit-native.cjs')
writeFileSync(
  audit,
  `const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const original = process.dlopen;
process.dlopen = function(module, filename, ...rest) {
  if (String(filename).includes('swc') && String(filename).endsWith('.node')) {
    assert.equal(process.version, ${JSON.stringify(runtime.version)});
    assert.equal(fs.realpathSync(process.execPath), ${JSON.stringify(runtime.executable)});
    const path = fs.realpathSync(filename);
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
    assert.equal(path, ${JSON.stringify(native)});
    assert.equal(sha256, ${JSON.stringify(prepared.native.sha256)});
    fs.appendFileSync(process.env.PACKED_NATIVE_AUDIT, JSON.stringify({pid:process.pid,path,sha256,nodeVersion:process.version,nodeExecutable:fs.realpathSync(process.execPath)})+'\\n');
  }
  return original.call(this, module, filename, ...rest);
};\n`
)
const projects =
  phase === 'production'
    ? [
        ['production-node', 2],
        ['production-rsc', 1],
      ]
    : [
        [
          phase,
          phase === 'production-browser' || phase === 'production-rsc' ? 1 : 2,
        ],
      ]
if (browserPhase)
  await run('chromium-install', [
    join(dirname(require.resolve('playwright/package.json')), 'cli.js'),
    'install',
    'chromium',
  ])
const artifacts = []
for (const [project, expectedCases] of projects) {
  const auditLog = join(output, `native-${project}.jsonl`)
  const eventLog = join(output, `events-${project}.jsonl`)
  const { log } = await run(
    project,
    [
      cli,
      'test',
      '.',
      '--run',
      '--project',
      project,
      ...(phase === 'coverage' ? ['--coverage'] : []),
    ],
    {
      NODE_OPTIONS: `--import=${JSON.stringify(pathToFileURL(join(fixture, 'result-events.cjs')).href)} --import=${JSON.stringify(pathToFileURL(audit).href)}`,
      PACKED_NATIVE_AUDIT: auditLog,
      NEXT_TEST_EVENT_AUDIT: eventLog,
    }
  )
  assert.doesNotMatch(
    log,
    /\bFATAL\b|unexpected Turbopack error|TurbopackInternalError|Expected [`'"]?telemetry[`'"]? to be set in globals|\bpanicked at\b|UnhandledPromiseRejection|uncaughtException|segmentation fault|abort trap|out of memory/i
  )
  const events = readResultEvents(eventLog)
  if (phase === 'coverage') {
    const attempts = events.filter((event) => event.type === 'case-end')
    const entries = new Map(
      events
        .filter((event) => event.type === 'file-start')
        .map((event) => [event.entry.id, event.entry])
    )
    assert.deepEqual(
      attempts.map((event) => ({
        status: event.status.toUpperCase(),
        name: event.name,
        file: relative(consumer, realpathSync(entries.get(event.entryId).file)),
        retry: event.attempt.retry,
        repeat: event.attempt.repeat,
      })),
      [
        {
          status: 'PASSED',
          name: 'covers the regular price in the first worker',
          file: 'line-coverage/first.case.ts',
          retry: 0,
          repeat: 0,
        },
        {
          status: 'FAILED',
          name: 'merges coverage from a retry and a second worker',
          file: 'line-coverage/retry.case.js',
          retry: 0,
          repeat: 0,
        },
        {
          status: 'PASSED',
          name: 'merges coverage from a retry and a second worker',
          file: 'line-coverage/retry.case.js',
          retry: 1,
          repeat: 0,
        },
      ]
    )
    assert.equal(
      attempts[1].caseId,
      attempts[2].caseId,
      'Retry must retain its case identity'
    )
    assert.notEqual(
      attempts[1].attempt.id,
      attempts[2].attempt.id,
      'Retry must have a fresh attempt identity'
    )
    const diagnostics = attempts.flatMap((event) => event.errors)
    assert.equal(diagnostics.length, 1)
    assert.equal(
      attempts[1].errors[0],
      diagnostics[0],
      'Expected assertion must belong to the failed first attempt'
    )
    assert.deepEqual(
      diagnostics.map(({ phase, severity, name, message }) => ({
        phase,
        severity,
        name,
        message,
      })),
      [
        {
          phase: 'runtime',
          severity: 'error',
          name: 'AssertionError',
          message: 'expected 1 to be 2 // Object.is equality',
        },
      ]
    )
    const diagnostic = diagnostics[0]
    const locations = [
      diagnostic.location,
      ...(diagnostic.frames ?? []),
    ].filter(Boolean)
    assert(
      locations.some(
        (location) =>
          location.file.endsWith('/line-coverage/retry.case.js') &&
          location.line === 11 &&
          location.column === 19
      ) || /line-coverage\/retry\.case\.js:11:19/.test(diagnostic.stack ?? ''),
      'Expected failed retry must retain its original source attribution'
    )
  }
  assertSuccessfulRun(events, {
    cases: expectedCases,
    errors: phase === 'coverage' ? 1 : 0,
  })
  const loads = readFileSync(auditLog, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  assert(loads.length > 0, 'Actual installed native load required')
  for (const load of loads) {
    assert.equal(load.nodeVersion, runtime.version)
    assert.equal(load.nodeExecutable, runtime.executable)
    assert.equal(load.path, native)
    assert.equal(load.sha256, prepared.native.sha256)
  }
  if (project === 'mounting' || project === 'production-browser') {
    const expected =
      project === 'mounting'
        ? new Map([
            [
              'JavaScript mounts a registered server fixture and hydrates its client',
              'mounting/mount-js.case.js',
            ],
            [
              'TypeScript mounts a registered server fixture and hydrates its client',
              'mounting/mount-ts.case.ts',
            ],
          ])
        : new Map([
            [
              'production driver visits the actual built application',
              'production/browser.case.ts',
            ],
          ])
    assert.equal(expected.size, expectedCases)
    artifacts.push(
      ...assertBrowserArtifacts(events, {
        expected,
        consumer,
        project,
        previousArtifacts: artifacts,
      })
    )
    save('browser-artifacts.json', artifacts)
  }
}
if (phase === 'coverage') {
  const beforeRejectedRun = inventory(join(consumer, phaseDirectory))
  const rejectedTmp = join(output, 'coverage-update-tmp')
  mkdirSync(rejectedTmp)
  const rejectedAudit = join(output, 'native-coverage-update.jsonl')
  const rejected = await run(
    'coverage-update-rejected',
    [
      cli,
      'test',
      '.',
      '--run',
      '--project',
      'coverage',
      '--coverage',
      '--update',
    ],
    {
      NODE_OPTIONS: `--import=${JSON.stringify(pathToFileURL(audit).href)}`,
      PACKED_NATIVE_AUDIT: rejectedAudit,
      TMPDIR: rejectedTmp,
    },
    1
  )
  assert.match(rejected.log, /--coverage cannot be combined with --update\./)
  assert.doesNotMatch(
    rejected.log,
    /^\s*(?:RUN |DEV |Test Files|Tests |[✓❯] )/m
  )
  assert(
    !existsSync(rejectedAudit) || !readFileSync(rejectedAudit, 'utf8').trim(),
    'Unsupported flag combination must reject before native execution'
  )
  assert.deepEqual(
    inventory(join(consumer, phaseDirectory)),
    beforeRejectedRun,
    'Rejected coverage/update command changed source or snapshots'
  )
  assert.deepEqual(
    readdirSync(rejectedTmp),
    [],
    'Rejected coverage/update command wrote output'
  )
  const expectationsPath = realpathSync(expectedCoverageArg)
  copyFileSync(
    expectationsPath,
    join(output, 'reviewed-coverage-expectations.json')
  )
  assert.deepEqual(
    JSON.parse(readFileSync(expectationsPath, 'utf8')),
    coverageExpectations,
    'Reviewed expectations changed during execution'
  )
  const expected = coverageExpectations
  const events = readResultEvents(join(output, 'events-coverage.jsonl'))
  const reports = events.filter(
    (event) =>
      event.type === 'attachment' &&
      event.attachment.kind === 'file' &&
      event.attachment.path.endsWith('/coverage.json')
  )
  assert.equal(
    reports.length,
    1,
    'Exactly one retained JSON coverage report required'
  )
  const reportPath = reports[0].attachment.path
  const report = JSON.parse(readFileSync(reportPath, 'utf8'))
  assert.equal(report.version, 1)
  assert.equal(report.kind, 'node-line')
  assert.equal(report.complete, true)
  assert.deepEqual(report.errors, [])
  assert.equal(report.entries.length, 2)
  assert.equal(new Set(report.entries).size, 2)
  const actual = {}
  for (const file of report.files) {
    const path = realpathSync(file.file)
    assert(
      path.startsWith(consumer + '/'),
      'Coverage escaped original consumer sources'
    )
    const name = relative(consumer, path)
    assert(!Object.hasOwn(actual, name), 'Duplicate original source')
    assert.equal(file.sha256, digest(path), `Coverage source identity: ${name}`)
    actual[name] = {
      sha256: file.sha256,
      executableLines: file.executableLines,
      coveredLines: file.coveredLines,
    }
  }
  assert.deepEqual(
    actual,
    expected.files,
    'Original-source line sets differ from reviewed expectations'
  )
  const executable = report.files.reduce(
    (sum, file) => sum + file.executableLines.length,
    0
  )
  const covered = report.files.reduce(
    (sum, file) => sum + file.coveredLines.length,
    0
  )
  assert.deepEqual(report.totals, {
    executable,
    covered,
    percent: (covered / executable) * 100,
  })
  assert(
    covered > 0 && covered < executable,
    'Both covered and uncovered lines required'
  )
  const textPath = join(dirname(reportPath), 'coverage.txt')
  const text = readFileSync(textPath, 'utf8')
  assert.match(text, /^Next Node line coverage: complete\n/)
  assert(text.includes(`Lines: ${covered}/${executable}`))
  for (const file of report.files)
    assert(
      text.includes(
        `${file.file}: ${file.coveredLines.length}/${file.executableLines.length}`
      )
    )
  copyFileSync(reportPath, join(output, 'coverage.json'))
  copyFileSync(textPath, join(output, 'coverage.txt'))
  save('coverage-evidence.json', {
    reportPath,
    textPath,
    reportSha256: digest(reportPath),
    textSha256: digest(textPath),
    expectedSha256: digest(expectationsPath),
  })
}
save('browser-artifacts.json', artifacts)
save('passed.json', {
  runtime,
  phase,
  browserDependenciesInstalled: browserPhase,
  consumer,
  preparedManifestHashes: prepared.manifests,
  sourceSha256: authored,
  native: prepared.native,
  commands,
  artifacts,
})
console.log(`Installed ${phase} consumer checks passed: ${output}`)
