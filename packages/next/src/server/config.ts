import { existsSync } from 'fs'
import { basename, extname, join, relative, isAbsolute, resolve } from 'path'
import { pathToFileURL } from 'url'
import findUp from 'next/dist/compiled/find-up'
import * as Log from '../build/output/log'
import * as ciEnvironment from '../server/ci-info'
import {
  CONFIG_FILES,
  PHASE_DEVELOPMENT_SERVER,
  PHASE_EXPORT,
  PHASE_PRODUCTION_BUILD,
  type PHASE_TYPE,
} from '../shared/lib/constants'
import { defaultConfig, normalizeConfig } from './config-shared'
import type {
  ExperimentalConfig,
  NextConfigComplete,
  NextConfig,
} from './config-shared'

import { loadWebpackHook } from './config-utils'
import { imageConfigDefault } from '../shared/lib/image-config'
import type { ImageConfig } from '../shared/lib/image-config'
import { loadEnvConfig, updateInitialEnv } from '@next/env'
import { flushTelemetry } from '../telemetry/flush-telemetry'
import {
  findRootDirAndLockFiles,
  warnDuplicatedLockFiles,
} from '../lib/find-root'
import { setHttpClientAndAgentOptions } from './setup-http-agent-env'
import { pathHasPrefix } from '../shared/lib/router/utils/path-has-prefix'
import { matchRemotePattern } from '../shared/lib/match-remote-pattern'

import type { ZodError } from 'next/dist/compiled/zod'
import { hasNextSupport } from '../server/ci-info'
import { transpileConfig } from '../build/next-config-ts/transpile-config'
import { dset } from '../shared/lib/dset'
import { normalizeZodErrors } from '../shared/lib/zod'
import { HTML_LIMITED_BOT_UA_RE_STRING } from '../shared/lib/router/utils/is-bot'
import { findDir } from '../lib/find-pages-dir'
import {
  CanaryOnlyConfigError,
  isStableBuild,
} from '../shared/lib/errors/canary-only-config-error'
import { interopDefault } from '../lib/interop-default'
import { djb2Hash } from '../shared/lib/hash'
import type { NextAdapter } from '../build/adapter/build-complete'
import { HardDeprecatedConfigError } from '../shared/lib/errors/hard-deprecated-config-error'
import { NextInstanceErrorState } from './mcp/tools/next-instance-error-state'

export { normalizeConfig } from './config-shared'
export type { DomainLocale, NextConfig } from './config-shared'

function normalizeNextConfigZodErrors(
  error: ZodError<NextConfig>
): [warnings: string[], fatalErrors: string[]] {
  const warnings: string[] = []
  const fatalErrors: string[] = []
  const issues = normalizeZodErrors(error)

  for (const { issue, message: originalMessage } of issues) {
    let message = originalMessage
    let shouldExit = false

    if (issue.path[0] === 'images') {
      // We exit the build when encountering an error in the images config
      shouldExit = true
    }
    if (
      issue.code === 'unrecognized_keys' &&
      issue.path[0] === 'experimental'
    ) {
      if (message.includes('turbopackPersistentCachingForBuild')) {
        // We exit the build when encountering an error in the turbopackPersistentCaching config
        shouldExit = true
        message +=
          "\nUse 'experimental.turbopackFileSystemCacheForBuild' instead."
        message +=
          '\nLearn more: https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache'
      } else if (message.includes('turbopackPersistentCaching')) {
        // We exit the build when encountering an error in the turbopackPersistentCaching config
        shouldExit = true
        message +=
          "\nUse 'experimental.turbopackFileSystemCacheForDev' instead."
        message +=
          '\nLearn more: https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache'
      }
    }

    if (shouldExit) {
      fatalErrors.push(message)
    } else {
      warnings.push(message)
    }
  }

  return [warnings, fatalErrors]
}

export function warnOptionHasBeenDeprecated(
  config: NextConfig,
  nestedPropertyKey: string,
  reason: string,
  silent: boolean
): boolean {
  let hasWarned = false
  if (!silent) {
    let current = config
    let found = true
    const nestedPropertyKeys = nestedPropertyKey.split('.')
    for (const key of nestedPropertyKeys) {
      if ((current as any)[key] !== undefined) {
        current = (current as any)[key]
      } else {
        found = false
        break
      }
    }
    if (found) {
      Log.warnOnce(reason)
      hasWarned = true
    }
  }
  return hasWarned
}

function checkDeprecations(
  userConfig: NextConfig,
  configFileName: string,
  silent: boolean,
  dir: string
) {
  warnOptionHasBeenDeprecated(
    userConfig,
    'experimental.middlewarePrefetch',
    `\`experimental.middlewarePrefetch\` is deprecated. Please use \`experimental.proxyPrefetch\` instead in ${configFileName}.`,
    silent
  )
  warnOptionHasBeenDeprecated(
    userConfig,
    'experimental.middlewareClientMaxBodySize',
    `\`experimental.middlewareClientMaxBodySize\` is deprecated. Please use \`experimental.proxyClientMaxBodySize\` instead in ${configFileName}.`,
    silent
  )
  warnOptionHasBeenDeprecated(
    userConfig,
    'experimental.externalMiddlewareRewritesResolve',
    `\`experimental.externalMiddlewareRewritesResolve\` is deprecated. Please use \`experimental.externalProxyRewritesResolve\` instead in ${configFileName}.`,
    silent
  )
  warnOptionHasBeenDeprecated(
    userConfig,
    'skipMiddlewareUrlNormalize',
    `\`skipMiddlewareUrlNormalize\` is deprecated. Please use \`skipProxyUrlNormalize\` instead in ${configFileName}.`,
    silent
  )

  warnOptionHasBeenDeprecated(
    userConfig,
    'experimental.instrumentationHook',
    `\`experimental.instrumentationHook\` is no longer needed, because \`instrumentation.js\` is available by default. You can remove it from ${configFileName}.`,
    silent
  )

  warnOptionHasBeenDeprecated(
    userConfig,
    'experimental.after',
    `\`experimental.after\` is no longer needed, because \`after\` is available by default. You can remove it from ${configFileName}.`,
    silent
  )

  warnOptionHasBeenDeprecated(
    userConfig,
    'eslint',
    `\`eslint\` configuration in ${configFileName} is no longer supported. See more info here: https://nextjs.org/docs/app/api-reference/cli/next#next-lint-options`,
    silent
  )

  if (userConfig.images?.domains?.length) {
    warnOptionHasBeenDeprecated(
      userConfig,
      'images.domains',
      `\`images.domains\` is deprecated in favor of \`images.remotePatterns\`. Please update ${configFileName} to protect your application from malicious users.`,
      silent
    )
  }

  // i18n deprecation for App Router
  if (userConfig.i18n) {
    const hasAppDir = Boolean(findDir(dir, 'app'))
    if (hasAppDir) {
      warnOptionHasBeenDeprecated(
        userConfig,
        'i18n',
        `i18n configuration in ${configFileName} is unsupported in App Router.\nLearn more about internationalization in App Router: https://nextjs.org/docs/app/building-your-application/routing/internationalization`,
        silent
      )
    }
  }
}

export function warnOptionHasBeenMovedOutOfExperimental(
  config: NextConfig,
  oldExperimentalKey: string,
  newKey: string,
  configFileName: string,
  silent: boolean
) {
  if (config.experimental && oldExperimentalKey in config.experimental) {
    if (!silent) {
      Log.warn(
        `\`experimental.${oldExperimentalKey}\` has been moved to \`${newKey}\`. ` +
          `Please update your ${configFileName} file accordingly.`
      )
    }

    let current = config
    const newKeys = newKey.split('.')
    while (newKeys.length > 1) {
      const key = newKeys.shift()!
      ;(current as any)[key] = (current as any)[key] || {}
      current = (current as any)[key]
    }
    ;(current as any)[newKeys.shift()!] = (config.experimental as any)[
      oldExperimentalKey
    ]
  }

  return config
}

function warnCustomizedOption(
  config: NextConfig,
  key: string,
  defaultValue: any,
  customMessage: string,
  configFileName: string,
  silent: boolean
) {
  const segs = key.split('.')
  let current = config

  while (segs.length >= 1) {
    const seg = segs.shift()!
    if (!(seg in current)) {
      return
    }
    current = (current as any)[seg]
  }

  if (!silent && current !== defaultValue) {
    Log.warn(
      `The "${key}" option has been modified. ${customMessage ? customMessage + '. ' : ''}It should be removed from your ${configFileName}.`
    )
  }
}

/**
 * Assigns defaults to the user config and validates the config.
 *
 * @param dir - The directory of the project.
 * @param userConfig - The user config.
 * @param silent - Whether to suppress warnings.
 * @returns The complete config.
 */
function assignDefaultsAndValidate(
  dir: string,
  userConfig: NextConfig & { configFileName: string },
  silent: boolean,
  phase: PHASE_TYPE
): NextConfigComplete {
  const configFileName = userConfig.configFileName
  if (typeof (userConfig as any).exportTrailingSlash !== 'undefined') {
    if (!silent) {
      Log.warn(
        `The "exportTrailingSlash" option has been renamed to "trailingSlash". Please update your ${configFileName}.`
      )
    }
    if (typeof userConfig.trailingSlash === 'undefined') {
      userConfig.trailingSlash = (userConfig as any).exportTrailingSlash
    }
    delete (userConfig as any).exportTrailingSlash
  }

  const config = Object.keys(userConfig).reduce<{ [key: string]: any }>(
    (currentConfig, key) => {
      const value = (userConfig as any)[key]

      if (value === undefined || value === null) {
        return currentConfig
      }

      if (key === 'distDir') {
        if (typeof value !== 'string') {
          throw new Error(
            `Specified distDir is not a string, found type "${typeof value}"`
          )
        }
        const userDistDir = value.trim()

        // don't allow public as the distDir as this is a reserved folder for
        // public files
        if (userDistDir === 'public') {
          throw new Error(
            `The 'public' directory is reserved in Next.js and can not be set as the 'distDir'. https://nextjs.org/docs/messages/can-not-output-to-public`
          )
        }
        // make sure distDir isn't an empty string as it can result in the provided
        // directory being deleted in development mode
        if (userDistDir.length === 0) {
          throw new Error(
            `Invalid distDir provided, distDir can not be an empty string. Please remove this config or set it to undefined`
          )
        }
      }

      if (key === 'pageExtensions') {
        if (!Array.isArray(value)) {
          throw new Error(
            `Specified pageExtensions is not an array of strings, found "${value}". Please update this config or remove it.`
          )
        }

        if (!value.length) {
          throw new Error(
            `Specified pageExtensions is an empty array. Please update it with the relevant extensions or remove it.`
          )
        }

        value.forEach((ext) => {
          if (typeof ext !== 'string') {
            throw new Error(
              `Specified pageExtensions is not an array of strings, found "${ext}" of type "${typeof ext}". Please update this config or remove it.`
            )
          }
        })
      }

      const defaultValue = (defaultConfig as Record<string, unknown>)[key]

      if (
        !!value &&
        value.constructor === Object &&
        typeof defaultValue === 'object'
      ) {
        currentConfig[key] = {
          ...defaultValue,
          ...Object.keys(value).reduce<any>((c, k) => {
            const v = value[k]
            if (v !== undefined && v !== null) {
              c[k] = v
            }
            return c
          }, {}),
        }
      } else {
        currentConfig[key] = value
      }

      return currentConfig
    },
    {}
  ) as NextConfig & { configFileName: string }

  const result = {
    ...defaultConfig,
    ...config,
    experimental: {
      ...defaultConfig.experimental,
      ...config.experimental,
    },
  }

  // ensure correct default is set for api-resolver revalidate handling
  if (!result.experimental?.trustHostHeader && ciEnvironment.hasNextSupport) {
    result.experimental.trustHostHeader = true
  }

  if (
    result.experimental?.allowDevelopmentBuild &&
    process.env.NODE_ENV !== 'development'
  ) {
    throw new Error(
      `The experimental.allowDevelopmentBuild option requires NODE_ENV to be explicitly set to 'development'.`
    )
  }

  // Validate sassOptions.functions is not used with Turbopack
  if (
    process.env.TURBOPACK &&
    result.sassOptions &&
    'functions' in result.sassOptions
  ) {
    throw new Error(
      `The "sassOptions.functions" option is not supported when using Turbopack. ` +
        `Custom Sass functions are only available with webpack. ` +
        `Please remove the "functions" property from your sassOptions in ${configFileName}.`
    )
  }

  if (isStableBuild()) {
    // Prevents usage of certain experimental features outside of canary
    if (result.experimental?.turbopackFileSystemCacheForBuild) {
      throw new CanaryOnlyConfigError({
        feature: 'experimental.turbopackFileSystemCacheForBuild',
      })
    }
  }

  if (result.experimental.ppr) {
    throw new HardDeprecatedConfigError(
      `\`experimental.ppr\` has been merged into \`cacheComponents\`. The Partial Prerendering feature is still available, but is now enabled via \`cacheComponents\`. Please update your ${configFileName} accordingly.`
    )
  }

  if (result.output === 'export') {
    if (result.i18n) {
      throw new Error(
        'Specified "i18n" cannot be used with "output: export". See more info here: https://nextjs.org/docs/messages/export-no-i18n'
      )
    }

    if (!hasNextSupport) {
      if (result.rewrites) {
        Log.warn(
          'Specified "rewrites" will not automatically work with "output: export". See more info here: https://nextjs.org/docs/messages/export-no-custom-routes'
        )
      }
      if (result.redirects) {
        Log.warn(
          'Specified "redirects" will not automatically work with "output: export". See more info here: https://nextjs.org/docs/messages/export-no-custom-routes'
        )
      }
      if (result.headers) {
        Log.warn(
          'Specified "headers" will not automatically work with "output: export". See more info here: https://nextjs.org/docs/messages/export-no-custom-routes'
        )
      }
    }
  }

  if (typeof result.assetPrefix !== 'string') {
    throw new Error(
      `Specified assetPrefix is not a string, found type "${typeof result.assetPrefix}" https://nextjs.org/docs/messages/invalid-assetprefix`
    )
  }

  if (typeof result.basePath !== 'string') {
    throw new Error(
      `Specified basePath is not a string, found type "${typeof result.basePath}"`
    )
  }

  if (result.basePath !== '') {
    if (result.basePath === '/') {
      throw new Error(
        `Specified basePath /. basePath has to be either an empty string or a path prefix"`
      )
    }

    if (!result.basePath.startsWith('/')) {
      throw new Error(
        `Specified basePath has to start with a /, found "${result.basePath}"`
      )
    }

    if (result.basePath !== '/') {
      if (result.basePath.endsWith('/')) {
        throw new Error(
          `Specified basePath should not end with /, found "${result.basePath}"`
        )
      }

      if (result.assetPrefix === '') {
        result.assetPrefix = result.basePath
      }
    }
  }

  if (result?.images) {
    const images: ImageConfig = result.images

    if (typeof images !== 'object') {
      throw new Error(
        `Specified images should be an object received ${typeof images}.\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config`
      )
    }

    if (images.localPatterns) {
      if (!Array.isArray(images.localPatterns)) {
        throw new Error(
          `Specified images.localPatterns should be an Array received ${typeof images.localPatterns}.\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config`
        )
      }
      // avoid double-pushing the same pattern if it already exists
      const hasMatch = images.localPatterns.some(
        (pattern) =>
          pattern.pathname === '/_next/static/media/**' && pattern.search === ''
      )
      if (!hasMatch) {
        // static import images are automatically allowed
        images.localPatterns.push({
          pathname: '/_next/static/media/**',
          search: '',
        })
      }
    } else {
      // All paths are not allowed for a search query by default.
      images.localPatterns = [
        {
          pathname: '**',
          search: '',
        },
      ]
    }

    if (images.remotePatterns) {
      if (!Array.isArray(images.remotePatterns)) {
        throw new Error(
          `Specified images.remotePatterns should be an Array received ${typeof images.remotePatterns}.\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config`
        )
      }

      // We must convert URL to RemotePattern since URL has a colon in the protocol
      // and also has additional properties we want to filter out. Also, new URL()
      // accepts any protocol so we need manual validation here.
      images.remotePatterns = images.remotePatterns.map(
        ({ protocol, hostname, port, pathname, search }) => {
          const proto = protocol?.replace(/:$/, '')
          if (!['http', 'https', undefined].includes(proto)) {
            throw new Error(
              `Specified images.remotePatterns must have protocol "http" or "https" received "${proto}".`
            )
          }
          return {
            protocol: proto as 'http' | 'https' | undefined,
            hostname,
            port,
            pathname,
            search,
          }
        }
      )

      // static images are automatically prefixed with assetPrefix
      // so we need to ensure _next/image allows downloading from
      // this resource
      if (config.assetPrefix?.startsWith('http')) {
        try {
          const url = new URL(config.assetPrefix)
          const hasMatchForAssetPrefix = images.remotePatterns.some((pattern) =>
            matchRemotePattern(pattern, url)
          )

          // avoid double-pushing the same pattern if it already can be matched
          if (!hasMatchForAssetPrefix) {
            images.remotePatterns.push({
              hostname: url.hostname,
              protocol: url.protocol.replace(/:$/, '') as 'http' | 'https',
              port: url.port,
            })
          }
        } catch (error) {
          throw new Error(
            `Invalid assetPrefix provided. Original error: ${error}`
          )
        }
      }
    }

    if (images.domains) {
      if (!Array.isArray(images.domains)) {
        throw new Error(
          `Specified images.domains should be an Array received ${typeof images.domains}.\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config`
        )
      }
    }

    if (!images.loader) {
      images.loader = 'default'
    }

    if (
      images.loader !== 'default' &&
      images.loader !== 'custom' &&
      images.path === imageConfigDefault.path
    ) {
      throw new Error(
        `Specified images.loader property (${images.loader}) also requires images.path property to be assigned to a URL prefix.\nSee more info here: https://nextjs.org/docs/api-reference/next/legacy/image#loader-configuration`
      )
    }

    if (
      images.path === imageConfigDefault.path &&
      result.basePath &&
      !pathHasPrefix(images.path, result.basePath)
    ) {
      images.path = `${result.basePath}${images.path}`
    }

    // Append trailing slash for non-default loaders and when trailingSlash is set
    if (
      images.path &&
      !images.path.endsWith('/') &&
      (images.loader !== 'default' || result.trailingSlash)
    ) {
      images.path += '/'
    }

    if (images.loaderFile) {
      if (images.loader !== 'default' && images.loader !== 'custom') {
        throw new Error(
          `Specified images.loader property (${images.loader}) cannot be used with images.loaderFile property. Please set images.loader to "custom".`
        )
      }
      const absolutePath = join(dir, images.loaderFile)
      if (!existsSync(absolutePath)) {
        throw new Error(
          `Specified images.loaderFile does not exist at "${absolutePath}".`
        )
      }
      images.loaderFile = absolutePath
    }
  }

  warnCustomizedOption(
    result,
    'experimental.esmExternals',
    true,
    'experimental.esmExternals is not recommended to be modified as it may disrupt module resolution',
    configFileName,
    silent
  )

  warnOptionHasBeenMovedOutOfExperimental(
    result,
    'bundlePagesExternals',
    'bundlePagesRouterDependencies',
    configFileName,
    silent
  )
  warnOptionHasBeenMovedOutOfExperimental(
    result,
    'serverComponentsExternalPackages',
    'serverExternalPackages',
    configFileName,
    silent
  )
  warnOptionHasBeenMovedOutOfExperimental(
    result,
    'relay',
    'compiler.relay',
    configFileName,
    silent
  )
  warnOptionHasBeenMovedOutOfExperimental(
    result,
    'styledComponents',
    'compiler.styledComponents',
    configFileName,
    silent
  )
  warnOptionHasBeenMovedOutOfExperimental(
    result,
    'emotion',
    'compiler.emotion',
    configFileName,
    silent
  )
  warnOptionHasBeenMovedOutOfExperimental(
    result,
    'reactRemoveProperties',
    'compiler.reactRemoveProperties',
    configFileName,
    silent
  )
  warnOptionHasBeenMovedOutOfExperimental(
    result,
    'removeConsole',
    'compiler.removeConsole',
    configFileName,
    silent
  )
  warnOptionHasBeenMovedOutOfExperimental(
    result,
    'swrDelta',
    'expireTime',
    configFileName,
    silent
  )
  warnOptionHasBeenMovedOutOfExperimental(
    result,
    'typedRoutes',
    'typedRoutes',
    configFileName,
    silent
  )
  warnOptionHasBeenMovedOutOfExperimental(
    result,
    'outputFileTracingRoot',
    'outputFileTracingRoot',
    configFileName,
    silent
  )
  warnOptionHasBeenMovedOutOfExperimental(
    result,
    'outputFileTracingIncludes',
    'outputFileTracingIncludes',
    configFileName,
    silent
  )
  warnOptionHasBeenMovedOutOfExperimental(
    result,
    'outputFileTracingExcludes',
    'outputFileTracingExcludes',
    configFileName,
    silent
  )
  warnOptionHasBeenMovedOutOfExperimental(
    result,
    'reactCompiler',
    'reactCompiler',
    configFileName,
    silent
  )
  warnOptionHasBeenMovedOutOfExperimental(
    result,
    'enablePrerenderSourceMaps',
    'enablePrerenderSourceMaps',
    configFileName,
    silent
  )
  warnOptionHasBeenMovedOutOfExperimental(
    result,
    'cacheComponents',
    'cacheComponents',
    configFileName,
    silent
  )
  warnOptionHasBeenMovedOutOfExperimental(
    result,
    'cacheLife',
    'cacheLife',
    configFileName,
    silent
  )

  if ((result.experimental as any).outputStandalone) {
    if (!silent) {
      Log.warn(
        `experimental.outputStandalone has been renamed to "output: 'standalone'", please move the config.`
      )
    }
    result.output = 'standalone'
  }

  if (
    typeof result.experimental?.serverActions?.bodySizeLimit !== 'undefined'
  ) {
    const value = parseInt(
      result.experimental.serverActions?.bodySizeLimit.toString()
    )
    if (isNaN(value) || value < 1) {
      throw new Error(
        'Server Actions Size Limit must be a valid number or filesize format larger than 1MB: https://nextjs.org/docs/app/api-reference/next-config-js/serverActions#bodysizelimit'
      )
    }
  }

  // Throw if both Middleware and Proxy config are set.
  if (
    userConfig.experimental?.proxyClientMaxBodySize !== undefined &&
    userConfig.experimental?.middlewareClientMaxBodySize !== undefined
  ) {
    throw new Error(
      'Config options `experimental.proxyClientMaxBodySize` and `experimental.middlewareClientMaxBodySize` cannot be set at the same time. Please use `experimental.proxyClientMaxBodySize` instead.'
    )
  }
  if (
    userConfig.experimental?.proxyPrefetch !== undefined &&
    userConfig.experimental?.middlewarePrefetch !== undefined
  ) {
    throw new Error(
      'Config options `experimental.proxyPrefetch` and `experimental.middlewarePrefetch` cannot be set at the same time. Please use `experimental.proxyPrefetch` instead.'
    )
  }
  if (
    userConfig.experimental?.externalProxyRewritesResolve !== undefined &&
    userConfig.experimental?.externalMiddlewareRewritesResolve !== undefined
  ) {
    throw new Error(
      'Config options `experimental.externalProxyRewritesResolve` and `experimental.externalMiddlewareRewritesResolve` cannot be set at the same time. Please use `experimental.externalProxyRewritesResolve` instead.'
    )
  }
  if (
    userConfig.skipProxyUrlNormalize !== undefined &&
    userConfig.skipMiddlewareUrlNormalize !== undefined
  ) {
    throw new Error(
      'Config options `skipProxyUrlNormalize` and `skipMiddlewareUrlNormalize` cannot be set at the same time. Please use `skipProxyUrlNormalize` instead.'
    )
  }

  // Map Proxy config to Middleware config as it is currently an alias.
  if (
    userConfig.experimental?.proxyClientMaxBodySize === undefined &&
    userConfig.experimental?.middlewareClientMaxBodySize !== undefined
  ) {
    result.experimental.proxyClientMaxBodySize =
      userConfig.experimental.middlewareClientMaxBodySize
  }
  if (
    userConfig.experimental?.proxyPrefetch === undefined &&
    userConfig.experimental?.middlewarePrefetch !== undefined
  ) {
    result.experimental.proxyPrefetch =
      userConfig.experimental.middlewarePrefetch
  }
  if (
    userConfig.experimental?.externalProxyRewritesResolve === undefined &&
    userConfig.experimental?.externalMiddlewareRewritesResolve !== undefined
  ) {
    result.experimental.externalProxyRewritesResolve =
      userConfig.experimental.externalMiddlewareRewritesResolve
  }
  if (
    userConfig.skipProxyUrlNormalize === undefined &&
    userConfig.skipMiddlewareUrlNormalize !== undefined
  ) {
    result.skipProxyUrlNormalize = userConfig.skipMiddlewareUrlNormalize
  }

  // Normalize & validate experimental.proxyClientMaxBodySize
  if (typeof result.experimental?.proxyClientMaxBodySize !== 'undefined') {
    const proxyClientMaxBodySize = result.experimental.proxyClientMaxBodySize
    let normalizedValue: number

    if (typeof proxyClientMaxBodySize === 'string') {
      const bytes =
        require('next/dist/compiled/bytes') as typeof import('next/dist/compiled/bytes')
      normalizedValue = bytes.parse(proxyClientMaxBodySize)
    } else if (typeof proxyClientMaxBodySize === 'number') {
      normalizedValue = proxyClientMaxBodySize
    } else {
      throw new Error(
        'Client Max Body Size must be a valid number (bytes) or filesize format string (e.g., "5mb")'
      )
    }

    if (isNaN(normalizedValue) || normalizedValue < 1) {
      throw new Error('Client Max Body Size must be larger than 0 bytes')
    }

    // Store the normalized value as a number
    result.experimental.proxyClientMaxBodySize = normalizedValue
  }

  warnOptionHasBeenMovedOutOfExperimental(
    result,
    'transpilePackages',
    'transpilePackages',
    configFileName,
    silent
  )
  warnOptionHasBeenMovedOutOfExperimental(
    result,
    'skipMiddlewareUrlNormalize',
    'skipMiddlewareUrlNormalize',
    configFileName,
    silent
  )
  warnOptionHasBeenMovedOutOfExperimental(
    result,
    'skipTrailingSlashRedirect',
    'skipTrailingSlashRedirect',
    configFileName,
    silent
  )

  if (
    result?.outputFileTracingRoot &&
    !isAbsolute(result.outputFileTracingRoot)
  ) {
    result.outputFileTracingRoot = resolve(result.outputFileTracingRoot)
    if (!silent) {
      Log.warn(
        `outputFileTracingRoot should be absolute, using: ${result.outputFileTracingRoot}`
      )
    }
  }

  if (result?.turbopack?.root && !isAbsolute(result.turbopack.root)) {
    result.turbopack.root = resolve(result.turbopack.root)
    if (!silent) {
      Log.warn(
        `turbopack.root should be absolute, using: ${result.turbopack.root}`
      )
    }
  }

  // only leverage deploymentId
  if (process.env.NEXT_DEPLOYMENT_ID) {
    result.deploymentId = process.env.NEXT_DEPLOYMENT_ID
  }

  const tracingRoot = result?.outputFileTracingRoot
  const turbopackRoot = result?.turbopack?.root

  // If both provided, validate they match. If not, use outputFileTracingRoot.
  if (tracingRoot && turbopackRoot && tracingRoot !== turbopackRoot) {
    Log.warn(
      `Both \`outputFileTracingRoot\` and \`turbopack.root\` are set, but they must have the same value.\n` +
        `Using \`outputFileTracingRoot\` value: ${tracingRoot}.`
    )
  }

  let rootDir = tracingRoot || turbopackRoot
  if (!rootDir) {
    const { rootDir: foundRootDir, lockFiles } = findRootDirAndLockFiles(dir)
    rootDir = foundRootDir
    if (!silent) {
      warnDuplicatedLockFiles(lockFiles)
    }
  }

  if (!rootDir) {
    throw new Error(
      'Failed to find the root directory of the project. This is a bug in Next.js.'
    )
  }

  // Ensure both properties are set to the same value
  result.outputFileTracingRoot = rootDir
  dset(result, ['turbopack', 'root'], rootDir)

  setHttpClientAndAgentOptions(result || defaultConfig)

  if (result.i18n) {
    const { i18n } = result
    const i18nType = typeof i18n

    if (i18nType !== 'object') {
      throw new Error(
        `Specified i18n should be an object received ${i18nType}.\nSee more info here: https://nextjs.org/docs/messages/invalid-i18n-config`
      )
    }

    if (!Array.isArray(i18n.locales)) {
      throw new Error(
        `Specified i18n.locales should be an Array received ${typeof i18n.locales}.\nSee more info here: https://nextjs.org/docs/messages/invalid-i18n-config`
      )
    }

    if (i18n.locales.length > 100 && !silent) {
      Log.warn(
        `Received ${i18n.locales.length} i18n.locales items which exceeds the recommended max of 100.\nSee more info here: https://nextjs.org/docs/advanced-features/i18n-routing#how-does-this-work-with-static-generation`
      )
    }

    const defaultLocaleType = typeof i18n.defaultLocale

    if (!i18n.defaultLocale || defaultLocaleType !== 'string') {
      throw new Error(
        `Specified i18n.defaultLocale should be a string.\nSee more info here: https://nextjs.org/docs/messages/invalid-i18n-config`
      )
    }

    if (typeof i18n.domains !== 'undefined' && !Array.isArray(i18n.domains)) {
      throw new Error(
        `Specified i18n.domains must be an array of domain objects e.g. [ { domain: 'example.fr', defaultLocale: 'fr', locales: ['fr'] } ] received ${typeof i18n.domains}.\nSee more info here: https://nextjs.org/docs/messages/invalid-i18n-config`
      )
    }

    if (i18n.domains) {
      const invalidDomainItems = i18n.domains.filter((item) => {
        if (!item || typeof item !== 'object') return true
        if (!item.defaultLocale) return true
        if (!item.domain || typeof item.domain !== 'string') return true

        if (item.domain.includes(':')) {
          console.warn(
            `i18n domain: "${item.domain}" is invalid it should be a valid domain without protocol (https://) or port (:3000) e.g. example.vercel.sh`
          )
          return true
        }

        const defaultLocaleDuplicate = i18n.domains?.find(
          (altItem) =>
            altItem.defaultLocale === item.defaultLocale &&
            altItem.domain !== item.domain
        )

        if (!silent && defaultLocaleDuplicate) {
          console.warn(
            `Both ${item.domain} and ${defaultLocaleDuplicate.domain} configured the defaultLocale ${item.defaultLocale} but only one can. Change one item's default locale to continue`
          )
          return true
        }

        let hasInvalidLocale = false

        if (Array.isArray(item.locales)) {
          for (const locale of item.locales) {
            if (typeof locale !== 'string') hasInvalidLocale = true

            for (const domainItem of i18n.domains || []) {
              if (domainItem === item) continue
              if (domainItem.locales && domainItem.locales.includes(locale)) {
                console.warn(
                  `Both ${item.domain} and ${domainItem.domain} configured the locale (${locale}) but only one can. Remove it from one i18n.domains config to continue`
                )
                hasInvalidLocale = true
                break
              }
            }
          }
        }

        return hasInvalidLocale
      })

      if (invalidDomainItems.length > 0) {
        throw new Error(
          `Invalid i18n.domains values:\n${invalidDomainItems
            .map((item: any) => JSON.stringify(item))
            .join(
              '\n'
            )}\n\ndomains value must follow format { domain: 'example.fr', defaultLocale: 'fr', locales: ['fr'] }.\nSee more info here: https://nextjs.org/docs/messages/invalid-i18n-config`
        )
      }
    }

    if (!Array.isArray(i18n.locales)) {
      throw new Error(
        `Specified i18n.locales must be an array of locale strings e.g. ["en-US", "nl-NL"] received ${typeof i18n.locales}.\nSee more info here: https://nextjs.org/docs/messages/invalid-i18n-config`
      )
    }

    const invalidLocales = i18n.locales.filter(
      (locale: any) => typeof locale !== 'string'
    )

    if (invalidLocales.length > 0) {
      throw new Error(
        `Specified i18n.locales contains invalid values (${invalidLocales
          .map(String)
          .join(
            ', '
          )}), locales must be valid locale tags provided as strings e.g. "en-US".\n` +
          `See here for list of valid language sub-tags: http://www.iana.org/assignments/language-subtag-registry/language-subtag-registry`
      )
    }

    if (!i18n.locales.includes(i18n.defaultLocale)) {
      throw new Error(
        `Specified i18n.defaultLocale should be included in i18n.locales.\nSee more info here: https://nextjs.org/docs/messages/invalid-i18n-config`
      )
    }

    const normalizedLocales = new Set()
    const duplicateLocales = new Set()

    i18n.locales.forEach((locale) => {
      const localeLower = locale.toLowerCase()
      if (normalizedLocales.has(localeLower)) {
        duplicateLocales.add(locale)
      }
      normalizedLocales.add(localeLower)
    })

    if (duplicateLocales.size > 0) {
      throw new Error(
        `Specified i18n.locales contains the following duplicate locales:\n` +
          `${[...duplicateLocales].join(', ')}\n` +
          `Each locale should be listed only once.\n` +
          `See more info here: https://nextjs.org/docs/messages/invalid-i18n-config`
      )
    }

    // make sure default Locale is at the front
    i18n.locales = [
      i18n.defaultLocale,
      ...i18n.locales.filter((locale) => locale !== i18n.defaultLocale),
    ]

    const localeDetectionType = typeof i18n.localeDetection

    if (
      localeDetectionType !== 'boolean' &&
      localeDetectionType !== 'undefined'
    ) {
      throw new Error(
        `Specified i18n.localeDetection should be undefined or a boolean received ${localeDetectionType}.\nSee more info here: https://nextjs.org/docs/messages/invalid-i18n-config`
      )
    }
  }

  if (result.devIndicators !== false && result.devIndicators?.position) {
    const { position } = result.devIndicators
    const allowedValues = [
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ]

    if (!allowedValues.includes(position)) {
      throw new Error(
        `Invalid "devIndicator.position" provided, expected one of ${allowedValues.join(
          ', '
        )}, received ${position}`
      )
    }
  }

  if (result.cacheLife) {
    result.cacheLife = {
      ...defaultConfig.cacheLife,
      ...result.cacheLife,
    }
    const defaultDefault = defaultConfig.cacheLife?.['default']
    if (
      !defaultDefault ||
      defaultDefault.revalidate === undefined ||
      defaultDefault.expire === undefined ||
      !defaultConfig.experimental?.staleTimes?.static
    ) {
      throw new Error('No default cacheLife profile.')
    }
    const defaultCacheLifeProfile = result.cacheLife['default']
    if (!defaultCacheLifeProfile) {
      result.cacheLife['default'] = defaultDefault
    } else {
      if (defaultCacheLifeProfile.stale === undefined) {
        const staticStaleTime = result.experimental.staleTimes?.static
        defaultCacheLifeProfile.stale =
          staticStaleTime ?? defaultConfig.experimental?.staleTimes?.static
      }
      if (defaultCacheLifeProfile.revalidate === undefined) {
        defaultCacheLifeProfile.revalidate = defaultDefault.revalidate
      }
      if (defaultCacheLifeProfile.expire === undefined) {
        defaultCacheLifeProfile.expire =
          result.expireTime ?? defaultDefault.expire
      }
    }
  }

  if (result.experimental?.cacheHandlers) {
    const allowedHandlerNameRegex = /[a-z-]/

    if (typeof result.experimental.cacheHandlers !== 'object') {
      throw new Error(
        `Invalid "experimental.cacheHandlers" provided, expected an object e.g. { default: '/my-handler.js' }, received ${JSON.stringify(result.experimental.cacheHandlers)}`
      )
    }

    const handlerKeys = Object.keys(result.experimental.cacheHandlers)
    const invalidHandlerItems: Array<{ key: string; reason: string }> = []

    for (const key of handlerKeys) {
      if (key === 'private') {
        invalidHandlerItems.push({
          key,
          reason:
            'The cache handler for "use cache: private" cannot be customized.',
        })
      } else if (!allowedHandlerNameRegex.test(key)) {
        invalidHandlerItems.push({
          key,
          reason: 'key must only use characters a-z and -',
        })
      } else {
        const handlerPath = (
          result.experimental.cacheHandlers as {
            [handlerName: string]: string | undefined
          }
        )[key]

        if (handlerPath && !existsSync(handlerPath)) {
          invalidHandlerItems.push({
            key,
            reason: `cache handler path provided does not exist, received ${handlerPath}`,
          })
        }
      }
      if (invalidHandlerItems.length) {
        throw new Error(
          `Invalid handler fields configured for "experimental.cacheHandler":\n${invalidHandlerItems.map((item) => `${key}: ${item.reason}`).join('\n')}`
        )
      }
    }
  }

  const userProvidedModularizeImports = result.modularizeImports
  // Unfortunately these packages end up re-exporting 10600 modules, for example: https://unpkg.com/browse/@mui/icons-material@5.11.16/esm/index.js.
  // Leveraging modularizeImports tremendously reduces compile times for these.
  result.modularizeImports = {
    ...(userProvidedModularizeImports || {}),
    // This is intentionally added after the user-provided modularizeImports config.
    '@mui/icons-material': {
      transform: '@mui/icons-material/{{member}}',
    },
    lodash: {
      transform: 'lodash/{{member}}',
    },
  }

  const userProvidedOptimizePackageImports =
    result.experimental?.optimizePackageImports || []

  result.experimental.optimizePackageImports = [
    ...new Set([
      ...userProvidedOptimizePackageImports,
      'lucide-react',
      'date-fns',
      'lodash-es',
      'ramda',
      'antd',
      'react-bootstrap',
      'ahooks',
      '@ant-design/icons',
      '@headlessui/react',
      '@headlessui-float/react',
      '@heroicons/react/20/solid',
      '@heroicons/react/24/solid',
      '@heroicons/react/24/outline',
      '@visx/visx',
      '@tremor/react',
      'rxjs',
      '@mui/material',
      '@mui/icons-material',
      'recharts',
      'react-use',
      'effect',
      '@effect/schema',
      '@effect/platform',
      '@effect/platform-node',
      '@effect/platform-browser',
      '@effect/platform-bun',
      '@effect/sql',
      '@effect/sql-mssql',
      '@effect/sql-mysql2',
      '@effect/sql-pg',
      '@effect/sql-sqlite-node',
      '@effect/sql-sqlite-bun',
      '@effect/sql-sqlite-wasm',
      '@effect/sql-sqlite-react-native',
      '@effect/rpc',
      '@effect/rpc-http',
      '@effect/typeclass',
      '@effect/experimental',
      '@effect/opentelemetry',
      '@material-ui/core',
      '@material-ui/icons',
      '@tabler/icons-react',
      'mui-core',
      // We don't support wildcard imports for these configs, e.g. `react-icons/*`
      // so we need to add them manually.
      // In the future, we should consider automatically detecting packages that
      // need to be optimized.
      'react-icons/ai',
      'react-icons/bi',
      'react-icons/bs',
      'react-icons/cg',
      'react-icons/ci',
      'react-icons/di',
      'react-icons/fa',
      'react-icons/fa6',
      'react-icons/fc',
      'react-icons/fi',
      'react-icons/gi',
      'react-icons/go',
      'react-icons/gr',
      'react-icons/hi',
      'react-icons/hi2',
      'react-icons/im',
      'react-icons/io',
      'react-icons/io5',
      'react-icons/lia',
      'react-icons/lib',
      'react-icons/lu',
      'react-icons/md',
      'react-icons/pi',
      'react-icons/ri',
      'react-icons/rx',
      'react-icons/si',
      'react-icons/sl',
      'react-icons/tb',
      'react-icons/tfi',
      'react-icons/ti',
      'react-icons/vsc',
      'react-icons/wi',
    ]),
  ]

  if (!result.htmlLimitedBots) {
    // @ts-expect-error: override the htmlLimitedBots with default string, type covert: RegExp -> string
    result.htmlLimitedBots = HTML_LIMITED_BOT_UA_RE_STRING
  }

  if (
    typeof result.experimental.mcpServer === 'undefined' &&
    process.env.__NEXT_EXPERIMENTAL_MCP_SERVER === 'true'
  ) {
    result.experimental.mcpServer = true
  }

  if (result.cacheComponents) {
    // TODO: remove once we've finished migrating internally to cacheComponents.
    result.experimental.ppr = true

    // Prerender sourcemaps are enabled by default when using cacheComponents, unless explicitly disabled.
    if (result.enablePrerenderSourceMaps === undefined) {
      result.enablePrerenderSourceMaps = true
    }
  }

  // "use cache" was originally implicitly enabled with the cacheComponents flag, so
  // we transfer the value for cacheComponents to the explicit useCache flag to ensure
  // backwards compatibility.
  if (result.experimental.useCache === undefined) {
    result.experimental.useCache = result.cacheComponents
  }

  // Store the distDirRoot in the config before it is modified by the isolatedDevBuild flag
  ;(result as NextConfigComplete).distDirRoot = result.distDir
  if (
    phase === PHASE_DEVELOPMENT_SERVER &&
    result.experimental?.isolatedDevBuild
  ) {
    result.distDir = join(result.distDir, 'dev')
  }

  return result as NextConfigComplete
}

async function applyModifyConfig(
  config: NextConfigComplete,
  phase: PHASE_TYPE,
  silent: boolean
): Promise<NextConfigComplete> {
  // we always call modify config  and phase can be used to only
  // modify for specific times
  if (config.experimental?.adapterPath) {
    const adapterMod = interopDefault(
      await import(
        pathToFileURL(require.resolve(config.experimental.adapterPath)).href
      )
    ) as NextAdapter

    if (typeof adapterMod.modifyConfig === 'function') {
      if (!silent) {
        Log.info(`Applying modifyConfig from ${adapterMod.name}`)
      }

      config = await adapterMod.modifyConfig(config, {
        phase,
      })
    }
  }
  return config
}

// Cache config with keys to handle multiple configurations (e.g., multi-zone)
const configCache = new Map<
  string,
  {
    rawConfig: any
    config: NextConfigComplete
    configuredExperimentalFeatures: ConfiguredExperimentalFeature[]
  }
>()

// Generate cache key based on parameters that affect config output
// We need a unique key for cache because there can be multiple values
function getCacheKey(
  phase: PHASE_TYPE,
  dir: string,
  customConfig?: object | null,
  reactProductionProfiling?: boolean,
  debugPrerender?: boolean,
  pid?: number
): string {
  // The next.config.js is unique per project, so we can use the dir as the major key
  // to generate the unique config key. Include PID to invalidate on server restart.
  const keyData = JSON.stringify({
    dir,
    phase,
    hasCustomConfig: Boolean(customConfig),
    reactProductionProfiling: Boolean(reactProductionProfiling),
    debugPrerender: Boolean(debugPrerender),
    pid: pid || 0,
  })

  return djb2Hash(keyData).toString(36)
}
export default async function loadConfig(
  phase: PHASE_TYPE,
  dir: string,
  {
    customConfig,
    rawConfig,
    silent = true,
    reportExperimentalFeatures,
    reactProductionProfiling,
    debugPrerender,
  }: {
    customConfig?: object | null
    rawConfig?: boolean
    silent?: boolean
    reportExperimentalFeatures?: (
      configuredExperimentalFeatures: ConfiguredExperimentalFeature[]
    ) => void
    reactProductionProfiling?: boolean
    debugPrerender?: boolean
  } = {}
): Promise<NextConfigComplete> {
  // Generate cache key based on parameters that affect config output
  // Include process.pid to invalidate cache on server restart
  const cacheKey = getCacheKey(
    phase,
    dir,
    customConfig,
    reactProductionProfiling,
    debugPrerender,
    process.pid
  )

  // Check if we have a cached result
  const cachedResult = configCache.get(cacheKey)
  if (cachedResult) {
    // Call the experimental features callback if provided
    if (reportExperimentalFeatures) {
      reportExperimentalFeatures(cachedResult.configuredExperimentalFeatures)
    }

    // Return raw config if requested and available
    if (rawConfig && cachedResult.rawConfig) {
      return cachedResult.rawConfig
    }

    return cachedResult.config
  } else {
    // Reset next.config errors before loading config
    // This happens on every config load to ensure fresh validation
    NextInstanceErrorState.nextConfig = []
  }

  // Original implementation continues below...
  if (!process.env.__NEXT_PRIVATE_RENDER_WORKER) {
    try {
      loadWebpackHook()
    } catch (err) {
      // this can fail in standalone mode as the files
      // aren't traced/included
      if (!process.env.__NEXT_PRIVATE_STANDALONE_CONFIG) {
        throw err
      }
    }
  }

  if (process.env.__NEXT_PRIVATE_STANDALONE_CONFIG) {
    // we don't apply assignDefaults or modifyConfig here as it
    // has already been applied
    const standaloneConfig = JSON.parse(
      process.env.__NEXT_PRIVATE_STANDALONE_CONFIG
    )

    // Cache the standalone config
    configCache.set(cacheKey, {
      config: standaloneConfig,
      rawConfig: standaloneConfig,
      configuredExperimentalFeatures: [],
    })

    return standaloneConfig
  }

  const curLog = silent
    ? {
        warn: () => {},
        info: () => {},
        error: () => {},
      }
    : Log

  loadEnvConfig(dir, phase === PHASE_DEVELOPMENT_SERVER, curLog)

  let configFileName = 'next.config.js'
  const configuredExperimentalFeatures: ConfiguredExperimentalFeature[] = []

  if (customConfig) {
    // Check deprecation warnings on the custom config before merging with defaults
    checkDeprecations(customConfig as NextConfig, configFileName, silent, dir)

    const config = await applyModifyConfig(
      assignDefaultsAndValidate(
        dir,
        {
          configOrigin: 'server',
          configFileName,
          ...customConfig,
        },
        silent,
        phase
      ),
      phase,
      silent
    )

    // Cache the custom config result
    configCache.set(cacheKey, {
      config,
      rawConfig: customConfig,
      configuredExperimentalFeatures,
    })

    reportExperimentalFeatures?.(configuredExperimentalFeatures)

    return config
  }

  const path = await findUp(CONFIG_FILES, { cwd: dir })

  // If config file was found
  if (path?.length) {
    configFileName = basename(path)

    let userConfigModule: any
    try {
      const envBefore = Object.assign({}, process.env)

      // `import()` expects url-encoded strings, so the path must be properly
      // escaped and (especially on Windows) absolute paths must pe prefixed
      // with the `file://` protocol
      if (process.env.__NEXT_TEST_MODE === 'jest') {
        // dynamic import does not currently work inside of vm which
        // jest relies on so we fall back to require for this case
        // https://github.com/nodejs/node/issues/35889
        userConfigModule = require(path)
      } else if (configFileName === 'next.config.ts') {
        userConfigModule = await transpileConfig({
          nextConfigPath: path,
          configFileName,
          cwd: dir,
        })
      } else {
        userConfigModule = await import(pathToFileURL(path).href)
      }
      const newEnv: typeof process.env = {} as any

      for (const key of Object.keys(process.env)) {
        if (envBefore[key] !== process.env[key]) {
          newEnv[key] = process.env[key]
        }
      }
      updateInitialEnv(newEnv)

      if (rawConfig) {
        // Cache the raw config
        configCache.set(cacheKey, {
          config: userConfigModule as NextConfigComplete,
          rawConfig: userConfigModule,
          configuredExperimentalFeatures,
        })

        reportExperimentalFeatures?.(configuredExperimentalFeatures)

        return userConfigModule
      }
    } catch (err) {
      // Capture the error for MCP tool reporting
      NextInstanceErrorState.nextConfig.push(err)

      // TODO: Modify docs to add cases of failing next.config.ts transformation
      curLog.error(
        `Failed to load ${configFileName}, see more info here https://nextjs.org/docs/messages/next-config-error`
      )
      throw err
    }

    const loadedConfig = Object.freeze(
      (await normalizeConfig(
        phase,
        interopDefault(userConfigModule)
      )) as NextConfig
    )

    if (loadedConfig.experimental) {
      for (const name of Object.keys(
        loadedConfig.experimental
      ) as (keyof ExperimentalConfig)[]) {
        const value = loadedConfig.experimental[name]

        if (name.startsWith('turbopack') && !process.env.TURBOPACK) {
          // Ignore any Turbopack config if Turbopack is not enabled
          continue
        }

        addConfiguredExperimentalFeature(
          configuredExperimentalFeatures,
          name,
          value
        )
      }
    }

    // Clone a new userConfig each time to avoid mutating the original
    const userConfig = cloneObject(loadedConfig) as NextConfig

    // Check deprecation warnings on the actual user config before merging with defaults
    checkDeprecations(userConfig, configFileName, silent, dir)

    // Always validate the config against schema in non minimal mode
    if (!process.env.NEXT_MINIMAL && !silent) {
      await validateConfigSchema(
        userConfig,
        configFileName,
        curLog.warn,
        (messages) => {
          // Capture validation messages for MCP error reporting
          if (messages.length > 0) {
            const fullMessage = messages.join('\n')
            NextInstanceErrorState.nextConfig.push(new Error(fullMessage))
          }
        }
      )
    }

    if ((userConfig as any).target && (userConfig as any).target !== 'server') {
      throw new Error(
        `The "target" property is no longer supported in ${configFileName}.\n` +
          'See more info here https://nextjs.org/docs/messages/deprecated-target-config'
      )
    }

    if (reactProductionProfiling) {
      userConfig.reactProductionProfiling = reactProductionProfiling
    }

    if (userConfig.experimental?.useLightningcss) {
      const { loadBindings } =
        require('../build/swc') as typeof import('../build/swc')
      const isLightningSupported = (await loadBindings())?.css?.lightning

      if (!isLightningSupported) {
        curLog.warn(
          `experimental.useLightningcss is set, but the setting is disabled because next-swc/wasm does not support it yet.`
        )
        userConfig.experimental.useLightningcss = false
      }
    }

    // serialize the regex config into string
    if (userConfig?.htmlLimitedBots instanceof RegExp) {
      // @ts-expect-error: override the htmlLimitedBots with default string, type covert: RegExp -> string
      userConfig.htmlLimitedBots = userConfig.htmlLimitedBots.source
    }

    enforceExperimentalFeatures(userConfig, {
      isDefaultConfig: false,
      configuredExperimentalFeatures,
      debugPrerender,
      phase,
    })

    const completeConfig = assignDefaultsAndValidate(
      dir,
      {
        configOrigin: relative(dir, path),
        configFile: path,
        configFileName,
        ...userConfig,
      },
      silent,
      phase
    )

    const finalConfig = await applyModifyConfig(completeConfig, phase, silent)

    // Cache the final result
    configCache.set(cacheKey, {
      config: finalConfig,
      rawConfig: userConfigModule, // Store the original user config module
      configuredExperimentalFeatures,
    })

    if (reportExperimentalFeatures) {
      reportExperimentalFeatures(configuredExperimentalFeatures)
    }

    return finalConfig
  } else {
    const configBaseName = basename(CONFIG_FILES[0], extname(CONFIG_FILES[0]))
    const unsupportedConfig = findUp.sync(
      [
        `${configBaseName}.cjs`,
        `${configBaseName}.cts`,
        // TODO: Remove `as any` once we bump @types/node to v22.10.0+
        ...((process.features as any).typescript ? [] : ['next.config.mts']),
        `${configBaseName}.json`,
        `${configBaseName}.jsx`,
        `${configBaseName}.tsx`,
      ],
      { cwd: dir }
    )
    if (unsupportedConfig?.length) {
      throw new Error(
        `Configuring Next.js via '${basename(
          unsupportedConfig
        )}' is not supported. Please replace the file with 'next.config.js', 'next.config.mjs', or 'next.config.ts'.`
      )
    }
  }

  const clonedDefaultConfig = cloneObject(defaultConfig) as NextConfig

  enforceExperimentalFeatures(clonedDefaultConfig, {
    isDefaultConfig: true,
    configuredExperimentalFeatures,
    debugPrerender,
    phase,
  })

  // always call assignDefaults to ensure settings like
  // reactRoot can be updated correctly even with no next.config.js
  const completeConfig = assignDefaultsAndValidate(
    dir,
    { ...clonedDefaultConfig, configFileName },
    silent,
    phase
  ) as NextConfigComplete

  setHttpClientAndAgentOptions(completeConfig)

  const finalConfig = await applyModifyConfig(completeConfig, phase, silent)

  // Cache the default config result
  configCache.set(cacheKey, {
    config: finalConfig,
    rawConfig: clonedDefaultConfig,
    configuredExperimentalFeatures,
  })

  if (reportExperimentalFeatures) {
    reportExperimentalFeatures(configuredExperimentalFeatures)
  }

  return finalConfig
}

export type ConfiguredExperimentalFeature = {
  key: keyof ExperimentalConfig
  value: ExperimentalConfig[keyof ExperimentalConfig]
  reason?: string
}

function enforceExperimentalFeatures(
  config: NextConfig,
  options: {
    isDefaultConfig: boolean
    configuredExperimentalFeatures: ConfiguredExperimentalFeature[] | undefined
    debugPrerender: boolean | undefined
    phase: PHASE_TYPE
  }
) {
  const {
    configuredExperimentalFeatures,
    debugPrerender,
    isDefaultConfig,
    phase,
  } = options

  config.experimental ??= {}

  if (
    debugPrerender &&
    (phase === PHASE_PRODUCTION_BUILD || phase === PHASE_EXPORT)
  ) {
    // TODO: This is not an experimental feature, but should be enabled alongside other prerender debugging features.
    config.enablePrerenderSourceMaps = true

    setExperimentalFeatureForDebugPrerender(
      config.experimental,
      'serverSourceMaps',
      true,
      configuredExperimentalFeatures
    )

    setExperimentalFeatureForDebugPrerender(
      config.experimental,
      process.env.TURBOPACK ? 'turbopackMinify' : 'serverMinification',
      false,
      configuredExperimentalFeatures
    )

    setExperimentalFeatureForDebugPrerender(
      config.experimental,
      'prerenderEarlyExit',
      false,
      configuredExperimentalFeatures
    )
  }

  // TODO: Remove this once we've made Cache Components the default.
  if (
    process.env.__NEXT_CACHE_COMPONENTS === 'true' &&
    // We do respect an explicit value in the user config.
    (config.cacheComponents === undefined ||
      (isDefaultConfig && !config.cacheComponents))
  ) {
    config.cacheComponents = true
  }

  // TODO: Remove this once using the debug channel is the default.
  if (
    process.env.__NEXT_EXPERIMENTAL_DEBUG_CHANNEL === 'true' &&
    // We do respect an explicit value in the user config.
    (config.experimental.reactDebugChannel === undefined ||
      (isDefaultConfig && !config.experimental.reactDebugChannel))
  ) {
    config.experimental.reactDebugChannel = true

    if (configuredExperimentalFeatures) {
      addConfiguredExperimentalFeature(
        configuredExperimentalFeatures,
        'reactDebugChannel',
        true,
        'enabled by `__NEXT_EXPERIMENTAL_DEBUG_CHANNEL`'
      )
    }
  }

  if (
    process.env.__NEXT_ENABLE_REACT_COMPILER === 'true' &&
    // We do respect an explicit value in the user config.
    (config.reactCompiler === undefined ||
      (isDefaultConfig && !config.reactCompiler))
  ) {
    config.reactCompiler = true
    // TODO: Report if we enable non-experimental features via env
  }
}

function addConfiguredExperimentalFeature<
  KeyType extends keyof ExperimentalConfig,
>(
  configuredExperimentalFeatures: ConfiguredExperimentalFeature[],
  key: KeyType,
  value: ExperimentalConfig[KeyType],
  reason?: string
) {
  if (value !== (defaultConfig.experimental as Record<string, unknown>)[key]) {
    configuredExperimentalFeatures.push({ key, value, reason })
  }
}

function setExperimentalFeatureForDebugPrerender<
  KeyType extends keyof ExperimentalConfig,
>(
  experimentalConfig: ExperimentalConfig,
  key: KeyType,
  value: ExperimentalConfig[KeyType],
  configuredExperimentalFeatures: ConfiguredExperimentalFeature[] | undefined
) {
  if (experimentalConfig[key] !== value) {
    experimentalConfig[key] = value

    if (configuredExperimentalFeatures) {
      const action =
        value === true ? 'enabled' : value === false ? 'disabled' : 'set'

      const reason = `${action} by \`--debug-prerender\``

      addConfiguredExperimentalFeature(
        configuredExperimentalFeatures,
        key,
        value,
        reason
      )
    }
  }
}

function cloneObject(obj: any): any {
  // Primitives & null
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  // RegExp → clone via constructor
  if (obj instanceof RegExp) {
    return new RegExp(obj.source, obj.flags)
  }

  // Function → just reuse the function reference
  if (typeof obj === 'function') {
    return obj
  }

  // Arrays → map each element
  if (Array.isArray(obj)) {
    return obj.map(cloneObject)
  }

  // Detect non‑plain objects (class instances)
  const proto = Object.getPrototypeOf(obj)
  const isPlainObject = proto === Object.prototype || proto === null

  // If it's not a plain object, just return the original
  if (!isPlainObject) {
    return obj
  }

  // Plain object → create a new object with the same prototype
  // and copy all properties, cloning data properties and keeping
  // accessor properties (getters/setters) as‑is.
  const result = Object.create(proto)
  for (const key of Reflect.ownKeys(obj)) {
    const descriptor = Object.getOwnPropertyDescriptor(obj, key)

    if (descriptor && (descriptor.get || descriptor.set)) {
      // Accessor property → copy descriptor as‑is (get/set functions)
      Object.defineProperty(result, key, descriptor)
    } else {
      // Data property → clone the value
      result[key] = cloneObject(obj[key])
    }
  }

  return result
}

async function validateConfigSchema(
  userConfig: NextConfig,
  configFileName: string,
  warn: (message: string) => void,
  onValidationMessages?: (messages: string[]) => void
) {
  // We only validate the config against schema in non minimal mode
  const { configSchema } =
    require('./config-schema') as typeof import('./config-schema')
  const state = configSchema.safeParse(userConfig)

  if (!state.success) {
    const [warnings, fatalErrors] = normalizeNextConfigZodErrors(state.error)
    const hasFatalErrors = fatalErrors.length > 0

    // Group warnings first
    if (warnings.length > 0) {
      const warningMessages = [`Invalid ${configFileName} options detected: `]

      for (const error of warnings) {
        warningMessages.push(`    ${error.split('\n').join('\n    ')}`)
      }

      warningMessages.push(
        'See more info here: https://nextjs.org/docs/messages/invalid-next-config'
      )

      // Call the callback with validation messages if provided
      if (onValidationMessages) {
        onValidationMessages(warningMessages)
      }

      for (const message of warningMessages) {
        warn(message)
      }
    }

    // Then throw hard errors
    if (hasFatalErrors) {
      await flushTelemetry()

      const errorMessages = [
        `Fatal next config errors found in ${configFileName} that must be fixed:`,
      ]

      for (const error of fatalErrors) {
        errorMessages.push(`    ${error.split('\n').join('\n    ')}`)
      }

      errorMessages.push(
        'These configuration options are required or have been migrated. Please update your configuration.'
      )
      errorMessages.push(
        'See more info here: https://nextjs.org/docs/messages/invalid-next-config'
      )

      // Call the callback with validation messages if provided
      if (onValidationMessages) {
        onValidationMessages(errorMessages)
      }

      const fullErrorMessage = errorMessages.join('\n')
      throw new Error(fullErrorMessage)
    }
  }
}
