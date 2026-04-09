/**
 * CLI handler for `npx @next/codemod upgrade agents-md` — the
 * `agents-md` subcommand nested under `upgrade`.
 *
 * This is the "fast path" variant of the `agents-md` codemod. It
 * upserts the canonical create-next-app-style agent-rules block into
 * the project's `AGENTS.md` / `CLAUDE.md` using the version-matched
 * docs bundled at `node_modules/next/dist/docs/`. No git clone, no
 * `.next-docs/` scratch directory.
 *
 * Anchors strictly on `cwd`: the caller must already be inside a
 * Next.js app directory (the `package.json` that declares `next`).
 * This mirrors `upgrade.ts`'s own cwd contract — running either
 * command from a monorepo root is an error, not a silent fallback.
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
