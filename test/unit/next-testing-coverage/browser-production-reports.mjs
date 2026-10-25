import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'

// Explicit functional qualifier: one installed Next consumer, one existing
// Browser dependency project and an owned output directory. No reference runner
// or alternate compiler is present in the consumer.
const [nextProjectArg, browserProjectArg, destinationArg] =
  process.argv.slice(2)
assert(
  nextProjectArg && browserProjectArg && destinationArg,
  'Expected Next consumer, Browser dependency project and output directory'
)
const nextProject = resolve(nextProjectArg),
  browserProject = resolve(browserProjectArg),
  destination = resolve(destinationArg)
const here = dirname(fileURLToPath(import.meta.url)),
  browserRequire = createRequire(join(browserProject, 'package.json'))
const actualSdk = dirname(browserRequire.resolve('playwright/package.json'))
const sdk = JSON.parse(
  readFileSync(join(actualSdk, 'package.json'), 'utf8')
).version
assert(
  ['1.61.0', '1.64.0'].includes(sdk),
  'This maintained reference qualifies the measured SDK profiles'
)
const hash = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
const results = []
for (const kind of [
  'javascript',
  'typescript',
  'fragment',
  'unimported',
  'nojsx',
  'classic',
  'automatic',
  'pragma',
  'pragmafrag',
  'children',
  'named-children',
  'named-aliases',
  'empty-elements',
  'empty-aliases',
  'component-tags',
  'component-aliases',
  'creator-scopes',
  'creator-layouts',
  'creator-tags',
  'creator-tag-aliases',
  'creator-named',
  'creator-named-aliases',
]) {
  const output = join(destination, kind)
  mkdirSync(output, { recursive: true })
  const expectedFile = join(
    here,
    'fixtures/browser-production',
    kind + '.expected.json'
  )
  const expected = JSON.parse(readFileSync(expectedFile, 'utf8'))
  const textFixture = [
    'fragment',
    'unimported',
    'nojsx',
    'classic',
    'automatic',
    'pragma',
    'pragmafrag',
    'children',
    'named-children',
    'named-aliases',
    'empty-elements',
    'empty-aliases',
    'component-tags',
    'component-aliases',
    'creator-scopes',
    'creator-layouts',
    'creator-tags',
    'creator-tag-aliases',
    'creator-named',
    'creator-named-aliases',
  ].includes(kind)
  const source = [
    'nojsx',
    'classic',
    'automatic',
    'pragma',
    'pragmafrag',
    'children',
    'named-children',
    'named-aliases',
    'empty-elements',
    'empty-aliases',
    'component-tags',
    'component-aliases',
    'creator-scopes',
    'creator-layouts',
    'creator-tags',
    'creator-tag-aliases',
    'creator-named',
    'creator-named-aliases',
  ].includes(kind)
    ? join(here, 'fixtures/browser-production', kind)
    : ['fragment', 'unimported'].includes(kind)
      ? join(here, 'fixtures/jsx-owners-public/fragment')
      : join(
          here,
          '../app-dir/next-testing-stable-release-gaps/fixtures',
          kind === 'javascript'
            ? 'coverage-browser'
            : 'coverage-compiler-source-typescript'
        )
  const fixture = mkdtempSync(
    join(nextProject, '.production-coverage-fixture-')
  )
  try {
    mkdirSync(join(fixture, 'node_modules'))
    symlinkSync(actualSdk, join(fixture, 'node_modules/playwright'))
    const hashes = {}
    for (const [name, original] of Object.entries(expected.sourceFiles)) {
      const originalFile = join(
        source,
        (original.fixture ?? name) + (textFixture ? '.txt' : '')
      )
      hashes[name] = hash(originalFile)
      assert.equal(hashes[name], original.sha256)
      copyFileSync(originalFile, join(fixture, name))
      assert.equal(hash(join(fixture, name)), original.sha256)
    }
    writeFileSync(
      join(output, 'source-hashes.json'),
      JSON.stringify(hashes, null, 2) + '\n'
    )
    if (!Object.hasOwn(expected.sourceFiles, 'package.json'))
      writeFileSync(
        join(fixture, 'package.json'),
        '{"type":"module","private":true}\n'
      )
    writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default ' +
        JSON.stringify({
          turbopack: { root: nextProject },
          experimental: { turbopackSharedRuntime: true },
        }) +
        '\n'
    )
    mkdirSync(join(fixture, 'app'))
    writeFileSync(
      join(fixture, 'app/layout.jsx'),
      'export default function Layout({children}){return <html><body>{children}</body></html>}\n'
    )
    writeFileSync(
      join(fixture, 'app/page.jsx'),
      'export default function Page(){return <p>Production Browser source coverage</p>}\n'
    )
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
    }
    for (const key of [
      'NODE_OPTIONS',
      'NODE_PATH',
      'PLAYWRIGHT_BROWSERS_PATH',
      'CI',
      'NEXT_TEST_NATIVE_DIR',
      'NEXT_TEST_NATIVE_IGNORE_LOCAL_INSTALL',
    ])
      delete env[key]
    const owner = await runOwnedNode(
      [
        join(here, 'browser-production-reports-worker.mjs'),
        nextProject,
        fixture,
        output,
        expectedFile,
        sdk,
      ],
      {
        cwd: nextProject,
        env,
        auditDir: join(output, 'owners'),
        timeoutMs: 180000,
      }
    )
    writeFileSync(
      join(output, 'owner.json'),
      JSON.stringify(owner, null, 2) + '\n'
    )
    writeFileSync(join(output, 'stdout.log'), owner.stdout)
    writeFileSync(join(output, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(
      owner,
      'Actual production Browser V8 compiler and child capture'
    )
    assert.equal(owner.status, 0, owner.stdout + owner.stderr)
    results.push({
      kind,
      ...JSON.parse(readFileSync(join(output, 'result.json'), 'utf8')),
    })
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
}
writeFileSync(
  join(destination, 'result.json'),
  JSON.stringify({ sdk, profiles: results }, null, 2) + '\n'
)
console.log(
  JSON.stringify({
    sdk,
    profiles: results.length,
    exactPublishedReports: results.length * 2,
    cancellationVetoes: results.length,
  })
)
