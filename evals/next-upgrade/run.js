#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { Sandbox } = require('@vercel/sandbox')
const { config: loadEnvironment } = require('dotenv')
const { packPackage } = require('../lib/pack')
const { linkEnvironment } = require('../lib/environment')
const snapshotEnvironmentVariable = 'AGENT_EVAL_SANDBOX_SNAPSHOT_ID'

async function createToolchainSnapshot() {
  console.log('Preparing shared eval toolchain...')
  const token = process.env.VERCEL_TOKEN
  const credentials = token
    ? {
        token,
        teamId: process.env.VERCEL_TEAM_ID,
        projectId: process.env.VERCEL_PROJECT_ID,
      }
    : {}
  const sandbox = await Sandbox.create({
    runtime: 'node24',
    timeout: 600_000,
    ...credentials,
  })
  try {
    const install = await sandbox.runCommand({
      cmd: 'npm',
      args: [
        'install',
        '--global',
        '--no-audit',
        '--no-fund',
        '@anthropic-ai/claude-code',
        '@openai/codex',
      ],
    })
    if (install.exitCode !== 0) {
      const output =
        `${await install.stdout()}\n${await install.stderr()}`.trim()
      throw new Error(`Preparing shared eval toolchain failed:\n${output}`)
    }
    return await sandbox.snapshot({ expiration: 24 * 60 * 60 * 1000 })
  } catch (error) {
    await sandbox.stop()
    throw error
  }
}

async function main() {
  const root = path.resolve(__dirname, '../..')
  linkEnvironment(root, __dirname)
  loadEnvironment({ path: path.join(__dirname, '.env.local'), override: true })
  loadEnvironment({ path: path.join(__dirname, '.env'), override: true })
  const args = process.argv.slice(2)
  const fixturesDirectory = path.join(__dirname, 'evals')
  const { discoverFixtures, loadFixture } = await import('@vercel/agent-eval')
  const cases = fs.existsSync(fixturesDirectory)
    ? discoverFixtures(fixturesDirectory)
    : []
  if (args.includes('--list')) {
    if (args.length !== 1) throw new Error('Use --list by itself')
    console.log(cases.join('\n'))
    return
  }
  const selected = args.filter((arg) => !arg.startsWith('--'))
  if (selected.length !== 1)
    throw new Error(
      'Select one upgrade eval fixture; use --list to list fixtures'
    )
  const fixture = selected[0]
  const harness = process.env.NEXT_UPGRADE_EVAL_EXPERIMENT
  if (harness && !['codex', 'claude'].includes(harness))
    throw new Error('Select codex or claude')
  if (!cases.includes(fixture))
    throw new Error(`Available cases: ${cases.join(', ')}`)
  if (args.some((arg) => arg.startsWith('--') && arg !== '--dry'))
    throw new Error('Supported flags: --dry, --list')
  // Validate using the framework's own fixture rules. Its run command otherwise
  // falls back to all fixtures when an explicit filter matches no valid fixture.
  loadFixture(fixturesDirectory, fixture)
  if (args.includes('--dry')) return console.log(fixture)
  for (const [name, entry] of [
    ['next', 'dist/bin/next'],
    ['next-codemod', 'bin/next-codemod.js'],
  ]) {
    if (!fs.existsSync(path.join(root, 'packages', name, entry)))
      throw new Error(`Build packages/${name} before running upgrade evals`)
  }
  const tarballs = path.join(__dirname, '.tarballs')
  fs.mkdirSync(tarballs, { recursive: true })
  const env = {
    ...process.env,
    NEXT_UPGRADE_EVAL_NEXT_TARBALL: packPackage(
      path.join(root, 'packages/next'),
      path.join(tarballs, 'next.tgz')
    ),
    NEXT_UPGRADE_EVAL_CODEMOD_TARBALL: packPackage(
      path.join(root, 'packages/next-codemod'),
      path.join(tarballs, 'codemod.tgz')
    ),
  }
  fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true })
  let snapshot
  try {
    if (!env[snapshotEnvironmentVariable]) {
      snapshot = await createToolchainSnapshot()
      env[snapshotEnvironmentVariable] = snapshot.snapshotId
    }
    const experiments = harness ? [harness] : ['codex', 'claude']
    const result = spawnSync(
      path.join(root, 'node_modules/.bin/agent-eval'),
      ['run', ...experiments, '--force', '--ack-failures'],
      {
        cwd: __dirname,
        env: {
          ...env,
          NEXT_UPGRADE_EVAL_CASE: fixture,
          ...(experiments.length > 1
            ? {
                AGENT_EVAL_PREPARE_FIXTURE_ONCE: '1',
                AGENT_EVAL_PREPARED_FIXTURE_CONSUMERS: String(
                  experiments.length
                ),
              }
            : {}),
        },
        stdio: 'inherit',
      }
    )
    if (result.error) throw result.error
    if (result.status !== 0) process.exitCode = 1
  } finally {
    if (snapshot) {
      try {
        await snapshot.delete()
      } catch (error) {
        console.error('Failed to delete eval toolchain snapshot:', error)
        process.exitCode = 1
      }
    }
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
