import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

import { z } from 'zod'

import type { NapiProjectOptions } from './binding'

/**
 * User-facing `turbopack.config.ts` shape, providing access to all of the
 * configurable settings that control how Turbopack bundles.
 */
export interface TurbopackConfig {
  /** Project root (default: cwd). */
  root?: string
  /** Entry points — HTML templates and/or bare JS/TS modules (relative to root). */
  entries?: string[]
  /** Resolve aliases, e.g. `{ '@': './src' }` — adds `@` and `@/*`. */
  alias?: Record<string, string>
  /** Build options. */
  build?: {
    distDir?: string
    sourceMaps?: boolean
  }
}

/** Identity helper so users get typed config with `export default defineConfig({...})`. */
export function defineConfig(config: TurbopackConfig): TurbopackConfig {
  return config
}

/**
 * Runtime schema for `turbopack.config.ts` (mirrors `TurbopackConfig`).
 * Validation is advisory: on failure we warn (listing the offending options)
 * and continue with the user's config unchanged, so a new config value never
 * outright fails on an older CLI.
 */
export const configSchema: z.ZodType<TurbopackConfig> = z.strictObject({
  root: z.string().optional(),
  entries: z.array(z.string()).optional(),
  alias: z.record(z.string(), z.string()).optional(),
  build: z
    .strictObject({
      distDir: z.string().optional(),
      sourceMaps: z.boolean().optional(),
    })
    .optional(),
})

/** Format zod issues into readable lines and warn (advisory, must never throw). */
function warnConfigIssues(configFile: string, error: z.ZodError): void {
  const lines = [`Invalid ${configFile} options detected:`]
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      lines.push(`  unknown option(s): ${issue.keys.join(', ')}`)
    } else {
      const at = issue.path.length ? issue.path.join('.') : '<root>'
      lines.push(`  ${at}: ${issue.message}`)
    }
  }
  console.warn(`\n${lines.join('\n')}\n`)
}

/**
 * A genuine dynamic `import()`. tsc's CommonJS output rewrites a literal `import()` into
 * `require()`, which cannot load an ESM/TS file by URL. This indirection keeps a real native
 * `import` so Node's TS stripping + ESM loading apply.
 */
// eslint-disable-next-line no-new-func
const nativeImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<any>

/** All supported config filenames */
const CONFIG_FILES = [
  'turbopack.config.ts',
  'turbopack.config.mjs',
  'turbopack.config.js',
]

/** Find the config file at `root`, if any. */
export function findConfigFile(root: string): string | undefined {
  for (const name of CONFIG_FILES) {
    const full = path.join(root, name)
    if (fs.existsSync(full)) return full
  }
  return undefined
}

/**
 * Load `turbopack.config.ts` via Node's native TypeScript import (`import(fileURL)`, taking
 * the default export). No transpile step or extra deps, so long as Node is newer
 * than 22.6. The older `.js`/`.mjs` configs can load on any Node. Returns `{}`
 * when there is no config file.
 */
export async function loadTurbopackConfig(
  root: string
): Promise<{ config: TurbopackConfig; configPath?: string }> {
  const configPath = findConfigFile(root)
  if (!configPath) return { config: {} }

  // `process.features.typescript` is present on Node ≥ 22.6 but not yet in @types/node.
  const nativeTs = (process.features as { typescript?: unknown }).typescript
  if (configPath.endsWith('.ts') && !nativeTs) {
    throw new Error(
      `Loading ${path.basename(configPath)} needs Node's native TypeScript support ` +
        `(Node ≥ 22.6). Upgrade Node, or use turbopack.config.mjs. (Detected: ${process.version})`
    )
  }

  // Cache-bust so an edited config re-imports (the CLI restarts the project on change).
  const url = `${pathToFileURL(configPath).href}?t=${fs.statSync(configPath).mtimeMs}`
  const mod = await nativeImport(url)
  const config = (mod.default ?? mod) as TurbopackConfig

  // Validation pass to warn about invalid or unknown options. Unknown values
  // aren't an error, use the config as-is.
  const parsed = configSchema.safeParse(config)
  if (!parsed.success) warnConfigIssues(path.basename(configPath), parsed.error)

  return { config, configPath }
}

/**
 * Fold a loaded config  into `NapiProjectOptions`. `overrides` (from CLI flags) win over
 * the config file.
 */
export function resolveProjectOptions(args: {
  config: TurbopackConfig
  root: string
  dev: boolean
  overrides?: Partial<NapiProjectOptions>
}): NapiProjectOptions {
  const { config, root, overrides = {} } = args

  const options: NapiProjectOptions = {
    rootPath: root,
    entries: config.entries ?? [],
    distDir: config.build?.distDir,
    ...overrides,
  }
  return options
}
