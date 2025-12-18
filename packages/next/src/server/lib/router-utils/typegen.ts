import type { RouteTypesManifest } from './route-types-utils'
import { isDynamicRoute } from '../../../shared/lib/router/utils/is-dynamic'

function generateRouteTypes(routesManifest: RouteTypesManifest): string {
  const appRoutes = Object.keys(routesManifest.appRoutes).sort()
  const pageRoutes = Object.keys(routesManifest.pageRoutes).sort()
  const layoutRoutes = Object.keys(routesManifest.layoutRoutes).sort()
  const redirectRoutes = Object.keys(routesManifest.redirectRoutes).sort()
  const rewriteRoutes = Object.keys(routesManifest.rewriteRoutes).sort()

  let result = ''

  // Generate AppRoutes union type (pages only)
  if (appRoutes.length > 0) {
    result += `type AppRoutes = ${appRoutes.map((route) => JSON.stringify(route)).join(' | ')}\n`
  } else {
    result += 'type AppRoutes = never\n'
  }

  // Generate AppRouteHandlerRoutes union type for route handlers
  const appRouteHandlerRoutes = Object.keys(
    routesManifest.appRouteHandlerRoutes
  ).sort()

  const hasAppRouteHandlers = appRouteHandlerRoutes.length > 0

  if (hasAppRouteHandlers) {
    result += `type AppRouteHandlerRoutes = ${appRouteHandlerRoutes.map((route) => JSON.stringify(route)).join(' | ')}\n`
  }

  // Generate PageRoutes union type
  if (pageRoutes.length > 0) {
    result += `type PageRoutes = ${pageRoutes.map((route) => JSON.stringify(route)).join(' | ')}\n`
  } else {
    result += 'type PageRoutes = never\n'
  }

  // Generate LayoutRoutes union type
  if (layoutRoutes.length > 0) {
    result += `type LayoutRoutes = ${layoutRoutes.map((route) => JSON.stringify(route)).join(' | ')}\n`
  } else {
    result += 'type LayoutRoutes = never\n'
  }

  // Generate RedirectRoutes union type
  if (redirectRoutes.length > 0) {
    result += `type RedirectRoutes = ${redirectRoutes
      .map((route) => JSON.stringify(route))
      .join(' | ')}\n`
  } else {
    result += 'type RedirectRoutes = never\n'
  }

  // Generate RewriteRoutes union type
  if (rewriteRoutes.length > 0) {
    result += `type RewriteRoutes = ${rewriteRoutes
      .map((route) => JSON.stringify(route))
      .join(' | ')}\n`
  } else {
    result += 'type RewriteRoutes = never\n'
  }

  // Only include AppRouteHandlerRoutes in Routes union if there are actual route handlers
  const routeUnionParts = [
    'AppRoutes',
    'PageRoutes',
    'LayoutRoutes',
    'RedirectRoutes',
    'RewriteRoutes',
  ]
  if (hasAppRouteHandlers) {
    routeUnionParts.push('AppRouteHandlerRoutes')
  }

  result += `type Routes = ${routeUnionParts.join(' | ')}\n`

  return result
}

function generateParamTypes(routesManifest: RouteTypesManifest): string {
  const allRoutes = {
    ...routesManifest.appRoutes,
    ...routesManifest.appRouteHandlerRoutes,
    ...routesManifest.pageRoutes,
    ...routesManifest.layoutRoutes,
    ...routesManifest.redirectRoutes,
    ...routesManifest.rewriteRoutes,
  }

  let paramTypes = 'interface ParamMap {\n'

  // Sort routes deterministically for consistent output
  const sortedRoutes = Object.entries(allRoutes).sort(([a], [b]) =>
    a.localeCompare(b)
  )

  for (const [route, routeInfo] of sortedRoutes) {
    const { groups } = routeInfo

    // For static routes (no dynamic segments), we can produce an empty parameter map.
    if (!isDynamicRoute(route) || Object.keys(groups ?? {}).length === 0) {
      paramTypes += `  ${JSON.stringify(route)}: {}\n`
      continue
    }

    let paramType = '{'

    // Process each group based on its properties
    for (const [key, group] of Object.entries(groups)) {
      const escapedKey = JSON.stringify(key)
      if (group.repeat) {
        // Catch-all parameters
        if (group.optional) {
          paramType += ` ${escapedKey}?: string[];`
        } else {
          paramType += ` ${escapedKey}: string[];`
        }
      } else {
        // Regular parameters
        if (group.optional) {
          paramType += ` ${escapedKey}?: string;`
        } else {
          paramType += ` ${escapedKey}: string;`
        }
      }
    }

    paramType += ' }'

    paramTypes += `  ${JSON.stringify(route)}: ${paramType}\n`
  }

  paramTypes += '}\n'
  return paramTypes
}

function generateLayoutSlotMap(routesManifest: RouteTypesManifest): string {
  let slotMap = 'interface LayoutSlotMap {\n'

  // Sort routes deterministically for consistent output
  const sortedLayoutRoutes = Object.entries(routesManifest.layoutRoutes).sort(
    ([a], [b]) => a.localeCompare(b)
  )

  for (const [route, routeInfo] of sortedLayoutRoutes) {
    if ('slots' in routeInfo) {
      const slots = routeInfo.slots.sort()
      if (slots.length > 0) {
        slotMap += `  ${JSON.stringify(route)}: ${slots.map((slot) => JSON.stringify(slot)).join(' | ')}\n`
      } else {
        slotMap += `  ${JSON.stringify(route)}: never\n`
      }
    } else {
      slotMap += `  ${JSON.stringify(route)}: never\n`
    }
  }

  slotMap += '}\n'
  return slotMap
}

// Helper function to format routes to route types (matches the plugin logic exactly)
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

// Helper function to serialize route types (matches the plugin logic exactly)
function serializeRouteTypes(routeTypes: string[]) {
  // route collection is not deterministic, this makes the output of the file deterministic
  return routeTypes
    .sort()
    .map((route) => `\n    | \`${route}\``)
    .join('')
}

export function generateLinkTypesFile(
  routesManifest: RouteTypesManifest
): string {
  // Generate serialized static and dynamic routes for the internal namespace
  // Build a unified set of routes across app/pages/redirect/rewrite as well as
  // app route handlers and Pages Router API routes.
  const allRoutesSet = new Set<string>([
    ...Object.keys(routesManifest.appRoutes),
    ...Object.keys(routesManifest.pageRoutes),
    ...Object.keys(routesManifest.redirectRoutes),
    ...Object.keys(routesManifest.rewriteRoutes),
    // Allow linking to App Route Handlers (e.g. `/logout/route.ts`)
    ...Object.keys(routesManifest.appRouteHandlerRoutes),
    // Allow linking to Pages Router API routes (e.g. `/api/*`)
    ...Array.from(routesManifest.pageApiRoutes),
  ])

  const staticRouteTypes: string[] = []
  const dynamicRouteTypes: string[] = []

  // Process each route using the same logic as the plugin
  for (const route of allRoutesSet) {
    const { isDynamic, routeType } = formatRouteToRouteType(route)
    if (isDynamic) {
      dynamicRouteTypes.push(routeType)
    } else {
      staticRouteTypes.push(routeType)
    }
  }

  const serializedStaticRouteTypes = serializeRouteTypes(staticRouteTypes)
  const serializedDynamicRouteTypes = serializeRouteTypes(dynamicRouteTypes)

  // If both StaticRoutes and DynamicRoutes are empty, fallback to type 'string & {}'.
  const routeTypesFallback =
    !serializedStaticRouteTypes && !serializedDynamicRouteTypes
      ? 'string & {}'
      : ''

  return `// This file is generated automatically by Next.js
// Do not edit this file manually

// Type definitions for Next.js routes

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

  type StaticRoutes = ${serializedStaticRouteTypes || 'never'}
  type DynamicRoutes<T extends string = string> = ${
    serializedDynamicRouteTypes || 'never'
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
  export { default } from 'next/types.js'
  export * from 'next/types.js'

  export type Route<T extends string = string> =
    __next_route_internal_types__.RouteImpl<T>
}

declare module 'next/link' {
  export { useLinkStatus } from 'next/dist/client/link.js'

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
  import type { RedirectType } from 'next/dist/client/components/redirect-error.js'
  
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

  export function useRouter(): AppRouterInstance;
  
  /**
   * This function allows you to redirect the user to another URL. It can be used in
   * [Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components),
   * [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers), and
   * [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations).
   *
   * - In a Server Component, this will insert a meta tag to redirect the user to the target page.
   * - In a Route Handler or Server Action, it will serve a 307/303 to the caller.
   * - In a Server Action, type defaults to 'push' and 'replace' elsewhere.
   *
   * Read more: [Next.js Docs: redirect](https://nextjs.org/docs/app/api-reference/functions/redirect)
   */
  export function redirect<RouteType>(
    /** The URL to redirect to */
    url: __next_route_internal_types__.RouteImpl<RouteType>,
    type?: RedirectType
  ): never;
  
  /**
   * This function allows you to redirect the user to another URL. It can be used in
   * [Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components),
   * [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers), and
   * [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations).
   *
   * - In a Server Component, this will insert a meta tag to redirect the user to the target page.
   * - In a Route Handler or Server Action, it will serve a 308/303 to the caller.
   *
   * Read more: [Next.js Docs: redirect](https://nextjs.org/docs/app/api-reference/functions/redirect)
   */
  export function permanentRedirect<RouteType>(
    /** The URL to redirect to */
    url: __next_route_internal_types__.RouteImpl<RouteType>,
    type?: RedirectType
  ): never;
}

declare module 'next/form' {
  import type { FormProps as OriginalFormProps } from 'next/dist/client/form.js'

  type FormRestProps = Omit<OriginalFormProps, 'action'>

  export type FormProps<RouteInferType> = {
    /**
     * \`action\` can be either a \`string\` or a function.
     * - If \`action\` is a string, it will be interpreted as a path or URL to navigate to when the form is submitted.
     *   The path will be prefetched when the form becomes visible.
     * - If \`action\` is a function, it will be called when the form is submitted. See the [React docs](https://react.dev/reference/react-dom/components/form#props) for more.
     */
    action: __next_route_internal_types__.RouteImpl<RouteInferType> | ((formData: FormData) => void)
  } & FormRestProps

  export default function Form<RouteType>(props: FormProps<RouteType>): JSX.Element
}
`
}

export function generateValidatorFile(
  routesManifest: RouteTypesManifest
): string {
  const generateValidations = (
    paths: string[],
    type:
      | 'AppPageConfig'
      | 'PagesPageConfig'
      | 'LayoutConfig'
      | 'RouteHandlerConfig'
      | 'ApiRouteConfig',
    pathToRouteMap?: Map<string, string>
  ) =>
    paths
      .sort()
      // Only validate TypeScript files - JavaScript files have too many type inference limitations
      .filter(
        (filePath) => filePath.endsWith('.ts') || filePath.endsWith('.tsx')
      )
      .filter(
        // Don't include metadata routes or pages
        // (e.g. /manifest.webmanifest)
        (filePath) =>
          type !== 'AppPageConfig' ||
          filePath.endsWith('page.ts') ||
          filePath.endsWith('page.tsx')
      )
      .map((filePath) => {
        // Keep the file extension for TypeScript imports to support node16 module resolution
        const importPath = filePath
        const route = pathToRouteMap?.get(filePath)
        const typeWithRoute =
          route &&
          (type === 'AppPageConfig' ||
            type === 'LayoutConfig' ||
            type === 'RouteHandlerConfig')
            ? `${type}<${JSON.stringify(route)}>`
            : type

        // NOTE: we previously used `satisfies` here, but it's not supported by TypeScript 4.8 and below.
        // If we ever raise the TS minimum version, we can switch back.

        return `// Validate ${filePath}
{
  type __IsExpected<Specific extends ${typeWithRoute}> = Specific
  const handler = {} as typeof import(${JSON.stringify(
    importPath.replace(/\.tsx?$/, '.js')
  )})
  type __Check = __IsExpected<typeof handler>
  // @ts-ignore
  type __Unused = __Check
}`
      })
      .join('\n\n')

  // Use direct mappings from the manifest

  // Generate validations for different route types
  const appPageValidations = generateValidations(
    Array.from(routesManifest.appPagePaths).sort(),
    'AppPageConfig',
    routesManifest.filePathToRoute
  )
  const appRouteHandlerValidations = generateValidations(
    Array.from(routesManifest.appRouteHandlers).sort(),
    'RouteHandlerConfig',
    routesManifest.filePathToRoute
  )
  const pagesRouterPageValidations = generateValidations(
    Array.from(routesManifest.pagesRouterPagePaths).sort(),
    'PagesPageConfig'
  )
  const pagesApiRouteValidations = generateValidations(
    Array.from(routesManifest.pageApiRoutes).sort(),
    'ApiRouteConfig'
  )
  const layoutValidations = generateValidations(
    Array.from(routesManifest.layoutPaths).sort(),
    'LayoutConfig',
    routesManifest.filePathToRoute
  )

  const hasAppRouteHandlers =
    Object.keys(routesManifest.appRouteHandlerRoutes).length > 0

  // Build type definitions based on what's actually used
  let typeDefinitions = ''

  if (appPageValidations) {
    typeDefinitions += `type AppPageConfig<Route extends AppRoutes = AppRoutes> = {
  default: React.ComponentType<{ params: Promise<ParamMap[Route]> } & any> | ((props: { params: Promise<ParamMap[Route]> } & any) => React.ReactNode | Promise<React.ReactNode> | never | void | Promise<void>)
  generateStaticParams?: (props: { params: ParamMap[Route] }) => Promise<any[]> | any[]
  generateMetadata?: (
    props: { params: Promise<ParamMap[Route]> } & any,
    parent: ResolvingMetadata
  ) => Promise<any> | any
  generateViewport?: (
    props: { params: Promise<ParamMap[Route]> } & any,
    parent: ResolvingViewport
  ) => Promise<any> | any
  metadata?: any
  viewport?: any
}

`
  }

  if (pagesRouterPageValidations) {
    typeDefinitions += `type PagesPageConfig = {
  default: React.ComponentType<any> | ((props: any) => React.ReactNode | Promise<React.ReactNode> | never | void)
  getStaticProps?: (context: any) => Promise<any> | any
  getStaticPaths?: (context: any) => Promise<any> | any
  getServerSideProps?: (context: any) => Promise<any> | any
  getInitialProps?: (context: any) => Promise<any> | any
  /**
   * Segment configuration for legacy Pages Router pages.
   * Validated at build-time by parsePagesSegmentConfig.
   */
  config?: {
    maxDuration?: number
    runtime?: 'edge' | 'experimental-edge' | 'nodejs' | string // necessary unless config is exported as const
    regions?: string[]
  }
}

`
  }

  if (layoutValidations) {
    typeDefinitions += `type LayoutConfig<Route extends LayoutRoutes = LayoutRoutes> = {
  default: React.ComponentType<LayoutProps<Route>> | ((props: LayoutProps<Route>) => React.ReactNode | Promise<React.ReactNode> | never | void | Promise<void>)
  generateStaticParams?: (props: { params: ParamMap[Route] }) => Promise<any[]> | any[]
  generateMetadata?: (
    props: { params: Promise<ParamMap[Route]> } & any,
    parent: ResolvingMetadata
  ) => Promise<any> | any
  generateViewport?: (
    props: { params: Promise<ParamMap[Route]> } & any,
    parent: ResolvingViewport
  ) => Promise<any> | any
  metadata?: any
  viewport?: any
}

`
  }

  if (appRouteHandlerValidations) {
    typeDefinitions += `type RouteHandlerConfig<Route extends AppRouteHandlerRoutes = AppRouteHandlerRoutes> = {
  GET?: (request: NextRequest, context: { params: Promise<ParamMap[Route]> }) => Promise<Response | void> | Response | void
  POST?: (request: NextRequest, context: { params: Promise<ParamMap[Route]> }) => Promise<Response | void> | Response | void
  PUT?: (request: NextRequest, context: { params: Promise<ParamMap[Route]> }) => Promise<Response | void> | Response | void
  PATCH?: (request: NextRequest, context: { params: Promise<ParamMap[Route]> }) => Promise<Response | void> | Response | void
  DELETE?: (request: NextRequest, context: { params: Promise<ParamMap[Route]> }) => Promise<Response | void> | Response | void
  HEAD?: (request: NextRequest, context: { params: Promise<ParamMap[Route]> }) => Promise<Response | void> | Response | void
  OPTIONS?: (request: NextRequest, context: { params: Promise<ParamMap[Route]> }) => Promise<Response | void> | Response | void
}

`
  }

  if (pagesApiRouteValidations) {
    typeDefinitions += `type ApiRouteConfig = {
  default: (req: any, res: any) => ReturnType<NextApiHandler>
  config?: {
    api?: {
      bodyParser?: boolean | { sizeLimit?: string }
      responseLimit?: string | number | boolean
      externalResolver?: boolean
    }
    runtime?: 'edge' | 'experimental-edge' | 'nodejs' | string // necessary unless config is exported as const
    maxDuration?: number
  }
}

`
  }

  // Build import statement based on what's actually needed
  const routeImports = []

  // Only import AppRoutes if there are app pages
  if (appPageValidations) {
    routeImports.push('AppRoutes')
  }

  // Only import LayoutRoutes if there are layouts
  if (layoutValidations) {
    routeImports.push('LayoutRoutes')
  }

  // Only import ParamMap if there are routes that use it
  if (appPageValidations || layoutValidations || appRouteHandlerValidations) {
    routeImports.push('ParamMap')
  }

  if (hasAppRouteHandlers) {
    routeImports.push('AppRouteHandlerRoutes')
  }

  const routeImportStatement =
    routeImports.length > 0
      ? `import type { ${routeImports.join(', ')} } from "./routes.js"`
      : ''

  const nextRequestImport = hasAppRouteHandlers
    ? "import type { NextRequest } from 'next/server.js'\n"
    : ''

  // Conditionally import types from next/types, merged into a single statement
  const nextTypes: string[] = []
  if (pagesApiRouteValidations) {
    nextTypes.push('NextApiHandler')
  }
  if (appPageValidations || layoutValidations) {
    nextTypes.push('ResolvingMetadata', 'ResolvingViewport')
  }
  const nextTypesImport =
    nextTypes.length > 0
      ? `import type { ${nextTypes.join(', ')} } from "next/types.js"\n`
      : ''

  return `// This file is generated automatically by Next.js
// Do not edit this file manually
// This file validates that all pages and layouts export the correct types

${routeImportStatement}
${nextTypesImport}${nextRequestImport}
${typeDefinitions}
${appPageValidations}

${appRouteHandlerValidations}

${pagesRouterPageValidations}

${pagesApiRouteValidations}

${layoutValidations}
`
}

export function generateRouteTypesFile(
  routesManifest: RouteTypesManifest
): string {
  const routeTypes = generateRouteTypes(routesManifest)
  const paramTypes = generateParamTypes(routesManifest)
  const layoutSlotMap = generateLayoutSlotMap(routesManifest)

  const hasAppRouteHandlers =
    Object.keys(routesManifest.appRouteHandlerRoutes).length > 0

  // Build export statement based on what's actually generated
  const routeExports = [
    'AppRoutes',
    'PageRoutes',
    'LayoutRoutes',
    'RedirectRoutes',
    'RewriteRoutes',
    'ParamMap',
  ]
  if (hasAppRouteHandlers) {
    routeExports.push('AppRouteHandlerRoutes')
  }

  const exportStatement = `export type { ${routeExports.join(', ')} }`

  const routeContextInterface = hasAppRouteHandlers
    ? `

  /**
   * Context for Next.js App Router route handlers
   * @example
   * \`\`\`tsx
   * export async function GET(request: NextRequest, context: RouteContext<'/api/users/[id]'>) {
   *   const { id } = await context.params
   *   return Response.json({ id })
   * }
   * \`\`\`
   */
  interface RouteContext<AppRouteHandlerRoute extends AppRouteHandlerRoutes> {
    params: Promise<ParamMap[AppRouteHandlerRoute]>
  }`
    : ''

  return `// This file is generated automatically by Next.js
// Do not edit this file manually

${routeTypes}

${paramTypes}

export type ParamsOf<Route extends Routes> = ParamMap[Route]

${layoutSlotMap}

${exportStatement}

declare global {
  /**
   * Props for Next.js App Router page components
   * @example
   * \`\`\`tsx
   * export default function Page(props: PageProps<'/blog/[slug]'>) {
   *   const { slug } = await props.params
   *   return <div>Blog post: {slug}</div>
   * }
   * \`\`\`
   */
  interface PageProps<AppRoute extends AppRoutes> {
    params: Promise<ParamMap[AppRoute]>
    searchParams: Promise<Record<string, string | string[] | undefined>>
  }

  /**
   * Props for Next.js App Router layout components
   * @example
   * \`\`\`tsx
   * export default function Layout(props: LayoutProps<'/dashboard'>) {
   *   return <div>{props.children}</div>
   * }
   * \`\`\`
   */
  type LayoutProps<LayoutRoute extends LayoutRoutes> = {
    params: Promise<ParamMap[LayoutRoute]>
    children: React.ReactNode
  } & {
    [K in LayoutSlotMap[LayoutRoute]]: React.ReactNode
  }${routeContextInterface}
}
`
}
