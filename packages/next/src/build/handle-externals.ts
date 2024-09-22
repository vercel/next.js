import type { WebpackLayerName } from '../lib/constants'
import type { NextConfigComplete } from '../server/config-shared'
import type { ResolveOptions } from 'webpack'
import { defaultOverrides } from '../server/require-hook'
import { BARREL_OPTIMIZATION_PREFIX } from '../shared/lib/constants'
import path from '../shared/lib/isomorphic/path'
import {
  NODE_BASE_ESM_RESOLVE_OPTIONS,
  NODE_BASE_RESOLVE_OPTIONS,
  NODE_ESM_RESOLVE_OPTIONS,
  NODE_RESOLVE_OPTIONS,
} from './webpack-config'
import { isWebpackBundledLayer, isWebpackServerOnlyLayer } from './utils'
import { normalizePathSep } from '../shared/lib/page-path/normalize-path-sep'
const reactPackagesRegex = /^(react|react-dom|react-server-dom-webpack)($|\/)/

const pathSeparators = '[/\\\\]'
const optionalEsmPart = `((${pathSeparators}esm)?${pathSeparators})`
const externalFileEnd = '(\\.external(\\.js)?)$'
const nextDist = `next${pathSeparators}dist`

const externalPattern = new RegExp(
  `${nextDist}${optionalEsmPart}.*${externalFileEnd}`
)

const nodeModulesRegex = /node_modules[/\\].*\.[mc]?js$/

export function isResourceInPackages(
  resource: string,
  packageNames?: string[],
  packageDirMapping?: Map<string, string>
): boolean {
  if (!packageNames) return false
  return packageNames.some((p: string) =>
    packageDirMapping && packageDirMapping.has(p)
      ? resource.startsWith(packageDirMapping.get(p)! + path.sep)
      : resource.includes(
          path.sep +
            path.join('node_modules', p.replace(/\//g, path.sep)) +
            path.sep
        )
  )
}

export async function resolveExternal(
  dir: string,
  esmExternalsConfig: NextConfigComplete['experimental']['esmExternals'],
  context: string,
  request: string,
  isEsmRequested: boolean,
  _optOutBundlingPackages: string[],
  getResolve: (
    options: ResolveOptions
  ) => (
    resolveContext: string,
    resolveRequest: string
  ) => Promise<[string | null, boolean]>,
  isLocalCallback?: (res: string) => any,
  baseResolveCheck = true,
  esmResolveOptions: any = NODE_ESM_RESOLVE_OPTIONS,
  nodeResolveOptions: any = NODE_RESOLVE_OPTIONS,
  baseEsmResolveOptions: any = NODE_BASE_ESM_RESOLVE_OPTIONS,
  baseResolveOptions: any = NODE_BASE_RESOLVE_OPTIONS
) {
  const esmExternals = !!esmExternalsConfig
  const looseEsmExternals = esmExternalsConfig === 'loose'

  let res: string | null = null
  let isEsm: boolean = false

  const preferEsmOptions =
    esmExternals && isEsmRequested ? [true, false] : [false]

  for (const preferEsm of preferEsmOptions) {
    const resolveOptions = preferEsm ? esmResolveOptions : nodeResolveOptions

    const resolve = getResolve(resolveOptions)

    // Resolve the import with the webpack provided context, this
    // ensures we're resolving the correct version when multiple
    // exist.
    try {
      ;[res, isEsm] = await resolve(context, request)
    } catch (err) {
      res = null
    }

    if (!res) {
      continue
    }

    // ESM externals can only be imported (and not required).
    // Make an exception in loose mode.
    if (!isEsmRequested && isEsm && !looseEsmExternals) {
      continue
    }

    if (isLocalCallback) {
      return { localRes: isLocalCallback(res) }
    }

    // Bundled Node.js code is relocated without its node_modules tree.
    // This means we need to make sure its request resolves to the same
    // package that'll be available at runtime. If it's not identical,
    // we need to bundle the code (even if it _should_ be external).
    if (baseResolveCheck) {
      let baseRes: string | null
      let baseIsEsm: boolean
      try {
        const baseResolve = getResolve(
          isEsm ? baseEsmResolveOptions : baseResolveOptions
        )
        ;[baseRes, baseIsEsm] = await baseResolve(dir, request)
      } catch (err) {
        baseRes = null
        baseIsEsm = false
      }

      // Same as above: if the package, when required from the root,
      // would be different from what the real resolution would use, we
      // cannot externalize it.
      // if request is pointing to a symlink it could point to the same file,
      // the resolver will resolve symlinks so this is handled
      if (baseRes !== res || isEsm !== baseIsEsm) {
        res = null
        continue
      }
    }
    break
  }
  return { res, isEsm }
}

export function makeExternalHandler({
  config,
  optOutBundlingPackages,
  optOutBundlingPackageRegex,
  transpiledPackages,
  dir,
}: {
  config: NextConfigComplete
  optOutBundlingPackages: string[]
  optOutBundlingPackageRegex: RegExp
  transpiledPackages: string[]
  dir: string
}) {
  let resolvedExternalPackageDirs: Map<string, string>
  const looseEsmExternals = config.experimental?.esmExternals === 'loose'

  return async function handleExternals(
    context: string,
    request: string,
    dependencyType: string,
    layer: WebpackLayerName | null,
    getResolve: (
      options: any
    ) => (
      resolveContext: string,
      resolveRequest: string
    ) => Promise<[string | null, boolean]>
  ) {
    // We need to externalize internal requests for files intended to
    // not be bundled.
    const isLocal: boolean =
      request.startsWith('.') ||
      // Always check for unix-style path, as webpack sometimes
      // normalizes as posix.
      path.posix.isAbsolute(request) ||
      // When on Windows, we also want to check for Windows-specific
      // absolute paths.
      (process.platform === 'win32' && path.win32.isAbsolute(request))

    // make sure import "next" shows a warning when imported
    // in pages/components
    if (request === 'next') {
      return `commonjs next/dist/lib/import-next-warning`
    }

    const isAppLayer = isWebpackBundledLayer(layer)

    // Relative requires don't need custom resolution, because they
    // are relative to requests we've already resolved here.
    // Absolute requires (require('/foo')) are extremely uncommon, but
    // also have no need for customization as they're already resolved.
    if (!isLocal) {
      if (/^next$/.test(request)) {
        return `commonjs ${request}`
      }

      if (reactPackagesRegex.test(request) && !isAppLayer) {
        return `commonjs ${request}`
      }

      const notExternalModules =
        /^(?:private-next-pages\/|next\/(?:dist\/pages\/|(?:app|document|link|form|image|legacy\/image|constants|dynamic|script|navigation|headers|router)$)|string-hash|private-next-rsc-action-validate|private-next-rsc-action-client-wrapper|private-next-rsc-server-reference|private-next-rsc-cache-wrapper$)/
      if (notExternalModules.test(request)) {
        return
      }
    }

    // @swc/helpers should not be external as it would
    // require hoisting the package which we can't rely on
    if (request.includes('@swc/helpers')) {
      return
    }

    // BARREL_OPTIMIZATION_PREFIX is a special marker that tells Next.js to
    // optimize the import by removing unused exports. This has to be compiled.
    if (request.startsWith(BARREL_OPTIMIZATION_PREFIX)) {
      return
    }

    // When in esm externals mode, and using import, we resolve with
    // ESM resolving options.
    // Also disable esm request when appDir is enabled
    const isEsmRequested = dependencyType === 'esm'

    // Don't bundle @vercel/og nodejs bundle for nodejs runtime.
    // TODO-APP: bundle route.js with different layer that externals common node_module deps.
    // Make sure @vercel/og is loaded as ESM for Node.js runtime
    if (
      isWebpackServerOnlyLayer(layer) &&
      request === 'next/dist/compiled/@vercel/og/index.node.js'
    ) {
      return `module ${request}`
    }

    // Specific Next.js imports that should remain external
    // TODO-APP: Investigate if we can remove this.
    if (request.startsWith('next/dist/')) {
      // Non external that needs to be transpiled
      // Image loader needs to be transpiled
      if (/^next[\\/]dist[\\/]shared[\\/]lib[\\/]image-loader/.test(request)) {
        return
      }

      if (/^next[\\/]dist[\\/]compiled[\\/]next-server/.test(request)) {
        return `commonjs ${request}`
      }

      if (
        /^next[\\/]dist[\\/]shared[\\/](?!lib[\\/]router[\\/]router)/.test(
          request
        ) ||
        /^next[\\/]dist[\\/]compiled[\\/].*\.c?js$/.test(request)
      ) {
        return `commonjs ${request}`
      }

      if (
        /^next[\\/]dist[\\/]esm[\\/]shared[\\/](?!lib[\\/]router[\\/]router)/.test(
          request
        ) ||
        /^next[\\/]dist[\\/]compiled[\\/].*\.mjs$/.test(request)
      ) {
        return `module ${request}`
      }

      return resolveNextExternal(request)
    }

    // TODO-APP: Let's avoid this resolve call as much as possible, and eventually get rid of it.
    const resolveResult = await resolveExternal(
      dir,
      config.experimental.esmExternals,
      context,
      request,
      isEsmRequested,
      optOutBundlingPackages,
      getResolve,
      isLocal ? resolveNextExternal : undefined
    )

    if ('localRes' in resolveResult) {
      return resolveResult.localRes
    }

    // Forcedly resolve the styled-jsx installed by next.js,
    // since `resolveExternal` cannot find the styled-jsx dep with pnpm
    if (request === 'styled-jsx/style') {
      resolveResult.res = defaultOverrides['styled-jsx/style']
    }

    const { res, isEsm } = resolveResult

    // If the request cannot be resolved we need to have
    // webpack "bundle" it so it surfaces the not found error.
    if (!res) {
      return
    }

    const isOptOutBundling = optOutBundlingPackageRegex.test(res)
    // Apply bundling rules to all app layers.
    // Since handleExternals only handle the server layers, we don't need to exclude client here
    if (!isOptOutBundling && isAppLayer) {
      return
    }

    // ESM externals can only be imported (and not required).
    // Make an exception in loose mode.
    if (!isEsmRequested && isEsm && !looseEsmExternals && !isLocal) {
      throw new Error(
        `ESM packages (${request}) need to be imported. Use 'import' to reference the package instead. https://nextjs.org/docs/messages/import-esm-externals`
      )
    }

    const externalType = isEsm ? 'module' : 'commonjs'

    // Default pages have to be transpiled
    if (
      // This is the @babel/plugin-transform-runtime "helpers: true" option
      /node_modules[/\\]@babel[/\\]runtime[/\\]/.test(res)
    ) {
      return
    }

    // Webpack itself has to be compiled because it doesn't always use module relative paths
    if (
      /node_modules[/\\]webpack/.test(res) ||
      /node_modules[/\\]css-loader/.test(res)
    ) {
      return
    }

    // If a package should be transpiled by Next.js, we skip making it external.
    // It doesn't matter what the extension is, as we'll transpile it anyway.
    if (transpiledPackages && !resolvedExternalPackageDirs) {
      resolvedExternalPackageDirs = new Map()
      // We need to resolve all the external package dirs initially.
      for (const pkg of transpiledPackages) {
        const pkgRes = await resolveExternal(
          dir,
          config.experimental.esmExternals,
          context,
          pkg + '/package.json',
          isEsmRequested,
          optOutBundlingPackages,
          getResolve,
          isLocal ? resolveNextExternal : undefined
        )
        if (pkgRes.res) {
          resolvedExternalPackageDirs.set(pkg, path.dirname(pkgRes.res))
        }
      }
    }

    const resolvedBundlingOptOutRes = resolveBundlingOptOutPackages({
      resolvedRes: res,
      config,
      resolvedExternalPackageDirs,
      isAppLayer,
      externalType,
      isOptOutBundling,
      request,
      transpiledPackages,
    })
    if (resolvedBundlingOptOutRes) {
      return resolvedBundlingOptOutRes
    }

    // if here, we default to bundling the file
    return
  }
}

function resolveBundlingOptOutPackages({
  resolvedRes,
  config,
  resolvedExternalPackageDirs,
  isAppLayer,
  externalType,
  isOptOutBundling,
  request,
  transpiledPackages,
}: {
  resolvedRes: string
  config: NextConfigComplete
  resolvedExternalPackageDirs: Map<string, string>
  isAppLayer: boolean
  externalType: string
  isOptOutBundling: boolean
  request: string
  transpiledPackages: string[]
}) {
  if (nodeModulesRegex.test(resolvedRes)) {
    const shouldBundlePages =
      !isAppLayer && config.bundlePagesRouterDependencies && !isOptOutBundling

    const shouldBeBundled =
      shouldBundlePages ||
      isResourceInPackages(
        resolvedRes,
        transpiledPackages,
        resolvedExternalPackageDirs
      )

    if (!shouldBeBundled) {
      return `${externalType} ${request}` // Externalize if not bundled or opted out
    }
  }
}

/**
 * @param localRes the full path to the file
 * @returns the externalized path
 * @description returns an externalized path if the file is a Next.js file and ends with either `.shared-runtime.js` or `.external.js`
 * This is used to ensure that files used across the rendering runtime(s) and the user code are one and the same. The logic in this function
 * will rewrite the require to the correct bundle location depending on the layer at which the file is being used.
 */
function resolveNextExternal(localRes: string) {
  const isExternal = externalPattern.test(localRes)

  // if the file ends with .external, we need to make it a commonjs require in all cases
  // this is used mainly to share the async local storage across the routing, rendering and user layers.
  if (isExternal) {
    // it's important we return the path that starts with `next/dist/` here instead of the absolute path
    // otherwise NFT will get tripped up
    return `commonjs ${normalizePathSep(
      localRes.replace(/.*?next[/\\]dist/, 'next/dist')
    )}`
  }
}
