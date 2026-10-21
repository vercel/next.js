const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, execFileSync } = require('node:child_process')

const repo = path.resolve(__dirname, '../../../..')
const source = path.join(__dirname, 'production-related')
const expected = JSON.parse(
  fs.readFileSync(path.join(source, 'expected.json'), 'utf8')
)
const fixture = fs.mkdtempSync(
  path.join(repo, '.next-test-production-related-')
)
for (const name of fs.readdirSync(source)) {
  if (!name.endsWith('.txt')) continue
  fs.copyFileSync(
    path.join(source, name),
    path.join(fixture, name.slice(0, -4))
  )
}
fs.symlinkSync(
  path.join(repo, 'node_modules'),
  path.join(fixture, 'node_modules')
)
fs.writeFileSync(
  path.join(fixture, 'next.config.mjs'),
  'export default ' + JSON.stringify({ turbopack: { root: repo } }) + '\n'
)
fs.writeFileSync(
  path.join(fixture, 'next.test.config.json'),
  JSON.stringify({
    maxWorkers: 1,
    projects: [
      {
        name: 'production-related',
        environment: 'node',
        mode: 'production',
        include: ['*.test.mjs'],
      },
    ],
  })
)
const originals = new Map(
  fs
    .readdirSync(source)
    .filter((name) => name.endsWith('.txt'))
    .map((name) => [
      name.slice(0, -4),
      fs.readFileSync(path.join(source, name)),
    ])
)

async function run(key, target) {
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    FORCE_COLOR: '0',
  }
  delete env.CI
  const output = path.join(fixture, key + '.json')
  const child = spawn(
    process.execPath,
    [
      path.join(repo, 'packages/next/dist/bin/next'),
      'test',
      fixture,
      '--run',
      ...(key === 'changed' ? ['--changed'] : ['--related', target]),
      '--reporter',
      'json',
      '--outputFile',
      output,
      '--passWithNoTests',
    ],
    { cwd: fixture, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  const stdout = []
  const stderr = []
  child.stdout.on('data', (chunk) => stdout.push(chunk))
  child.stderr.on('data', (chunk) => stderr.push(chunk))
  let forced = false
  let killTimer
  const deadline = setTimeout(() => {
    forced = true
    process.kill(-child.pid, 'SIGTERM')
    killTimer = setTimeout(() => process.kill(-child.pid, 'SIGKILL'), 5000)
  }, 120000)
  let close
  try {
    close = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolve({ code, signal }))
    })
    clearTimeout(deadline)
    clearTimeout(killTimer)
    assert.deepEqual(close, { code: 0, signal: null })
    assert.equal(forced, false)
    const report = JSON.parse(fs.readFileSync(output, 'utf8'))
    const actual = {
      cases: report.testResults.flatMap((file) =>
        file.assertionResults.map((test) => ({
          name: test.fullName,
          status: test.status,
          failureMessages: test.failureMessages,
        }))
      ),
      rows: report.next.events
        .filter((event) => event.type === 'output')
        .flatMap((event) =>
          event.text
            .split('\n')
            .filter((line) => line.startsWith('RELATED132:'))
            .map((line) => JSON.parse(line.slice('RELATED132:'.length)))
        ),
    }
    assert.deepEqual(actual, expected[key])
    assert.equal(report.success, true)
    assert.equal(report.numTotalTests, expected[key].cases.length)
    assert.equal(report.numPassedTests, expected[key].cases.length)
    assert.equal(report.numFailedTests, 0)
    for (const [name, bytes] of originals)
      assert.deepEqual(fs.readFileSync(path.join(fixture, name)), bytes)
    process.stdout.write(
      JSON.stringify({ key, close, forced, ...actual }) + '\n'
    )
  } finally {
    clearTimeout(deadline)
    clearTimeout(killTimer)
    if (forced || !close || close.code !== 0) {
      process.stderr.write(Buffer.concat(stdout))
      process.stderr.write(Buffer.concat(stderr))
    }
  }
}

;(async () => {
  await run('alpha', 'source-alpha.mjs')
  await run('beta', 'source-beta.mjs')
  await run('unrelated', 'unrelated.mjs')
  fs.writeFileSync(path.join(fixture, '.gitignore'), 'node_modules\n*.json\n')
  const git = (args) =>
    execFileSync('git', args, { cwd: fixture, stdio: 'pipe' })
  git(['init', '-q'])
  git([
    'add',
    '-f',
    '.gitignore',
    'next.config.mjs',
    'next.test.config.json',
    ...originals.keys(),
  ])
  git([
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'user.name=Next test qualification',
    '-c',
    'user.email=next-test-qualification@example.invalid',
    '-c',
    'commit.gpgSign=false',
    'commit',
    '-qm',
    'Complete production source-selection fixture',
  ])
  const modified = Buffer.concat([
    originals.get('source-beta.mjs'),
    Buffer.from('// changed source dependency\n'),
  ])
  fs.writeFileSync(path.join(fixture, 'source-beta.mjs'), modified)
  originals.set('source-beta.mjs', modified)
  await run('changed')
  fs.rmSync(fixture, { recursive: true, force: true })
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
