import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  runOwnedNode,
  assertOwnedNodeCompleted,
} from '../../e2e/app-dir/next-testing-package/process-supervisor.mjs'
// Explicit real-engine matrix; the general unit suite never loads it.
const directory = dirname(fileURLToPath(import.meta.url)),
  consumer = resolve(process.argv[2]),
  engine = process.argv[3],
  mode = process.argv[4],
  out = resolve(process.argv[5]),
  sdkDirectory = process.argv[6] && resolve(process.argv[6])
assert.ok(['chromium', 'firefox'].includes(engine))
assert.ok(['development', 'production'].includes(mode))
mkdirSync(out, { recursive: true })
const fromConsumer = createRequire(join(consumer, 'package.json'))
const fromSDK = sdkDirectory
  ? createRequire(join(sdkDirectory, 'package.json'))
  : fromConsumer
assert.equal(fromSDK('playwright/package.json').version, '1.64.0')
const options = [
    { name: 'omitted-local', ci: false, expected: false },
    { name: 'omitted-empty-ci', ci: '', expected: false },
    { name: 'omitted-false-ci', ci: 'false', expected: true },
    { name: 'omitted-ci', ci: true, expected: true },
    { name: 'config-true', config: true, ci: false, expected: true },
    { name: 'config-false', config: false, ci: true, expected: false },
    { name: 'cli-true', config: false, cli: true, ci: false, expected: true },
    { name: 'cli-false', config: true, cli: false, ci: true, expected: false },
    {
      name: 'cli-negative',
      config: true,
      cli: false,
      negative: true,
      ci: true,
      expected: false,
    },
  ],
  profiles = []
const hash = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex')
writeFileSync(
  join(out, 'SOURCE-INSTALLED.json'),
  JSON.stringify(
    {
      nextVersion: fromConsumer('next/package.json').version,
      sdkVersion: fromSDK('playwright/package.json').version,
      sourceSha256: hash(
        join(directory, 'fixtures/headless/contract.case.mjs.txt')
      ),
    },
    null,
    2
  ) + '\n'
)
for (const option of options) {
  const dest = join(out, 'current-' + engine + '-' + mode + '-' + option.name)
  mkdirSync(dest, { recursive: true })
  const fixture = mkdtempSync(join(consumer, '.next-headless162-'))
  let joined = false
  try {
    writeFileSync(
      join(fixture, 'package.json'),
      '{"type":"module","private":true}\n'
    )
    if (sdkDirectory) {
      mkdirSync(join(fixture, 'node_modules'))
      symlinkSync(
        dirname(fromSDK.resolve('playwright/package.json')),
        join(fixture, 'node_modules/playwright')
      )
    }
    writeFileSync(
      join(fixture, 'contract.case.mjs'),
      readFileSync(join(directory, 'fixtures/headless/contract.case.mjs.txt'))
    )
    writeFileSync(
      join(fixture, 'next.config.mjs'),
      'export default{turbopack:{root:' + JSON.stringify(consumer) + '}}\n'
    )
    mkdirSync(join(fixture, 'app'))
    writeFileSync(
      join(fixture, 'app/layout.jsx'),
      'export default function Layout({children}){return <html><body>{children}</body></html>}\n'
    )
    writeFileSync(
      join(fixture, 'app/page.jsx'),
      'export default function Page(){return <p>Headless configuration</p>}\n'
    )
    writeFileSync(
      join(fixture, 'next.test.config.json'),
      JSON.stringify({
        projects: [
          {
            name: 'headless',
            mode,
            include: ['contract.case.mjs'],
            browser: {
              enabled: true,
              instances: [{ browser: engine }],
              headless: option.config,
            },
          },
        ],
      }) + '\n'
    )
    const env = {
      ...process.env,
      NODE_ENV: mode,
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
      HEADLESS_MATRIX_AUDIT: join(dest, 'launches.jsonl'),
      NODE_OPTIONS:
        '--require=' +
        JSON.stringify(join(directory, 'headless-launch-audit.cjs')),
    }
    for (const key of ['CI', 'NODE_PATH']) delete env[key]
    if (typeof option.ci === 'string') env.CI = option.ci
    else if (option.ci) env.CI = 'true'
    const args = [
      join(consumer, 'node_modules/next/dist/bin/next'),
      'test',
      fixture,
      '--run',
      '--reporter=json',
      '--outputFile=' + join(dest, 'report.json'),
    ]
    if (option.negative) args.push('--no-browser.headless')
    else if (option.cli !== undefined)
      args.push('--browser.headless', String(option.cli))
    const owner = await runOwnedNode(args, {
      cwd: fixture,
      env,
      timeoutMs: 120000,
      auditDir: join(dest, 'owners'),
    })
    writeFileSync(
      join(dest, 'owner.json'),
      JSON.stringify(owner, null, 2) + '\n'
    )
    writeFileSync(join(dest, 'stdout.log'), owner.stdout)
    writeFileSync(join(dest, 'stderr.log'), owner.stderr)
    assertOwnedNodeCompleted(owner, 'current' + engine + mode + option.name)
    joined = true
    assert.equal(owner.status, 0, owner.stderr)
    const report = JSON.parse(readFileSync(join(dest, 'report.json'))),
      rows = []
    for (const event of report.next.events.filter(
      (event) => event.type === 'output'
    ))
      for (const line of event.text.split('\n'))
        if (line) {
          const prefix = ['HEADLESS_HOOK:', 'HEADLESS_BODY:'].find((prefix) =>
            line.startsWith(prefix)
          )
          assert.ok(prefix, 'Unexpected actual console row ' + line)
          rows.push({
            stream: event.stream,
            prefix,
            value: JSON.parse(line.slice(prefix.length)),
          })
        }
    assert.equal(report.numPassedTests, 1)
    assert.equal(report.snapshot.matched, 1)
    assert.equal(rows.length, 5)
    const launches = readFileSync(join(dest, 'launches.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    assert.equal(launches.length, 1)
    assert.equal(launches[0].engine, engine)
    assert.equal(launches[0].headless, option.expected)
    const body = rows.find((row) => row.prefix === 'HEADLESS_BODY:').value
    assert.equal(body.count, 1)
    if (engine === 'chromium')
      assert.equal(body.headlessChrome, option.expected)
    else assert.equal(body.firefox, true)
    const value = {
      engine,
      mode,
      ...option,
      fixture,
      report,
      rows,
      launches,
      ownersClosed: true,
    }
    writeFileSync(
      join(dest, 'CHECKS.json'),
      JSON.stringify(value, null, 2) + '\n'
    )
    profiles.push({
      engine,
      mode,
      name: option.name,
      headless: option.expected,
      cases: 1,
      rows: 5,
      snapshots: 1,
      ownersClosed: true,
    })
    console.log(JSON.stringify(profiles.at(-1)))
  } finally {
    if (joined) rmSync(fixture, { recursive: true, force: true })
  }
}
writeFileSync(
  join(out, 'CURRENT.json'),
  JSON.stringify({ profiles }, null, 2) + '\n'
)
