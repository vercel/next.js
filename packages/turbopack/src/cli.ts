#!/usr/bin/env node
import fs from 'fs'
import path from 'path'

import type { NapiProjectOptions } from './binding'
import { loadTurbopackConfig, resolveProjectOptions } from './config'

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
  const root = path.resolve(flag(args, 'root', process.cwd())!)
  const distFlag = flag(args, 'dist')
  const overrides = flagOverrides(args)

  const { config, configPath } = await loadTurbopackConfig(root)
  const options = resolveProjectOptions({ config, root, dev: false, overrides })
  if (!options.entries || options.entries.length === 0)
    options.entries = ['index.html']
  if (distFlag) options.distDir = distFlag

  // Time ONLY the turbopack build (compile + emit) — not project setup, the public/ copy, or the
  // cache flush. This is the "built in N ms" number other bundlers report.
  const started = Date.now()
  // This is where the project build goes!
  const buildMs = Date.now() - started

  // Copy public/ into the out dir (static passthrough) — outside the reported build time.
  const outDir = path.resolve(root, options.distDir ?? 'dist')
  const publicDir = path.join(root, 'public')
  if (fs.existsSync(publicDir)) {
    fs.cpSync(publicDir, outDir, { recursive: true })
  }

  // The server bundle (dist/server/*) is emitted as CommonJS — module.exports plus require() for
  // chunk loading. Node picks a .js file's module type from the nearest package.json, so a project
  // whose root package.json is "type":"module" would parse these .js files (the entry AND its
  // chunks/*.js) as ESM and throw "require is not defined". Pin the whole server subtree to
  // CommonJS with its own package.json — the mechanism Node designed for this, and what bundlers
  // like Next.js use for their server output. Written before prerenderStatic require()s the bundle;
  // covers both static (required at build) and server (served at runtime) modes.
  const serverDir = path.join(outDir, 'server')
  if (fs.existsSync(serverDir)) {
    fs.writeFileSync(
      path.join(serverDir, 'package.json'),
      '{ "type": "commonjs" }\n'
    )
  }

  console.log(
    `\n  turbopack build → ${outDir}  (${buildMs}ms)` +
      `${configPath ? `  (config: ${path.basename(configPath)})` : ''}\n`
  )

  // Clean up the project here
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
