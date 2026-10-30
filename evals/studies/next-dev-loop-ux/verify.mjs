import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { collectLocalFiles, createSandbox } from '@vercel/agent-eval'
import { installPlaywright } from '../../lib/setup.ts'
import { task } from './prepare.mjs'

const directory = process.argv[2]
if (!directory)
  throw new Error('Usage: verify.mjs <result-directory> [--metrics-only]')
if (!process.env.VERCEL_OIDC_TOKEN) throw new Error('Missing VERCEL_OIDC_TOKEN')
delete process.env.VERCEL_TOKEN
const output = resolve(directory)
const source = join(output, 'workspace/source')
const provenance = JSON.parse(
  readFileSync(join(output, 'provenance.json'), 'utf8')
)
if (provenance.sourceRevision !== task.sourceRevision)
  throw new Error('Task revision mismatch')
const metricsOnly = process.argv.includes('--metrics-only')
if (
  metricsOnly &&
  JSON.parse(readFileSync(join(output, 'verification.json'), 'utf8'))
    .acceptanceExitCode !== 0
) {
  throw new Error('Metrics-only requires successful independent verification')
}
const sandbox = await createSandbox({
  backend: 'vercel',
  runtime: 'node24',
  timeout: 3600000,
})
let step = 0
async function run(cmd, args = [], options) {
  const r = await sandbox.runCommand(cmd, args, options)
  writeFileSync(
    join(output, `verification-setup-${++step}.log`),
    r.stdout + '\n' + r.stderr
  )
  if (r.exitCode !== 0)
    throw new Error(
      `Verification setup failed; see verification-setup-${step}.log`
    )
  return r
}
try {
  console.log('Verifier Sandbox', sandbox.sandboxId)
  const cwd = (await run('pwd')).stdout.trim()
  // The verifier receives public task files and the saved app, never the model key.
  await sandbox.uploadFiles(await collectLocalFiles(join(source, 'template')))
  await sandbox.writeFiles({
    'package-lock.json': readFileSync(
      join(source, 'template/package-lock.json'),
      'utf8'
    ),
  })
  await run('npm', ['ci', '--no-audit', '--no-fund'])
  await installPlaywright(sandbox)
  await run('bash', ['scripts/setup-data.sh'])
  await sandbox.uploadFiles([
    { path: 'app.tgz', content: readFileSync(join(output, 'app.tgz')) },
  ])
  // Generated archives are untrusted. Extract only regular app files in the VM.
  await run('python3', [
    '-c',
    `import tarfile, pathlib
with tarfile.open('app.tgz') as archive:
    members = archive.getmembers()
    for member in members:
        path = pathlib.PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0] != 'app' or not (member.isfile() or member.isdir()):
            raise ValueError('Unexpected app archive member')
    archive.extractall('.', members=members)
`,
  ])
  await run('npm', ['ci', '--prefix', 'app', '--no-audit', '--no-fund'])
  const config = await sandbox.runCommand('node', [
    '-e',
    `
const {resolve} = require('node:path');
const load = require('./app/node_modules/next/dist/server/config').default;
const {PHASE_PRODUCTION_BUILD} = require('./app/node_modules/next/constants');
load(PHASE_PRODUCTION_BUILD, resolve('app')).then(config => {
  const version = require('./app/node_modules/next/package.json').version;
  const checked = {version, cacheComponents: config.cacheComponents, partialPrefetching: config.partialPrefetching};
  console.log(JSON.stringify(checked));
  if(version !== '16.4.2' || !checked.cacheComponents || !checked.partialPrefetching) process.exitCode = 1;
});`,
  ])
  writeFileSync(
    join(output, 'configuration.log'),
    config.stdout + '\n' + config.stderr
  )
  if (config.exitCode !== 0) {
    writeFileSync(
      join(output, 'verification.json'),
      JSON.stringify(
        {
          acceptanceExitCode: 1,
          configurationExitCode: config.exitCode,
          reason:
            'Required Next.js version or Cache Components configuration changed',
          sandboxId: sandbox.sandboxId,
        },
        null,
        2
      )
    )
    throw new Error('Required configuration failed; see configuration.log')
  }
  if (!metricsOnly) {
    console.log('Running original acceptance tests')
    const tests = await sandbox.runCommand(
      'npm',
      ['test', '--', '--reporter=json'],
      { env: { PLAYWRIGHT_JSON_OUTPUT_FILE: cwd + '/acceptance.json' } }
    )
    writeFileSync(
      join(output, 'acceptance.log'),
      tests.stdout + '\n' + tests.stderr
    )
    const acceptance = await sandbox
      .readFile('acceptance.json')
      .catch(() => null)
    if (acceptance) writeFileSync(join(output, 'acceptance.json'), acceptance)
    const stats = acceptance ? JSON.parse(acceptance).stats : null
    const passed =
      tests.exitCode === 0 &&
      stats?.expected === 54 &&
      stats?.unexpected === 0 &&
      stats?.skipped === 0 &&
      stats?.flaky === 0
    writeFileSync(
      join(output, 'verification.json'),
      JSON.stringify(
        {
          acceptanceExitCode: passed ? 0 : 1,
          testExitCode: tests.exitCode,
          configurationExitCode: config.exitCode,
          sandboxId: sandbox.sandboxId,
          sourceRevision: task.sourceRevision,
        },
        null,
        2
      )
    )
    console.log('Acceptance', passed ? '54/54' : 'failed')
    if (!passed) process.exitCode = 1
  }

  await sandbox.uploadFiles(
    (await collectLocalFiles(join(source, 'bench')))
      .filter((f) =>
        ['measure.mjs', 'stack.mjs', 'package.json'].includes(f.path)
      )
      .map((f) => ({ ...f, path: 'bench/' + f.path }))
  )
  await sandbox.writeFiles({
    // Sandbox cannot edit /etc/hosts. Preserve separate HTTPS ports instead.
    'bench/stack.mjs': readFileSync(join(source, 'bench/stack.mjs'), 'utf8')
      .replaceAll('app.localhost', 'localhost')
      .replaceAll('api.localhost', 'localhost'),
    'bench/package-lock.json': readFileSync(
      join(source, 'bench/package-lock.json'),
      'utf8'
    ),
  })
  await run('npm', ['ci', '--prefix', 'bench', '--no-audit', '--no-fund'])
  await run('npx', ['--prefix', 'bench', 'playwright', 'install', 'chromium'])
  await run('mkdir', ['-p', '.bin'])
  await run('curl', [
    '--fail',
    '--silent',
    '--show-error',
    '--location',
    'https://github.com/caddyserver/caddy/releases/download/v2.11.7/caddy_2.11.7_linux_amd64.tar.gz',
    '--output',
    '/tmp/caddy.tgz',
  ])
  await run('node', [
    '--input-type=module',
    '-e',
    "import{readFileSync}from'node:fs';import{createHash}from'node:crypto';if(createHash('sha256').update(readFileSync('/tmp/caddy.tgz')).digest('hex')!=='727b91701a392de6ebc5027509f548bf39979e5216340d0faed8fa5e69c84f8b')throw Error('Caddy checksum mismatch')",
  ])
  await run('tar', ['-xzf', '/tmp/caddy.tgz', '-C', '.bin', 'caddy'])
  const path = (await run('printenv', ['PATH'])).stdout.trim()
  console.log('Collecting production Lighthouse samples')
  const measured = await sandbox.runCommand(
    'node',
    [
      'bench/measure.mjs',
      'app',
      'measurement',
      '--runs',
      String(task.lighthouseSamples),
    ],
    { env: { TEMPLATE_DIR: cwd, PATH: cwd + '/.bin:' + path } }
  )
  writeFileSync(
    join(output, 'measurement.log'),
    measured.stdout + '\n' + measured.stderr
  )
  if (measured.exitCode !== 0)
    throw new Error('Performance collection failed; see measurement.log')
  writeFileSync(
    join(output, 'measurements.json'),
    await sandbox.readFile('measurement/results.json')
  )
  await run('tar', ['-czf', '/tmp/measurement.tgz', 'measurement'])
  writeFileSync(
    join(output, 'measurement.tgz'),
    await sandbox.readFileBuffer('/tmp/measurement.tgz')
  )
  console.log('Saved checks and metrics')
} finally {
  await sandbox.stop()
}
