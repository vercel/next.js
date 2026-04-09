/**
 * CLI handler for `npx @next/codemod upgrade agents-md`. Upserts the
 * create-next-app agent-rules block into `AGENTS.md` / `CLAUDE.md`
 * using the docs bundled at `node_modules/next/dist/docs/`. Anchors
 * strictly on `cwd` — same contract as `codemod upgrade`.
 */

import pc from 'picocolors'
import { BadInput } from './shared'
import {
  getNextjsVersion,
  requireNextProjectDir,
  hasBundledDocs,
  writeBundledDocsAgentFiles,
  type BundledDocsFileAction,
} from '../lib/agents-md'

export async function runUpgradeAgentsMd(): Promise<void> {
  const cwd = process.cwd()

  let projectDir: string
  try {
    projectDir = requireNextProjectDir(cwd)
  } catch (err) {
    throw new BadInput((err as Error).message)
  }

  if (!hasBundledDocs(projectDir)) {
    throw new BadInput(
      `The Next.js install at ${pc.cyan(projectDir)} does not ship bundled docs. ` +
        `Upgrade to Next.js 16.2 or newer, or run \`npx @next/codemod agents-md\` ` +
        `to pull docs for an older version via git.`
    )
  }

  const detectedVersion = getNextjsVersion(projectDir).version
  const versionLabel = detectedVersion
    ? pc.cyan(detectedVersion)
    : pc.cyan('next')

  console.log(
    `\nScaffolding agent rules for Next.js ${versionLabel} in ${pc.cyan(projectDir)}.`
  )

  const result = writeBundledDocsAgentFiles(projectDir)

  const describe = (file: string, action: BundledDocsFileAction) => {
    // Don't list files we didn't touch at all.
    if (action === 'skipped') return
    const symbol = action === 'unchanged' ? pc.gray('•') : pc.green('✓')
    const verb =
      action === 'created'
        ? 'Created'
        : action === 'updated'
          ? 'Updated'
          : 'Up to date:'
    console.log(`${symbol} ${verb} ${pc.bold(file)}`)
  }

  describe('AGENTS.md', result.agentsMd)
  describe('CLAUDE.md', result.claudeMd)
  console.log('')
}
