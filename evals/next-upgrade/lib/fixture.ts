import { readFileSync } from 'node:fs'
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
  })
  await run('npm', [
    'install',
    '--prefix',
    `${toolsDirectory}/next`,
    `${toolsDirectory}/next.tgz`,
  ])
  await run('chmod', ['+x', `${toolsDirectory}/entry.mjs`])
  const prefix = await run('npm', ['prefix', '-g'])
  await run('mkdir', ['-p', join(prefix, 'bin')])
  await run('ln', [
    '-sf',
    `${toolsDirectory}/entry.mjs`,
    join(prefix, 'bin/next'),
  ])
}
