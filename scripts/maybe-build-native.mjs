import { execSync } from 'child_process'
import { readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = join(__dirname, '..')
const NATIVE_DIR = join(ROOT_DIR, 'packages/next-swc/native')

function hasExistingNativeBinary() {
  try {
    const files = readdirSync(NATIVE_DIR)
    return files.some((f) => f.endsWith('.node'))
  } catch {
    return false
  }
}

function getVersionBumpCommit() {
  try {
    return (
      execSync(
        `git log -1 --format=%H -G '"version":' -- packages/next/package.json`,
        { cwd: ROOT_DIR, encoding: 'utf8' }
      ).trim() || null
    )
  } catch {
    return null
  }
}

function hasRustChanges(sinceCommit) {
  try {
    const diff = execSync(
      `git diff --name-only ${sinceCommit} HEAD -- ':(glob)**/*.rs'`,
      { cwd: ROOT_DIR, encoding: 'utf8' }
    ).trim()
    return diff.length > 0
  } catch {
    return false
  }
}

function main() {
  if (hasExistingNativeBinary()) {
    console.log(
      'Found existing native binary in packages/next-swc/native/, running swc-build-native...'
    )
    execSync('pnpm swc-build-native', { cwd: ROOT_DIR, stdio: 'inherit' })
    return
  }

  const versionBumpCommit = getVersionBumpCommit()
  if (versionBumpCommit && hasRustChanges(versionBumpCommit)) {
    console.log(
      'Rust source files changed since last version bump, running swc-build-native...'
    )
    execSync('pnpm swc-build-native', { cwd: ROOT_DIR, stdio: 'inherit' })
    return
  }

  console.log(
    'Skipping swc-build-native (no existing native binary and no Rust changes since version bump)'
  )
}

main()
