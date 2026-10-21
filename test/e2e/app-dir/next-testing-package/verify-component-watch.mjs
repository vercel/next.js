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
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from './process-supervisor.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify-component-watch.mjs <installed-consumer> <new-evidence-dir>'
)
const consumer = realpathSync(consumerArg)
const output = resolve(outputArg)
mkdirSync(output)
const directory = dirname(fileURLToPath(import.meta.url))
const corpus = resolve(
  directory,
  '../../../unit/next-testing-browser-resources/fixtures'
)
const expected = JSON.parse(
  readFileSync(join(directory, 'component-watch.expected.json'), 'utf8')
)
const require = createRequire(join(consumer, 'package.json'))
const versions = {}
for (const name of [
  'next',
  'playwright',
  'react',
  'react-dom',
  'vitest-browser-react',
]) {
  const path = realpathSync(require.resolve(`${name}/package.json`))
  const installed = relative(join(consumer, 'node_modules'), path)
  assert(
    !isAbsolute(installed) &&
      installed !== '..' &&
      !installed.startsWith('..' + sep),
    `${name} must resolve from the physical consumer installation`
  )
  versions[name] = JSON.parse(readFileSync(path, 'utf8')).version
}
for (const name of ['vitest', 'vite'])
  assert.throws(() => require.resolve(name), `${name} must not be installed`)
const fixture = join(consumer, `.next-test-component-watch-${randomUUID()}`)
mkdirSync(fixture)
mkdirSync(join(fixture, 'app'))
const digest = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex')
const sources = {}
for (const [source, target] of [
  ['component-watch/watch.test.mjs.txt', 'watch.test.mjs'],
  ['component-watch/label.mjs.txt', 'label.mjs'],
  ['component-watch/control.mjs.txt', 'control.mjs'],
  ['react-rendering/Counter.jsx.txt', 'Counter.jsx'],
  ['react-rendering/counter.module.css.txt', 'counter.module.css'],
]) {
  copyFileSync(join(corpus, source), join(fixture, target))
  sources[target] = digest(join(fixture, target))
}
writeFileSync(
  join(fixture, 'package.json'),
  '{"private":true,"type":"module"}\n'
)
writeFileSync(join(fixture, 'next.config.mjs'), 'export default {}\n')
writeFileSync(
  join(fixture, 'app/layout.jsx'),
  "import React from 'react';export default function Layout({children}) { return <html><body>{children}</body></html> }\n"
)
writeFileSync(
  join(fixture, 'app/page.jsx'),
  'export default function Page() { return <p>Watch</p> }\n'
)
writeFileSync(
  join(fixture, 'next.test.config.json'),
  JSON.stringify({
    maxWorkers: 1,
    projects: [
      {
        name: 'client-watch',
        mode: 'development',
        testTimeout: 5000,
        hookTimeout: 5000,
        fileTimeout: 30000,
        include: ['*.test.mjs'],
        browser: { enabled: true, viewport: { width: 640, height: 480 } },
      },
    ],
  })
)
const save = (name, value) =>
  writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n')
save('inputs.json', {
  runtime: process.version,
  versions,
  sources,
  reference: expected.reference,
})

// A passive Node IPC observer detects the existing browser output event while
// the case is pending. It preserves every message, callback and return value.
const observer = join(output, 'active-observer.cjs')
const active = join(output, 'active.json')
writeFileSync(
  observer,
  `const fs = require('node:fs');
const original = process.send;
if (typeof original === 'function') process.send = function (...args) {
  try {
    if (JSON.stringify(args[0]).includes('CLIENT_WATCH_ACTIVE '))
      fs.writeFileSync(${JSON.stringify(active)}, JSON.stringify({ active: true, pid: process.pid }));
  } catch {}
  return Reflect.apply(original, this, args);
};\n`
)
const env = {
  ...process.env,
  NODE_ENV: 'development',
  NEXT_TELEMETRY_DISABLED: '1',
}
for (const key of [
  'NODE_OPTIONS',
  'NODE_PATH',
  'NEXT_TEST_NATIVE_DIR',
  'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
])
  delete env[key]
env.NODE_OPTIONS = `--require=${JSON.stringify(observer)}`
const reportFile = join(output, 'report.live.json')
const auditDir = join(output, 'processes')
const args = [
  require.resolve('next/dist/bin/next'),
  'test',
  fixture,
  '--watch',
  '--reporter',
  'json',
  '--outputFile',
  reportFile,
]
let completed
const running = runOwnedNode(args, {
  cwd: consumer,
  env,
  auditDir,
  timeoutMs: 120000,
}).then((result) => {
  completed = result
  return result
})
function cliPID() {
  const path = join(auditDir, 'starts.jsonl')
  if (!existsSync(path)) return undefined
  for (const line of readFileSync(path, 'utf8').split('\n').slice(0, -1)) {
    const event = JSON.parse(line)
    if (event.type === 'start' && event.ppid === process.pid) return event.pid
  }
}
async function until(read, budget) {
  const deadline = Date.now() + budget
  while (Date.now() < deadline) {
    const value = read()
    if (value !== undefined) return value
    assert(!completed, 'Watch CLI exited before the expected observation')
    await delay(25)
  }
  throw new Error('Component watch observation exceeded its deadline')
}
function readGeneration(previous) {
  try {
    const bytes = readFileSync(reportFile)
    const hash = createHash('sha256').update(bytes).digest('hex')
    if (hash === previous) return undefined
    const report = JSON.parse(bytes)
    if (report.numPassedTests !== 1 || report.numFailedTests !== 0)
      return undefined
    const cases = report.testResults.flatMap((file) =>
      file.assertionResults.map(({ fullName, status, failureMessages }) => ({
        fullName,
        status,
        failureMessages,
      }))
    )
    assert.deepEqual(cases, expected.cases)
    const rows = report.next.events
      .filter((event) => event.type === 'output')
      .flatMap((event) =>
        event.text
          .split('\n')
          .filter((line) => line.startsWith('CLIENT_WATCH_RAW '))
          .map((line) => JSON.parse(line.slice('CLIENT_WATCH_RAW '.length)))
      )
    assert.equal(rows.length, 1)
    return { hash, report, row: rows[0] }
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError)
      return undefined
    throw error
  }
}
let pid
let failure
const observations = []
try {
  pid = await until(cliPID, 20000)
  let previous
  for (let index = 0; index < expected.rows.length; index++) {
    const previousGeneration = previous
    const generation = await until(
      () => readGeneration(previousGeneration),
      45000
    )
    previous = generation.hash
    save(`generation${index + 1}.report.json`, generation.report)
    assert.deepEqual(generation.row, expected.rows[index])
    observations.push(generation.row)
    for (const name of ['watch.test.mjs', 'Counter.jsx'])
      assert.equal(digest(join(fixture, name)), sources[name])
    if (index === 0)
      writeFileSync(join(fixture, 'label.mjs'), "export const label = 'two'\n")
    if (index === 1)
      writeFileSync(
        join(fixture, 'counter.module.css'),
        '.counter { color: rgb(67, 45, 23); }\n'
      )
  }
  writeFileSync(join(fixture, 'control.mjs'), 'export const hold = true\n')
  await until(() => (existsSync(active) ? true : undefined), 20000)
  save('active-observed.json', {
    active: true,
    bodyUnchanged:
      digest(join(fixture, 'watch.test.mjs')) === sources['watch.test.mjs'],
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
writeFileSync(join(output, 'stdout.log'), result.stdout)
writeFileSync(join(output, 'stderr.log'), result.stderr)
save('command.json', { args, status: result.status })
save('observations.json', observations)
assertOwnedNodeCompleted(result, 'installed component watch')
assert.equal(result.status, 130)
rmSync(fixture, { recursive: true })
if (failure) throw failure
save('verification.json', {
  completedGenerations: 3,
  fullRows: 3,
  exactReferenceMatch: true,
  activeRenderCancelled: true,
  fixtureRemoved: true,
})
console.log(
  'Installed component watch: 3 full rows match, active render cancelled cleanly'
)
