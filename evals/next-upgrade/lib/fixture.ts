import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Sandbox } from '@vercel/agent-eval'

export const toolsDirectory = '/tmp/next-upgrade-eval'

export async function setupUpgrade(sandbox: Sandbox) {
  const run = async (command: string, args: string[]) => {
    const result = await sandbox.runCommand(command, args)
    if (result.exitCode !== 0)
      throw new Error(
        `${command} failed during upgrade setup:\n${result.stderr}`
      )
    return result.stdout.trim()
  }
  const nextTarball = process.env.NEXT_UPGRADE_EVAL_NEXT_TARBALL
  const codemodTarball = process.env.NEXT_UPGRADE_EVAL_CODEMOD_TARBALL
  if (!nextTarball || !codemodTarball)
    throw new Error(
      'Run through pnpm eval:upgrade to provide the candidate packages'
    )

  const fixture = process.env.NEXT_UPGRADE_EVAL_CASE
  if (!fixture) throw new Error('Select one upgrade eval case')
  const fixtureDirectory = join(__dirname, '../evals', fixture)
  const baselineFiles = Object.fromEntries(
    ['package-lock.json'].flatMap((name) => {
      const file = join(fixtureDirectory, name)
      return existsSync(file) ? [[name, readFileSync(file, 'utf8')]] : []
    })
  )
  await sandbox.writeFiles(baselineFiles)
  await run('git', ['add', '--force', ...Object.keys(baselineFiles)])
  await run('git', ['commit', '--amend', '--no-edit'])

  await run('mkdir', ['-p', toolsDirectory])
  await sandbox.writeFiles({
    // @ts-expect-error agent-eval accepts binary upload at runtime
    [`${toolsDirectory}/next.tgz`]: readFileSync(nextTarball),
    // @ts-expect-error agent-eval accepts binary upload at runtime
    [`${toolsDirectory}/codemod.tgz`]: readFileSync(codemodTarball),
    [`${toolsDirectory}/entry.mjs`]: readFileSync(
      join(__dirname, 'entry.mjs'),
      'utf8'
    ),
    [`${toolsDirectory}/package-runner.mjs`]: readFileSync(
      join(__dirname, 'package-runner.mjs'),
      'utf8'
    ),
  })
  await run('npm', [
    'install',
    '--prefix',
    `${toolsDirectory}/next`,
    `${toolsDirectory}/next.tgz`,
  ])
  await run('npm', [
    'install',
    '--prefix',
    `${toolsDirectory}/codemod`,
    `${toolsDirectory}/codemod.tgz`,
  ])
  await run('chmod', ['+x', `${toolsDirectory}/entry.mjs`])
  const path = await run('sh', ['-c', 'printf %s "$PATH"'])
  const bin = `${toolsDirectory}/bin`
  const npm = await run('sh', ['-c', 'command -v npm'])
  const npx = await run('sh', ['-c', 'command -v npx'])
  const nextVersion = await run('node', [
    '-p',
    `require('${toolsDirectory}/next/node_modules/next/package.json').version`,
  ])
  await run('mkdir', ['-p', bin])
  await sandbox.writeFiles({
    [`${toolsDirectory}/package-runner.json`]: JSON.stringify({
      nextVersion,
      npm,
      npx,
    }),
    [join(bin, 'npm')]:
      `#!/bin/sh\nexec node ${toolsDirectory}/package-runner.mjs npm "$@"\n`,
    [join(bin, 'npx')]:
      `#!/bin/sh\nexec node ${toolsDirectory}/package-runner.mjs npx "$@"\n`,
  })
  await run('chmod', ['+x', join(bin, 'npm'), join(bin, 'npx')])
  await run('ln', ['-sf', `${toolsDirectory}/entry.mjs`, join(bin, 'next')])

  return { env: { PATH: `${bin}:${path}` } }
}
