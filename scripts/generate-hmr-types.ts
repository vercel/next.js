#!/usr/bin/env node

// Generates the TypeScript definitions for the Turbopack HMR update-instruction
// wire protocol from their Rust source of truth (the `chunk_list` instruction
// structs in `turbopack-ecmascript`), via `ts-rs`.
//
// The Rust `cargo run --example export_hmr_types` prints the type declarations;
// this script wraps them with a "do not edit" header, formats them with
// prettier, and vendors the result into `packages/next`.
//
// Usage:
//   tsx scripts/generate-hmr-types.ts           # (re)generate the file
//   tsx scripts/generate-hmr-types.ts --check    # fail if the file is stale
//
// The `--check` mode is intended for CI: it regenerates the types in memory and
// exits non-zero if they differ from what is checked in.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import execa from 'execa'
import { NEXT_DIR, logCommand } from './pack-util'

const GENERATED_FILE = path.join(
  NEXT_DIR,
  'packages/next/src/build/swc/generated-hmr-types.ts'
)

const HEADER =
  '// DO NOT MANUALLY EDIT THIS FILE\n' +
  '//\n' +
  '// These types are generated from the Rust source of truth\n' +
  '// (`turbopack/crates/turbopack-ecmascript/src/chunk_list`) via `ts-rs`.\n' +
  '// Regenerate with `pnpm swc-generate-hmr-types` from the repo root.\n\n'

async function generate(): Promise<string> {
  const command = [
    'cargo',
    'run',
    '--quiet',
    '-p',
    'turbopack-ecmascript',
    '--example',
    'export_hmr_types',
  ]
  logCommand('Generate HMR types', command)
  const { stdout } = await execa(command[0], command.slice(1), {
    cwd: NEXT_DIR,
    // Only capture stdout (the type declarations); cargo build progress goes to
    // stderr.
    stderr: 'inherit',
  })

  const prettifyCommand = ['prettier', '--stdin-filepath', GENERATED_FILE]
  const { stdout: formatted } = await execa(
    prettifyCommand[0],
    prettifyCommand.slice(1),
    {
      cwd: NEXT_DIR,
      input: HEADER + stdout + '\n',
      preferLocal: true,
    }
  )
  return formatted.endsWith('\n') ? formatted : formatted + '\n'
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check')
  const generated = await generate()

  if (check) {
    let existing: string | null = null
    try {
      existing = await fs.readFile(GENERATED_FILE, 'utf8')
    } catch {}
    if (existing !== generated) {
      console.error(
        `\n${path.relative(NEXT_DIR, GENERATED_FILE)} is out of date.\n` +
          'Run `pnpm swc-generate-hmr-types` and commit the result.\n'
      )
      process.exit(1)
    }
    logCommand('Check HMR types', 'up to date')
    return
  }

  await writeGeneratedHmrTypes(generated)
}

/** Regenerates and writes the vendored HMR type definitions. */
export default async function writeGeneratedHmrTypes(
  generated?: string
): Promise<void> {
  generated ??= await generate()
  logCommand('Write generated HMR types', GENERATED_FILE)
  await fs.writeFile(GENERATED_FILE, generated)
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).toString()) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
