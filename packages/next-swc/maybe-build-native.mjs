import { execSync } from 'child_process'
import { readFileSync, readdirSync, writeFileSync } from 'fs'
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

function buildNative() {
  console.log('Running build-native...')
  execSync('pnpm run build-native', {
    cwd: PKG_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      CARGO_TERM_COLOR: 'always',
      TTY: '1',
    },
  })

  copyGeneratedTypes()
}

function copyGeneratedTypes() {
  const generatedTypesPath = join(NATIVE_DIR, 'index.d.ts')
  const vendoredTypesPath = join(
    ROOT_DIR,
    'packages/next/src/build/swc/generated-native.d.ts'
  )
  const generatedTypesMarker = '// GENERATED-TYPES-BELOW\n'
  const generatedNotice =
    '// DO NOT MANUALLY EDIT THESE TYPES\n' +
    '// You can regenerate this file by running `pnpm swc-build-native` in the root of the repo.\n\n'

  const generatedTypes = readFileSync(generatedTypesPath, 'utf8')
  let vendoredTypes = readFileSync(vendoredTypesPath, 'utf8')

  vendoredTypes = vendoredTypes.split(generatedTypesMarker)[0]
  vendoredTypes =
    vendoredTypes + generatedTypesMarker + generatedNotice + generatedTypes

  writeFileSync(vendoredTypesPath, vendoredTypes)

  console.log(
    'Copied generated types to packages/next/src/build/swc/generated-native.d.ts'
  )
  execSync(`pnpm prettier --write ${vendoredTypesPath}`, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  })
}

function main() {
  if (hasExistingNativeBinary()) {
    console.log(
      'Found existing native binary in packages/next-swc/native/, rebuilding...'
    )
    buildNative()
    return
  }

  const versionBumpCommit = getVersionBumpCommit()
  if (versionBumpCommit && hasRustChanges(versionBumpCommit)) {
    console.log(
      'Rust source files changed since last version bump, building native...'
    )
    buildNative()
    return
  }

  console.log(
    'Skipping swc-build-native (no existing native binary and no Rust changes since version bump)'
  )
}

main()
