import { webpack } from 'next/dist/compiled/webpack/webpack'
import { resolve } from 'node:path'

const registeredPlugins = new Set<any>()

// This matches up to the first path separator unless the path starts with `.` or `/` or `\`
const upToFirstSeparator = /^[^.\\/][^\\/]*/

type NextResolvePluginOptions = {
  serverRuntime?: boolean
  profilingReact?: boolean
}

export class NextResolvePlugin {
  private readonly options: NextAppResolvePluginOptions
  private readonly profilingReact: boolean

  constructor(options?: NextResolvePluginOptions) {
    if (!registeredPlugins.has(NextResolvePlugin)) {
      webpack.util.serialization.register(
        NextResolvePlugin,
        'next/dist/build/webpack/plugins/next-resolve-plugin',
        'NextResolvePlugin',
        new (class NextResolvePluginSerializer {
          serialize(source: NextResolvePlugin, { write }: any) {
            const o = source.getOptions()
            write(o)
          }

          deserialize({ read }: any) {
            const o = read()
            return new NextResolvePlugin(o)
          }
        })()
      )
      registeredPlugins.add(NextResolvePlugin)
    }

    this.options = options || {}

    // Some logic below depends on whether we are bundling to run on edge/node vs the browser.
    this.profilingReact =
      (options &&
        options.profilingReact === true &&
        options.serverRuntime !== true) ||
      false
  }

  getOptions() {
    return this.options
  }

  apply(resolver: webpack.Resolver) {
    const target = resolver.ensureHook('resolve')

    resolver
      .getHook('before-resolve')
      .tapAsync(
        'NextResolvePlugin',
        (request: any, resolveContext: any, callback: any) => {
          // We only use vendored packages for App Router builds
          const requestString = request.request

          const packageMatch = requestString.match(upToFirstSeparator)

          if (packageMatch) {
            // Determine the package we are trying to resolve
            let packageName = packageMatch[0] || ''

            switch (packageName) {
              case 'react-dom':
              case 'scheduler': {
                if (this.profilingReact) {
                  // We are in profiling mode and need to swap in the profiler tracing build
                  let alias: string
                  if (requestString === 'react-dom') {
                    alias = 'react-dom/profiling'
                  } else if (requestString.startsWith('scheduler/tracing')) {
                    alias =
                      'scheduler/tracing-profiling' +
                      requestString.slice('scheduler/tracing'.length)
                  } else {
                    return callback()
                  }

                  return resolver.doResolve(
                    target,
                    {
                      ...request,
                      request: alias,
                    },
                    'aliasing ' + packageName,
                    resolveContext,
                    callback
                  )
                }
                break
              }
              default:
            }
          }

          return callback()
        }
      )
  }
}

type NextAppResolvePluginOptions = {
  experimentalReact?: boolean
  serverRuntime?: boolean
}

export class NextAppResolvePlugin {
  private readonly options: NextAppResolvePluginOptions
  private readonly serverRuntime: boolean
  private readonly aliases: Map<string, string>
  private readonly reactVendoredPackageSuffix: string
  private readonly vendorPath: string

  constructor(options?: NextAppResolvePluginOptions) {
    if (!registeredPlugins.has(NextAppResolvePlugin)) {
      webpack.util.serialization.register(
        NextAppResolvePlugin,
        'next/dist/build/webpack/plugins/next-resolve-plugin',
        'NextAppResolvePlugin',
        new (class NextAppResolvePluginSerializer {
          serialize(source: NextAppResolvePlugin, { write }: any) {
            const o = source.getOptions()
            write(o)
          }

          deserialize({ read }: any) {
            const o = read()
            return new NextAppResolvePlugin(o)
          }
        })()
      )
      registeredPlugins.add(NextAppResolvePlugin)
    }

    this.options = options || {}

    // Some logic below depends on whether we are bundling to run on edge/node vs the browser.
    this.serverRuntime = (options && options.serverRuntime) || false

    // Alias resolving is bespoke so this is better modeled by a map than with switch branches like we do
    // with vendored resolves where the logic follows a consistent pattern for most packages. Think of aliasing as
    // being for individual files and vendoring for entire packages.
    // This aliasing is subtley different from builtin webpack aliasing. It matches exact request strings rather than path segments.
    // This choice was made for practicality and simplicity, there just aren't any instances that needed segment based aliasing
    // after adopting vendoring. If this changes in the future we will need to refactor this to support aliasing path segments.
    this.aliases = new Map([
      ['next/head', 'next/dist/client/components/noop-head'],
      ['next/dynamic', 'next/dist/shared/lib/app-dynamic'],
    ])

    // React packages are renamed to support experimental channels and to avoid Haste package name warnings
    this.reactVendoredPackageSuffix =
      options && options.experimentalReact
        ? '-experimental-vendored'
        : '-vendored'

    const nextPackage = require.resolve('next/package.json')
    this.vendorPath = resolve(nextPackage, '../dist/vendored')
  }

  getOptions() {
    return this.options
  }

  getVendoredRequestObject(requestObject: any, vendoredRequest: string) {
    return {
      ...requestObject,
      path: this.vendorPath,
      request: vendoredRequest,
    }
  }

  getAliasedRequestObject(requestObject: any, aliasedRequest: string) {
    return {
      ...requestObject,
      request: aliasedRequest,
    }
  }

  apply(resolver: webpack.Resolver) {
    const target = resolver.ensureHook('resolve')

    resolver
      .getHook('before-resolve')
      .tapAsync(
        'NextAppResolvePlugin',
        (request: any, resolveContext: any, callback: any) => {
          // We only use vendored packages for App Router builds
          const requestString = request.request

          if (request.path === this.vendorPath) {
            // Webpack resolves cyclicly and so after redirecting a resolve to vendor this hook runs again.
            // We can fast path this to avoid recomputing the package name below by assuming any resolve that
            // has a path of the vendorPath is already vendored. This is safe because there are no modules
            // that natively resolve from this path.
            return callback()
          }

          const packageMatch = requestString.match(upToFirstSeparator)
          if (packageMatch) {
            // Determine the package we are trying to resolve
            let packageName = packageMatch[0] || ''

            switch (packageName) {
              case 'next': {
                // Next is common and if the runtime does not optimally compile this code we can at least
                // speed it up by short circuiting the switch early for the most common packages
                break
              }
              case 'react-dom': {
                // react-dom has a special alias when vendoring on the server. Once this is integrated into the react-dom
                // package we can unify this branch with the other react branches below
                let packagePath = requestString.slice(packageName.length)
                if (packagePath === '' && this.serverRuntime) {
                  if (this.serverRuntime) {
                    // We're bundling for a server environment and requiring the top level package "react-dom".
                    // We substitute the server-rendering-stub instead to avoid loading all of react-dom on the server.
                    // In the future we will remove this once the react-dom top level export no longer contains the
                    // entire client build
                    packagePath = '/server-rendering-stub'
                  }
                }
                // Restart the resolution process from the vendored package path and the augmented react package name
                return resolver.doResolve(
                  target,
                  this.getVendoredRequestObject(
                    request,
                    packageName + this.reactVendoredPackageSuffix + packagePath
                  ),
                  'vendoring ' + packageName,
                  resolveContext,
                  callback
                )
              }
              case 'react':
              case 'react-server-dom-webpack':
              case 'scheduler': {
                let packagePath = requestString.slice(packageName.length)
                // Restart the resolution process from the vendored package path and the augmented react package name
                return resolver.doResolve(
                  target,
                  this.getVendoredRequestObject(
                    request,
                    packageName + this.reactVendoredPackageSuffix + packagePath
                  ),
                  'vendoring ' + packageName,
                  resolveContext,
                  callback
                )
              }

              // packages that are not renamed when vendored
              case 'server-only':
              case 'client-only': {
                // Restart the resolution process from teh vendored package path
                return resolver.doResolve(
                  target,
                  this.getVendoredRequestObject(request, requestString),
                  'vendoring ' + packageName,
                  resolveContext,
                  callback
                )
              }
              default:
              // This package does not require vendoring but the request might still
              // need to be aliased. We continue below to the alias path
            }
          }

          // If this was a vendorable request we would have already returned. Now we check if the request is aliasable
          const alias = this.aliases.get(requestString)
          if (alias) {
            // We restart resolution with the alias in place of the original request
            return resolver.doResolve(
              target,
              this.getAliasedRequestObject(request, alias),
              'aliasing ' + requestString,
              resolveContext,
              callback
            )
          }
          // No alias configured, continue with the existing resolution process
          return callback()
        }
      )
  }
}
