import { execSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

const BASE_URL = 'https://vercel-packages.vercel.app/next/commits'

const PACKAGES_TO_PATCH = [
  'next',
  '@next/mdx',
  '@next/env',
  '@next/bundle-analyzer',
]

// --- Argument parsing ---

function parseAndValidateArgs() {
  const { values } = parseArgs({
    options: {
      project: { type: 'string' },
      commit: { type: 'string' },
      branch: { type: 'string' },
    },
    strict: true,
  })

  if (!values.project) {
    console.error(
      'Usage: node scripts/patch-preview-tarball.mjs --project <path> [--commit <sha> | --branch <name>]'
    )
    process.exit(1)
  }

  if (values.commit && values.branch) {
    console.error('Error: --commit and --branch are mutually exclusive.')
    process.exit(1)
  }

  return {
    project: path.resolve(values.project),
    commit: values.commit,
    branch: values.branch,
  }
}

// --- Resolve commit SHA ---

function resolveCommitSha({ commit, branch }) {
  if (commit) {
    if (!/^[0-9a-f]{7,40}$/i.test(commit)) {
      console.error(`Error: Invalid commit SHA: ${commit}`)
      process.exit(1)
    }
    return commit
  }

  if (branch) {
    const encoded = encodeURIComponent(branch)
    try {
      const sha = execSync(
        `gh api "repos/vercel/next.js/branches/${encoded}" --jq '.commit.sha'`,
        { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim()
      if (!sha) {
        console.error(
          `Error: Could not resolve branch '${branch}' to a commit SHA.`
        )
        process.exit(1)
      }
      return sha
    } catch (err) {
      console.error(
        `Error: Failed to look up branch '${branch}' via GitHub API.`
      )
      console.error(err.stderr?.toString() || err.message)
      process.exit(1)
    }
  }

  // Fallback: local HEAD
  try {
    return execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
  } catch (err) {
    console.error('Error: Failed to resolve local HEAD commit.')
    console.error(err.stderr?.toString() || err.message)
    process.exit(1)
  }
}

// --- URL construction ---

function buildTarballUrls(commitSha) {
  const urls = new Map()
  for (const pkg of PACKAGES_TO_PATCH) {
    urls.set(pkg, `${BASE_URL}/${commitSha}/${pkg}`)
  }
  return urls
}

// --- Tarball verification ---

async function verifyTarballExists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' })
    return res.ok
  } catch {
    return false
  }
}

// --- Workspace root finding ---

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function findWorkspaceRoot(projectPath) {
  for (const ev of ['NPM_CONFIG_WORKSPACE_DIR', 'npm_config_workspace_dir']) {
    if (process.env[ev]) {
      return process.env[ev]
    }
  }

  try {
    const canonicalPath = await fs.realpath(projectPath)
    let currentDir = canonicalPath

    while (currentDir !== path.parse(currentDir).root) {
      if (await fileExists(path.join(currentDir, 'pnpm-workspace.yaml'))) {
        return currentDir
      }

      const packageJsonPath = path.join(currentDir, 'package.json')
      if (await fileExists(packageJsonPath)) {
        const content = await fs.readFile(packageJsonPath, 'utf8')
        const pkg = JSON.parse(content)
        if (pkg.workspaces) {
          return currentDir
        }
      }

      currentDir = path.dirname(currentDir)
    }

    return null
  } catch {
    return null
  }
}

// --- Patch package.json ---

async function patchPackageJson(projectPath, tarballUrls) {
  const root = await findWorkspaceRoot(projectPath)
  const packageJsonPath = root
    ? path.join(root, 'package.json')
    : path.join(projectPath, 'package.json')

  if (!(await fileExists(packageJsonPath))) {
    console.error(`Error: package.json not found at ${packageJsonPath}`)
    process.exit(1)
  }

  const content = await fs.readFile(packageJsonPath, 'utf8')
  const pkg = JSON.parse(content)

  const entries = Array.from(tarballUrls.entries())

  // npm/pnpm overrides
  pkg.overrides = pkg.overrides || {}
  for (const [name, url] of entries) {
    pkg.overrides[name] = url
  }

  // yarn resolutions
  pkg.resolutions = pkg.resolutions || {}
  for (const [name, url] of entries) {
    pkg.resolutions[name] = url
  }

  await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n')

  console.log(`Patched ${packageJsonPath}`)
  console.log('Packages overridden:')
  for (const [name, url] of entries) {
    console.log(`  ${name} -> ${url}`)
  }

  return packageJsonPath
}

// --- Main ---

async function main() {
  const { project, commit, branch } = parseAndValidateArgs()

  const sha = resolveCommitSha({ commit, branch })
  console.log(`Resolved commit SHA: ${sha}`)

  const tarballUrls = buildTarballUrls(sha)

  const nextUrl = tarballUrls.get('next')
  console.log(`Verifying preview tarball exists: ${nextUrl}`)
  const exists = await verifyTarballExists(nextUrl)
  if (!exists) {
    console.error(
      `Preview tarball not found for commit ${sha}.\n` +
        `The "Deploy preview tarball" job may not have completed yet, or the commit may not have a build.\n` +
        `Check: https://github.com/vercel/next.js/actions/workflows/build_and_deploy.yml`
    )
    process.exit(1)
  }
  console.log('Preview tarball verified.')

  await patchPackageJson(project, tarballUrls)

  console.log(
    '\nDone! Run your package manager install command to apply changes.'
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
