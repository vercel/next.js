import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Sandbox } from '@vercel/agent-eval'

const root = '/tmp/next-upgrade-tools'
const project = join(__dirname, '..')

async function run(
  sandbox: Sandbox,
  command: string,
  args: string[],
  cwd?: string
) {
  const result = await sandbox.runCommand(
    command,
    args,
    cwd ? { cwd } : undefined
  )
  if (result.exitCode !== 0)
    throw new Error(
      `Upgrade eval setup failed: ${command}\n${result.stderr}\n${result.stdout}`
    )
  return result.stdout
}

export async function setupUpgrade(
  sandbox: Sandbox,
  harness: 'codex' | 'claude',
  nativeRunner: string
) {
  const scenario = JSON.parse(await sandbox.readFile('scenario.json'))
  if (scenario.entry === 'terminal') {
    // The Node managed image does not include Python, used for the real PTY.
    await run(sandbox, 'sudo', ['apt-get', 'update', '-qq'])
    await run(sandbox, 'sudo', [
      'apt-get',
      'install',
      '-y',
      'python3',
      'python3-pyte',
    ])
  }
  await run(sandbox, 'mkdir', [
    '-p',
    `${root}/bin`,
    `${root}/next`,
    `${root}/codemod`,
  ])
  const nextTarball = process.env.NEXT_UPGRADE_EVAL_NEXT_TARBALL
  const codemodTarball = process.env.NEXT_UPGRADE_EVAL_CODEMOD_TARBALL
  if (!nextTarball || !codemodTarball)
    throw new Error(
      'Run through pnpm eval:upgrade to provide the separately packed local tools.'
    )
  await sandbox.writeFiles({
    // The runtime accepts Buffer to preserve archive bytes; its type exposes only text.
    // @ts-expect-error binary file upload
    [`${root}/next.tgz`]: readFileSync(nextTarball),
    // @ts-expect-error binary file upload
    [`${root}/codemod.tgz`]: readFileSync(codemodTarball),
    [`${root}/next/package.json`]: '{"private":true}',
    [`${root}/codemod/package.json`]: '{"private":true}',
    [`${root}/scenario.json`]: JSON.stringify(scenario),
    [`${root}/native-runner.mjs`]: readFileSync(nativeRunner, 'utf8'),
    [`${root}/provider.json`]: readFileSync(
      join(
        project,
        'fixtures/providers',
        scenario.id === 'existing-pr' ? 'existing.json' : 'empty.json'
      ),
      'utf8'
    ),
    ...Object.fromEntries(
      [
        'provider-fixture.cjs',
        'resolver-fixture.cjs',
        'package-runner.cjs',
        'runtime.cjs',
        'controls.cjs',
        'terminal.py',
        'publication-guard.cjs',
      ].map((name) => [
        `${root}/${name}`,
        readFileSync(join(__dirname, name), 'utf8'),
      ])
    ),
  })
  await run(sandbox, 'npm', ['install', '-g', 'pnpm@10.28.0'])
  const packageRunner = (
    await run(sandbox, 'sh', ['-c', 'command -v pnpm'])
  ).trim()
  await run(sandbox, packageRunner, ['install', '--no-frozen-lockfile'])
  await run(sandbox, 'npm', [
    'install',
    '--prefix',
    `${root}/next`,
    `${root}/next.tgz`,
  ])
  await run(sandbox, 'npm', [
    'install',
    '--prefix',
    `${root}/codemod`,
    `${root}/codemod.tgz`,
  ])
  const versions = JSON.parse(
    await run(sandbox, 'node', [
      '-e',
      `console.log(JSON.stringify({ next:require('${root}/next/node_modules/next/package.json').version,codemod:require('${root}/codemod/node_modules/@next/codemod/package.json').version }))`,
    ])
  )
  versions.packageRunner = packageRunner
  const security = JSON.parse(
    readFileSync(
      join(
        project,
        'fixtures/security',
        scenario.major ? 'major-migration.json' : 'same-major.json'
      ),
      'utf8'
    )
  )
  security.registry = { versions: {}, time: {} }
  for (const version of [
    '14.0.0',
    '15.0.0',
    '15.5.23',
    '15.5.24',
    '16.0.0',
    '16.3.3',
  ]) {
    const metadata = JSON.parse(
      await run(sandbox, 'npm', ['view', `next@${version}`, '--json'])
    )
    security.registry.versions[version] = {
      version,
      engines: metadata.engines,
      peerDependencies: metadata.peerDependencies,
    }
    security.registry.time[version] = version.startsWith('14.')
      ? '2023-10-26T00:00:00Z'
      : version.startsWith('15.')
        ? '2024-10-21T00:00:00Z'
        : '2025-10-21T00:00:00Z'
  }
  await sandbox.writeFiles({
    [`${root}/security.json`]: JSON.stringify(security),
    [`${root}/versions.json`]: JSON.stringify(versions),
    [`${root}/bin/next`]: `#!/bin/sh\nexec node --require ${root}/resolver-fixture.cjs ${root}/next/node_modules/next/dist/bin/next "$@"\n`,
    [`${root}/bin/pnpm`]: `#!/bin/sh\nexec node ${root}/package-runner.cjs "$@"\n`,
    '.gitignore':
      'node_modules/\n.next/\n__agent_eval__/\n.upgrade-runtime.log\n',
  })
  await run(sandbox, 'chmod', ['+x', `${root}/bin/next`, `${root}/bin/pnpm`])
  if (scenario.major) {
    try {
      await run(sandbox, 'node', [`${root}/controls.cjs`])
    } finally {
      await run(sandbox, 'rm', ['-f', `${root}/controls.cjs`])
    }
  }
  await run(sandbox, 'git', ['config', 'user.name', 'Upgrade eval'])
  await run(sandbox, 'git', [
    'config',
    'user.email',
    'upgrade-eval@example.invalid',
  ])
  await run(sandbox, 'git', ['add', '.'])
  await run(sandbox, 'git', [
    'commit',
    '-m',
    'Prepare original upgrade fixture',
  ])
  await run(sandbox, 'git', ['branch', '-M', 'main'])
  const head = (await run(sandbox, 'git', ['rev-parse', 'HEAD'])).trim()
  const tree = (await run(sandbox, 'git', ['rev-parse', 'HEAD^{tree}'])).trim()
  await sandbox.writeFiles({
    [`${root}/baseline.json`]: JSON.stringify({
      head,
      tree,
      source: scenario.source,
      target: scenario.target,
      harness,
      ...versions,
    }),
  })
  const publicationTools: Record<string, string> = {}
  for (const name of ['git', 'gh', 'glab']) {
    const found = await sandbox.runCommand('sh', ['-c', `command -v ${name}`])
    if (found.exitCode === 0) publicationTools[name] = found.stdout.trim()
  }
  await sandbox.writeFiles({
    [`${root}/publication-tools.json`]: JSON.stringify(publicationTools),
    ...Object.fromEntries(
      ['git', 'gh', 'glab'].map((name) => [
        `${root}/bin/${name}`,
        `#!/bin/sh\nexec node ${root}/publication-guard.cjs ${name} "$@"\n`,
      ])
    ),
  })
  await run(sandbox, 'chmod', [
    '+x',
    ...['git', 'gh', 'glab'].map((name) => `${root}/bin/${name}`),
  ])
}
