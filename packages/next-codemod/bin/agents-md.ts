/**
 * CLI handler for `npx @next/codemod agents-md`.
 * See ../lib/agents-md.ts for the core logic.
 */

import fs from 'fs'
import path from 'path'
import prompts from 'prompts'
import pc from 'picocolors'
import { BadInput } from './shared'
import {
  getNextjsVersion,
  pullDocs,
  collectDocFiles,
  buildDocTree,
  generateClaudeMdIndex,
  injectIntoClaudeMd,
  ensureGitignoreEntry,
} from '../lib/agents-md'
import { onCancel } from '../lib/utils'

export interface AgentsMdOptions {
  version?: string
  output?: string
}

const DOCS_DIR_NAME = '.next-docs'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

export async function runAgentsMd(options: AgentsMdOptions): Promise<void> {
  const cwd = process.cwd()

  // Mode logic:
  // 1. No flags → interactive mode (prompts for version + target file)
  // 2. --version provided → --output is REQUIRED (error if missing)
  // 3. --output alone → auto-detect version, error if not found

  let nextjsVersion: string
  let targetFile: string

  if (options.version) {
    // --version provided: --output is required
    if (!options.output) {
      throw new BadInput(
        'When using --version, --output is also required.\n' +
          'Example: npx @next/codemod agents-md --version 15.1.3 --output CLAUDE.md'
      )
    }
    nextjsVersion = options.version
    targetFile = options.output
  } else if (options.output) {
    // --output alone: auto-detect version
    const detected = getNextjsVersion(cwd)
    if (!detected.version) {
      throw new BadInput(
        'Could not detect Next.js version. Use --version to specify.\n' +
          `Example: npx @next/codemod agents-md --version 15.1.3 --output ${options.output}`
      )
    }
    nextjsVersion = detected.version
    targetFile = options.output
  } else {
    // No flags: interactive mode
    const promptedOptions = await promptForOptions(cwd)
    nextjsVersion = promptedOptions.nextVersion
    targetFile = promptedOptions.targetFile
  }

  const claudeMdPath = path.join(cwd, targetFile)
  const docsPath = path.join(cwd, DOCS_DIR_NAME)
  const docsLinkPath = `./${DOCS_DIR_NAME}`

  let sizeBefore = 0
  let isNewFile = true
  let existingContent = ''

  if (fs.existsSync(claudeMdPath)) {
    existingContent = fs.readFileSync(claudeMdPath, 'utf-8')
    sizeBefore = Buffer.byteLength(existingContent, 'utf-8')
    isNewFile = false
  }

  console.log(
    `\nDownloading Next.js ${pc.cyan(nextjsVersion)} documentation to ${pc.cyan(DOCS_DIR_NAME)}...`
  )

  const pullResult = await pullDocs({
    cwd,
    version: nextjsVersion,
    docsDir: docsPath,
  })

  if (!pullResult.success) {
    throw new BadInput(`Failed to pull docs: ${pullResult.error}`)
  }

  const docFiles = collectDocFiles(docsPath)
  const sections = buildDocTree(docFiles)

  const indexContent = generateClaudeMdIndex({
    docsPath: docsLinkPath,
    sections,
    outputFile: targetFile,
  })

  const newContent = injectIntoClaudeMd(existingContent, indexContent)
  fs.writeFileSync(claudeMdPath, newContent, 'utf-8')

  const sizeAfter = Buffer.byteLength(newContent, 'utf-8')

  const gitignoreResult = ensureGitignoreEntry(cwd)

  const action = isNewFile ? 'Created' : 'Updated'
  const sizeInfo = isNewFile
    ? formatSize(sizeAfter)
    : `${formatSize(sizeBefore)} → ${formatSize(sizeAfter)}`

  console.log(`${pc.green('✓')} ${action} ${pc.bold(targetFile)} (${sizeInfo})`)
  if (gitignoreResult.updated) {
    console.log(
      `${pc.green('✓')} Added ${pc.bold(DOCS_DIR_NAME)} to .gitignore`
    )
  }
  console.log('')
}

async function promptForOptions(
  cwd: string
): Promise<{ nextVersion: string; targetFile: string }> {
  // Detect Next.js version for default
  const versionResult = getNextjsVersion(cwd)
  const detectedVersion = versionResult.version

  console.log(
    pc.cyan('\n@next/codemod agents-md - Next.js Documentation for AI Agents\n')
  )

  if (detectedVersion) {
    console.log(pc.gray(`  Detected Next.js version: ${detectedVersion}\n`))
  }

  const response = await prompts(
    [
      {
        type: 'text',
        name: 'nextVersion',
        message: 'Next.js version',
        initial: detectedVersion || '',
        validate: (value: string) =>
          value.trim() ? true : 'Please enter a Next.js version',
      },
      {
        type: 'select',
        name: 'targetFile',
        message: 'Target markdown file',
        choices: [
          { title: 'CLAUDE.md', value: 'CLAUDE.md' },
          { title: 'AGENTS.md', value: 'AGENTS.md' },
          { title: 'Custom...', value: '__custom__' },
        ],
        initial: 0,
      },
    ],
    { onCancel }
  )

  // Handle cancelled prompts
  if (response.nextVersion === undefined || response.targetFile === undefined) {
    console.log(pc.yellow('\nCancelled.'))
    process.exit(0)
  }

  let targetFile = response.targetFile

  if (targetFile === '__custom__') {
    const customResponse = await prompts(
      {
        type: 'text',
        name: 'customFile',
        message: 'Enter custom file path',
        initial: 'CLAUDE.md',
        validate: (value: string) =>
          value.trim() ? true : 'Please enter a file path',
      },
      { onCancel }
    )

    if (customResponse.customFile === undefined) {
      console.log(pc.yellow('\nCancelled.'))
      process.exit(0)
    }

    targetFile = customResponse.customFile
  }

  return {
    nextVersion: response.nextVersion,
    targetFile,
  }
}
