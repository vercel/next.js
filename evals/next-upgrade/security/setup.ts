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
  const security = `${toolsDirectory}/security`
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
    [config]: `[url "file://${remote}"]\n\tinsteadOf = ${repository}\n[remote "origin"]\n\turl = ${repository}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`,
    [`${toolsDirectory}/baseline.json`]: JSON.stringify({ head: baseline }),
  })

  await run('git', ['branch', '-M', 'main'])
  await run('git', ['clone', '--bare', '.', remote])
  await run('git', ['config', 'include.path', config])
  await run('git', ['fetch', 'origin'])
  await run('git', ['remote', 'set-head', 'origin', 'main'])
}
