import path from 'path'
import { promises as fs } from 'fs'
import type { NextConfigComplete } from '../server/config-shared'
import { Bundler, bundlerName } from '../lib/bundler'
import { INSTRUMENTATION_HOOK_FILENAME } from '../lib/constants'
import { getOxfordCommaList } from '../lib/oxford-comma-list'
import * as Log from './output/log'

/**
 * Packages `tracing: true` needs in the project. create-next-app installs the
 * same names (a test fails if they drift).
 */
export const TRACING_PACKAGES = [
  '@vercel/otel',
  '@opentelemetry/api',
  '@opentelemetry/api-logs',
] as const

/**
 * The only copy of the built-in instrumentation. Webpack compiles it from
 * `builtinInstrumentationFile(dir)`. Turbopack receives it through
 * `ProjectOptions.builtinInstrumentationSource`.
 */
export const BUILTIN_INSTRUMENTATION_SOURCE = `import { registerOTel } from '@vercel/otel'

export function register() {
  registerOTel()
}
`

/**
 * Always under the project, even with a custom `distDir`, so that
 * `@vercel/otel` resolves from the project and webpack's `codeCondition`
 * includes the file. `.mjs` because `.next/package.json` declares
 * `"type": "commonjs"`, which would make webpack parse a `.js` file here as a
 * script.
 */
export function builtinInstrumentationFile(dir: string): string {
  return path.join(dir, '.next', 'cache', 'builtin-instrumentation.mjs')
}

export type InstrumentationDecision =
  | { kind: 'builtin' }
  | { kind: 'project' }
  | { kind: 'blocked'; projectFile: string }
  | { kind: 'off' }

/**
 *   tracing    project file   active bundler compiles it   decision
 *   true       none           n/a                          builtin
 *   true       found          yes                          project
 *   true       found          no                           blocked
 *   not true   any            any                          off
 */
export function decideInstrumentation(facts: {
  readonly tracing: boolean | undefined
  readonly projectFile: string | undefined
  readonly activeBundlerCompilesProjectFile: boolean
}): InstrumentationDecision {
  if (facts.tracing !== true) {
    return { kind: 'off' }
  }
  if (facts.projectFile === undefined) {
    return { kind: 'builtin' }
  }
  if (facts.activeBundlerCompilesProjectFile) {
    return { kind: 'project' }
  }
  return { kind: 'blocked', projectFile: facts.projectFile }
}

declare const builtinInstrumentationBrand: unique symbol

/**
 * Held only when `tracing === true`, no project instrumentation file is in
 * Turbopack's lookup, the tracing packages resolve from the project, and
 * `file` holds `BUILTIN_INSTRUMENTATION_SOURCE`. Only
 * `resolveBuiltinInstrumentation` creates one.
 */
export interface BuiltinInstrumentation {
  readonly [builtinInstrumentationBrand]: true
  readonly file: string
  readonly page: `/${typeof INSTRUMENTATION_HOOK_FILENAME}`
}

/**
 * Decides once per build or dev server whether the built-in fills the
 * instrumentation slot. Writes the built-in file when it does and deletes it
 * when it does not.
 *
 * Throws when the built-in is selected and a tracing package is missing.
 * Warns when a project file blocks the built-in but the active bundler will
 * not compile that file.
 */
export async function resolveBuiltinInstrumentation(opts: {
  readonly dir: string
  readonly appDir: string | undefined
  readonly pagesDir: string | undefined
  readonly config: Pick<
    NextConfigComplete,
    'tracing' | 'pageExtensions' | 'outputFileTracingRoot'
  >
  readonly bundler: Bundler
  readonly dev: boolean
}): Promise<BuiltinInstrumentation | undefined> {
  const { dir, config, bundler } = opts
  const file = builtinInstrumentationFile(dir)
  const projectFile =
    config.tracing === true
      ? await findProjectInstrumentationFile(
          dir,
          config.outputFileTracingRoot,
          config.pageExtensions
        )
      : undefined
  const conventionDir = path.join((opts.pagesDir || opts.appDir) ?? dir, '..')

  const decision = decideInstrumentation({
    tracing: config.tracing,
    projectFile,
    activeBundlerCompilesProjectFile:
      projectFile !== undefined &&
      (bundler === Bundler.Turbopack ||
        webpackCompilesInstrumentationFile(
          projectFile,
          conventionDir,
          dir,
          opts.dev
        )),
  })

  if (decision.kind !== 'builtin') {
    await fs.rm(file, { force: true })
    if (decision.kind === 'blocked') {
      const blocking = path.relative(dir, decision.projectFile)
      const expected = path.relative(
        dir,
        path.join(conventionDir, INSTRUMENTATION_HOOK_FILENAME)
      )
      Log.warnOnce(
        `\`tracing: true\` is off because ${blocking} exists, but ${bundlerName(bundler)} will not compile it. ` +
          `Move it to ${expected}.<ext>, or delete it to use the built-in tracing.`
      )
    }
    return undefined
  }

  assertTracingPackagesResolve(dir)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, BUILTIN_INSTRUMENTATION_SOURCE)
  return {
    file,
    page: `/${INSTRUMENTATION_HOOK_FILENAME}`,
  } as BuiltinInstrumentation
}

/**
 * Mirrors `find_instrumentation` in crates/next-api/src/project.rs: at `dir`
 * and each parent up to and including Turbopack's root (config.ts sets
 * `turbopack.root` to `outputFileTracingRoot`), the first existing
 * `instrumentation.<ext>`, then `src/instrumentation.<ext>`. Every file either
 * webpack pipeline compiles is in this set.
 */
async function findProjectInstrumentationFile(
  dir: string,
  lookupRoot: string,
  pageExtensions: readonly string[]
): Promise<string | undefined> {
  const names = [
    ...pageExtensions.map((ext) => `${INSTRUMENTATION_HOOK_FILENAME}.${ext}`),
    ...pageExtensions.map(
      (ext) => `src/${INSTRUMENTATION_HOOK_FILENAME}.${ext}`
    ),
  ]
  for (let level = dir; ; level = path.dirname(level)) {
    for (const name of names) {
      const file = path.join(level, name)
      const stat = await fs.stat(file).catch(() => undefined)
      if (stat?.isFile()) {
        return file
      }
    }
    if (
      level === lookupRoot ||
      !isInside(level, lookupRoot) ||
      level === path.dirname(level)
    ) {
      return undefined
    }
  }
}

function isInside(file: string, root: string): boolean {
  const relative = path.relative(root, file)
  return !relative.startsWith('..') && !path.isAbsolute(relative)
}

// `next build` reads instrumentation only beside the `app` or `pages`
// directory. `next dev` also reads `src/instrumentation` when that directory
// is the project root (see `startWatcher` in setup-dev-bundler.ts).
function webpackCompilesInstrumentationFile(
  file: string,
  conventionDir: string,
  dir: string,
  dev: boolean
): boolean {
  const fileDir = path.dirname(file)
  return (
    fileDir === conventionDir ||
    (dev && conventionDir === dir && fileDir === path.join(dir, 'src'))
  )
}

function assertTracingPackagesResolve(dir: string): void {
  const missing = TRACING_PACKAGES.filter((name) => {
    try {
      require.resolve(name, { paths: [dir] })
      return false
    } catch (err: any) {
      // Installed, but its exports map has no entry for `require`.
      return err?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED'
    }
  })
  if (missing.length > 0) {
    throw new Error(
      `\`tracing: true\` needs ${getOxfordCommaList([...TRACING_PACKAGES])}.\n` +
        'Install them, or set `tracing: false`.'
    )
  }
}
