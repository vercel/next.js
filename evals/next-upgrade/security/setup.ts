import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Sandbox } from '@vercel/agent-eval'
import { toolsDirectory } from '../lib/fixture'

export async function setupSecurity(sandbox: Sandbox) {
  const fixture = process.env.NEXT_UPGRADE_EVAL_CASE
  if (!fixture?.startsWith('security-'))
    throw new Error('Select a security upgrade eval case')
  const sameMajorTarget = '15.5.24'
  const crossMajorTarget = '15.5.24'
  const scenarios: Record<
    string,
    {
      target: string
      range: string
      versions: string[]
      duplicate: boolean
      installedVersion: string | undefined
      severity: string | undefined
    }
  > = {
    'security-cross-major': {
      target: crossMajorTarget,
      range: `>=13.0.0 <${crossMajorTarget}`,
      versions: ['13.5.11', '14.2.35', crossMajorTarget, '16.0.0'],
      duplicate: false,
      installedVersion: undefined,
      severity: undefined,
    },
    'security-duplicate': {
      target: sameMajorTarget,
      range: `>=15.0.0 <${sameMajorTarget}`,
      versions: ['15.5.23', sameMajorTarget, '16.0.0'],
      duplicate: true,
      installedVersion: undefined,
      severity: undefined,
    },
    'security-nudge-original-task': {
      target: sameMajorTarget,
      range: `>=15.0.0 <${sameMajorTarget}`,
      versions: ['15.5.23', sameMajorTarget, '16.0.0'],
      duplicate: false,
      installedVersion: '15.5.23',
      severity: 'high',
    },
    'security-same-major': {
      target: sameMajorTarget,
      range: `>=15.0.0 <${sameMajorTarget}`,
      versions: ['15.5.23', sameMajorTarget, '16.0.0'],
      duplicate: false,
      installedVersion: undefined,
      severity: undefined,
    },
  }
  const scenario = scenarios[fixture]
  if (!scenario) throw new Error('Unknown security upgrade eval case')

  await setupUpgradeScenario(sandbox, {
    fixturePrefix: 'security-',
    assessmentPath: join(__dirname, 'assessment.mjs'),
    assessment: scenario,
    installedVersion: scenario.installedVersion,
  })
}

export async function setupUpgradeScenario(
  sandbox: Sandbox,
  options: {
    fixturePrefix: string
    assessmentPath: string
    assessment: object
    installedVersion: string | undefined
    candidateScripts?: string[]
    skillInstructionsPath?: string
  }
) {
  const run = async (command: string, args: string[]) => {
    const result = await sandbox.runCommand(command, args)
    if (result.exitCode !== 0)
      throw new Error(
        `${command} failed during security setup:\n${result.stderr}`
      )
    return result.stdout.trim()
  }
  const fixture = process.env.NEXT_UPGRADE_EVAL_CASE
  if (!fixture?.startsWith(options.fixturePrefix))
    throw new Error(`Select a ${options.fixturePrefix} upgrade eval case`)
  const security = `${toolsDirectory}/security`
  const bin = `${toolsDirectory}/bin`
  const repository = 'https://github.com/next-upgrade-eval/fixture.git'
  const remote = `${toolsDirectory}/origin.git`
  const config = `${toolsDirectory}/gitconfig`
  const baseline = await run('git', ['rev-parse', 'HEAD'])

  await run('mkdir', ['-p', security])
  await sandbox.writeFiles({
    [`${security}/assessment.mjs`]: readFileSync(
      options.assessmentPath,
      'utf8'
    ),
    [`${security}/assessment.json`]: JSON.stringify(options.assessment),
    [`${security}/provider.mjs`]: readFileSync(
      join(__dirname, 'provider.mjs'),
      'utf8'
    ),
    [`${security}/package-runner.mjs`]: readFileSync(
      join(__dirname, 'package-runner.mjs'),
      'utf8'
    ),
    [`${security}/prepare-candidate.mjs`]: readFileSync(
      join(__dirname, 'prepare-candidate.mjs'),
      'utf8'
    ),
    ...(options.skillInstructionsPath
      ? {
          [`${security}/skill-instructions.md`]: readFileSync(
            options.skillInstructionsPath,
            'utf8'
          ),
        }
      : {}),
    [config]: `[url "file://${remote}"]\n\tinsteadOf = ${repository}\n`,
    [`${toolsDirectory}/baseline.json`]: JSON.stringify({ head: baseline }),
  })

  if (options.installedVersion) {
    await run('node', [
      `${security}/prepare-candidate.mjs`,
      options.installedVersion,
    ])
  }

  await run('git', ['branch', '-M', 'main'])
  await run('git', ['clone', '--bare', '.', remote])
  await run('git', ['config', 'include.path', config])
  await run('git', ['remote', 'add', 'origin', repository])
  await run('git', ['fetch', 'origin'])
  await run('git', ['remote', 'set-head', 'origin', 'main'])
  await run('git', ['config', '--unset', 'include.path'])

  const git = await run('sh', ['-c', 'command -v git'])
  const codemodVersion = await run('node', [
    '-p',
    `require('${toolsDirectory}/codemod/node_modules/@next/codemod/package.json').version`,
  ])
  await sandbox.writeFiles({
    [`${security}/package-runner.json`]: JSON.stringify({
      baseRunner: `${toolsDirectory}/package-runner.mjs`,
      candidateModules: `${toolsDirectory}/next/node_modules`,
      candidateNext: `${toolsDirectory}/next/node_modules/next`,
      codemodVersion,
      git,
      prepareFixture: Boolean(options.installedVersion),
      remote,
      repository,
      candidateScripts: options.candidateScripts ?? [],
      skillInstructions: options.skillInstructionsPath
        ? `${security}/skill-instructions.md`
        : undefined,
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
