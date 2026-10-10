import { cp, mkdir, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getNpxCommand } from '../package-runner'
import type { UpgradeDocument } from '../../shared/future-defaults'

const SKILLS_CLI_VERSION = '1.5.26'

type PrepareUpgradeDocumentInput = {
  directory: string
  runDirectory: string
  bundledDocs: string
  nextVersion: string
  document: UpgradeDocument
}

export async function prepareUpgradeDocument(
  input: PrepareUpgradeDocumentInput
): Promise<string> {
  if (input.document.startsWith('docs/')) {
    const path = input.document.slice('docs/'.length)
    const destination = join(input.runDirectory, input.document)
    await mkdir(dirname(destination), { recursive: true })
    await cp(join(input.bundledDocs, path), destination)
    return destination
  }

  const match = /^skills\/(.+)\/SKILL\.md$/.exec(input.document)
  if (!match) {
    throw new Error(`Unsupported upgrade document ${input.document}.`)
  }

  return prepareUpgradeSkill(input, match[1])
}

async function prepareUpgradeSkill(
  input: PrepareUpgradeDocumentInput,
  skill: string
): Promise<string> {
  const spawnCommand = require('cross-spawn') as typeof import('cross-spawn')
  const [command, ...runnerArgs] = getNpxCommand(input.directory).split(' ')
  const source =
    `https://github.com/vercel/next.js/tree/v${input.nextVersion}/skills/` +
    skill
  const args = [...runnerArgs, `skills@${SKILLS_CLI_VERSION}`, 'use', source]
  const skillDirectory = join(input.runDirectory, 'skills', skill)
  const instructionsPath = join(skillDirectory, 'PROMPT.md')

  await mkdir(skillDirectory, { recursive: true })

  try {
    const instructions = await new Promise<string>((resolve, reject) => {
      const child = spawnCommand(command, args, {
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
              `Could not prepare ${input.document}: ${stderr.trim() || `exit code ${code ?? 'unknown'}`}`
            )
          )
          return
        }

        if (!stdout.trim()) {
          reject(new Error(`${input.document} returned no instructions.`))
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
