import type PagesRouteModule from '../../../server/future/route-modules/pages/module'
import type { EdgeFunctionDefinition } from '../../webpack/plugins/middleware-plugin'

import { isValidElementType } from 'next/dist/compiled/react-is'
import {
  SSG_GET_INITIAL_PROPS_CONFLICT,
  SERVER_PROPS_GET_INIT_PROPS_CONFLICT,
  SERVER_PROPS_SSG_CONFLICT,
} from '../../../lib/constants'
import { PAGES_MANIFEST } from '../../../shared/lib/constants'
import {
  GetStaticPaths,
  GetStaticPathsResult,
  ServerRuntime,
} from '../../../../types'
import * as Log from '../../output/log'
import { isEdgeRuntime } from '../../../lib/is-edge-runtime'
import { ManifestRouteModuleLoader } from '../../../server/future/helpers/module-loader/manifest-module-loader'
import { EdgeModuleLoader } from '../../../server/future/helpers/module-loader/edge-module-loader'
import {
  GetStaticPathsParsedResult,
  parseGetStaticPathsResult,
} from './helpers/parse-static-paths'

export class InvalidGetStaticPathsError extends Error {
  constructor(message: string) {
    super(
      message +
        ` Expected: { paths: [], fallback: boolean }\n` +
        `See here for more info: https://nextjs.org/docs/messages/invalid-getstaticpaths-value`
    )
  }
}

export class InvalidPathsKeyError extends Error {
  constructor(page: string) {
    super(
      `Invalid \`paths\` value returned from getStaticPaths in ${page}.\n` +
        `\`paths\` must be an array of strings or objects of shape { params: [key: string]: string }`
    )
  }
}

export const VALID_GET_STATIC_PATHS_KEYS = ['paths', 'fallback']
export const VALID_GET_STATIC_PATHS_PATH_KEYS = ['params', 'locale']

export async function getStaticPaths(context: {
  page: string
  locales: string[] | undefined
  defaultLocale: string | undefined
  getStaticPaths: GetStaticPaths
  configFileName: string
}): Promise<GetStaticPathsParsedResult> {
  // Get the static paths for the page.
  const result = await context.getStaticPaths({
    locales: context.locales,
    defaultLocale: context.defaultLocale,
  })

  // Validate the output from getStaticPaths.
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new InvalidGetStaticPathsError(
      `Invalid value returned from getStaticPaths in ${
        context.page
      }. Received ${typeof result} `
    )
  }

  // Parse the result from getStaticPaths.
  return parseGetStaticPathsResult(result, context)
}

export type IsPageStaticResult = {
  isStatic: boolean | undefined
  isAmpOnly: boolean | undefined
  isHybridAmp: boolean | undefined
  hasServerProps: boolean | undefined
  hasStaticProps: boolean | undefined
  prerenderRoutes: string[] | undefined
  encodedPrerenderRoutes: string[] | undefined
  prerenderFallback: boolean | 'blocking' | undefined
  isNextImageImported: boolean | undefined
}

export async function isPagesPageStatic(context: {
  page: string
  pageRuntime: ServerRuntime
  distDir: string
  locales: string[] | undefined
  defaultLocale: string | undefined
  configFileName: string
  getStaticPathsResult?: GetStaticPathsResult
  edgeInfo: EdgeFunctionDefinition | undefined
}): Promise<IsPageStaticResult> {
  let module: string | PagesRouteModule
  if (isEdgeRuntime(context.pageRuntime) && context.edgeInfo) {
    // Load the module from the edge runtime.
    module = await EdgeModuleLoader.load<PagesRouteModule>(
      context.distDir,
      context.edgeInfo
    )
  } else {
    // Try to load the module from the filesystem.
    module = await ManifestRouteModuleLoader.load<PagesRouteModule>(
      context.distDir,
      PAGES_MANIFEST,
      context.page
    )
  }

  if (typeof module === 'string') {
    throw new Error(
      'Invariant: unexpected string from loader.load during isPageStatic check'
    )
  }

  // Validate that the userland code contains the expected export.
  if (
    !module.userland.default ||
    !isValidElementType(module.userland.default) ||
    typeof module.userland.default === 'string'
  ) {
    // TODO: (wyattjoh) update this error to be more useful
    throw new Error('INVALID_DEFAULT_EXPORT')
  }

  // Validate that the userland code doesn't have any legacy exports.
  if ('unstable_getStaticParams' in module.userland) {
    throw new Error(
      `unstable_getStaticParams was replaced with getStaticPaths. Please update your code.`
    )
  }
  if ('unstable_getStaticPaths' in module.userland) {
    throw new Error(
      `unstable_getStaticPaths was replaced with getStaticPaths. Please update your code.`
    )
  }
  if ('unstable_getStaticProps' in module.userland) {
    throw new Error(
      `unstable_getStaticProps was replaced with getStaticProps. Please update your code.`
    )
  }
  if ('unstable_getServerProps' in module.userland) {
    throw new Error(
      `unstable_getServerProps was replaced with getServerSideProps. Please update your code.`
    )
  }

  // Validate that the page doesn't have both getStaticProps and
  // getInitialProps.
  if (
    module.userland.getStaticProps &&
    module.userland.default.getInitialProps
  ) {
    throw new Error(SSG_GET_INITIAL_PROPS_CONFLICT)
  }

  // Validate that the page doesn't have both getServerSideProps and
  // getInitialProps.
  if (
    module.userland.getServerSideProps &&
    module.userland.default.getInitialProps
  ) {
    throw new Error(SERVER_PROPS_GET_INIT_PROPS_CONFLICT)
  }

  // Validate that the page doesn't have both getStaticProps and
  // getServerSideProps.
  if (module.userland.getStaticProps && module.userland.getServerSideProps) {
    throw new Error(SERVER_PROPS_SSG_CONFLICT)
  }

  // A page must have getStaticPaths if it's dynamic and has getStaticProps.
  if (
    module.definition.isDynamic &&
    module.userland.getStaticProps &&
    !module.userland.getStaticPaths
  ) {
    throw new Error(
      `getStaticPaths is required for dynamic SSG pages and is missing for '${context.page}'.` +
        `\nRead more: https://nextjs.org/docs/messages/invalid-getstaticpaths-value`
    )
  }

  // A page can't have getStaticProps and getStaticPaths if it's not dynamic.
  if (
    module.userland.getStaticProps &&
    module.userland.getStaticPaths &&
    !module.definition.isDynamic
  ) {
    throw new Error(
      `getStaticPaths can only be used with dynamic pages, not '${context.page}'.` +
        `\nLearn more: https://nextjs.org/docs/routing/dynamic-routes`
    )
  }

  // Build the static paths if getStaticPaths is defined.
  let parsed: GetStaticPathsParsedResult | undefined
  if (context.getStaticPathsResult) {
    parsed = parseGetStaticPathsResult(context.getStaticPathsResult, {
      page: context.page,
      locales: context.locales,
      defaultLocale: context.defaultLocale,
      configFileName: context.configFileName,
    })
  } else if (module.userland.getStaticPaths) {
    parsed = await getStaticPaths({
      page: context.page,
      locales: context.locales,
      defaultLocale: context.defaultLocale,
      configFileName: context.configFileName,
      getStaticPaths: module.userland.getStaticPaths,
    })
  }

  const isNextImageImported = (globalThis as any).__NEXT_IMAGE_IMPORTED
  if (
    module.userland.config?.unstable_includeFiles ||
    module.userland.config?.unstable_excludeFiles
  ) {
    Log.warn(
      `unstable_includeFiles/unstable_excludeFiles has been removed in favor of the option in next.config.js.\nSee more info here: https://nextjs.org/docs/advanced-features/output-file-tracing#caveats`
    )
  }

  return {
    isStatic:
      typeof module.userland.getStaticProps !== 'function' &&
      typeof module.userland.default.getInitialProps !== 'function' &&
      typeof module.userland.getServerSideProps !== 'function',
    isHybridAmp: module.userland.config?.amp === 'hybrid',
    isAmpOnly: module.userland.config?.amp === true,
    prerenderRoutes: parsed?.paths,
    prerenderFallback: parsed?.fallback,
    encodedPrerenderRoutes: parsed?.encodedPaths,
    hasStaticProps: typeof module.userland.getStaticProps === 'function',
    hasServerProps: typeof module.userland.getServerSideProps === 'function',
    isNextImageImported,
  }
}
