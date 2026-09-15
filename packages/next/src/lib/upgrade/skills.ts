import { mkdir, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import spawn from 'next/dist/compiled/cross-spawn'
import { getNpxCommand } from '../helpers/get-npx-command'

const SKILLS_CLI_VERSION = '1.5.26'

export async function writeUpgradeSkillInstructions(input: {
  directory: string
  runDirectory: string
  nextVersion: string
  skill: string
}): Promise<string> {
  const [command, ...runnerArgs] = getNpxCommand(input.directory).split(' ')
  const source =
    `https://github.com/vercel/next.js/tree/v${input.nextVersion}/skills/` +
    input.skill
  const args = [...runnerArgs, `skills@${SKILLS_CLI_VERSION}`, 'use', source]
  const skillDirectory = join(input.runDirectory, 'skills', input.skill)
  const instructionsPath = join(skillDirectory, 'PROMPT.md')

  await mkdir(skillDirectory, { recursive: true })

  try {
    const instructions = await new Promise<string>((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: input.directory,
        env: {
          ...process.env,
          TEMP: skillDirectory,
          TMP: skillDirectory,
          TMPDIR: skillDirectory,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''

      child.stdout?.setEncoding('utf8')
      child.stderr?.setEncoding('utf8')

      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk
      })
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk
      })
      child.once('error', reject)
      child.once('close', (code) => {
        if (code !== 0) {
          reject(
            new Error(
              `Could not prepare ${input.skill}: ${stderr.trim() || `exit code ${code ?? 'unknown'}`}`
            )
          )
          return
        }

        if (!stdout.trim()) {
          reject(new Error('Skill use returned no instructions.'))
          return
        }

        resolve(stdout)
      })
    })

    await writeFile(instructionsPath, instructions)
    return instructionsPath
  } catch (error) {
    await rm(skillDirectory, { recursive: true, force: true })
    throw error
  }
}
