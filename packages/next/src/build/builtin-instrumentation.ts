import path from 'path'
import type { NextConfigComplete } from '../server/config-shared'
import { Bundler, bundlerName } from '../lib/bundler'
import { INSTRUMENTATION_HOOK_FILENAME } from '../lib/constants'
import * as Log from './output/log'

/**
 * The adapter-supplied module that fills the instrumentation slot when the
 * project has no instrumentation file. The Vercel adapter sets this. Next.js
 * does not import `@vercel/otel` and does not install it.
 */
export type InstrumentationInject = {
  readonly file: string
  readonly page: `/${typeof INSTRUMENTATION_HOOK_FILENAME}`
  readonly specifier: string
}

/**
 *   inject specifier   project file   active bundler compiles it   result
 *   set                none           n/a                          inject
 *   set                found          yes                          project
 *   set                found          no                           blocked
 *   unset              any            any                          off
 *
 * A project file always wins, including one this bundler will not compile.
 * Injecting over that miss would replace a file Turbopack compiles.
 */
export function decideInstrumentationInject(facts: {
  readonly inject: string | undefined
  readonly projectFile: string | undefined
  readonly activeBundlerCompilesProjectFile: boolean
}):
  | { kind: 'inject' }
  | { kind: 'project' }
  | { kind: 'blocked'; projectFile: string }
  | { kind: 'off' } {
  if (facts.inject === undefined) {
    return { kind: 'off' }
  }
  if (facts.projectFile === undefined) {
    return { kind: 'inject' }
  }
  if (facts.activeBundlerCompilesProjectFile) {
    return { kind: 'project' }
  }
  return { kind: 'blocked', projectFile: facts.projectFile }
}

/**
 * Resolves `instrumentationInject` when it should fill the slot.
 *
 * Throws when the specifier does not resolve from the project. The caller
 * (the adapter) owns making that module resolvable. This does not look for
 * `@vercel/otel`.
 */
export async function resolveInstrumentationInject(opts: {
  readonly dir: string
  readonly appDir: string | undefined
  readonly pagesDir: string | undefined
  readonly config: Pick<
    NextConfigComplete,
    'instrumentationInject' | 'pageExtensions' | 'outputFileTracingRoot'
  >
  readonly bundler: Bundler
  readonly dev: boolean
}): Promise<InstrumentationInject | undefined> {
  const specifier = opts.config.instrumentationInject?.[0]
  const projectFile = specifier
    ? await findProjectInstrumentationFile(
        opts.dir,
        opts.config.outputFileTracingRoot,
        opts.config.pageExtensions
      )
    : undefined
  const conventionDir = path.join(
    (opts.pagesDir || opts.appDir) ?? opts.dir,
    '..'
  )
  const decision = decideInstrumentationInject({
    inject: specifier,
    projectFile,
    activeBundlerCompilesProjectFile:
      projectFile !== undefined &&
      (opts.bundler === Bundler.Turbopack ||
        webpackCompilesInstrumentationFile(
          projectFile,
          conventionDir,
          opts.dir,
          opts.dev
        )),
  })

  if (decision.kind === 'blocked') {
    const blocking = path.relative(opts.dir, decision.projectFile)
    Log.warnOnce(
      `\`instrumentationInject\` is not used because ${blocking} exists, but ${bundlerName(opts.bundler)} will not compile it. ` +
        `That file replaces the injected instrumentation.`
    )
    return undefined
  }
  if (decision.kind !== 'inject' || specifier === undefined) {
    return undefined
  }

  let file: string
  try {
    file = require.resolve(specifier, { paths: [opts.dir] })
  } catch {
    throw new Error(
      `\`instrumentationInject\` entry ${JSON.stringify(specifier)} does not resolve from the project.\n` +
        'The module must be resolvable from the project root. Next.js does not install it.'
    )
  }
  return {
    file,
    page: `/${INSTRUMENTATION_HOOK_FILENAME}`,
    specifier,
  }
}

/**
 * Mirrors `find_instrumentation`: at `dir` and each parent up to and including
 * `outputFileTracingRoot`, root names before `src/` names. Stops at that root.
 * `find_context_file` does not walk to the OS root.
 */
async function findProjectInstrumentationFile(
  dir: string,
  lookupRoot: string,
  pageExtensions: readonly string[]
): Promise<string | undefined> {
  const { promises: fs } = await import('fs')
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
// is the project root.
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
