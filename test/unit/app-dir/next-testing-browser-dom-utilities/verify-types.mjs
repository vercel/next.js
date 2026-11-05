import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

const [consumerArg, outputArg, compilerRootArg = consumerArg, kindArg] =
  process.argv.slice(2)
assert(consumerArg && outputArg)
assert(kindArg === undefined || kindArg === 'element-errors')
const consumer = fs.realpathSync(consumerArg)
const output = path.resolve(outputArg)
const directory = path.dirname(fileURLToPath(import.meta.url))
const load = createRequire(path.join(consumer, 'package.json'))
const compiler = createRequire(
  path.join(path.resolve(compilerRootArg), 'package.json')
).resolve('typescript/bin/tsc')
const next = path.dirname(load.resolve('next/package.json'))
const entry = path.join(next, 'experimental/testing/vitest-browser.d.ts')
const declaration = path.join(
  next,
  'dist/experimental/testing/client/browser-context.d.ts'
)
const base = fs.readFileSync(
  path.join(
    directory,
    kindArg ? 'element-errors.consumer.mts.txt' : 'consumer.mts.txt'
  ),
  'utf8'
)
const negativeCases = kindArg ? 5 : 3
assert.equal((base.match(/@ts-expect-error/g) || []).length, negativeCases)
assert(
  JSON.parse(fs.readFileSync(path.join(next, 'package.json'))).files.includes(
    'experimental/testing/vitest-browser.d.ts'
  )
)
fs.mkdirSync(output, { recursive: true })
const runs = []
for (const specifier of ['vitest/browser', '@vitest/browser/context']) {
  const evidence = path.join(
    output,
    specifier === 'vitest/browser' ? 'vitest-browser' : 'browser-context'
  )
  fs.mkdirSync(evidence)
  const fixture = fs.mkdtempSync(
    path.join(consumer, '.next-test-browser-dom-utilities-types-')
  )
  let joined = false
  try {
    fs.mkdirSync(path.join(fixture, 'node_modules'))
    fs.symlinkSync(next, path.join(fixture, 'node_modules/next'), 'dir')
    fs.writeFileSync(
      path.join(fixture, 'package.json'),
      '{"type":"module","private":true}\n'
    )
    fs.writeFileSync(
      path.join(fixture, 'consumer.mts'),
      specifier === 'vitest/browser'
        ? base
        : base.replaceAll("'vitest/browser'", "'" + specifier + "'")
    )
    fs.writeFileSync(
      path.join(fixture, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          target: 'ES2022',
          lib: ['ESNext', 'DOM'],
          types: ['next/experimental/testing/vitest-browser'],
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        files: ['consumer.mts'],
      }) + '\n'
    )
    const env = { ...process.env }
    for (const key of ['NODE_OPTIONS', 'NODE_PATH']) delete env[key]
    const owner = await runOwnedNode(
      [
        compiler,
        '--project',
        path.join(fixture, 'tsconfig.json'),
        '--pretty',
        'false',
        '--listFiles',
      ],
      {
        cwd: fixture,
        env,
        auditDir: path.join(evidence, 'owners'),
        timeoutMs: 60000,
      }
    )
    fs.writeFileSync(path.join(evidence, 'stdout.log'), owner.stdout)
    fs.writeFileSync(path.join(evidence, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, 'Browser declaration ' + specifier)
    joined = true
    assert.equal(owner.status, 0, owner.stdout + '\n' + owner.stderr)
    const listedFiles = new Set(
      owner.stdout.split('\n').map((line) => line.trim())
    )
    assert(
      listedFiles.has(entry),
      'The public ambient entry must be typechecked'
    )
    assert(
      listedFiles.has(declaration),
      'The Browser declarations must be typechecked'
    )
    runs.push({
      specifier,
      negativeAssertionsConsumed: negativeCases,
      allOwnersJoined: true,
    })
  } finally {
    if (joined) fs.rmSync(fixture, { recursive: true, force: true })
  }
}
fs.writeFileSync(
  path.join(output, 'VERIFIED.json'),
  JSON.stringify(
    {
      profiles: runs.length,
      cases: runs.length,
      runs,
      actualShippedAmbientEntry: true,
      actualShippedDeclaration: true,
      allOwnersJoined: true,
      allFixturesRemoved: true,
    },
    null,
    2
  ) + '\n'
)
