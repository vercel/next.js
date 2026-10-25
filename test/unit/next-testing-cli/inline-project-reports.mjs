import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
const expected = JSON.parse(
  await readFile(join(corpus, 'pristine.json'), 'utf8')
)
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const authored = new Map()
for (const [name, pin] of Object.entries(expected.sourceSHA256)) {
  const bytes = await readFile(join(corpus, name))
  assert.equal(sha(bytes), pin)
  authored.set(name, bytes)
}
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
for (const profile of expected.profiles) {
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
  const definition = `{${profile.flag === 'omitted' ? '' : `extends:${profile.flag},`}test:{name:'child',include:['*.case.mjs'],provide:{child:7}${profile.kind === 'settings' ? ",setupFiles:['./child-setup.mjs']" : ''}}}`
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
    const actual = {
      kind: profile.kind,
      flag: profile.flag,
      exit: owner.status,
      cases: report.testResults.flatMap((file) =>
        file.assertionResults.map((test) => ({
          name: test.fullName,
          status: test.status,
          failureMessages: test.failureMessages,
        }))
      ),
      observations: report.next.events
        .filter((event) => event.type === 'output')
        .flatMap((event) => event.text.split('\n'))
        .filter((line) => line.startsWith('INLINE207:'))
        .map((line) => JSON.parse(line.slice(10))),
      transforms: await readFile(trace, 'utf8')
        .then((text) => text.trim().split('\n').filter(Boolean).map(JSON.parse))
        .catch((error) => {
          if (error.code === 'ENOENT') return []
          throw error
        }),
    }
    await writeFile(
      join(evidence, 'ACTUAL.json'),
      JSON.stringify(actual, null, 2) + '\n'
    )
    assert.deepEqual(actual, profile)
    for (const [name, bytes] of authored)
      assert.deepEqual(await readFile(destination(fixture, name)), bytes)
    facts.push({
      label,
      completeCasesAndRowsEqual: true,
      ownersClosed: true,
      authoredBytesHeld: true,
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
      completeCasesAndRowsEqual: true,
      allOwnersJoined: readersClosed,
      authoredBytesHeld: true,
    },
    null,
    2
  ) + '\n'
)
