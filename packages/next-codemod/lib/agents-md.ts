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
  const packageJsonPath = path.join(cwd, 'package.json')

  if (!fs.existsSync(packageJsonPath)) {
    return {
      version: null,
      error: 'No package.json found in the current directory',
    }
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    const dependencies = packageJson.dependencies || {}
    const devDependencies = packageJson.devDependencies || {}

    const nextVersion = dependencies.next || devDependencies.next

    if (nextVersion) {
      const cleanVersion = nextVersion.replace(/^[\^~>=<]+/, '')
      return { version: cleanVersion }
    }

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
  } catch (err) {
    return {
      version: null,
      error: `Failed to parse package.json: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
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
    const packageJsonPath = path.join(pkgPath, 'package.json')
    if (!fs.existsSync(packageJsonPath)) continue

    try {
      const content = fs.readFileSync(packageJsonPath, 'utf-8')
      const pkg = JSON.parse(content)
      const nextVersion = pkg.dependencies?.next || pkg.devDependencies?.next
      if (nextVersion) {
        versions.push(nextVersion.replace(/^[\^~>=<]+/, ''))
      }
    } catch {
      // Skip invalid package.json
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
