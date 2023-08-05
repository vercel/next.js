// Synchronously inject a require hook for webpack and webpack/. It's required to use the internal ncc webpack version.
// This is needed for userland plugins to attach to the same webpack instance as Next.js'.
// Individually compiled modules are as defined for the compilation in bundles/webpack/packages/*.

// This module will only be loaded once per process.

const { resolve: pathResolve, dirname } = require('path')
const Module = require('module')
const resolveFilename = Module._resolveFilename
const hookPropertyMap = new Map()

export function addHookAliases(aliases: [string, string][] = []) {
  for (const [key, value] of aliases) {
    hookPropertyMap.set(key, value)
  }
}

const resolve = process.env.NEXT_MINIMAL
  ? // @ts-ignore
    __non_webpack_require__.resolve
  : require.resolve

const toResolveMap = (map: Record<string, string>): [string, string][] =>
  Object.entries(map).map(([key, value]) => [key, resolve(value)])

export const globalOverrides = {
  'styled-jsx': dirname(resolve('styled-jsx/package.json')),
  'styled-jsx/style': resolve('styled-jsx/style'),
}

// Add default aliases
addHookAliases(toResolveMap(globalOverrides))

const nextPackageAnchor = resolve('next/package.json')
const vendoredPath = pathResolve(nextPackageAnchor, '../vendored')

Module._resolveFilename = function (
  originalResolveFilename: typeof resolveFilename,
  requestMap: Map<string, string>,
  request: string,
  parent: any,
  isMain: boolean,
  options: any
) {
  /**
   * With vendoring we transparently resolve package specifiers to a vendored package substitute
   * while still maintaining normal module resolution semantics. In particular it is important
   * that export maps and main fields defined in package.json files continue to work through this
   * vendoring process. This only really matters however for bare specifiers such as `require('foo/bar')`
   *
   * Path specifiers such as `require('./foo/bar')` don't have any package resolution semantics to maintain
   * so they can be transparently aliased by simply replacing the specifier with the alias value. In both this
   * file and the corresponding webpack plugins that perfom similar functionality we distinguish vendoring from
   * aliasing because the requirement of maintaining package semantics is very important.
   *
   * It should be noted that while `require('next/vendored/react')` looks like a bare specifier it is for the
   * `next` package not `react`. If we alias `react` to this `next/vendored/react` it will not use the
   * exports map defined in the react package to resolve this request. This is important for things like the "react-server"
   * condition which loads a shared subset of React that can run in RSC.
   *
   * A rule of thumb for whether you want to vendor something or alias is whether the replacement is for an entire
   * package vs a few files and whether the replacement is structurally indentical. Our vendoring of React packages is
   * a good example of this whereas our aliasing of a precompiled webpack build is a good example for aliasing
   * where the aliasing is to files that bear no resemblance to the uncompiled package structure
   */
  if (request[0] !== '.' && request[0] !== '/' && request[0] !== '\\') {
    // We have a bare specifier and might need to resolve this to a vendored package
    const slash = request.indexOf('/')
    const requestBase = slash === -1 ? request : request.slice(0, slash)
    switch (requestBase) {
      case 'react':
      case 'react-dom':
      case 'react-server-dom-webpack':
      case 'scheduler':
        // We have a React package. We don't always vendor React, we only do so for App Router at the moment.
        // We can determine whether we should vendor this request by checking an environment variable
        if (!process.env.__NEXT_PRIVATE_PREBUNDLED_REACT) {
          break
        }

        let requestPath: string
        if (request === 'react-dom') {
          // this hook always runs on the server and so we unconditionally rewrite
          // bare react-dom resolutions to /server-rendering-stub. Webpack will pick
          // the right react-dom when it resolves this for the client so we don't need
          // to consider that here.
          // When React publishes a version where the top level react-dom export does not
          // contain all of the client we will remove this special aliasing.
          requestPath = '/server-rendering-stub'
        } else {
          requestPath = slash === -1 ? '' : request.slice(slash)
        }

        // Haste complains when more than one package is loaded with the same package and we also have
        // both canary and experimental channels of vendored react packages so when we copy the packages
        // into the project we modify their names both in the file-system and within the package.json
        const vendoredSuffix =
          process.env.__NEXT_PRIVATE_PREBUNDLED_REACT === 'experimental'
            ? '-experimental-vendored'
            : '-vendored'

        const vendoredRequest = requestBase + vendoredSuffix + requestPath

        // This will resolve the modified request from the path next/vendored rather than
        // where the actual require originated.
        return resolve(vendoredRequest, {
          paths: [vendoredPath],
        })
      case 'client-only':
      case 'server-only': {
        return resolve(
          requestBase + '-vendored' + request.slice(requestBase.length),
          {
            paths: [vendoredPath],
          }
        )
      }
      default:
      // If we have no special vendoring defined for this package we fall through to check for aliasing
    }
  }

  // If an alias is registered for this request we resolve the alias instead otherwise we resolve the request
  const hookResolved = requestMap.get(request)
  if (hookResolved) request = hookResolved
  return originalResolveFilename.call(Module, request, parent, isMain, options)

  // We use `bind` here to avoid referencing outside variables to create potential memory leaks.
}.bind(null, resolveFilename, hookPropertyMap)
