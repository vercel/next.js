/**
 * agents-md: Generate Next.js documentation index for AI coding agents.
 *
 * Downloads docs from GitHub via git sparse-checkout, builds a compact
 * index of all doc files, and injects it into CLAUDE.md or AGENTS.md.
 */

import execa from 'execa'
import fs from 'fs'
import path from 'path'
import os from 'os'

interface NextjsVersionResult {
  version: string | null
  error?: string
}

export function getNextjsVersion(cwd: string): NextjsVersionResult {
  try {
    const nextPkgPath = require.resolve('next/package.json', { paths: [cwd] })
    const pkg = JSON.parse(fs.readFileSync(nextPkgPath, 'utf-8'))
    return { version: pkg.version }
  } catch {
    // Not found at root - check for monorepo workspace
    const workspace = detectWorkspace(cwd)
    if (workspace.isMonorepo && workspace.packages.length > 0) {
      const highestVersion = findNextjsInWorkspace(cwd, workspace.packages)

      if (highestVersion) {
        return { version: highestVersion }
      }

      return {
        version: null,
        error: `No Next.js found in ${workspace.type} workspace packages.`,
      }
    }

    return {
      version: null,
      error: 'Next.js is not installed in this project.',
    }
  }
}

/**
 * Find the Next.js project directory — the canonical location for
 * AGENTS.md / CLAUDE.md. This is the nearest ancestor directory with
 * a `package.json` that declares `next` as a dependency.
 *
 * In a monorepo, this resolves to the *sub-package* that actually
 * uses Next.js (e.g. `apps/web/`), never the monorepo root that
 * wraps it. That's because AI coding agents locate agent-rules files
 * by reading from the package they're currently working in — so
 * AGENTS.md must be co-located with the package.json that declares
 * the dependency.
 *
 * Resolution order:
 *   1. Walk up from `cwd` looking for a `package.json` that has
 *      `next` in `dependencies` / `devDependencies` / `peerDependencies`.
 *      Covers the common case (user `cd`'d into the package).
 *   2. If nothing found walking up, fall back to walking the detected
 *      workspace packages from `cwd`. Covers the less-common case
 *      where the user runs the codemod from the monorepo root without
 *      cd'ing into the sub-package first.
 *
 * Returns `null` if no Next.js project is found anywhere in the walk.
 */
export function findNextProjectDir(cwd: string): string | null {
  let currentDir = path.resolve(cwd)
  while (true) {
    if (packageJsonHasNext(currentDir)) return currentDir
    const parent = path.dirname(currentDir)
    if (parent === currentDir) break
    currentDir = parent
  }

  // Fallback for monorepo-root invocations: walk the workspace
  // packages and find the first one that declares next.
  const workspace = detectWorkspace(cwd)
  if (workspace.isMonorepo && workspace.packages.length > 0) {
    for (const pkgPath of expandWorkspacePatterns(cwd, workspace.packages)) {
      if (packageJsonHasNext(pkgPath)) return pkgPath
    }
  }

  return null
}

function packageJsonHasNext(dir: string): boolean {
  try {
    const content = fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')
    const pkg = JSON.parse(content)
    return Boolean(
      pkg.dependencies?.next ||
        pkg.devDependencies?.next ||
        pkg.peerDependencies?.next
    )
  } catch {
    return false
  }
}

/**
 * Returns true when the Next.js install in `projectDir` ships
 * version-matched bundled docs at `node_modules/next/dist/docs/`.
 * Used to decide between the fast path (which only writes AGENTS.md)
 * and the legacy git-clone flow.
 *
 * Checked directly at `projectDir/node_modules/next/...` — no Node-
 * resolution walk-up — because that's the only layout where the
 * `node_modules/next/dist/docs/` string we bake into the managed
 * block is guaranteed to resolve correctly from the AGENTS.md
 * location. pnpm's symlinked `node_modules/next` at the sub-package
 * satisfies this. Hoisted `node_modules` layouts that only have
 * `next` at the monorepo root won't match here and will cleanly
 * fall back to the legacy git-clone flow.
 */
export function hasBundledDocs(projectDir: string): boolean {
  return isDirectory(
    path.join(projectDir, 'node_modules', 'next', 'dist', 'docs')
  )
}

/**
 * Marker pair delimiting the Next.js-managed section inside an AGENTS.md file.
 * Keep in sync with:
 *   - packages/create-next-app/helpers/generate-agent-files.ts
 *   - packages/next/src/server/lib/app-info-log.ts
 */
export const AGENT_RULES_START_MARKER = '<!-- BEGIN:nextjs-agent-rules -->'
export const AGENT_RULES_END_MARKER = '<!-- END:nextjs-agent-rules -->'

/**
 * Marker pair used by the *legacy* `agents-md` codemod (the git-clone +
 * `.next-docs/` index workflow). Projects that ran the codemod on a Next.js
 * version older than the bundled-docs era still have a block delimited by
 * these markers in their `AGENTS.md` / `CLAUDE.md`. Whenever the new
 * fast-path upserts the canonical block, we strip the legacy block first
 * so the file ends up with one source of truth instead of both blocks
 * coexisting (the legacy one points at a `.next-docs/` directory that
 * may no longer exist or be up to date).
 */
const LEGACY_AGENT_RULES_START_MARKER = '<!-- NEXT-AGENTS-MD-START -->'
const LEGACY_AGENT_RULES_END_MARKER = '<!-- NEXT-AGENTS-MD-END -->'

/**
 * Build the canonical agent-rules block. The bundled-docs path is
 * hardcoded to `node_modules/next/dist/docs/` because AGENTS.md is
 * always written at the Next.js project directory — the same level
 * as `package.json` and `node_modules/next/` — so the relative path
 * from the file to the docs is always this string regardless of
 * project layout. This is what `create-next-app` writes for new
 * projects too.
 */
function buildAgentRulesBlock(): string {
  return `${AGENT_RULES_START_MARKER}
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in \`node_modules/next/dist/docs/\` before writing any code. Heed deprecation notices.
${AGENT_RULES_END_MARKER}`
}

const CLAUDE_MD_CONTENT = `@AGENTS.md\n`

export type BundledDocsFileAction =
  | 'created'
  | 'updated'
  | 'unchanged'
  | 'skipped'

export interface BundledDocsWriteResult {
  agentsMdPath: string
  claudeMdPath: string
  agentsMd: BundledDocsFileAction
  claudeMd: BundledDocsFileAction
}

/**
 * Write the create-next-app-style agent rules into `projectDir`,
 * respecting whichever file the user already uses as their agent
 * instructions:
 *
 *   - If `AGENTS.md` exists, upsert the rules block into it and
 *     leave `CLAUDE.md` alone. `AGENTS.md` is the canonical file,
 *     so we prefer it whenever the user has one.
 *   - Otherwise, if `CLAUDE.md` exists, upsert the rules block into
 *     it. The user is clearly using `CLAUDE.md` as their primary
 *     agent file and we shouldn't force a new `AGENTS.md` next to it.
 *   - Otherwise (neither exists), create a fresh `AGENTS.md`
 *     containing the canonical block and a `CLAUDE.md` that points
 *     at it via the `@` import syntax — identical to what
 *     `create-next-app` generates for new projects.
 *
 * `projectDir` must be the Next.js project directory (the package
 * that declares `next` as a dependency). AI coding agents locate
 * agent-rules files at that level by default, so that's the only
 * location we write to — in a monorepo it's the sub-package (e.g.
 * `apps/web/`), never the monorepo root.
 *
 * Upserts are non-destructive: existing content outside the marker
 * block is preserved. If the canonical block is already present
 * verbatim, the file is reported as `unchanged` and not rewritten.
 */
export function writeBundledDocsAgentFiles(
  projectDir: string
): BundledDocsWriteResult {
  const agentsMdPath = path.join(projectDir, 'AGENTS.md')
  const claudeMdPath = path.join(projectDir, 'CLAUDE.md')
  const block = buildAgentRulesBlock()

  const agentsMdExists = fs.existsSync(agentsMdPath)
  const claudeMdExists = fs.existsSync(claudeMdPath)

  if (agentsMdExists) {
    return {
      agentsMdPath,
      claudeMdPath,
      agentsMd: upsertFile(agentsMdPath, block),
      claudeMd: 'skipped',
    }
  }

  if (claudeMdExists) {
    return {
      agentsMdPath,
      claudeMdPath,
      agentsMd: 'skipped',
      claudeMd: upsertFile(claudeMdPath, block),
    }
  }

  // Neither file exists — scaffold both, create-next-app style.
  fs.writeFileSync(agentsMdPath, block + '\n', 'utf-8')
  fs.writeFileSync(claudeMdPath, CLAUDE_MD_CONTENT, 'utf-8')
  return {
    agentsMdPath,
    claudeMdPath,
    agentsMd: 'created',
    claudeMd: 'created',
  }
}

/**
 * Upsert the canonical agent-rules block into an existing file and return
 * whether the file actually changed.
 */
function upsertFile(filePath: string, block: string): BundledDocsFileAction {
  const existing = fs.readFileSync(filePath, 'utf-8')
  const updated = upsertAgentRulesBlock(existing, block)
  if (updated === existing) {
    return 'unchanged'
  }
  fs.writeFileSync(filePath, updated, 'utf-8')
  return 'updated'
}

/**
 * Given the current contents of an AGENTS.md file and a rendered agent-rules
 * block, return a version that contains the block exactly once. If the
 * markers are already present, the block between them is replaced. Otherwise
 * the block is appended after the existing content. If the block is already
 * present verbatim, the input is returned unchanged.
 *
 * Also strips any leftover *legacy* agent-rules block (delimited by the old
 * `<!-- NEXT-AGENTS-MD-START -->` / `<!-- NEXT-AGENTS-MD-END -->` markers)
 * so projects that ran the pre-bundled-docs version of this codemod end up
 * with a single, current block instead of two stale-and-current blocks
 * coexisting in the same file.
 */
function upsertAgentRulesBlock(existing: string, block: string): string {
  // Migration step: drop the legacy block first. Older projects that ran
  // `agents-md` against a pre-16.2 Next.js still have a `NEXT-AGENTS-MD-*`
  // wrapper around a `.next-docs/`-style doc index. The legacy block points
  // at a directory that probably doesn't exist anymore (or has gone stale
  // versus the bundled docs), so we remove it before injecting the new
  // canonical block. Surrounding content is preserved.
  existing = stripLegacyAgentRulesBlock(existing)

  const startIdx = existing.indexOf(AGENT_RULES_START_MARKER)
  const endIdx = existing.indexOf(AGENT_RULES_END_MARKER)

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx)
    const after = existing.slice(endIdx + AGENT_RULES_END_MARKER.length)
    const replaced = before + block + after
    return replaced === existing ? existing : replaced
  }

  const separator =
    existing.length === 0 || existing.endsWith('\n') ? '\n' : '\n\n'
  return existing + separator + block + '\n'
}

/**
 * Strip the legacy `<!-- NEXT-AGENTS-MD-START -->...<!-- NEXT-AGENTS-MD-END -->`
 * block from a file's contents, including any whitespace immediately
 * surrounding it so we don't leave a stray blank line behind. If no legacy
 * block is present, returns the input unchanged.
 *
 * The legacy block was written by the pre-bundled-docs version of the
 * `agents-md` codemod, which generated a custom doc index pointing at a
 * `.next-docs/` directory. That directory and the index inside the block
 * were tied to a specific Next.js version and almost certainly no longer
 * match the project's current install, so we drop the entire block when
 * we install the new managed block.
 */
function stripLegacyAgentRulesBlock(existing: string): string {
  const startIdx = existing.indexOf(LEGACY_AGENT_RULES_START_MARKER)
  if (startIdx === -1) return existing
  const endIdx = existing.indexOf(LEGACY_AGENT_RULES_END_MARKER, startIdx)
  if (endIdx === -1) return existing

  // Expand the slice outward to swallow leading/trailing whitespace so we
  // don't leave a stray blank line where the block used to be.
  let cutStart = startIdx
  while (cutStart > 0 && /\s/.test(existing[cutStart - 1])) {
    cutStart--
  }
  let cutEnd = endIdx + LEGACY_AGENT_RULES_END_MARKER.length
  while (cutEnd < existing.length && /\s/.test(existing[cutEnd])) {
    cutEnd++
  }

  const before = existing.slice(0, cutStart)
  const after = existing.slice(cutEnd)

  // Re-join with a single newline if both sides have content, so we don't
  // accidentally fuse the surrounding paragraphs.
  if (before.length > 0 && after.length > 0) {
    return before + '\n\n' + after
  }
  return before + after
}

function versionToGitHubTag(version: string): string {
  return version.startsWith('v') ? version : `v${version}`
}

interface PullOptions {
  cwd: string
  version?: string
  docsDir?: string
}

interface PullResult {
  success: boolean
  docsPath?: string
  nextjsVersion?: string
  error?: string
}

export async function pullDocs(options: PullOptions): Promise<PullResult> {
  const { cwd, version: versionOverride, docsDir } = options

  let nextjsVersion: string

  if (versionOverride) {
    nextjsVersion = versionOverride
  } else {
    const versionResult = getNextjsVersion(cwd)
    if (!versionResult.version) {
      return {
        success: false,
        error: versionResult.error || 'Could not detect Next.js version',
      }
    }
    nextjsVersion = versionResult.version
  }

  const docsPath =
    docsDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'next-agents-md-'))
  const useTempDir = !docsDir

  try {
    if (useTempDir && fs.existsSync(docsPath)) {
      fs.rmSync(docsPath, { recursive: true })
    }

    const tag = versionToGitHubTag(nextjsVersion)
    await cloneDocsFolder(tag, docsPath)

    return {
      success: true,
      docsPath,
      nextjsVersion,
    }
  } catch (error) {
    if (useTempDir && fs.existsSync(docsPath)) {
      fs.rmSync(docsPath, { recursive: true })
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function cloneDocsFolder(tag: string, destDir: string): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'next-agents-md-'))

  try {
    try {
      await execa(
        'git',
        [
          'clone',
          '--depth',
          '1',
          '--filter=blob:none',
          '--sparse',
          '--branch',
          tag,
          'https://github.com/vercel/next.js.git',
          '.',
        ],
        { cwd: tempDir }
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('not found') || message.includes('did not match')) {
        throw new Error(
          `Could not find documentation for Next.js ${tag}. This version may not exist on GitHub yet.`
        )
      }
      throw error
    }

    await execa('git', ['sparse-checkout', 'set', 'docs'], { cwd: tempDir })

    const sourceDocsDir = path.join(tempDir, 'docs')
    if (!fs.existsSync(sourceDocsDir)) {
      throw new Error('docs folder not found in cloned repository')
    }

    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true })
    }
    fs.mkdirSync(destDir, { recursive: true })
    fs.cpSync(sourceDocsDir, destDir, { recursive: true })
  } finally {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true })
    }
  }
}

export function collectDocFiles(dir: string): { relativePath: string }[] {
  return (fs.readdirSync(dir, { recursive: true }) as string[])
    .filter(
      (f) =>
        (f.endsWith('.mdx') || f.endsWith('.md')) &&
        !/[/\\]index\.mdx$/.test(f) &&
        !/[/\\]index\.md$/.test(f) &&
        !f.startsWith('index.')
    )
    .sort()
    .map((f) => ({ relativePath: f.replace(/\\/g, '/') }))
}

interface DocSection {
  name: string
  files: { relativePath: string }[]
  subsections: DocSection[]
}

export function buildDocTree(files: { relativePath: string }[]): DocSection[] {
  const sections: Map<string, DocSection> = new Map()

  for (const file of files) {
    const parts = file.relativePath.split(/[/\\]/)
    if (parts.length < 2) continue

    const topLevelDir = parts[0]

    if (!sections.has(topLevelDir)) {
      sections.set(topLevelDir, {
        name: topLevelDir,
        files: [],
        subsections: [],
      })
    }

    const section = sections.get(topLevelDir)!

    if (parts.length === 2) {
      section.files.push({ relativePath: file.relativePath })
    } else {
      const subsectionDir = parts[1]
      let subsection = section.subsections.find((s) => s.name === subsectionDir)

      if (!subsection) {
        subsection = { name: subsectionDir, files: [], subsections: [] }
        section.subsections.push(subsection)
      }

      if (parts.length === 3) {
        subsection.files.push({ relativePath: file.relativePath })
      } else {
        const subSubDir = parts[2]
        let subSubsection = subsection.subsections.find(
          (s) => s.name === subSubDir
        )

        if (!subSubsection) {
          subSubsection = { name: subSubDir, files: [], subsections: [] }
          subsection.subsections.push(subSubsection)
        }

        subSubsection.files.push({ relativePath: file.relativePath })
      }
    }
  }

  const sortedSections = Array.from(sections.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  )

  for (const section of sortedSections) {
    section.files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    section.subsections.sort((a, b) => a.name.localeCompare(b.name))
    for (const subsection of section.subsections) {
      subsection.files.sort((a, b) =>
        a.relativePath.localeCompare(b.relativePath)
      )
      subsection.subsections.sort((a, b) => a.name.localeCompare(b.name))
    }
  }

  return sortedSections
}

interface ClaudeMdIndexData {
  docsPath: string
  sections: DocSection[]
  outputFile?: string
}

export function generateClaudeMdIndex(data: ClaudeMdIndexData): string {
  const { docsPath, sections, outputFile } = data

  const parts: string[] = []

  parts.push('[Next.js Docs Index]')
  parts.push(`root: ${docsPath}`)
  parts.push(
    'STOP. What you remember about Next.js is WRONG for this project. Always search docs and read before any task.'
  )
  const targetFile = outputFile || 'CLAUDE.md'
  parts.push(
    `If docs missing, run this command first: npx @next/codemod agents-md --output ${targetFile}`
  )

  const allFiles = collectAllFilesFromSections(sections)
  const grouped = groupByDirectory(allFiles)

  for (const [dir, files] of grouped) {
    parts.push(`${dir}:{${files.join(',')}}`)
  }

  return parts.join('|')
}

function collectAllFilesFromSections(sections: DocSection[]): string[] {
  const files: string[] = []

  for (const section of sections) {
    for (const file of section.files) {
      files.push(file.relativePath)
    }
    files.push(...collectAllFilesFromSections(section.subsections))
  }

  return files
}

function groupByDirectory(files: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>()

  for (const filePath of files) {
    const lastSlash = Math.max(
      filePath.lastIndexOf('/'),
      filePath.lastIndexOf('\\')
    )
    const dir = lastSlash === -1 ? '.' : filePath.slice(0, lastSlash)
    const fileName = lastSlash === -1 ? filePath : filePath.slice(lastSlash + 1)

    const existing = grouped.get(dir)
    if (existing) {
      existing.push(fileName)
    } else {
      grouped.set(dir, [fileName])
    }
  }

  return grouped
}

const START_MARKER = '<!-- NEXT-AGENTS-MD-START -->'
const END_MARKER = '<!-- NEXT-AGENTS-MD-END -->'

function hasExistingIndex(content: string): boolean {
  return content.includes(START_MARKER)
}

function wrapWithMarkers(content: string): string {
  return `${START_MARKER}${content}${END_MARKER}`
}

export function injectIntoClaudeMd(
  claudeMdContent: string,
  indexContent: string
): string {
  const wrappedContent = wrapWithMarkers(indexContent)

  if (hasExistingIndex(claudeMdContent)) {
    const startIdx = claudeMdContent.indexOf(START_MARKER)
    const endIdx = claudeMdContent.indexOf(END_MARKER) + END_MARKER.length

    return (
      claudeMdContent.slice(0, startIdx) +
      wrappedContent +
      claudeMdContent.slice(endIdx)
    )
  }

  const separator = claudeMdContent.endsWith('\n') ? '\n' : '\n\n'
  return claudeMdContent + separator + wrappedContent + '\n'
}

interface GitignoreStatus {
  path: string
  updated: boolean
  alreadyPresent: boolean
}

const GITIGNORE_ENTRY = '.next-docs/'

export function ensureGitignoreEntry(cwd: string): GitignoreStatus {
  const gitignorePath = path.join(cwd, '.gitignore')
  const entryRegex = /^\s*\.next-docs(?:\/.*)?$/

  let content = ''
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf-8')
  }

  const hasEntry = content.split(/\r?\n/).some((line) => entryRegex.test(line))

  if (hasEntry) {
    return { path: gitignorePath, updated: false, alreadyPresent: true }
  }

  const needsNewline = content.length > 0 && !content.endsWith('\n')
  const header = content.includes('# next-agents-md')
    ? ''
    : '# next-agents-md\n'
  const newContent =
    content + (needsNewline ? '\n' : '') + header + `${GITIGNORE_ENTRY}\n`

  fs.writeFileSync(gitignorePath, newContent, 'utf-8')

  return { path: gitignorePath, updated: true, alreadyPresent: false }
}

type WorkspaceType = 'pnpm' | 'npm' | 'yarn' | 'nx' | 'lerna' | null

interface WorkspaceInfo {
  isMonorepo: boolean
  type: WorkspaceType
  packages: string[]
}

function detectWorkspace(cwd: string): WorkspaceInfo {
  const packageJsonPath = path.join(cwd, 'package.json')

  // Check pnpm workspaces (pnpm-workspace.yaml)
  const pnpmWorkspacePath = path.join(cwd, 'pnpm-workspace.yaml')
  if (fs.existsSync(pnpmWorkspacePath)) {
    const packages = parsePnpmWorkspace(pnpmWorkspacePath)
    if (packages.length > 0) {
      return { isMonorepo: true, type: 'pnpm', packages }
    }
  }

  // Check npm/yarn workspaces (package.json workspaces field)
  if (fs.existsSync(packageJsonPath)) {
    const packages = parsePackageJsonWorkspaces(packageJsonPath)
    if (packages.length > 0) {
      return { isMonorepo: true, type: 'npm', packages }
    }
  }

  // Check Lerna (lerna.json)
  const lernaPath = path.join(cwd, 'lerna.json')
  if (fs.existsSync(lernaPath)) {
    const packages = parseLernaConfig(lernaPath)
    if (packages.length > 0) {
      return { isMonorepo: true, type: 'lerna', packages }
    }
  }

  // Check Nx (nx.json)
  const nxPath = path.join(cwd, 'nx.json')
  if (fs.existsSync(nxPath)) {
    const packages = parseNxWorkspace(cwd, packageJsonPath)
    if (packages.length > 0) {
      return { isMonorepo: true, type: 'nx', packages }
    }
  }

  return { isMonorepo: false, type: null, packages: [] }
}

function parsePnpmWorkspace(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    const packages: string[] = []
    let inPackages = false

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed === 'packages:') {
        inPackages = true
        continue
      }
      if (inPackages) {
        if (trimmed && !trimmed.startsWith('-') && !trimmed.startsWith('#')) {
          break
        }
        const match = trimmed.match(/^-\s*['"]?([^'"]+)['"]?$/)
        if (match) {
          packages.push(match[1])
        }
      }
    }
    return packages
  } catch {
    return []
  }
}

function parsePackageJsonWorkspaces(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const pkg = JSON.parse(content)
    if (Array.isArray(pkg.workspaces)) {
      return pkg.workspaces
    }
    if (pkg.workspaces?.packages && Array.isArray(pkg.workspaces.packages)) {
      return pkg.workspaces.packages
    }
    return []
  } catch {
    return []
  }
}

function parseLernaConfig(filePath: string): string[] {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const config = JSON.parse(content)
    if (Array.isArray(config.packages)) {
      return config.packages
    }
    return ['packages/*']
  } catch {
    return []
  }
}

function parseNxWorkspace(cwd: string, packageJsonPath: string): string[] {
  if (fs.existsSync(packageJsonPath)) {
    const packages = parsePackageJsonWorkspaces(packageJsonPath)
    if (packages.length > 0) {
      return packages
    }
  }
  const defaultPatterns = ['apps/*', 'libs/*', 'packages/*']
  const existingPatterns: string[] = []
  for (const pattern of defaultPatterns) {
    const basePath = path.join(cwd, pattern.replace('/*', ''))
    if (fs.existsSync(basePath)) {
      existingPatterns.push(pattern)
    }
  }
  return existingPatterns
}

function findNextjsInWorkspace(cwd: string, patterns: string[]): string | null {
  const packagePaths = expandWorkspacePatterns(cwd, patterns)
  const versions: string[] = []

  for (const pkgPath of packagePaths) {
    try {
      const nextPkgPath = require.resolve('next/package.json', {
        paths: [pkgPath],
      })
      const pkg = JSON.parse(fs.readFileSync(nextPkgPath, 'utf-8'))
      if (pkg.version) {
        versions.push(pkg.version)
      }
    } catch {
      // Next.js not installed in this package
    }
  }

  return findHighestVersion(versions)
}

function expandWorkspacePatterns(cwd: string, patterns: string[]): string[] {
  const packagePaths: string[] = []

  for (const pattern of patterns) {
    if (pattern.startsWith('!')) continue

    if (pattern.includes('*')) {
      packagePaths.push(...expandGlobPattern(cwd, pattern))
    } else {
      const fullPath = path.join(cwd, pattern)
      if (fs.existsSync(fullPath)) {
        packagePaths.push(fullPath)
      }
    }
  }

  return [...new Set(packagePaths)]
}

function expandGlobPattern(cwd: string, pattern: string): string[] {
  const parts = pattern.split('/')
  const results: string[] = []

  function walk(currentPath: string, partIndex: number): void {
    if (partIndex >= parts.length) {
      if (fs.existsSync(path.join(currentPath, 'package.json'))) {
        results.push(currentPath)
      }
      return
    }

    const part = parts[partIndex]

    if (part === '*') {
      if (!fs.existsSync(currentPath)) return
      try {
        for (const entry of fs.readdirSync(currentPath)) {
          const fullPath = path.join(currentPath, entry)
          if (isDirectory(fullPath)) {
            if (partIndex === parts.length - 1) {
              if (fs.existsSync(path.join(fullPath, 'package.json'))) {
                results.push(fullPath)
              }
            } else {
              walk(fullPath, partIndex + 1)
            }
          }
        }
      } catch {
        // Permission denied
      }
    } else if (part === '**') {
      walkRecursive(currentPath, results)
    } else {
      walk(path.join(currentPath, part), partIndex + 1)
    }
  }

  walk(cwd, 0)
  return results
}

function walkRecursive(dir: string, results: string[]): void {
  if (!fs.existsSync(dir)) return

  if (fs.existsSync(path.join(dir, 'package.json'))) {
    results.push(dir)
  }

  try {
    for (const entry of fs.readdirSync(dir)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue
      const fullPath = path.join(dir, entry)
      if (isDirectory(fullPath)) {
        walkRecursive(fullPath, results)
      }
    }
  } catch {
    // Permission denied
  }
}

function isDirectory(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory()
  } catch {
    return false
  }
}

function findHighestVersion(versions: string[]): string | null {
  if (versions.length === 0) return null
  if (versions.length === 1) return versions[0]

  return versions.reduce((highest, current) => {
    return compareVersions(current, highest) > 0 ? current : highest
  })
}

function compareVersions(a: string, b: string): number {
  const parseVersion = (v: string) => {
    const match = v.match(/^(\d+)\.(\d+)\.(\d+)/)
    if (!match) return [0, 0, 0]
    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])]
  }

  const [aMajor, aMinor, aPatch] = parseVersion(a)
  const [bMajor, bMinor, bPatch] = parseVersion(b)

  if (aMajor !== bMajor) return aMajor - bMajor
  if (aMinor !== bMinor) return aMinor - bMinor
  return aPatch - bPatch
}
