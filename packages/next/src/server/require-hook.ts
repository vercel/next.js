// Synchronously inject a require hook for webpack and webpack/. It's required to use the internal ncc webpack version.
// This is needed for userland plugins to attach to the same webpack instance as Next.js'.
// Individually compiled modules are as defined for the compilation in bundles/webpack/packages/*.

// This module will only be loaded once per process.
const path = require('path') as typeof import('path')
const mod = require('module') as typeof import('module')
const originalRequire = mod.prototype.require
const resolveFilename =
  // @ts-expect-error
  mod._resolveFilename

let resolve: typeof require.resolve = process.env.NEXT_MINIMAL
  ? // @ts-ignore
    __non_webpack_require__.resolve
  : require.resolve

export const hookPropertyMap = new Map()

/**
 * Aliases that make every `styled-jsx` request resolve to Next.js' own copy. The
 * Pages Router renderer (`next/dist/server/render.js`) creates the styled-jsx
 * style registry and hands it to user code through a React context owned by the
 * styled-jsx module instance, so user code importing a *different* copy (which
 * happens as soon as the app depends on another styled-jsx version) silently
 * renders no styles at all during SSR. Whatever assembles a deployment has to
 * ship the files these resolve to - see `styledJsxRequireHookEntries()`.
 */
export const defaultOverrides: Record<string, string> = {}

try {
  Object.assign(defaultOverrides, {
    'styled-jsx': path.dirname(resolve('styled-jsx/package.json')),
    'styled-jsx/style': resolve('styled-jsx/style'),
    'styled-jsx/style.js': resolve('styled-jsx/style'),
  })
} catch (cause) {
  // Not being able to register these aliases is not fatal - an app that doesn't
  // use styled-jsx doesn't care - but it silently breaks styled-jsx SSR when the
  // app has its own copy of styled-jsx, so make it diagnosable instead of
  // swallowing the error.
  console.warn(
    'Warning: Next.js could not resolve its own copy of `styled-jsx`, so ' +
      '`styled-jsx` was not deduplicated. If this app uses styled-jsx in the ' +
      'Pages Router, its styles will be missing from the server-rendered HTML ' +
      'and only applied after hydration.' +
      `\nReason: ${(cause as Error)?.message ?? cause}`
  )
}

/**
 * The files the `styled-jsx` aliases above resolve to, resolved from Next.js'
 * own location. The Pages Router renderer needs them at runtime, but no module
 * graph references them directly (user code references the app's own copy), so
 * build output tracing has to add them explicitly - otherwise the hook cannot
 * register its aliases in the deployment and styled-jsx styles silently
 * disappear from the server-rendered HTML.
 */
export function styledJsxRequireHookEntries(): string[] {
  const entries = new Set<string>()

  for (const request of Object.keys(defaultOverrides)) {
    try {
      entries.add(resolve(request, { paths: [__filename] }))
    } catch {
      // styled-jsx is not resolvable, which is warned about above.
    }
  }
  return [...entries]
}

const toResolveMap = (map: Record<string, string>): [string, string][] => {
  const resolveMap: [string, string][] = []
  for (const [key, value] of Object.entries(map)) {
    try {
      resolveMap.push([key, resolve(value)])
    } catch {}
  }
  return resolveMap
}

export function addHookAliases(aliases: [string, string][] = []) {
  for (const [key, value] of aliases) {
    hookPropertyMap.set(key, value)
  }
}

addHookAliases(toResolveMap(defaultOverrides))

// @ts-expect-error
mod._resolveFilename = function (
  originalResolveFilename: (
    request: string,
    parent: string,
    isMain: boolean,
    opts: any
  ) => string,
  requestMap: Map<string, string>,
  request: string,
  parent: string,
  isMain: boolean,
  options: any
) {
  const hookResolved = requestMap.get(request)
  if (hookResolved) request = hookResolved

  return originalResolveFilename.call(mod, request, parent, isMain, options)

  // We use `bind` here to avoid referencing outside variables to create potential memory leaks.
}.bind(null, resolveFilename, hookPropertyMap)

// @ts-expect-error
// This is a hack to make sure that if a user requires a Next.js module that wasn't bundled
// that needs to point to the rendering runtime version, it will point to the correct one.
// This can happen on `pages` when a user requires a dependency that uses next/image for example.
mod.prototype.require = function (request: string) {
  if (request.endsWith('.shared-runtime')) {
    return originalRequire.call(
      this,
      `next/dist/server/route-modules/pages/vendored/contexts/${path.basename(
        request,
        '.shared-runtime'
      )}`
    )
  }

  return originalRequire.call(this, request)
}
