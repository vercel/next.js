import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Sandbox } from '@vercel/agent-eval'
import { toolsDirectory } from '../lib/fixture'

export async function setupSecurity(sandbox: Sandbox) {
  const run = async (command: string, args: string[]) => {
    const result = await sandbox.runCommand(command, args)
    if (result.exitCode !== 0)
      throw new Error(
        `${command} failed during security setup:\n${result.stderr}`
      )
    return result.stdout.trim()
  }
  const fixture = process.env.NEXT_UPGRADE_EVAL_CASE
  if (!fixture?.startsWith('security-'))
    throw new Error('Select a security upgrade eval case')
  const crossMajorTarget = '15.5.24'
  const scenarios: Record<
    string,
    { target: string; range: string; versions: string[] }
  > = {
    'security-cross-major': {
      target: crossMajorTarget,
      range: `>=13.0.0 <${crossMajorTarget}`,
      versions: ['13.5.11', '14.2.35', crossMajorTarget, '16.0.0'],
    },
    'security-same-major': {
      target: '15.5.24',
      range: '>=15.0.0 <15.5.24',
      versions: ['15.5.23', '15.5.24', '16.0.0'],
    },
  }
  const scenario = scenarios[fixture]
  if (!scenario) throw new Error('Unknown security upgrade eval case')
  const security = `${toolsDirectory}/security`
  const bin = `${toolsDirectory}/bin`
  const repository = 'https://github.com/next-upgrade-eval/fixture.git'
  const remote = `${toolsDirectory}/origin.git`
  const config = `${toolsDirectory}/gitconfig`
  const baseline = await run('git', ['rev-parse', 'HEAD'])

  await run('mkdir', ['-p', security])
  await sandbox.writeFiles({
    [`${security}/assessment.mjs`]: readFileSync(
      join(__dirname, 'assessment.mjs'),
      'utf8'
    ),
    [`${security}/assessment.json`]: JSON.stringify(scenario),
    [`${security}/provider.mjs`]: readFileSync(
      join(__dirname, 'provider.mjs'),
      'utf8'
    ),
    [`${security}/package-runner.mjs`]: readFileSync(
      join(__dirname, 'package-runner.mjs'),
      'utf8'
    ),
    [config]: `[url "file://${remote}"]\n\tinsteadOf = ${repository}\n[remote "origin"]\n\turl = ${repository}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`,
    [`${toolsDirectory}/baseline.json`]: JSON.stringify({ head: baseline }),
  })

  await run('git', ['branch', '-M', 'main'])
  await run('git', ['clone', '--bare', '.', remote])
  await run('git', ['config', 'include.path', config])
  await run('git', ['fetch', 'origin'])
  await run('git', ['remote', 'set-head', 'origin', 'main'])

  const git = await run('sh', ['-c', 'command -v git'])
  const codemodVersion = await run('node', [
    '-p',
    `require('${toolsDirectory}/codemod/node_modules/@next/codemod/package.json').version`,
  ])
  await sandbox.writeFiles({
    [`${security}/package-runner.json`]: JSON.stringify({
      baseRunner: `${toolsDirectory}/package-runner.mjs`,
      codemodVersion,
      git,
    }),
    [join(bin, 'npm')]:
      `#!/bin/sh\nexec node ${security}/package-runner.mjs npm "$@"\n`,
    [join(bin, 'npx')]:
      `#!/bin/sh\nexec node ${security}/package-runner.mjs npx "$@"\n`,
    [join(bin, 'git')]:
      `#!/bin/sh\nexec node ${security}/package-runner.mjs git "$@"\n`,
  })
  await run('chmod', [
    '+x',
    join(bin, 'git'),
    join(bin, 'npm'),
    join(bin, 'npx'),
  ])
  await run('chmod', ['+x', `${security}/provider.mjs`])
  await run('ln', ['-sf', `${security}/provider.mjs`, join(bin, 'gh')])
}
