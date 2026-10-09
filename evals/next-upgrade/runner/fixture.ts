import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Sandbox } from '@vercel/agent-eval'

export const suite = resolve(__dirname, '..')
export const toolsDirectory = '/tmp/next-upgrade-eval'
export type Scenario = {
  kind: 'direct' | 'nudge'
  policy: 'security' | 'latest'
  app: string
  sourceVersion: string
  targetVersion: string
}

// The six cases share one contract per task kind, without per-case copies.
export function requiredChecks(kind: Scenario['kind']): string[] {
  return kind === 'direct'
    ? [
        'manifest',
        'lockfile',
        'installed-version',
        'typecheck',
        'build',
        'http',
        'browser',
      ]
    : ['notice-emitted', 'notice-mentioned', 'nudge-not-discredited']
}

// Scenario data belongs to this repository; native loadFixture validates the
// assembled prompt and EVAL.ts before any Sandbox is allocated.
export function loadCase(name: string): Scenario {
  return JSON.parse(
    readFileSync(join(suite, 'cases', name, 'scenario.json'), 'utf8')
  )
}

export function materialize(name: string, root: string): void {
  const scenario = loadCase(name)
  const destination = join(root, 'evals', name)
  cpSync(join(suite, 'apps', scenario.app), destination, {
    recursive: true,
    filter: (file) => !file.split('/').includes('node_modules'),
  })
  // Next 15 and 16 use the same dashboard source; the case pins its starting
  // release instead of keeping another copy of the app.
  if (scenario.kind === 'direct') {
    const manifestPath = join(destination, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.dependencies.next = scenario.sourceVersion
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  }
  cpSync(
    join(suite, 'cases', name, 'PROMPT.md'),
    join(destination, 'PROMPT.md')
  )
  cpSync(join(suite, 'cases', name, 'EVAL.ts'), join(destination, 'EVAL.ts'))
  mkdirSync(join(destination, 'validation'), { recursive: true })
  // Basename EVAL.ts is withheld by the native collector, including helper files.
  cpSync(
    join(
      suite,
      'verifier',
      scenario.kind === 'direct' ? 'upgrade.ts' : 'nudge.ts'
    ),
    join(destination, 'validation/EVAL.ts')
  )
  if (scenario.kind === 'nudge') {
    cpSync(
      join(suite, 'verifier/judge'),
      join(destination, 'validation/judge'),
      { recursive: true }
    )
    writeFileSync(
      join(destination, 'package.json'),
      JSON.stringify(
        {
          name,
          private: true,
          type: 'module',
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
          },
          dependencies: {
            next: '16.5.0',
            react: '19.1.0',
            'react-dom': '19.1.0',
          },
          devDependencies: {
            typescript: '5.8.3',
            '@types/node': '20.17.7',
            '@types/react': '19.1.2',
            '@types/react-dom': '19.1.2',
          },
        },
        null,
        2
      )
    )
    writeFileSync(
      join(destination, 'next.config.ts'),
      `export default { agentRules: false, experimental: { agentUpgrade: '${scenario.policy}' as const } }\n`
    )
    const rules =
      'Work locally. Do not push, create pull requests, or change global agent configuration. Use npm.\n'
    writeFileSync(join(destination, 'AGENTS.md'), rules)
    writeFileSync(join(destination, 'CLAUDE.md'), rules)
  }
}

export async function setupFixture(
  sandbox: Sandbox
): Promise<{ env: Record<string, string> }> {
  const name = process.env.NEXT_UPGRADE_EVAL_CASE
  const root = process.env.NEXT_UPGRADE_EVAL_RUN_ROOT
  const nextTarball = process.env.NEXT_UPGRADE_EVAL_NEXT_TARBALL
  const codemodTarball = process.env.NEXT_UPGRADE_EVAL_CODEMOD_TARBALL
  if (!name || !root || !nextTarball || !codemodTarball) {
    throw new Error('Use pnpm eval:upgrade to supply run inputs')
  }
  const scenario = loadCase(name)
  const run = async (cmd: string, args: string[]) => {
    const result = await sandbox.runCommand(cmd, args)
    if (result.exitCode !== 0) {
      throw new Error(`Setup ${cmd} failed: ${result.stderr}`)
    }
    return result.stdout.trim()
  }
  const files: Record<string, string> = {}
  for (const file of ['entry.mjs', 'package-runner.mjs', 'upstream.mjs']) {
    files[join(toolsDirectory, file)] = readFileSync(
      join(__dirname, file),
      'utf8'
    )
  }
  files[join(toolsDirectory, 'upstream.json')] = readFileSync(
    join(suite, 'cases', name, 'upstream.json'),
    'utf8'
  )
  await sandbox.writeFiles(files)
  // The native implementation supports Buffer uploads despite the setup interface.
  // @ts-expect-error binary upload supported at runtime
  await sandbox.writeFiles({
    [join(toolsDirectory, 'next.tgz')]: readFileSync(nextTarball),
    [join(toolsDirectory, 'codemod.tgz')]: readFileSync(codemodTarball),
  })
  await run('npm', [
    'install',
    '--no-audit',
    '--no-fund',
    '--prefix',
    `${toolsDirectory}/next`,
    `${toolsDirectory}/next.tgz`,
  ])
  await run('npm', [
    'install',
    '--no-audit',
    '--no-fund',
    '--prefix',
    `${toolsDirectory}/codemod`,
    `${toolsDirectory}/codemod.tgz`,
  ])
  if (scenario.kind === 'nudge') {
    const bindingVersion = process.env.NEXT_UPGRADE_EVAL_NATIVE_BINDING_VERSION
    if (!bindingVersion) {
      throw new Error(
        'Supply the original candidate native binding identity for a stable test build'
      )
    }
    await run('npm', [
      'install',
      '--no-audit',
      '--no-fund',
      '--prefix',
      `${toolsDirectory}/next`,
      `@next/swc-linux-x64-gnu@${bindingVersion}`,
      'react@19.1.0',
      'react-dom@19.1.0',
    ])
  }
  const nextVersion = await run('node', [
    '-p',
    `require('${toolsDirectory}/next/node_modules/next/package.json').version`,
  ])
  if (scenario.kind === 'nudge' && nextVersion !== scenario.sourceVersion) {
    throw new Error('Nudge tarball has the wrong declared test identity')
  }
  const compiledVersion = await run('node', [
    `${toolsDirectory}/next/node_modules/next/dist/bin/next`,
    '--version',
  ])
  if (!compiledVersion.endsWith(nextVersion)) {
    throw new Error('Candidate manifest and compiled CLI identity disagree')
  }
  const codemodVersion = await run('node', [
    '-p',
    `require('${toolsDirectory}/codemod/node_modules/@next/codemod/package.json').version`,
  ])
  const npm = await run('sh', ['-c', 'command -v npm'])
  const npx = await run('sh', ['-c', 'command -v npx'])
  const originalPath = await run('sh', ['-c', 'printf %s "$PATH"'])
  const bin = join(toolsDirectory, 'bin')
  await run('mkdir', ['-p', bin])
  await sandbox.writeFiles({
    [join(toolsDirectory, 'package-runner.json')]: JSON.stringify({
      nextVersion,
      codemodVersion,
      npm,
      npx,
      nudge: scenario.kind === 'nudge',
    }),
    [join(bin, 'npm')]:
      `#!/bin/sh\nexec node ${toolsDirectory}/package-runner.mjs npm "$@"\n`,
    [join(bin, 'npx')]:
      `#!/bin/sh\nexec node ${toolsDirectory}/package-runner.mjs npx "$@"\n`,
  })
  await run('chmod', [
    '+x',
    join(bin, 'npm'),
    join(bin, 'npx'),
    join(toolsDirectory, 'entry.mjs'),
  ])
  await run('ln', ['-sf', join(toolsDirectory, 'entry.mjs'), join(bin, 'next')])
  // Resolve the app lockfile before recording the baseline. agent-eval installs
  // dependencies from this lockfile next, and the shared snapshot retains both.
  if (scenario.kind === 'direct') {
    await run('npm', [
      'install',
      '--package-lock-only',
      '--no-audit',
      '--no-fund',
    ])
  } else {
    // Install the stable test build honestly, never relabel or symlink a release.
    await run('npm', [
      'install',
      '--no-audit',
      '--no-fund',
      `${toolsDirectory}/next.tgz`,
    ])
    await run('npm', [
      'install',
      '--save-dev',
      '--no-audit',
      '--no-fund',
      `@next/swc-linux-x64-gnu@${process.env.NEXT_UPGRADE_EVAL_NATIVE_BINDING_VERSION}`,
    ])
    await run('mkdir', ['-p', '/tmp/next-upgrade-baseline'])
    await run('cp', [
      'package-lock.json',
      '/tmp/next-upgrade-baseline/package-lock.json',
    ])
    // npm scripts resolve local next. A wrapper at that real bin records raw output.
    await run('rm', ['node_modules/.bin/next'])
    await sandbox.writeFiles({
      'node_modules/.bin/next': `#!/bin/sh\nexec node ${toolsDirectory}/entry.mjs "$@"\n`,
    })
    await run('chmod', ['+x', 'node_modules/.bin/next'])
  }
  await run('git', ['add', '--force', 'package-lock.json', 'package.json'])
  await run('git', ['commit', '--amend', '--no-edit'])
  await sandbox.writeFiles({
    [join(toolsDirectory, 'baseline.json')]: JSON.stringify({
      head: await run('git', ['rev-parse', 'HEAD']),
    }),
  })
  return {
    env: {
      PATH: `${bin}:${originalPath}`,
      NEXT_TELEMETRY_DISABLED: '1',
      NODE_OPTIONS: `--import=${toolsDirectory}/upstream.mjs`,
    },
  }
}
