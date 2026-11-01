import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  assertOwnedNodeCompleted,
  runOwnedNode,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg] = process.argv.slice(2)
assert(
  consumerArg && outputArg,
  'Usage: node verify.mjs <consumer-root> <new-output>'
)
const consumer = realpathSync(consumerArg)
const output = path.resolve(outputArg)
mkdirSync(output)
const body = readFileSync(
  new URL('./watch.test.mjs.txt', import.meta.url),
  'utf8'
)
const reference = JSON.parse(
  readFileSync(new URL('./reference.json', import.meta.url), 'utf8')
)
const load = createRequire(path.join(consumer, 'package.json'))
const bin = load.resolve('next/dist/bin/next')
const sha = (value) => createHash('sha256').update(value).digest('hex')
const save = (file, value) =>
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n')
assert.equal(sha(body), reference.bodySHA256)
const plans = [
  {
    name: 'configured-watch-ci',
    watch: true,
    ci: true,
    flags: [],
    expectedWatch: true,
  },
  {
    name: 'configured-one-shot',
    watch: false,
    flags: [],
    expectedWatch: false,
  },
  { name: 'explicit-run', watch: true, flags: ['--run'], expectedWatch: false },
  {
    name: 'explicit-watch',
    watch: false,
    flags: ['--watch'],
    expectedWatch: true,
  },
  {
    name: 'both-cli-flags',
    watch: true,
    flags: ['--run', '--watch'],
    expectedWatch: false,
  },
  {
    name: 'watch-equals-false',
    watch: true,
    flags: ['--watch=false'],
    expectedWatch: false,
  },
  {
    name: 'no-watch',
    watch: true,
    flags: ['--no-watch'],
    expectedWatch: false,
  },
  {
    name: 'watch-equals-true',
    watch: false,
    flags: ['--watch=true'],
    expectedWatch: true,
  },
]
save(path.join(output, 'INPUTS.json'), {
  runtime: process.version,
  executable: realpathSync(process.execPath),
  next: realpathSync(bin),
  bodySHA256: sha(body),
  plans,
  initialBudgetMs: 60000,
  ownerBudgetMs: 90000,
  scope:
    'Initial root watch selection only. Dynamic watch-mode config edits, project-local watch selection and native event delivery are separate contracts.',
})
const reports = []
for (const plan of plans) {
  const evidence = path.join(output, plan.name)
  mkdirSync(evidence)
  const fixture = path.join(
    consumer,
    '.next-test-configured-watch-' + randomUUID()
  )
  mkdirSync(fixture)
  symlinkSync(
    path.join(consumer, 'node_modules'),
    path.join(fixture, 'node_modules'),
    'dir'
  )
  const authored = {
    'package.json': '{"private":true,"type":"module"}\n',
    'watch.test.mjs': body,
    'next.config.mjs':
      'export default ' +
      JSON.stringify({ turbopack: { root: consumer } }) +
      '\n',
    'vitest.config.mjs':
      'export default ' +
      JSON.stringify({
        test: {
          watch: plan.watch,
          include: ['watch.test.mjs'],
          maxWorkers: 1,
          fileParallelism: false,
        },
      }) +
      '\n',
  }
  for (const [name, bytes] of Object.entries(authored))
    writeFileSync(path.join(fixture, name), bytes)
  const env = Object.fromEntries(
    ['HOME', 'PATH', 'TMPDIR', 'LANG', 'SHELL']
      .filter((name) => process.env[name] !== undefined)
      .map((name) => [name, process.env[name]])
  )
  Object.assign(env, {
    NODE_ENV: 'development',
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
    ...(plan.ci ? { CI: '1' } : {}),
  })
  const args = [
    bin,
    'test',
    fixture,
    ...plan.flags,
    '--reporter',
    'json',
    '--outputFile',
    'result.json',
  ]
  save(path.join(evidence, 'INPUTS.json'), {
    plan,
    args,
    authoredSHA256: Object.fromEntries(
      Object.entries(authored).map(([name, bytes]) => [name, sha(bytes)])
    ),
    envNames: Object.keys(env),
  })
  let done, report, failure
  const running = runOwnedNode(args, {
    cwd: fixture,
    env,
    auditDir: path.join(evidence, 'owners'),
    timeoutMs: 90000,
  }).then((value) => (done = value))
  try {
    const start = Date.now()
    while (Date.now() - start < 60000) {
      if (existsSync(path.join(fixture, 'result.json'))) {
        report = JSON.parse(
          readFileSync(path.join(fixture, 'result.json'), 'utf8')
        )
        if (report.numPassedTests === 1) break
      }
      if (done) break
      await delay(100)
    }
    assert(
      report,
      'No actual initial report within the new sixty-second profile budget'
    )
    assert.equal(report.success, true)
    assert.equal(report.numTotalTests, 1)
    assert.equal(report.numPassedTests, 1)
    assert.equal(report.numFailedTests, 0)
    assert.equal(
      report.testResults[0].assertionResults[0].fullName,
      'authored watch configuration executes the real case'
    )
    save(path.join(evidence, 'INITIAL-REPORT.json'), report)
    if (plan.expectedWatch)
      assert(!done, 'Configured watch session exited after its initial report')
  } catch (error) {
    failure = error
    save(path.join(evidence, 'ERROR.json'), {
      name: error.name,
      message: error.message,
      stack: error.stack,
    })
  } finally {
    if (!plan.expectedWatch) {
      const start = Date.now()
      while (!done && Date.now() - start < 10000) await delay(50)
    }
    if (!done && plan.expectedWatch) {
      const starts = readFileSync(
        path.join(evidence, 'owners/starts.jsonl'),
        'utf8'
      )
        .split('\n')
        .filter(Boolean)
        .map(JSON.parse)
      const root = starts.find(
        (entry) => entry.type === 'start' && entry.ppid === process.pid
      )
      assert(root)
      try {
        process.kill(root.pid, 'SIGINT')
      } catch (error) {
        if (error.code !== 'ESRCH') throw error
      }
    }
    const owner = await running
    save(path.join(evidence, 'OWNER.json'), owner)
    writeFileSync(path.join(evidence, 'stdout.log'), owner.stdout)
    writeFileSync(path.join(evidence, 'stderr.log'), owner.stderr)
    try {
      assertOwnedNodeCompleted(owner, plan.name)
      assert.equal(owner.status, plan.expectedWatch ? 130 : 0)
    } catch (error) {
      failure ??= error
    }
    for (const entry of owner.ownedProcesses) {
      try {
        process.kill(entry.pid, 0)
        throw new Error('Owned process remains alive: ' + entry.pid)
      } catch (error) {
        if (error.code !== 'ESRCH') throw error
      }
    }
    for (const [name, bytes] of Object.entries(authored))
      assert.equal(readFileSync(path.join(fixture, name), 'utf8'), bytes)
    if (existsSync(path.join(fixture, 'result.json')))
      save(
        path.join(evidence, 'FINAL-REPORT.json'),
        JSON.parse(readFileSync(path.join(fixture, 'result.json')))
      )
    rmSync(fixture, { recursive: true, force: true })
    save(path.join(evidence, 'CLOSED.json'), {
      allOwnedProcessesJoined: true,
      allAuthoredInputsHeld: true,
      fixtureRemoved: !existsSync(fixture),
    })
  }
  if (failure) throw failure
  reports.push(report)
}
save(path.join(output, 'VERIFIED.json'), {
  profiles: plans.length,
  actualPassedCases: reports.reduce(
    (count, report) => count + report.numPassedTests,
    0
  ),
  allRealInitialReportsPassed: true,
  allOwnedProcessesJoined: true,
  allAuthoredInputsHeld: true,
  allFixturesRemoved: true,
})
