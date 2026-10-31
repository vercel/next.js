import { expect, test } from 'vitest'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

test('builds a working Pokédex with Cache Components and Partial Prefetching', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'pokedex-verifier-'))
  const directory = join(temporary, 'workspace')
  const source = join(temporary, 'source')
  mkdirSync(directory)
  mkdirSync(source)
  // Do not pass model or judge credentials to the app or npm scripts.
  const env: NodeJS.ProcessEnv = { NODE_ENV: 'development', CI: '1' }
  for (const name of ['PATH', 'HOME', 'TMPDIR', 'PLAYWRIGHT_BROWSERS_PATH']) {
    if (process.env[name]) env[name] = process.env[name]
  }
  const run = (command: string, args: string[]) => {
    const result = spawnSync(command, args, {
      cwd: directory,
      env,
      encoding: 'utf8',
      timeout: 600_000,
      maxBuffer: 32 * 1024 * 1024,
    })
    if (result.error) throw result.error
    if (result.status !== 0)
      throw new Error(`${command} failed:\n${result.stdout}\n${result.stderr}`)
    return result.stdout
  }
  try {
    // Fetch the trusted tests again. Agent edits to its workspace's tests,
    // helpers, data, or setup script must not change the grade.
    const response = await fetch(
      'https://codeload.github.com/nolanlawson/agent-framework-benchmark/tar.gz/b95ada03930ca3670c8ff6377c3af815df0ac040'
    )
    if (!response.ok)
      throw new Error(`Task download failed: ${response.status}`)
    const archive = Buffer.from(await response.arrayBuffer())
    expect(createHash('sha256').update(archive).digest('hex')).toBe(
      '56a1fae810494f70e7a35aead1eaa7570c791a34afc7702842af2f4374d5c838'
    )
    writeFileSync(join(directory, 'source.tgz'), archive)
    run('tar', ['-xzf', 'source.tgz', '-C', source, '--strip-components=1'])
    cpSync(join(source, 'template'), directory, { recursive: true })
    const helper = join(directory, 'tests/specs/helpers.mjs')
    writeFileSync(
      helper,
      readFileSync(helper, 'utf8').replace(
        'export async function clickHeader(header) {',
        "export async function clickHeader(header) {\n  await header.waitFor({ state: 'visible' });"
      )
    )
    cpSync(join(process.cwd(), 'app'), join(directory, 'app'), {
      recursive: true,
      filter: (path) => {
        const name = basename(path)
        if (
          ['node_modules', '.git'].includes(name) ||
          /^\.next|^\.env/.test(name)
        )
          return false
        if (lstatSync(path).isSymbolicLink())
          throw new Error('The app must contain regular files, not symlinks')
        return true
      },
    })
    run('npm', ['ci', '--no-audit', '--no-fund'])
    run('npm', ['ci', '--prefix', 'app', '--no-audit', '--no-fund'])
    run('node', [
      '--input-type=commonjs',
      '-e',
      `const {resolve} = require('node:path');
const load = require('./app/node_modules/next/dist/server/config').default;
const {PHASE_PRODUCTION_BUILD} = require('./app/node_modules/next/constants');
load(PHASE_PRODUCTION_BUILD, resolve('app')).then(config => {
  if (require('./app/node_modules/next/package.json').version !== '16.4.2' ||
      !config.cacheComponents || !config.partialPrefetching) {
    throw new Error('Required Next.js version, Cache Components, or Partial Prefetching changed');
  }
});`,
    ])
    env.APP_PORT = '3102'
    env.API_PORT = '9102'
    env.PLAYWRIGHT_JSON_OUTPUT_FILE = join(directory, 'acceptance.json')
    run('npm', ['test', '--', '--reporter=json'])
    const { stats } = JSON.parse(
      readFileSync(env.PLAYWRIGHT_JSON_OUTPUT_FILE, 'utf8')
    )
    expect(stats).toMatchObject({
      expected: 54,
      unexpected: 0,
      skipped: 0,
      flaky: 0,
    })
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
})
