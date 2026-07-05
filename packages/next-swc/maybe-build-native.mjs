import { execSync } from 'child_process'
import { readdirSync, rmSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_DIR = __dirname
const ROOT_DIR = join(__dirname, '../..')
const NATIVE_DIR = join(PKG_DIR, 'native')

function hasExistingNativeBinary() {
  try {
    const files = readdirSync(NATIVE_DIR)
    return files.some((f) => f.endsWith('.node'))
  } catch {
    return false
  }
}

function clearNativeBinaries() {
  try {
    const files = readdirSync(NATIVE_DIR)
    for (const f of files) {
      if (f.endsWith('.node')) {
        rmSync(join(NATIVE_DIR, f))
      }
    }
  } catch {
    // directory doesn't exist, nothing to clear
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
    // Omit HEAD to compare against the working tree, which includes
    // committed, staged, and unstaged changes.
    const diff = execSync(
      `git diff --name-only ${sinceCommit} -- ':(glob)**/*.rs' ':(glob)**/*.toml' ':(glob).cargo/**' Cargo.lock rust-toolchain`,
      { cwd: ROOT_DIR, encoding: 'utf8' }
    ).trim()
    return diff.length > 0
  } catch {
    // If we can't determine whether changes occurred, assume they did
    return true
  }
}

function buildNative() {
  console.log('Running swc-build-native...')
  execSync('pnpm run swc-build-native', {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      CARGO_TERM_COLOR: 'always',
      TTY: '1',
    },
  })
}

function main() {
  if (process.env.CI) {
    console.log('Skipping swc-build-native in CI')
    return
  }

  const versionBumpCommit = getVersionBumpCommit()

  if (!versionBumpCommit) {
    console.log(
      'Could not determine version bump commit (shallow clone?), building native to be safe...'
    )
    buildNative()
    return
  }

  if (hasRustChanges(versionBumpCommit)) {
    console.log(
      'Rust source files changed since last version bump, building native...'
    )
    buildNative()
    return
  }

  // No Rust changes from the release version — clear any stale native build
  // so the prebuilt @next/swc-* npm packages are used instead.
  if (hasExistingNativeBinary()) {
    console.log(
      'No Rust changes since last version bump, clearing stale native binary...'
    )
    clearNativeBinaries()
  }

  console.log('Skipping swc-build-native (no Rust changes since version bump)')
}

main()
