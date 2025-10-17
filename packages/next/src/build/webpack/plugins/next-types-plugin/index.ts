import type { Rewrite, Redirect } from '../../../../lib/load-custom-routes'

import fs from 'fs/promises'
import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import path from 'path'

import { WEBPACK_LAYERS } from '../../../../lib/constants'
import { denormalizePagePath } from '../../../../shared/lib/page-path/denormalize-page-path'
import { ensureLeadingSlash } from '../../../../shared/lib/page-path/ensure-leading-slash'
import { normalizePathSep } from '../../../../shared/lib/page-path/normalize-path-sep'
import { HTTP_METHODS } from '../../../../server/web/http'
import { isDynamicRoute } from '../../../../shared/lib/router/utils'
import { normalizeAppPath } from '../../../../shared/lib/router/utils/app-paths'
import { getPageFromPath } from '../../../entries'
import type { PageExtensions } from '../../../page-extensions-type'
import { getProxiedPluginState } from '../../../build-context'
import type { CacheLife } from '../../../../server/use-cache/cache-life'

const PLUGIN_NAME = 'NextTypesPlugin'

type Rewrites = {
  fallback: Rewrite[]
  afterFiles: Rewrite[]
  beforeFiles: Rewrite[]
}

interface Options {
  dir: string
  distDir: string
  appDir: string
  dev: boolean
  isEdgeServer: boolean
  pageExtensions: PageExtensions
  cacheLifeConfig: undefined | { [profile: string]: CacheLife }
  originalRewrites: Rewrites | undefined
  originalRedirects: Redirect[] | undefined
}

function createTypeGuardFile(
  fullPath: string,
  relativePath: string,
  options: {
    type: 'layout' | 'page' | 'route'
    slots?: string[]
  }
) {
  return `// File: ${fullPath}
import * as entry from '${relativePath}.js'
${
  options.type === 'route'
    ? `import type { NextRequest } from 'next/server.js'`
    : `import type { ResolvingMetadata, ResolvingViewport } from 'next/dist/lib/metadata/types/metadata-interface.js'`
}

import type { PrefetchForTypeCheckInternal } from 'next/dist/build/segment-config/app/app-segment-config.js'

type TEntry = typeof import('${relativePath}.js')

type SegmentParams<T extends Object = any> = T extends Record<string, any>
  ? { [K in keyof T]: T[K] extends string ? string | string[] | undefined : never }
  : T

// Check that the entry is a valid entry
checkFields<Diff<{
  ${
    options.type === 'route'
      ? HTTP_METHODS.map((method) => `${method}?: Function`).join('\n  ')
      : 'default: Function'
  }
  config?: {}
  generateStaticParams?: Function
  unstable_prefetch?: PrefetchForTypeCheckInternal
  revalidate?: RevalidateRange<TEntry> | false
  dynamic?: 'auto' | 'force-dynamic' | 'error' | 'force-static'
  dynamicParams?: boolean
  fetchCache?: 'auto' | 'force-no-store' | 'only-no-store' | 'default-no-store' | 'default-cache' | 'only-cache' | 'force-cache'
  preferredRegion?: 'auto' | 'global' | 'home' | string | string[]
  runtime?: 'nodejs' | 'experimental-edge' | 'edge'
  maxDuration?: number
  ${
    options.type === 'route'
      ? ''
      : `
  metadata?: any
  generateMetadata?: Function
  viewport?: any
  generateViewport?: Function
  `
  }
}, TEntry, ''>>()

${options.type === 'route' ? `type RouteContext = { params: Promise<SegmentParams> }` : ''}
${
  options.type === 'route'
    ? HTTP_METHODS.map(
        (method) => `// Check the prop type of the entry function
if ('${method}' in entry) {
  checkFields<
    Diff<
      ParamCheck<Request | NextRequest>,
      {
        __tag__: '${method}'
        __param_position__: 'first'
        __param_type__: FirstArg<MaybeField<TEntry, '${method}'>>
      },
      '${method}'
    >
  >()
  checkFields<
    Diff<
      ParamCheck<RouteContext>,
      {
        __tag__: '${method}'
        __param_position__: 'second'
        __param_type__: SecondArg<MaybeField<TEntry, '${method}'>>
      },
      '${method}'
    >
  >()
  ${
    ''
    // Adding void to support never return type without explicit return:
    // e.g. notFound() will interrupt the execution but the handler return type is inferred as void.
    // x-ref: https://github.com/microsoft/TypeScript/issues/16608#issuecomment-309327984
  }
  checkFields<
    Diff<
      {
        __tag__: '${method}',
        __return_type__: Response | void | never | Promise<Response | void | never>
      },
      {
        __tag__: '${method}',
        __return_type__: ReturnType<MaybeField<TEntry, '${method}'>>
      },
      '${method}'
    >
  >()
}
`
      ).join('')
    : `// Check the prop type of the entry function
checkFields<Diff<${
        options.type === 'page' ? 'PageProps' : 'LayoutProps'
      }, FirstArg<TEntry['default']>, 'default'>>()

// Check the arguments and return type of the generateMetadata function
if ('generateMetadata' in entry) {
  checkFields<Diff<${
    options.type === 'page' ? 'PageProps' : 'LayoutProps'
  }, FirstArg<MaybeField<TEntry, 'generateMetadata'>>, 'generateMetadata'>>()
  checkFields<Diff<ResolvingMetadata, SecondArg<MaybeField<TEntry, 'generateMetadata'>>, 'generateMetadata'>>()
}

// Check the arguments and return type of the generateViewport function
if ('generateViewport' in entry) {
  checkFields<Diff<${
    options.type === 'page' ? 'PageProps' : 'LayoutProps'
  }, FirstArg<MaybeField<TEntry, 'generateViewport'>>, 'generateViewport'>>()
  checkFields<Diff<ResolvingViewport, SecondArg<MaybeField<TEntry, 'generateViewport'>>, 'generateViewport'>>()
}
`
}
// Check the arguments and return type of the generateStaticParams function
if ('generateStaticParams' in entry) {
  checkFields<Diff<{ params: SegmentParams }, FirstArg<MaybeField<TEntry, 'generateStaticParams'>>, 'generateStaticParams'>>()
  checkFields<Diff<{ __tag__: 'generateStaticParams', __return_type__: any[] | Promise<any[]> }, { __tag__: 'generateStaticParams', __return_type__: ReturnType<MaybeField<TEntry, 'generateStaticParams'>> }>>()
}

export interface PageProps {
  params?: Promise<SegmentParams>
  searchParams?: Promise<any>
}
export interface LayoutProps {
  children?: React.ReactNode
${
  options.slots
    ? options.slots.map((slot) => `  ${slot}: React.ReactNode`).join('\n')
    : ''
}
  params?: Promise<SegmentParams>
}

// =============
// Utility types
type RevalidateRange<T> = T extends { revalidate: any } ? NonNegative<T['revalidate']> : never

// If T is unknown or any, it will be an empty {} type. Otherwise, it will be the same as Omit<T, keyof Base>.
type OmitWithTag<T, K extends keyof any, _M> = Omit<T, K>
type Diff<Base, T extends Base, Message extends string = ''> = 0 extends (1 & T) ? {} : OmitWithTag<T, keyof Base, Message>

type FirstArg<T extends Function> = T extends (...args: [infer T, any]) => any ? unknown extends T ? any : T : never
type SecondArg<T extends Function> = T extends (...args: [any, infer T]) => any ? unknown extends T ? any : T : never
type MaybeField<T, K extends string> = T extends { [k in K]: infer G } ? G extends Function ? G : never : never

${
  options.type === 'route'
    ? `type ParamCheck<T> = {
  __tag__: string
  __param_position__: string
  __param_type__: T
}`
    : ''
}

function checkFields<_ extends { [k in keyof any]: never }>() {}

// https://github.com/sindresorhus/type-fest
type Numeric = number | bigint
type Zero = 0 | 0n
type Negative<T extends Numeric> = T extends Zero ? never : \`\${T}\` extends \`-\${string}\` ? T : never
type NonNegative<T extends Numeric> = T extends Zero ? T : Negative<T> extends never ? T : '__invalid_negative_number__'
`
}

async function collectNamedSlots(layoutPath: string) {
  const layoutDir = path.dirname(layoutPath)
  const items = await fs.readdir(layoutDir, { withFileTypes: true })
  const slots = []
  for (const item of items) {
    if (
      item.isDirectory() &&
      item.name.startsWith('@') &&
      // `@children slots are matched to the children prop, and should not be handled separately for type-checking
      item.name !== '@children'
    ) {
      slots.push(item.name.slice(1))
    }
  }
  return slots
}

// By exposing the static route types separately as string literals,
// editors can provide autocompletion for them. However it's currently not
// possible to provide the same experience for dynamic routes.

const pluginState = getProxiedPluginState({
  collectedRootParams: {} as Record<string, string[]>,
  routeTypes: {
    edge: {
      static: [],
      dynamic: [],
    },
    node: {
      static: [],
      dynamic: [],
    },
    extra: {
      static: [],
      dynamic: [],
    },
  } as Record<
    'edge' | 'node' | 'extra',
    Record<'static' | 'dynamic', string[]>
  >,
})

function formatRouteToRouteType(route: string) {
  const isDynamic = isDynamicRoute(route)
  if (isDynamic) {
    route = route
      .split('/')
      .map((part) => {
        if (part.startsWith('[') && part.endsWith(']')) {
          if (part.startsWith('[...')) {
            // /[...slug]
            return `\${CatchAllSlug<T>}`
          } else if (part.startsWith('[[...') && part.endsWith(']]')) {
            // /[[...slug]]
            return `\${OptionalCatchAllSlug<T>}`
          }
          // /[slug]
          return `\${SafeSlug<T>}`
        }
        return part
      })
      .join('/')
  }

  return {
    isDynamic,
    routeType: route,
  }
}

function formatTimespan(seconds: number): string {
  if (seconds > 0) {
    if (seconds === 18748800) {
      return '1 month'
    }
    if (seconds === 18144000) {
      return '1 month'
    }
    if (seconds === 604800) {
      return '1 week'
    }
    if (seconds === 86400) {
      return '1 day'
    }
    if (seconds === 3600) {
      return '1 hour'
    }
    if (seconds === 60) {
      return '1 minute'
    }
    if (seconds % 18748800 === 0) {
      return seconds / 18748800 + ' months'
    }
    if (seconds % 18144000 === 0) {
      return seconds / 18144000 + ' months'
    }
    if (seconds % 604800 === 0) {
      return seconds / 604800 + ' weeks'
    }
    if (seconds % 86400 === 0) {
      return seconds / 86400 + ' days'
    }
    if (seconds % 3600 === 0) {
      return seconds / 3600 + ' hours'
    }
    if (seconds % 60 === 0) {
      return seconds / 60 + ' minutes'
    }
  }
  return seconds + ' seconds'
}

function formatTimespanWithSeconds(seconds: undefined | number): string {
  if (seconds === undefined) {
    return 'default'
  }
  if (seconds >= 0xfffffffe) {
    return 'never'
  }
  const text = seconds + ' seconds'
  const descriptive = formatTimespan(seconds)
  if (descriptive === text) {
    return text
  }
  return text + ' (' + descriptive + ')'
}

function getRootParamsFromLayouts(layouts: Record<string, string[]>) {
  // Sort layouts by depth (descending)
  const sortedLayouts = Object.entries(layouts).sort(
    (a, b) => b[0].split('/').length - a[0].split('/').length
  )

  if (!sortedLayouts.length) {
    return []
  }

  // we assume the shorted layout path is the root layout
  let rootLayout = sortedLayouts[sortedLayouts.length - 1][0]

  let rootParams = new Set<string>()
  let isMultipleRootLayouts = false

  for (const [layoutPath, params] of sortedLayouts) {
    const allSegmentsAreDynamic = layoutPath
      .split('/')
      .slice(1, -1)
      // match dynamic params but not catch-all or optional catch-all
      .every((segment) => /^\[[^[.\]]+\]$/.test(segment))

    if (allSegmentsAreDynamic) {
      if (isSubpath(rootLayout, layoutPath)) {
        // Current path is a subpath of the root layout, update root
        rootLayout = layoutPath
        rootParams = new Set(params)
      } else {
        // Found another potential root layout
        isMultipleRootLayouts = true
        // Add any new params
        for (const param of params) {
          rootParams.add(param)
        }
      }
    }
  }

  // Create result array
  const result = Array.from(rootParams).map((param) => ({
    param,
    optional: isMultipleRootLayouts,
  }))

  return result
}

function isSubpath(parentLayoutPath: string, potentialChildLayoutPath: string) {
  // we strip off the `layout` part of the path as those will always conflict with being a subpath
  const parentSegments = parentLayoutPath.split('/').slice(1, -1)
  const childSegments = potentialChildLayoutPath.split('/').slice(1, -1)

  // child segments should be shorter or equal to parent segments to be a subpath
  if (childSegments.length > parentSegments.length || !childSegments.length)
    return false

  // Verify all segment values are equal
  return childSegments.every(
    (childSegment, index) => childSegment === parentSegments[index]
  )
}

function createServerDefinitions() {
  return `
  declare module 'next/server' {

    import type { AsyncLocalStorage as NodeAsyncLocalStorage } from 'async_hooks'
    declare global {
      var AsyncLocalStorage: typeof NodeAsyncLocalStorage
    }
    export { NextFetchEvent } from 'next/dist/server/web/spec-extension/fetch-event'
    export { NextRequest } from 'next/dist/server/web/spec-extension/request'
    export { NextResponse } from 'next/dist/server/web/spec-extension/response'
    export { NextMiddleware, MiddlewareConfig, NextProxy, ProxyConfig } from 'next/dist/server/web/types'
    export { userAgentFromString } from 'next/dist/server/web/spec-extension/user-agent'
    export { userAgent } from 'next/dist/server/web/spec-extension/user-agent'
    export { URLPattern } from 'next/dist/compiled/@edge-runtime/primitives/url'
    export { ImageResponse } from 'next/dist/server/web/spec-extension/image-response'
    export type { ImageResponseOptions } from 'next/dist/compiled/@vercel/og/types'
    export { after } from 'next/dist/server/after'
    export { connection } from 'next/dist/server/request/connection'
  }
  `
}

function createCustomCacheLifeDefinitions(cacheLife: {
  [profile: string]: CacheLife
}) {
  let overloads = ''

  const profileNames = Object.keys(cacheLife)
  for (let i = 0; i < profileNames.length; i++) {
    const profileName = profileNames[i]
    const profile = cacheLife[profileName]
    if (typeof profile !== 'object' || profile === null) {
      continue
    }

    let description = ''

    if (profile.stale === undefined) {
      description += `
     * This cache may be stale on clients for the default stale time of the scope before checking with the server.`
    } else if (profile.stale >= 0xfffffffe) {
      description += `
     * This cache may be stale on clients indefinitely before checking with the server.`
    } else {
      description += `
     * This cache may be stale on clients for ${formatTimespan(profile.stale)} before checking with the server.`
    }
    if (
      profile.revalidate !== undefined &&
      profile.expire !== undefined &&
      profile.revalidate >= profile.expire
    ) {
      description += `
     * This cache will expire after ${formatTimespan(profile.expire)}. The next request will recompute it.`
    } else {
      if (profile.revalidate === undefined) {
        description += `
     * It will inherit the default revalidate time of its scope since it does not define its own.`
      } else if (profile.revalidate >= 0xfffffffe) {
        // Nothing to mention.
      } else {
        description += `
     * If the server receives a new request after ${formatTimespan(profile.revalidate)}, start revalidating new values in the background.`
      }
      if (profile.expire === undefined) {
        description += `
     * It will inherit the default expiration time of its scope since it does not define its own.`
      } else if (profile.expire >= 0xfffffffe) {
        description += `
     * It lives for the maximum age of the server cache. If this entry has no traffic for a while, it may serve an old value the next request.`
      } else {
        description += `
     * If this entry has no traffic for ${formatTimespan(profile.expire)} it will expire. The next request will recompute it.`
      }
    }

    overloads += `
    /**
     * Cache this \`"use cache"\` for a timespan defined by the \`${JSON.stringify(profileName)}\` profile.
     * \`\`\`
     *   stale:      ${formatTimespanWithSeconds(profile.stale)}
     *   revalidate: ${formatTimespanWithSeconds(profile.revalidate)}
     *   expire:     ${formatTimespanWithSeconds(profile.expire)}
     * \`\`\`
     * ${description}
     */
    export function cacheLife(profile: ${JSON.stringify(profileName)}): void
    `
  }

  overloads += `
    /**
     * Cache this \`"use cache"\` using a custom timespan.
     * \`\`\`
     *   stale: ... // seconds
     *   revalidate: ... // seconds
     *   expire: ... // seconds
     * \`\`\`
     *
     * This is similar to Cache-Control: max-age=\`stale\`,s-max-age=\`revalidate\`,stale-while-revalidate=\`expire-revalidate\`
     *
     * If a value is left out, the lowest of other cacheLife() calls or the default, is used instead.
     */
    export function cacheLife(profile: {
      /**
       * This cache may be stale on clients for ... seconds before checking with the server.
       */
      stale?: number,
      /**
       * If the server receives a new request after ... seconds, start revalidating new values in the background.
       */
      revalidate?: number,
      /**
       * If this entry has no traffic for ... seconds it will expire. The next request will recompute it.
       */
      expire?: number
    }): void
  `

  // Redefine the cacheLife() accepted arguments.
  return `// Type definitions for Next.js cacheLife configs

declare module 'next/cache' {
  export { unstable_cache } from 'next/dist/server/web/spec-extension/unstable-cache'
  export {
    updateTag,
    revalidateTag,
    revalidatePath,
    refresh,
  } from 'next/dist/server/web/spec-extension/revalidate'
  export { unstable_noStore } from 'next/dist/server/web/spec-extension/unstable-no-store'

  ${overloads}

  import { cacheTag } from 'next/dist/server/use-cache/cache-tag'
  export { cacheTag }

  export const unstable_cacheTag: typeof cacheTag
  export const unstable_cacheLife: typeof cacheLife
}
`
}

const appTypesBasePath = path.join('types', 'app')

export class NextTypesPlugin {
  dir: string
  distDir: string
  appDir: string
  dev: boolean
  isEdgeServer: boolean
  pageExtensions: string[]
  pagesDir: string
  cacheLifeConfig: undefined | { [profile: string]: CacheLife }
  distDirAbsolutePath: string

  constructor(options: Options) {
    this.dir = options.dir
    this.distDir = options.distDir
    this.appDir = options.appDir
    this.dev = options.dev
    this.isEdgeServer = options.isEdgeServer
    this.pageExtensions = options.pageExtensions
    this.pagesDir = path.join(this.appDir, '..', 'pages')
    this.cacheLifeConfig = options.cacheLifeConfig
    this.distDirAbsolutePath = path.join(this.dir, this.distDir)
  }

  getRelativePathFromAppTypesDir(moduleRelativePathToAppDir: string) {
    const moduleAbsolutePath = path.join(
      this.appDir,
      moduleRelativePathToAppDir
    )

    const moduleInAppTypesAbsolutePath = path.join(
      this.distDirAbsolutePath,
      appTypesBasePath,
      moduleRelativePathToAppDir
    )

    return path.relative(
      moduleInAppTypesAbsolutePath + '/..',
      moduleAbsolutePath
    )
  }

  collectPage(filePath: string) {
    const isApp = filePath.startsWith(this.appDir + path.sep)
    const isPages = !isApp && filePath.startsWith(this.pagesDir + path.sep)

    if (!isApp && !isPages) {
      return
    }

    // Filter out non-page and non-route files in app dir
    if (isApp && !/[/\\](?:page|route)\.[^.]+$/.test(filePath)) {
      return
    }

    // Filter out non-page files in pages dir
    if (
      isPages &&
      /[/\\](?:_app|_document|_error|404|500)\.[^.]+$/.test(filePath)
    ) {
      return
    }

    let route = (isApp ? normalizeAppPath : denormalizePagePath)(
      ensureLeadingSlash(
        getPageFromPath(
          path.relative(isApp ? this.appDir : this.pagesDir, filePath),
          this.pageExtensions
        )
      )
    )

    const { isDynamic, routeType } = formatRouteToRouteType(route)

    pluginState.routeTypes[this.isEdgeServer ? 'edge' : 'node'][
      isDynamic ? 'dynamic' : 'static'
    ].push(routeType)
  }

  apply(compiler: webpack.Compiler) {
    // From asset root to dist root
    const assetDirRelative = this.dev
      ? '..'
      : this.isEdgeServer
        ? '..'
        : '../..'

    const handleModule = async (
      mod: webpack.NormalModule,
      compilation: webpack.Compilation
    ) => {
      if (!mod.resource) return

      const pageExtensionsRegex = new RegExp(
        `\\.(${this.pageExtensions.join('|')})$`
      )

      if (!pageExtensionsRegex.test(mod.resource)) return

      if (!mod.resource.startsWith(this.appDir + path.sep)) {
        if (!this.dev) {
          if (mod.resource.startsWith(this.pagesDir + path.sep)) {
            this.collectPage(mod.resource)
          }
        }
        return
      }
      if (mod.layer !== WEBPACK_LAYERS.reactServerComponents) return

      // skip for /app/_private dir convention
      // matches <app-dir>/**/_*
      const IS_PRIVATE = /(?:\/[^/]+)*\/_.*$/.test(
        mod.resource.replace(this.appDir, '')
      )
      if (IS_PRIVATE) return

      const IS_LAYOUT = /[/\\]layout\.[^./\\]+$/.test(mod.resource)
      const IS_PAGE = !IS_LAYOUT && /[/\\]page\.[^.]+$/.test(mod.resource)
      const IS_ROUTE = !IS_PAGE && /[/\\]route\.[^.]+$/.test(mod.resource)
      const IS_IMPORTABLE = /\.(js|jsx|ts|tsx|mjs|cjs)$/.test(mod.resource)
      const relativePathToApp = path.relative(this.appDir, mod.resource)

      if (!this.dev) {
        if (IS_PAGE || IS_ROUTE) {
          this.collectPage(mod.resource)
        }
      }

      const typePath = path.join(
        appTypesBasePath,
        relativePathToApp.replace(pageExtensionsRegex, '.ts')
      )
      const relativeImportPath = normalizePathSep(
        path
          .join(this.getRelativePathFromAppTypesDir(relativePathToApp))
          .replace(pageExtensionsRegex, '')
      )

      const assetPath = path.join(assetDirRelative, typePath)

      // Typescript won’t allow relative-importing (for example) a .mdx file using the .js extension
      // so for now we only generate “type guard files” for files that typescript can transform
      if (!IS_IMPORTABLE) return

      if (IS_LAYOUT) {
        const rootLayoutPath = normalizeAppPath(
          ensureLeadingSlash(
            getPageFromPath(
              path.relative(this.appDir, mod.resource),
              this.pageExtensions
            )
          )
        )

        const foundParams = Array.from(
          rootLayoutPath.matchAll(/\[(.*?)\]/g),
          (match) => match[1]
        )

        pluginState.collectedRootParams[rootLayoutPath] = foundParams

        const slots = await collectNamedSlots(mod.resource)
        compilation.emitAsset(
          assetPath,
          new sources.RawSource(
            createTypeGuardFile(mod.resource, relativeImportPath, {
              type: 'layout',
              slots,
            })
          ) as unknown as webpack.sources.RawSource
        )
      } else if (IS_PAGE) {
        compilation.emitAsset(
          assetPath,
          new sources.RawSource(
            createTypeGuardFile(mod.resource, relativeImportPath, {
              type: 'page',
            })
          ) as unknown as webpack.sources.RawSource
        )
      } else if (IS_ROUTE) {
        compilation.emitAsset(
          assetPath,
          new sources.RawSource(
            createTypeGuardFile(mod.resource, relativeImportPath, {
              type: 'route',
            })
          ) as unknown as webpack.sources.RawSource
        )
      }
    }

    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tapAsync(
        {
          name: PLUGIN_NAME,
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH,
        },
        async (_, callback) => {
          const promises: Promise<any>[] = []

          // Clear routes
          if (this.isEdgeServer) {
            pluginState.routeTypes.edge.dynamic = []
            pluginState.routeTypes.edge.static = []
          } else {
            pluginState.routeTypes.node.dynamic = []
            pluginState.routeTypes.node.static = []
          }

          compilation.chunkGroups.forEach((chunkGroup) => {
            chunkGroup.chunks.forEach((chunk) => {
              if (!chunk.name) return

              // Here we only track page and route chunks.
              if (
                !chunk.name.startsWith('pages/') &&
                !(
                  chunk.name.startsWith('app/') &&
                  (chunk.name.endsWith('/page') ||
                    chunk.name.endsWith('/route'))
                )
              ) {
                return
              }

              const chunkModules =
                compilation.chunkGraph.getChunkModulesIterable(
                  chunk
                ) as Iterable<webpack.NormalModule>
              for (const mod of chunkModules) {
                promises.push(handleModule(mod, compilation))

                // If this is a concatenation, register each child to the parent ID.
                const anyModule = mod as unknown as {
                  modules: webpack.NormalModule[]
                }
                if (anyModule.modules) {
                  anyModule.modules.forEach((concatenatedMod) => {
                    promises.push(handleModule(concatenatedMod, compilation))
                  })
                }
              }
            })
          })

          await Promise.all(promises)

          const rootParams = getRootParamsFromLayouts(
            pluginState.collectedRootParams
          )
          // If we discovered rootParams, we'll override the `next/server` types
          // since we're able to determine the root params at build time.
          if (rootParams.length > 0) {
            const serverTypesPath = path.join(
              assetDirRelative,
              'types/server.d.ts'
            )

            compilation.emitAsset(
              serverTypesPath,
              new sources.RawSource(
                createServerDefinitions()
              ) as unknown as webpack.sources.RawSource
            )
          }

          // Support `"moduleResolution": "Node16" | "NodeNext"` with `"type": "module"`

          const packageJsonAssetPath = path.join(
            assetDirRelative,
            'types/package.json'
          )

          compilation.emitAsset(
            packageJsonAssetPath,
            new sources.RawSource(
              '{"type": "module"}'
            ) as unknown as webpack.sources.RawSource
          )

          if (this.cacheLifeConfig) {
            const cacheLifeAssetPath = path.join(
              assetDirRelative,
              'types/cache-life.d.ts'
            )

            compilation.emitAsset(
              cacheLifeAssetPath,
              new sources.RawSource(
                createCustomCacheLifeDefinitions(this.cacheLifeConfig)
              ) as unknown as webpack.sources.RawSource
            )
          }

          callback()
        }
      )
    })
  }
}
