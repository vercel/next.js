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

export const defaultOverrides: Record<string, string> = {}

try {
  Object.assign(defaultOverrides, {
    'styled-jsx': path.dirname(resolve('styled-jsx/package.json')),
    'styled-jsx/style': resolve('styled-jsx/style'),
    'styled-jsx/style.js': resolve('styled-jsx/style'),
  })
} catch (cause) {
  // These aliases make every `styled-jsx` request resolve to Next.js' own copy, which the Pages
  // Router depends on: the renderer creates the styled-jsx style registry and hands it to user
  // code through a React context owned by that module instance. Without the aliases, user code
  // with its own copy of styled-jsx gets a second instance, `JSXStyle` finds no registry and
  // silently renders nothing during SSR - the `jsx-*` class names are still emitted, but the CSS
  // only arrives after hydration, i.e. a flash of unstyled content and no error anywhere. Failing
  // loudly here is better than that.
  throw new Error(
    "Next.js could not resolve its own copy of 'styled-jsx'. It is a dependency of 'next', so " +
      "this usually means the installation is incomplete or 'node_modules' is out of date - " +
      "reinstalling dependencies normally fixes it. If your setup can't resolve nested " +
      "dependencies (for example a custom bundling or vendoring step), add 'styled-jsx' to your " +
      'app dependencies so it resolves to a single copy.\n' +
      'See more info here: https://nextjs.org/docs/messages/styled-jsx-not-resolvable',
    { cause }
  )
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
