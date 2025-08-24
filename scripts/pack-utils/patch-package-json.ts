import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

export interface DependencyPaths {
  nextTarball: string
  nextMdxTarball: string
  nextEnvTarball: string
  nextBundleAnalyzerTarball: string
  nextSwcTarball: string
}

interface NextPeerDeps {
  react: string
  reactDom: string
  [key: string]: unknown
}

export interface PackageJson {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  overrides?: Record<string, string>
  resolutions?: Record<string, string>
  workspaces?: string[] | { packages: string[] }
  [key: string]: unknown
}

/**
 * Main function to patch a project's package.json with Next.js tarball references
 * @param paths Configuration options for patching
 * @returns The path to the patched file
 */
export default async function patchPackageJson(
  targetProjectPath: string,
  paths: DependencyPaths
): Promise<string> {
  try {
    const root = await findWorkspaceRoot(targetProjectPath)
    const packageJsonPath = root
      ? path.join(root, 'package.json')
      : path.join(targetProjectPath, 'package.json')

    const packageJsonValue = await readJsonValue(packageJsonPath)
    await patchWorkspacePackageJsonMap(paths, packageJsonValue)
    await writeJsonValue(packageJsonPath, packageJsonValue)

    return packageJsonPath
  } catch (error) {
    throw new Error('Error patching package.json', { cause: error })
  }
}

async function readJsonValue(filePath: string): Promise<PackageJson> {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content) as PackageJson
  } catch (error) {
    throw new Error(`Could not read or parse ${filePath}`, { cause: error })
  }
}

async function writeJsonValue(
  filePath: string,
  value: PackageJson
): Promise<void> {
  try {
    const content = JSON.stringify(value, null, 2) + os.EOL
    await fs.writeFile(filePath, content)
  } catch (error) {
    throw new Error(`Failed to write ${filePath}`, { cause: error })
  }
}

async function patchWorkspacePackageJsonMap(
  paths: DependencyPaths,
  packageJsonMap: PackageJson
): Promise<PackageJson> {
  const nextPeerDeps = await getNextPeerDeps()

  const overrides: [string, string][] = [
    ['next', `file:${paths.nextTarball}`],
    ['@next/mdx', `file:${paths.nextMdxTarball}`],
    ['@next/env', `file:${paths.nextEnvTarball}`],
    ['@next/bundle-analyzer', `file:${paths.nextBundleAnalyzerTarball}`],
    ['@next/swc', `file:${paths.nextSwcTarball}`],
    ['react', nextPeerDeps.react],
    ['react-dom', nextPeerDeps.reactDom],
  ]

  // npm uses `overrides`
  packageJsonMap.overrides = packageJsonMap.overrides || {}
  insertMapEntries(packageJsonMap.overrides, overrides)

  // yarn uses `resolutions`
  packageJsonMap.resolutions = packageJsonMap.resolutions || {}
  insertMapEntries(packageJsonMap.resolutions, overrides)

  // Add @next/swc to dependencies
  packageJsonMap.dependencies = packageJsonMap.dependencies || {}
  insertMapEntries(packageJsonMap.dependencies, [
    ['@next/swc', `file:${paths.nextSwcTarball}`],
  ])

  // Update direct dependencies to match overrides
  updateMapEntriesIfExists(packageJsonMap.dependencies, overrides)

  return packageJsonMap
}

/**
 * Get Next.js peer dependencies from its package.json
 */
async function getNextPeerDeps(): Promise<NextPeerDeps> {
  try {
    // Navigate to the next package.json relative to the current module
    const currentFilePath = fileURLToPath(import.meta.url)
    const scriptDir = path.dirname(currentFilePath)
    const packageJsonPath = path.resolve(
      scriptDir,
      '../../packages/next/package.json'
    )

    const content = await fs.readFile(packageJsonPath, 'utf8')
    const nextPackageJson = JSON.parse(content) as PackageJson

    if (!nextPackageJson.peerDependencies) {
      throw new Error('Next.js package.json is missing peerDependencies')
    }

    return {
      react: nextPackageJson.peerDependencies.react || '',
      reactDom: nextPackageJson.peerDependencies['react-dom'] || '',
    }
  } catch (error) {
    throw new Error('Failed to get Next.js peer dependencies', { cause: error })
  }
}

function insertMapEntries(
  map: Record<string, string>,
  entries: [string, string][]
): void {
  for (const [key, value] of entries) {
    map[key] = value
  }
}

function updateMapEntriesIfExists(
  map: Record<string, string>,
  entries: [string, string][]
): void {
  for (const [key, value] of entries) {
    if (map[key] !== undefined) {
      map[key] = value
    }
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * @returns null if not in a workspace
 */
async function findWorkspaceRoot(projectPath: string): Promise<string | null> {
  // Check environment variables
  const envVars = ['NPM_CONFIG_WORKSPACE_DIR', 'npm_config_workspace_dir']
  for (const ev of envVars) {
    if (process.env[ev]) {
      return process.env[ev]
    }
  }

  try {
    const canonicalPath = await fs.realpath(projectPath)
    let currentDir = canonicalPath

    // Walk up the directory tree
    while (currentDir !== path.parse(currentDir).root) {
      // Check for pnpm workspace
      if (await fileExists(path.join(currentDir, 'pnpm-workspace.yaml'))) {
        return currentDir
      }

      // Check for npm/yarn workspace
      const packageJsonPath = path.join(currentDir, 'package.json')
      if (await fileExists(packageJsonPath)) {
        const packageJson = await readJsonValue(packageJsonPath)
        if (packageJson.workspaces) {
          return currentDir
        }
      }

      // Move up to parent directory
      currentDir = path.dirname(currentDir)
    }

    // No workspace found
    return null
  } catch (error) {
    throw new Error('Failed to find workspace root', { cause: error })
  }
}
