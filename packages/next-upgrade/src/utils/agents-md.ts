import fs from 'fs'
import path from 'path'
import { createAppRequire } from './project'

const AGENT_RULES_START_MARKER = '<!-- BEGIN:nextjs-agent-rules -->'

/**
 * After an upgrade, refresh the managed agent-rules block in
 * AGENTS.md so its content matches the Next.js version that is now installed.
 *
 * Delegates to the installed package's own generator
 * (`next/dist/server/lib/generate-agent-files`), so the block text is
 * always the one shipped with that version — this package never
 * carries its own copy. Returns `'refreshed'` when a file was
 * rewritten, `'current'` when the block was already up to date, and
 * `'skipped'` when there is nothing to do: the project never adopted
 * the managed block, or the installed Next.js predates the generator
 * (< 16.3).
 */
export function refreshAgentRulesBlock(
  cwd: string
): 'refreshed' | 'current' | 'skipped' {
  let agentsMdContent: string
  try {
    agentsMdContent = fs.readFileSync(path.join(cwd, 'AGENTS.md'), 'utf-8')
  } catch {
    return 'skipped'
  }
  if (!agentsMdContent.includes(AGENT_RULES_START_MARKER)) return 'skipped'

  let writeAgentFiles: (dir: string) => { agentsMd: string }
  try {
    writeAgentFiles = createAppRequire(cwd)(
      'next/dist/server/lib/generate-agent-files'
    ).writeAgentFiles
    if (typeof writeAgentFiles !== 'function') return 'skipped'
  } catch {
    return 'skipped'
  }

  const result = writeAgentFiles(cwd)
  return result.agentsMd === 'updated' ? 'refreshed' : 'current'
}
