import { resolveFixturePath } from '../../lib/next-testing-fixtures.cjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [rootArg, outputArg] = process.argv.slice(2)
assert(rootArg && outputArg)
const root = resolve(rootArg),
  output = resolve(outputArg)
const corpus = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures/inline-project-inheritance'
)
const profiles = ['compiler', 'settings'].flatMap((kind) =>
  ['omitted', 'true', 'false'].map((flag) => ({ kind, flag }))
)
const authored = new Map()
for (const name of [
  'package.json.txt',
  'subject.mjs.txt',
  'aliased.mjs.txt',
  'root-setup.mjs.txt',
  'child-setup.mjs.txt',
  'contract.case.mjs.txt',
  'real-package/package.json.txt',
  'real-package/index.mjs.txt',
])
  authored.set(name, await readFile(resolveFixturePath(join(corpus, name))))
const load = createRequire(join(root, 'package.json'))
if (!process.argv.includes('--source'))
  for (const name of ['vitest', 'vite', '@vitest/mocker'])
    assert.throws(() => load.resolve(name))
const next = process.argv.includes('--source')
  ? join(root, 'packages/next/dist/bin/next')
  : load.resolve('next/dist/bin/next')
await mkdir(output, { recursive: true })
const prepared = [],
  facts = []
let readersClosed = true
function destination(fixture, name) {
  return name.startsWith('real-package/')
    ? join(
        fixture,
        'node_modules/inline-target',
        name.slice(13).replace(/\.txt$/, '')
      )
    : join(fixture, name.replace(/\.txt$/, ''))
}
for (const profile of profiles) {
  const label = profile.kind + '-' + profile.flag
  const fixture = await mkdtemp(join(root, '.next-test-inline-inheritance-')),
    evidence = join(output, label)
  await mkdir(evidence)
  const modules = join(fixture, 'node_modules')
  await mkdir(modules)
  for (const entry of await readdir(join(root, 'node_modules'))) {
    if (['.vite', '.vite-temp', '.cache', '.vitest-cache'].includes(entry))
      await mkdir(join(modules, entry))
    else await symlink(join(root, 'node_modules', entry), join(modules, entry))
  }
  for (const [name, bytes] of authored) {
    const target = destination(fixture, name)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, bytes)
  }
  const trace = join(evidence, 'transforms.jsonl')
  const inherited = profile.flag !== 'false'
  const expected = {
    value: profile.kind === 'compiler' && inherited ? 9 : 1,
    aliasValue: profile.kind === 'compiler' && inherited ? 99 : 1,
    rootSetup: profile.kind === 'settings' && inherited ? 1 : 0,
    childSetup: profile.kind === 'settings' ? 1 : 0,
    taskTimeout: inherited ? 789 : 5000,
  }
  const definition = `{${profile.flag === 'omitted' ? '' : `extends:${profile.flag},`}test:{name:'child',include:['*.case.mjs'],provide:{child:7,expected:${JSON.stringify(expected)}}${profile.kind === 'settings' ? ",setupFiles:['./child-setup.mjs']" : ''}}}`
  const compiler =
    profile.kind === 'compiler'
      ? `plugins:[{name:'root-hook',transform(code,id){if(id.endsWith('/subject.mjs')){appendFileSync(${JSON.stringify(trace)},JSON.stringify({target:'subject.mjs',value:9})+'\\n');return code.replace('= 1','= 9')}}}],resolve:{alias:{'inline-target':${JSON.stringify(join(fixture, 'aliased.mjs'))}}},`
      : ''
  await writeFile(
    join(fixture, 'next.test.config.mjs'),
    `import{appendFileSync}from'node:fs';export default {${compiler}test:{maxWorkers:1,testTimeout:789,provide:{root:5},${profile.kind === 'settings' ? "setupFiles:['./root-setup.mjs']," : ''}projects:[${definition}]}}\n`
  )
  await writeFile(
    join(fixture, 'next.config.mjs'),
    'export default ' + JSON.stringify({ turbopack: { root } }) + '\n'
  )
  prepared.push({ profile, label, fixture, evidence, trace })
}
await writeFile(
  join(output, 'INPUTS.json'),
  JSON.stringify({ allInputsPreparedBeforeReaders: true, prepared }, null, 2) +
    '\n'
)
try {
  for (const { profile, label, fixture, evidence, trace } of prepared) {
    const reportPath = join(evidence, 'report.json')
    const env = {
      ...process.env,
      PATH: dirname(process.execPath) + ':' + process.env.PATH,
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
      TURBO_TASKS_AVAILABLE_PARALLELISM: '4',
    }
    for (const key of [
      'CI',
      'NODE_OPTIONS',
      'NODE_PATH',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
      'WS2_INLINE_ENV',
    ])
      delete env[key]
    readersClosed = false
    const owner = await runOwnedNode(
      [
        next,
        'test',
        fixture,
        '--run',
        '--reporter=json',
        '--outputFile=' + reportPath,
      ],
      {
        cwd: fixture,
        env,
        timeoutMs: 120000,
        auditDir: join(evidence, 'owners'),
      }
    )
    await writeFile(
      join(evidence, 'OWNER.json'),
      JSON.stringify(owner, null, 2) + '\n'
    )
    await writeFile(join(evidence, 'stdout.log'), owner.stdout)
    await writeFile(join(evidence, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, label)
    readersClosed = true
    const report = JSON.parse(await readFile(reportPath, 'utf8'))
    assert.equal(owner.status, 0, owner.stderr)
    assert.equal(report.success, true)
    assert.deepEqual(
      report.testResults.flatMap((file) =>
        file.assertionResults.map((test) => ({
          name: test.fullName,
          status: test.status,
          failures: test.failureMessages,
        }))
      ),
      [{ name: 'inline inheritance contract', status: 'passed', failures: [] }]
    )
    const transforms = await readFile(trace, 'utf8')
      .then((text) => text.trim().split('\n').filter(Boolean).map(JSON.parse))
      .catch((error) => {
        if (error.code === 'ENOENT') return []
        throw error
      })
    assert.deepEqual(
      transforms,
      profile.kind === 'compiler' && profile.flag !== 'false'
        ? [{ target: 'subject.mjs', value: 9 }]
        : []
    )
    facts.push({
      label,
      configurationInheritanceAssertions: true,
      transformCallsVerified: true,
      ownersClosed: true,
    })
    await writeFile(
      join(output, 'PROGRESS.json'),
      JSON.stringify({ facts }, null, 2) + '\n'
    )
  }
} finally {
  if (readersClosed)
    for (const { fixture } of prepared)
      await rm(fixture, { recursive: true, force: true })
}
await writeFile(
  join(output, 'CHECKS.json'),
  JSON.stringify(
    {
      profiles: facts.length,
      configurationInheritanceAssertions: true,
      transformCallsVerified: true,
      allOwnersJoined: readersClosed,
    },
    null,
    2
  ) + '\n'
)
