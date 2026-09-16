#!/usr/bin/env node
import { realpathSync } from 'fs'
import path from 'path'

import type { NapiProjectOptions } from './binding'
import { loadTurbopackConfig, resolveProjectOptions } from './config'
import { createProject } from './index'

/**
 * Absolute, symlink-free project root. Turbopack's `DiskFileSystem` requires an already
 * canonicalized root and refuses to read a directory through a symlink, so `path.resolve` alone
 * is not enough — on macOS `/tmp` is a symlink to `/private/tmp`, and checkouts often live behind
 * one too. Falls back to the resolved path if the directory does not exist, so the failure
 * surfaces as a missing-entry error rather than an ENOENT here.
 */
function canonicalRoot(dir: string): string {
  const resolved = path.resolve(dir)
  try {
    return realpathSync(resolved)
  } catch {
    return resolved
  }
}

function flag(
  args: string[],
  name: string,
  fallback?: string
): string | undefined {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback
}

function splitCommaSeparatedOption(value: string): string[] {
  return value
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
}

/** CLI-flag overrides applied on top of `turbopack.config.ts` (flags win). */
function flagOverrides(args: string[]): Partial<NapiProjectOptions> {
  const overrides: Partial<NapiProjectOptions> = {}
  const entry = flag(args, 'entry')
  if (entry) overrides.entries = splitCommaSeparatedOption(entry)
  return overrides
}

/** Bundle JavaScript and other static assets into a deployment-ready output */
async function build(args: string[]): Promise<void> {
  const root = canonicalRoot(flag(args, 'root', process.cwd())!)
  const distFlag = flag(args, 'dist')
  const overrides = flagOverrides(args)

  const { config, configPath } = await loadTurbopackConfig(root)
  const options = resolveProjectOptions({ config, root, dev: false, overrides })
  if (!options.entries || options.entries.length === 0)
    options.entries = ['index.html']
  if (distFlag) options.distDir = distFlag

  const project = await createProject(options)

  // Time ONLY the turbopack build (compile + emit) — not project setup, the public/ copy, or
  // the cache flush. This is the "built in N ms" number other bundlers report.
  const started = Date.now()
  await project.build()
  const buildMs = Date.now() - started

  const outDir = path.resolve(root, options.distDir ?? 'dist')

  console.log(
    `\n  turbopack build → ${outDir}  (${buildMs}ms)` +
      `${configPath ? `  (config: ${path.basename(configPath)})` : ''}\n`
  )

  await project.shutdown()
  process.exit(0)
}

/**
 * help — detailed, self-contained reference
 */
const HELP = `turbopack — a fast web bundler designed around incremental compilation

The standalone turbopack CLI is intended for benchmarking the bundler against
generic JavaScript codebases.

USAGE
  turbopack <command> [options]

COMMANDS
  build      Produce an optimized static build in the output directory
             (default: dist/). Minifies, content-hashes chunk filenames, and —
             unless the config sets build.optimize - enables scope hoisting +
             identifier mangling. Copies public/ into the output.

  help       Print this reference.

OPTIONS (per command)

  build
    --root <dir>        Project root. Default: current working directory.
    --dist <dir>        Output directory. Default: dist (or build.distDir from the config).

  CLI flags always override values from turbopack.config.ts.
`

function help(): void {
  console.log(HELP)
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2)

  // Top-level help flags work before command dispatch. `--verbose` adds the full reference.
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    help()
    return
  }

  switch (cmd) {
    case 'build':
      await build(rest)
      break
    default:
      console.error(
        `Unknown command "${cmd}". Run "turbopack help" for usage ` +
          `(commands: build | help).`
      )
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
