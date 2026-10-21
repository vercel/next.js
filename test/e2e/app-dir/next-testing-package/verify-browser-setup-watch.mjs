import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify-browser-setup-watch.mjs <installed-consumer> <new-evidence-dir>'
)
const consumer = realpathSync(consumerArg)
const output = resolve(outputArg)
mkdirSync(output)
const require = createRequire(join(consumer, 'package.json'))
const nextRoot = dirname(require.resolve('next/package.json'))
for (const name of ['next', 'playwright', 'react', 'react-dom'])
  assert(
    realpathSync(require.resolve(`${name}/package.json`)).startsWith(
      join(consumer, 'node_modules') + '/'
    )
  )
for (const name of ['vitest', 'vite'])
  assert.throws(() => require.resolve(name), `${name} must not be installed`)
const directory = dirname(fileURLToPath(import.meta.url))
const resources = resolve(
  directory,
  '../../../unit/next-testing-browser-resources/fixtures'
)
const expected = JSON.parse(
  readFileSync(join(directory, 'browser-setup-watch.expected.json'), 'utf8')
)
const digest = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
const save = (dir, name, value) =>
  writeFileSync(join(dir, name), JSON.stringify(value, null, 2) + '\n')

for (const mode of ['development', 'production']) {
  const evidence = join(output, mode)
  mkdirSync(evidence)
  const fixture = join(
    consumer,
    '.next-test-browser-setup-watch-' + randomUUID()
  )
  mkdirSync(fixture)
  mkdirSync(join(fixture, 'app'))
  mkdirSync(join(fixture, 'node_modules/next-test-production-target'), {
    recursive: true,
  })
  const sources = expected.reference.sourceSHA256
  for (const [file, hash] of Object.entries(sources)) {
    copyFileSync(
      join(resources, 'setup-watch', `${file}.txt`),
      join(fixture, file)
    )
    assert.equal(digest(join(fixture, file)), hash)
  }
  const bodySources = Object.fromEntries(
    Object.entries(sources).filter(
      ([file]) =>
        !['setup-label.mjs', 'setup.css', 'control.mjs'].includes(file)
    )
  )
  for (const file of [
    'package.json',
    'browser-production.mjs',
    'browser-development.mjs',
    'browser-default.mjs',
    'node.mjs',
    'other.mjs',
  ])
    copyFileSync(
      join(
        resources,
        'production-mode/conditional-target',
        `${file}${file.endsWith('.mjs') ? '.txt' : ''}`
      ),
      join(fixture, 'node_modules/next-test-production-target', file)
    )
  writeFileSync(join(fixture, 'next.config.mjs'), 'export default {}\n')
  writeFileSync(
    join(fixture, 'app/layout.jsx'),
    'export default function Layout({children}){return <html><body>{children}</body></html>}\n'
  )
  writeFileSync(
    join(fixture, 'app/page.jsx'),
    'export default function Page(){return <p>Setup watch</p>}\n'
  )
  writeFileSync(
    join(fixture, 'next.test.config.json'),
    JSON.stringify({
      maxWorkers: 1,
      projects: [
        {
          name: 'browser-setup-watch',
          mode,
          include: ['a.test.mjs'],
          setupFiles: ['setup-one.mjs', 'setup-two.mjs'],
          sequence: { setupFiles: 'list' },
          fileTimeout: 60000,
          testTimeout: 5000,
          hookTimeout: 5000,
          browser: { enabled: true, viewport: { width: 640, height: 480 } },
        },
      ],
    }) + '\n'
  )
  const active = join(evidence, 'active.json')
  const descriptors = join(evidence, 'descriptors.jsonl')
  const observer = join(evidence, 'observer.cjs')
  writeFileSync(
    observer,
    String.raw`
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const original = process.send
if (typeof original === 'function') process.send = function (...args) {
  try {
    const message = args[0]
    if (JSON.stringify(message).includes('BROWSER_SETUP_WATCH_ACTIVE '))
      fs.writeFileSync(process.env.NEXT_BROWSER_SETUP_ACTIVE_LOG, JSON.stringify({ active: true, pid: process.pid }))
    if (message?.type === 'execution-broker-request' && message.action === 'execute' && message.artifact?.profile?.browserClient) {
      const artifact = message.artifact
      const bytes = fs.readFileSync(path.join(artifact.rootDir, artifact.entryPath))
      const descriptor = JSON.parse(bytes)
      const hashes = files => files.map(file => ({ path: file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(artifact.rootDir, file))).digest('hex') }))
      fs.appendFileSync(process.env.NEXT_BROWSER_SETUP_DESCRIPTOR_LOG, JSON.stringify({
        entryId: artifact.entryId, revision: artifact.revision, rootDir: artifact.rootDir,
        entryPath: artifact.entryPath, profile: artifact.profile, setupFiles: artifact.setupFiles,
        descriptorSha256: crypto.createHash('sha256').update(bytes).digest('hex'), descriptor,
        scripts: hashes(descriptor.scripts), styles: hashes(descriptor.styles), files: artifact.files,
      }) + '\n')
    }
  } catch (error) {
    fs.appendFileSync(process.env.NEXT_BROWSER_SETUP_DESCRIPTOR_LOG + '.errors', String(error) + '\n')
  }
  return Reflect.apply(original, this, args)
}
`
  )
  const env = {
    ...process.env,
    NODE_ENV: mode,
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
    NODE_OPTIONS: '--require=' + observer,
    NEXT_BROWSER_SETUP_ACTIVE_LOG: active,
    NEXT_BROWSER_SETUP_DESCRIPTOR_LOG: descriptors,
  }
  for (const key of [
    'CI',
    'NODE_PATH',
    'NEXT_TEST_NATIVE_DIR',
    'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
  ])
    delete env[key]
  const reportPath = join(evidence, 'report.live.json')
  const args = [
    join(nextRoot, 'dist/bin/next'),
    'test',
    fixture,
    '--watch',
    '--reporter=json',
    '--outputFile',
    reportPath,
  ]
  save(evidence, 'inputs.json', {
    mode,
    fixture,
    consumer,
    runtime: process.version,
    next: realpathSync(nextRoot),
    sources,
    reference: expected.reference,
  })
  let completed = false
  let failure
  let pid
  const observations = []
  const running = runOwnedNode(args, {
    cwd: fixture,
    env,
    auditDir: join(evidence, 'processes'),
    timeoutMs: 180000,
  }).then((result) => {
    completed = true
    return result
  })
  const until = async (read, timeout = 25000) => {
    const deadline = performance.now() + timeout
    while (performance.now() < deadline) {
      const value = read()
      if (value !== undefined) return value
      assert(!completed, 'Owned watch ended before the observation')
      await delay(50)
    }
    throw new Error('Timed out waiting for Browser setup watch observation')
  }
  const cliPID = () => {
    const file = join(evidence, 'processes/starts.jsonl')
    if (!existsSync(file)) return undefined
    return readFileSync(file, 'utf8')
      .split('\n')
      .slice(0, -1)
      .map((line) => JSON.parse(line))
      .find((event) => event.type === 'start' && event.ppid === process.pid)
      ?.pid
  }
  const generation = (previous) => {
    if (!existsSync(reportPath)) return undefined
    let report
    try {
      report = JSON.parse(readFileSync(reportPath, 'utf8'))
    } catch (error) {
      if (error instanceof SyntaxError) return undefined
      throw error
    }
    const sha256 = digest(reportPath)
    if (
      sha256 === previous ||
      report.numTotalTests !== 2 ||
      report.numPassedTests !== 2
    )
      return undefined
    const cases = report.testResults.flatMap((file) =>
      file.assertionResults.map(({ fullName, status, failureMessages }) => ({
        fullName,
        status,
        failureMessages,
      }))
    )
    const rows = report.next.events
      .filter((event) => event.type === 'output')
      .flatMap((event) => event.text.split('\n'))
      .filter((line) =>
        /^(BROWSER_SETUP_WATCH_CASE|BROWSER_SETUP_WATCH_FILE) /.test(line)
      )
      .map((line) => ({
        kind: line.slice(0, line.indexOf(' ')),
        row: JSON.parse(line.slice(line.indexOf(' ') + 1)),
      }))
    if (rows.length !== 3) return undefined
    return { sha256, report, cases, rows }
  }
  const assertBodies = () => {
    for (const [file, hash] of Object.entries(bodySources))
      assert.equal(
        digest(join(fixture, file)),
        hash,
        `Authored body changed: ${file}`
      )
  }
  try {
    pid = await until(cliPID)
    let previous
    for (let index = 0; index < 3; index++) {
      const before = previous
      const value = await until(() => generation(before))
      previous = value.sha256
      save(evidence, `generation${index + 1}.report.json`, value.report)
      save(evidence, `generation${index + 1}.cases.json`, value.cases)
      save(evidence, `generation${index + 1}.rows.json`, value.rows)
      assert.deepEqual(
        value.cases,
        expected.modes[mode].generations[index].cases
      )
      assert.deepEqual(value.rows, expected.modes[mode].generations[index].rows)
      assertBodies()
      observations.push({ cases: value.cases, rows: value.rows })
      if (index === 0)
        writeFileSync(
          join(fixture, 'setup-label.mjs'),
          "export const label = 'two'\n"
        )
      if (index === 1)
        writeFileSync(
          join(fixture, 'setup.css'),
          '#setup-button { color: rgb(67, 45, 23); }\n'
        )
    }
    writeFileSync(join(fixture, 'control.mjs'), 'export const hold = true\n')
    await until(() => (existsSync(active) ? true : undefined))
    assertBodies()
    save(evidence, 'active-observed.json', {
      active: true,
      bodySourcesHeld: true,
    })
  } catch (error) {
    failure = error
  } finally {
    pid ??= cliPID()
    if (pid && !completed) {
      try {
        process.kill(pid, 'SIGINT')
      } catch (error) {
        if (error.code !== 'ESRCH') failure ??= error
      }
    }
  }
  const result = await running
  writeFileSync(join(evidence, 'stdout.log'), result.stdout)
  writeFileSync(join(evidence, 'stderr.log'), result.stderr)
  save(evidence, 'command.json', { args, status: result.status })
  save(evidence, 'observations.json', observations)
  try {
    assertOwnedNodeCompleted(result, 'installed Browser setup watch ' + mode)
    assert.equal(result.status, 130)
    if (failure) throw failure
    assert(!existsSync(descriptors + '.errors'))
    const artifacts = readFileSync(descriptors, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    const rootChecks = artifacts.map((artifact) => ({
      rootDir: artifact.rootDir,
      removed: !existsSync(artifact.rootDir),
    }))
    save(evidence, 'artifact-cleanup.json', rootChecks)
    assert.equal(artifacts.length, 4)
    assert.equal(
      new Set(artifacts.map((artifact) => artifact.revision)).size,
      4
    )
    assert.equal(new Set(artifacts.map((artifact) => artifact.rootDir)).size, 4)
    for (const [index, artifact] of artifacts.entries()) {
      assert.deepEqual(artifact.profile, {
        id: 'browser-setup-watch',
        environment: 'browser',
        mode,
        runtime: 'nodejs',
        bundler: 'turbopack',
        browserClient: true,
      })
      assert.deepEqual(
        artifact.setupFiles,
        ['setup-one.mjs', 'setup-two.mjs'].map((file) => join(fixture, file))
      )
      assert(artifact.files.includes(artifact.entryPath))
      for (const asset of [...artifact.scripts, ...artifact.styles])
        assert(artifact.files.includes(asset.path))
      assert(artifact.styles.length > 0)
      assert(rootChecks[index].removed)
      if (mode === 'production')
        assert(
          artifact.descriptor.scripts.some((file) =>
            file.endsWith('.bootstrap.js')
          )
        )
      if (index < 3) {
        const report = JSON.parse(
          readFileSync(
            join(evidence, `generation${index + 1}.report.json`),
            'utf8'
          )
        )
        assert.equal(
          report.next.events.find((event) => event.type === 'file-start')
            .revision,
          artifact.revision
        )
      }
    }
    assert.notDeepEqual(
      artifacts[0].scripts.map((asset) => asset.sha256),
      artifacts[1].scripts.map((asset) => asset.sha256)
    )
    assert.notDeepEqual(
      artifacts[1].styles.map((asset) => asset.sha256),
      artifacts[2].styles.map((asset) => asset.sha256)
    )
    if (mode === 'production') {
      assert.notEqual(
        artifacts[0].descriptorSha256,
        artifacts[1].descriptorSha256
      )
      assert.notDeepEqual(
        artifacts[1].descriptor.styles,
        artifacts[2].descriptor.styles
      )
    }
    save(evidence, 'artifact-verification.json', {
      ownedArtifacts: 4,
      distinctRevisions: 4,
      distinctRoots: 4,
      orderedSetupInputs: 4,
      reportOwnersMatched: 3,
      setupDependencyJsBytesChanged: true,
      setupCssBytesChanged: true,
      allArtifactRootsRemoved: true,
    })
    save(evidence, 'verification.json', {
      completedGenerations: 3,
      cases: 6,
      fullRows: 9,
      exactReferenceMatch: true,
      activeCancellation: true,
    })
  } finally {
    assertBodies()
    rmSync(fixture, { recursive: true })
    save(evidence, 'closed.json', {
      fixtureRemoved: true,
      bodySourcesHeld: true,
    })
  }
}
save(output, 'verification.json', {
  modes: 2,
  completedGenerations: 6,
  cases: 12,
  fullRows: 18,
  exactReferenceMatch: true,
  ownedArtifacts: 8,
  activeCancellations: 2,
  allArtifactRootsRemoved: true,
})
console.log(
  'Installed Browser setup watch: 6 generations, 12 cases and 18 full rows match; 8 artifact owners and 2 active cancellations close'
)
