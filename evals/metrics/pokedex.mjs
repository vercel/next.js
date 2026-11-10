import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectLocalFiles, createSandbox } from '@vercel/agent-eval'
import { installPlaywright } from '../lib/setup.ts'
import { downloadSource } from '../evals/agent-062-pokedex-dev-loop/eval-setup.mjs'

// The normal EVAL.ts owns pass/fail. This only measures its saved app.
export async function collect(output, { samples = 3 } = {}) {
  const temporary = mkdtempSync(join(tmpdir(), 'pokedex-metrics-'))
  let sandbox
  try {
    const source = join(temporary, 'source')
    await downloadSource(source)
    sandbox = await createSandbox({
      backend: 'vercel',
      runtime: 'node24',
      timeout: 1800000,
    })
    async function run(command, args = [], options) {
      const result = await sandbox.runCommand(command, args, options)
      if (result.exitCode !== 0)
        throw new Error(`${command} failed: ${result.stderr}`)
      return result
    }
    const cwd = (await run('pwd')).stdout.trim()
    await sandbox.uploadFiles(await collectLocalFiles(join(source, 'template')))
    const files = (await collectLocalFiles(join(output, 'project/app'))).filter(
      ({ path }) =>
        !path
          .split('/')
          .some((part) =>
            /^(?:node_modules|\.git|\.next.*|\.env.*)$/.test(part)
          )
    )
    await sandbox.uploadFiles(
      files.map((file) => ({ ...file, path: `app/${file.path}` }))
    )
    // collectLocalFiles omits lockfiles. Preserve the exact dependency trees.
    await sandbox.writeFiles({
      'package-lock.json': readFileSync(
        join(source, 'template/package-lock.json'),
        'utf8'
      ),
      'app/package-lock.json': readFileSync(
        join(output, 'project/app/package-lock.json'),
        'utf8'
      ),
    })
    await run('npm', ['ci', '--no-audit', '--no-fund'])
    await installPlaywright(sandbox)
    await run('bash', ['scripts/setup-data.sh'])
    await run('npm', ['ci', '--prefix', 'app', '--no-audit', '--no-fund'])
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
      ['bench/measure.mjs', 'app', 'measurement', '--runs', String(samples)],
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
  } finally {
    if (sandbox) await sandbox.stop()
    rmSync(temporary, { recursive: true, force: true })
  }
}
