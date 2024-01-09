import type { Rewrite, Redirect } from '../../../../lib/load-custom-routes'
import type { Token } from 'next/dist/compiled/path-to-regexp'

import fs from 'fs/promises'
import { webpack, sources } from 'next/dist/compiled/webpack/webpack'
import { parse } from 'next/dist/compiled/path-to-regexp'
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
import { devPageFiles } from './shared'
import { getProxiedPluginState } from '../../../build-context'

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
  typedRoutes: boolean
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

type TEntry = typeof import('${relativePath}.js')

// Check that the entry is a valid entry
checkFields<Diff<{
  ${
    options.type === 'route'
      ? HTTP_METHODS.map((method) => `${method}?: Function`).join('\n  ')
      : 'default: Function'
  }
  config?: {}
  generateStaticParams?: Function
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
      ParamCheck<PageParams>,
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
  checkFields<Diff<{ params: PageParams }, FirstArg<MaybeField<TEntry, 'generateStaticParams'>>, 'generateStaticParams'>>()
  checkFields<Diff<{ __tag__: 'generateStaticParams', __return_type__: any[] | Promise<any[]> }, { __tag__: 'generateStaticParams', __return_type__: ReturnType<MaybeField<TEntry, 'generateStaticParams'>> }>>()
}

type PageParams = any
export interface PageProps {
  params?: any
  searchParams?: any
}
export interface LayoutProps {
  children?: React.ReactNode
${
  options.slots
    ? options.slots.map((slot) => `  ${slot}: React.ReactNode`).join('\n')
    : ''
}
  params?: any
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
  routeTypes: {
    edge: {
      static: '',
      dynamic: '',
    },
    node: {
      static: '',
      dynamic: '',
    },
    extra: {
      static: '',
      dynamic: '',
    },
  } as Record<'edge' | 'node' | 'extra', Record<'static' | 'dynamic', string>>,
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
    routeType: `\n    | \`${route}\``,
  }
}

// Whether redirects and rewrites have been converted into routeTypes or not.
let redirectsRewritesTypesProcessed = false

// Convert redirects and rewrites into routeTypes.
function addRedirectsRewritesRouteTypes(
  rewrites: Rewrites | undefined,
  redirects: Redirect[] | undefined
) {
  function addExtraRoute(source: string) {
    let tokens: Token[] | undefined
    try {
      tokens = parse(source)
    } catch {
      // Ignore invalid routes - they will be handled by other checks.
    }

    if (Array.isArray(tokens)) {
      const possibleNormalizedRoutes = ['']
      let slugCnt = 1

      function append(suffix: string) {
        for (let i = 0; i < possibleNormalizedRoutes.length; i++) {
          possibleNormalizedRoutes[i] += suffix
        }
      }

      function fork(suffix: string) {
        const currentLength = possibleNormalizedRoutes.length
        for (let i = 0; i < currentLength; i++) {
          possibleNormalizedRoutes.push(possibleNormalizedRoutes[i] + suffix)
        }
      }

      for (const token of tokens) {
        if (typeof token === 'object') {
          // Make sure the slug is always named.
          const slug =
            token.name || (slugCnt++ === 1 ? 'slug' : `slug${slugCnt}`)

          if (token.modifier === '*') {
            append(`${token.prefix}[[...${slug}]]`)
          } else if (token.modifier === '+') {
            append(`${token.prefix}[...${slug}]`)
          } else if (token.modifier === '') {
            if (token.pattern === '[^\\/#\\?]+?') {
              // A safe slug
              append(`${token.prefix}[${slug}]`)
            } else if (token.pattern === '.*') {
              // An optional catch-all slug
              append(`${token.prefix}[[...${slug}]]`)
            } else if (token.pattern === '.+') {
              // A catch-all slug
              append(`${token.prefix}[...${slug}]`)
            } else {
              // Other regex patterns are not supported. Skip this route.
              return
            }
          } else if (token.modifier === '?') {
            if (/^[a-zA-Z0-9_/]*$/.test(token.pattern)) {
              // An optional slug with plain text only, fork the route.
              append(token.prefix)
              fork(token.pattern)
            } else {
              // Optional modifier `?` and regex patterns are not supported.
              return
            }
          }
        } else if (typeof token === 'string') {
          append(token)
        }
      }

      for (const normalizedRoute of possibleNormalizedRoutes) {
        const { isDynamic, routeType } = formatRouteToRouteType(normalizedRoute)
        pluginState.routeTypes.extra[isDynamic ? 'dynamic' : 'static'] +=
          routeType
      }
    }
  }

  if (rewrites) {
    for (const rewrite of rewrites.beforeFiles) {
      addExtraRoute(rewrite.source)
    }
    for (const rewrite of rewrites.afterFiles) {
      addExtraRoute(rewrite.source)
    }
    for (const rewrite of rewrites.fallback) {
      addExtraRoute(rewrite.source)
    }
  }

  if (redirects) {
    for (const redirect of redirects) {
      // Skip internal redirects
      // https://github.com/vercel/next.js/blob/8ff3d7ff57836c24088474175d595b4d50b3f857/packages/next/src/lib/load-custom-routes.ts#L704-L710
      if (!('internal' in redirect)) {
        addExtraRoute(redirect.source)
      }
    }
  }
}

function createRouteDefinitions() {
  let staticRouteTypes = ''
  let dynamicRouteTypes = ''

  for (const type of ['edge', 'node', 'extra'] as const) {
    staticRouteTypes += pluginState.routeTypes[type].static
    dynamicRouteTypes += pluginState.routeTypes[type].dynamic
  }

  // If both StaticRoutes and DynamicRoutes are empty, fallback to type 'string'.
  const routeTypesFallback =
    !staticRouteTypes && !dynamicRouteTypes ? 'string' : ''

  return `// Type definitions for Next.js routes

/**
 * Internal types used by the Next.js router and Link component.
 * These types are not meant to be used directly.
 * @internal
 */
declare namespace __next_route_internal_types__ {
  type SearchOrHash = \`?\${string}\` | \`#\${string}\`
  type WithProtocol = \`\${string}:\${string}\`

  type Suffix = '' | SearchOrHash

  type SafeSlug<S extends string> = S extends \`\${string}/\${string}\`
    ? never
    : S extends \`\${string}\${SearchOrHash}\`
    ? never
    : S extends ''
    ? never
    : S

  type CatchAllSlug<S extends string> = S extends \`\${string}\${SearchOrHash}\`
    ? never
    : S extends ''
    ? never
    : S

  type OptionalCatchAllSlug<S extends string> =
    S extends \`\${string}\${SearchOrHash}\` ? never : S

  type StaticRoutes = ${staticRouteTypes || 'never'}
  type DynamicRoutes<T extends string = string> = ${
    dynamicRouteTypes || 'never'
  }

  type RouteImpl<T> = ${
    routeTypesFallback ||
    `
    ${
      // This keeps autocompletion working for static routes.
      '| StaticRoutes'
    }
    | SearchOrHash
    | WithProtocol
    | \`\${StaticRoutes}\${SearchOrHash}\`
    | (T extends \`\${DynamicRoutes<infer _>}\${Suffix}\` ? T : never)
    `
  }
}

declare module 'next' {
  export { default } from 'next/types/index.js'
  export * from 'next/types/index.js'

  export type Route<T extends string = string> =
    __next_route_internal_types__.RouteImpl<T>
}

declare module 'next/link' {
  import type { LinkProps as OriginalLinkProps } from 'next/dist/client/link.js'
  import type { AnchorHTMLAttributes, DetailedHTMLProps } from 'react'
  import type { UrlObject } from 'url'

  type LinkRestProps = Omit<
    Omit<
      DetailedHTMLProps<
        AnchorHTMLAttributes<HTMLAnchorElement>,
        HTMLAnchorElement
      >,
      keyof OriginalLinkProps
    > &
      OriginalLinkProps,
    'href'
  >

  export type LinkProps<RouteInferType> = LinkRestProps & {
    /**
     * The path or URL to navigate to. This is the only required prop. It can also be an object.
     * @see https://nextjs.org/docs/api-reference/next/link
     */
    href: __next_route_internal_types__.RouteImpl<RouteInferType> | UrlObject
  }

  export default function Link<RouteType>(props: LinkProps<RouteType>): JSX.Element
}

declare module 'next/navigation' {
  export * from 'next/dist/client/components/navigation.js'

  import type { NavigateOptions, AppRouterInstance as OriginalAppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime.js'
  interface AppRouterInstance extends OriginalAppRouterInstance {
    /**
     * Navigate to the provided href.
     * Pushes a new history entry.
     */
    push<RouteType>(href: __next_route_internal_types__.RouteImpl<RouteType>, options?: NavigateOptions): void
    /**
     * Navigate to the provided href.
     * Replaces the current history entry.
     */
    replace<RouteType>(href: __next_route_internal_types__.RouteImpl<RouteType>, options?: NavigateOptions): void
    /**
     * Prefetch the provided href.
     */
    prefetch<RouteType>(href: __next_route_internal_types__.RouteImpl<RouteType>): void
  }

  export declare function useRouter(): AppRouterInstance;
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
  typedRoutes: boolean
  distDirAbsolutePath: string

  constructor(options: Options) {
    this.dir = options.dir
    this.distDir = options.distDir
    this.appDir = options.appDir
    this.dev = options.dev
    this.isEdgeServer = options.isEdgeServer
    this.pageExtensions = options.pageExtensions
    this.pagesDir = path.join(this.appDir, '..', 'pages')
    this.typedRoutes = options.typedRoutes
    this.distDirAbsolutePath = path.join(this.dir, this.distDir)
    if (this.typedRoutes && !redirectsRewritesTypesProcessed) {
      redirectsRewritesTypesProcessed = true
      addRedirectsRewritesRouteTypes(
        options.originalRewrites,
        options.originalRedirects
      )
    }
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
    if (!this.typedRoutes) return

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
    ] += routeType
  }

  apply(compiler: webpack.Compiler) {
    // From asset root to dist root
    const assetDirRelative = this.dev
      ? '..'
      : this.isEdgeServer
      ? '..'
      : '../..'

    const handleModule = async (mod: webpack.NormalModule, assets: any) => {
      if (!mod.resource) return

      if (!/\.(js|jsx|ts|tsx|mjs)$/.test(mod.resource)) return

      if (!mod.resource.startsWith(this.appDir + path.sep)) {
        if (!this.dev) {
          if (mod.resource.startsWith(this.pagesDir + path.sep)) {
            this.collectPage(mod.resource)
          }
        }
        return
      }
      if (
        mod.layer !== WEBPACK_LAYERS.reactServerComponents &&
        mod.layer !== WEBPACK_LAYERS.appRouteHandler
      )
        return

      const IS_LAYOUT = /[/\\]layout\.[^./\\]+$/.test(mod.resource)
      const IS_PAGE = !IS_LAYOUT && /[/\\]page\.[^.]+$/.test(mod.resource)
      const IS_ROUTE = !IS_PAGE && /[/\\]route\.[^.]+$/.test(mod.resource)
      const relativePathToApp = path.relative(this.appDir, mod.resource)

      if (!this.dev) {
        if (IS_PAGE || IS_ROUTE) {
          this.collectPage(mod.resource)
        }
      }

      const typePath = path.join(
        appTypesBasePath,
        relativePathToApp.replace(/\.(js|jsx|ts|tsx|mjs)$/, '.ts')
      )
      const relativeImportPath = normalizePathSep(
        path
          .join(this.getRelativePathFromAppTypesDir(relativePathToApp))
          .replace(/\.(js|jsx|ts|tsx|mjs)$/, '')
      )

      const assetPath = path.join(assetDirRelative, typePath)

      if (IS_LAYOUT) {
        const slots = await collectNamedSlots(mod.resource)
        assets[assetPath] = new sources.RawSource(
          createTypeGuardFile(mod.resource, relativeImportPath, {
            type: 'layout',
            slots,
          })
        )
      } else if (IS_PAGE) {
        assets[assetPath] = new sources.RawSource(
          createTypeGuardFile(mod.resource, relativeImportPath, {
            type: 'page',
          })
        )
      } else if (IS_ROUTE) {
        assets[assetPath] = new sources.RawSource(
          createTypeGuardFile(mod.resource, relativeImportPath, {
            type: 'route',
          })
        )
      }
    }

    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tapAsync(
        {
          name: PLUGIN_NAME,
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH,
        },
        async (assets, callback) => {
          const promises: Promise<any>[] = []

          // Clear routes
          if (this.isEdgeServer) {
            pluginState.routeTypes.edge.dynamic = ''
            pluginState.routeTypes.edge.static = ''
          } else {
            pluginState.routeTypes.node.dynamic = ''
            pluginState.routeTypes.node.static = ''
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
                promises.push(handleModule(mod, assets))

                // If this is a concatenation, register each child to the parent ID.
                const anyModule = mod as unknown as {
                  modules: webpack.NormalModule[]
                }
                if (anyModule.modules) {
                  anyModule.modules.forEach((concatenatedMod) => {
                    promises.push(handleModule(concatenatedMod, assets))
                  })
                }
              }
            })
          })

          await Promise.all(promises)

          // Support `"moduleResolution": "Node16" | "NodeNext"` with `"type": "module"`

          const packageJsonAssetPath = path.join(
            assetDirRelative,
            'types/package.json'
          )

          assets[packageJsonAssetPath] = new sources.RawSource(
            '{"type": "module"}'
          ) as unknown as webpack.sources.RawSource

          if (this.typedRoutes) {
            if (this.dev && !this.isEdgeServer) {
              devPageFiles.forEach((file) => {
                this.collectPage(file)
              })
            }

            const linkAssetPath = path.join(assetDirRelative, 'types/link.d.ts')

            assets[linkAssetPath] = new sources.RawSource(
              createRouteDefinitions()
            ) as unknown as webpack.sources.RawSource
          }

          callback()
        }
      )
    })
  }
}
