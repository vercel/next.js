#!/usr/bin/env node
// Materialize a patched copy of a crates.io crate so cargo can be pointed at it with
// `--config 'patch.crates-io.<name>.path="<dir>"'`.
//
// Why this exists: some crates need a local fix that has not been released yet. Cargo has no
// support for patch files, and a `[patch.crates-io]` entry in Cargo.toml would have to name a
// directory that does not exist in a fresh checkout, breaking every normal build. So instead the
// patch lives in `patches/rust/<name>@<version>.patch`, this script applies it to a copy of the
// registry source under `target/patched-crates/`, and only the builds that need it pass the
// `--config` flag. Builds that do not pass the flag are completely unaffected.
//
// Usage:
//   node scripts/patch-rust-crate.mjs swc 74.0.0
//
// Prints the absolute path of the patched crate on stdout, so a caller can do:
//   DIR=$(node scripts/patch-rust-crate.mjs swc 74.0.0)
//   cargo check --config "patch.crates-io.swc.path=\"$DIR\""

import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const NEXT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const [name, version] = process.argv.slice(2)
if (!name || !version) {
  console.error('usage: node scripts/patch-rust-crate.mjs <crate> <version>')
  process.exit(1)
}

const patchFile = join(NEXT_DIR, 'patches', 'rust', `${name}@${version}.patch`)
if (!existsSync(patchFile)) {
  console.error(`no patch file at ${patchFile}`)
  process.exit(1)
}

// `cargo fetch` guarantees the crate source is unpacked in the registry cache.
execFileSync('cargo', ['fetch', '--quiet'], { cwd: NEXT_DIR, stdio: 'inherit' })

const cargoHome =
  process.env.CARGO_HOME ?? join(process.env.HOME ?? '', '.cargo')
const registrySrc = join(cargoHome, 'registry', 'src')
if (!existsSync(registrySrc)) {
  console.error(`no cargo registry source directory at ${registrySrc}`)
  process.exit(1)
}

// The registry directory name embeds a hash that varies by cargo version and index protocol, so
// discover it rather than hard-coding it.
const sourceDir = readdirSync(registrySrc)
  .map((entry) => join(registrySrc, entry, `${name}-${version}`))
  .find((candidate) => existsSync(candidate))

if (!sourceDir) {
  console.error(
    `could not find ${name}-${version} under ${registrySrc}; run \`cargo fetch\` first`
  )
  process.exit(1)
}

const outDir = join(NEXT_DIR, 'target', 'patched-crates', `${name}-${version}`)
rmSync(outDir, { recursive: true, force: true })
mkdirSync(dirname(outDir), { recursive: true })
cpSync(sourceDir, outDir, { recursive: true })

// The registry copy is read-only.
execFileSync('chmod', ['-R', 'u+w', outDir])

// `git apply` resolves the paths in a patch relative to the top level of the enclosing repository,
// not to the working directory — and `target/` is inside this repository. Running it from the repo
// root with `--directory` is therefore the only reliable form: with `cwd` set to the copy instead,
// git prints "Skipped patch" and still exits 0, silently leaving the crate unpatched.
const applied = spawnSync(
  'git',
  [
    'apply',
    '--verbose',
    `--directory=${relative(NEXT_DIR, outDir)}`,
    relative(NEXT_DIR, patchFile),
  ],
  { cwd: NEXT_DIR, encoding: 'utf8' }
)

// `--verbose` reports progress on stderr.
const applyOutput = `${applied.stdout ?? ''}${applied.stderr ?? ''}`
process.stderr.write(applyOutput)

// Guard against the silent skip described above: git exits 0 in that case, so the exit status alone
// is not enough to know the patch landed.
if (
  applied.status !== 0 ||
  applyOutput.includes('Skipped patch') ||
  !applyOutput.includes('cleanly')
) {
  console.error(`failed to apply ${patchFile} to ${outDir}`)
  process.exit(1)
}

console.log(outDir)
