import { existsSync } from 'fs'
import { basename, extname, join, relative, isAbsolute, resolve } from 'path'
import { pathToFileURL } from 'url'
import findUp from 'next/dist/compiled/find-up'
import * as Log from '../build/output/log'
import { CONFIG_FILES, PHASE_DEVELOPMENT_SERVER } from '../shared/lib/constants'
import { defaultConfig, normalizeConfig } from './config-shared'
import type {
  ExperimentalConfig,
  NextConfigComplete,
  NextConfig,
  TurboLoaderItem,
} from './config-shared'

import { loadWebpackHook } from './config-utils'
import { imageConfigDefault } from '../shared/lib/image-config'
import type { ImageConfig } from '../shared/lib/image-config'
import { loadEnvConfig, updateInitialEnv } from '@next/env'
import { flushAndExit } from '../telemetry/flush-and-exit'
import { findRootDir } from '../lib/find-root'
import { setHttpClientAndAgentOptions } from './setup-http-agent-env'
import { pathHasPrefix } from '../shared/lib/router/utils/path-has-prefix'
import { matchRemotePattern } from '../shared/lib/match-remote-pattern'

import { ZodParsedType, util as ZodUtil } from 'next/dist/compiled/zod'
import type { ZodError, ZodIssue } from 'next/dist/compiled/zod'
import { hasNextSupport } from '../telemetry/ci-info'

export { normalizeConfig } from './config-shared'
export type { DomainLocale, NextConfig } from './config-shared'

function processZodErrorMessage(issue: ZodIssue) {
  let message = issue.message

  let path = ''

  if (issue.path.length > 0) {
    if (issue.path.length === 1) {
      const identifier = issue.path[0]
      if (typeof identifier === 'number') {
        // The first identifier inside path is a number
        path = `index ${identifier}`
      } else {
        path = `"${identifier}"`
      }
    } else {
      // joined path to be shown in the error message
      path = `"${issue.path.reduce<string>((acc, cur) => {
        if (typeof cur === 'number') {
          // array index
          return `${acc}[${cur}]`
        }
        if (cur.includes('"')) {
          // escape quotes
          return `${acc}["${cur.replaceAll('"', '\\"')}"]`
        }
        // dot notation
        const separator = acc.length === 0 ? '' : '.'
        return acc + separator + cur
      }, '')}"`
    }
  }

  if (
    issue.code === 'invalid_type' &&
    issue.received === ZodParsedType.undefined
  ) {
    // missing key in object
    return `${path} is missing, expected ${issue.expected}`
  }
  if (issue.code === 'invalid_enum_value') {
    // Remove "Invalid enum value" prefix from zod default error message
    return `Expected ${ZodUtil.joinValues(issue.options)}, received '${
      issue.received
    }' at ${path}`
  }

  return message + (path ? ` at ${path}` : '')
}

function normalizeZodErrors(
  error: ZodError<NextConfig>
): [errorMessages: string[], shouldExit: boolean] {
  let shouldExit = false
  return [
    error.issues.flatMap((issue) => {
      const messages = [processZodErrorMessage(issue)]
      if (issue.path[0] === 'images') {
        // We exit the build when encountering an error in the images config
        shouldExit = true
      }

      if ('unionErrors' in issue) {
        issue.unionErrors
          .map(normalizeZodErrors)
          .forEach(([unionMessages, unionShouldExit]) => {
            messages.push(...unionMessages)
            // If any of the union results shows exit the build, we exit the build
            shouldExit = shouldExit || unionShouldExit
          })
      }

      return messages
    }),
    shouldExit,
  ]
}

export function warnOptionHasBeenDeprecated(
  config: NextConfig,
  nestedPropertyKey: string,
  reason: string,
  silent: boolean
) {
  if (!silent) {
    let current = config
    let found = true
    const nestedPropertyKeys = nestedPropertyKey.split('.')
    for (const key of nestedPropertyKeys) {
      if (current[key] !== undefined) {
        current = current[key]
      } else {
        found = false
        break
      }
    }
    if (found) {
      Log.warn(reason)
    }
  }
}

export function warnOptionHasBeenMovedOutOfExperimental(
  config: NextConfig,
  oldKey: string,
  newKey: string,
  configFileName: string,
  silent: boolean
) {
  if (config.experimental && oldKey in config.experimental) {
    if (!silent) {
      Log.warn(
        `\`${oldKey}\` has been moved out of \`experimental\`` +
          (newKey.includes('.') ? ` and into \`${newKey}\`` : '') +
          `. Please update your ${configFileName} file accordingly.`
      )
    }

    let current = config
    const newKeys = newKey.split('.')
    while (newKeys.length > 1) {
      const key = newKeys.shift()!
      current[key] = current[key] || {}
      current = current[key]
    }
    current[newKeys.shift()!] = (config.experimental as any)[oldKey]
  }

  return config
}

function assignDefaults(
  dir: string,
  userConfig: { [key: string]: any },
  silent: boolean
) {
  const configFileName = userConfig.configFileName
  if (typeof userConfig.exportTrailingSlash !== 'undefined') {
    if (!silent) {
      Log.warn(
        `The "exportTrailingSlash" option has been renamed to "trailingSlash". Please update your ${configFileName}.`
      )
    }
    if (typeof userConfig.trailingSlash === 'undefined') {
      userConfig.trailingSlash = userConfig.exportTrailingSlash
    }
    delete userConfig.exportTrailingSlash
  }

  const config = Object.keys(userConfig).reduce<{ [key: string]: any }>(
    (currentConfig, key) => {
      const value = userConfig[key]

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

      if (!!value && value.constructor === Object) {
        currentConfig[key] = {
          ...defaultConfig[key],
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
  )

  // TODO: remove once we've made PPR default
  // If this was defaulted to true, it implies that the configuration was
  // overridden for testing to be defaulted on.
  if (defaultConfig.experimental?.ppr) {
    Log.warn(
      `\`experimental.ppr\` has been defaulted to \`true\` because \`__NEXT_EXPERIMENTAL_PPR\` was set to \`true\` during testing.`
    )
  }

  const result = { ...defaultConfig, ...config }

  if (
    result.experimental?.ppr &&
    !process.env.__NEXT_VERSION!.includes('canary') &&
    !process.env.__NEXT_TEST_MODE
  ) {
    throw new Error(
      `The experimental.ppr preview feature can only be enabled when using the latest canary version of Next.js. See more info here: https://nextjs.org/docs/messages/ppr-preview`
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

  // TODO: remove after next minor (current v13.1.1)
  if (Array.isArray(result.experimental?.outputFileTracingIgnores)) {
    if (!result.experimental) {
      result.experimental = {}
    }
    if (!result.experimental.outputFileTracingExcludes) {
      result.experimental.outputFileTracingExcludes = {}
    }
    if (!result.experimental.outputFileTracingExcludes['**/*']) {
      result.experimental.outputFileTracingExcludes['**/*'] = []
    }
    result.experimental.outputFileTracingExcludes['**/*'].push(
      ...(result.experimental.outputFileTracingIgnores || [])
    )
    Log.warn(
      `\`outputFileTracingIgnores\` has been moved to \`experimental.outputFileTracingExcludes\`. Please update your ${configFileName} file accordingly.`
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

      if (result.amp?.canonicalBase === '') {
        result.amp.canonicalBase = result.basePath
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

    if (images.remotePatterns) {
      if (!Array.isArray(images.remotePatterns)) {
        throw new Error(
          `Specified images.remotePatterns should be an Array received ${typeof images.remotePatterns}.\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config`
        )
      }

      // static images are automatically prefixed with assetPrefix
      // so we need to ensure _next/image allows downloading from
      // this resource
      if (config.assetPrefix?.startsWith('http')) {
        try {
          const url = new URL(config.assetPrefix)
          const hasMatchForAssetPrefix = images.remotePatterns.some((pattern) =>
            matchRemotePattern(pattern, url)
          )

          // avoid double-pushing the same remote if it already can be matched
          if (!hasMatchForAssetPrefix) {
            images.remotePatterns?.push({
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

  if (result.experimental?.incrementalCacheHandlerPath) {
    // TODO: Remove this warning in Next.js 15
    warnOptionHasBeenDeprecated(
      result,
      'experimental.incrementalCacheHandlerPath',
      'The "experimental.incrementalCacheHandlerPath" option has been renamed to "cacheHandler". Please update your next.config.js.',
      silent
    )
  }

  if (result.experimental?.isrMemoryCacheSize) {
    // TODO: Remove this warning in Next.js 15
    warnOptionHasBeenDeprecated(
      result,
      'experimental.isrMemoryCacheSize',
      'The "experimental.isrMemoryCacheSize" option has been renamed to "cacheMaxMemorySize". Please update your next.config.js.',
      silent
    )
  }

  if (typeof result.experimental?.serverActions === 'boolean') {
    // TODO: Remove this warning in Next.js 15
    warnOptionHasBeenDeprecated(
      result,
      'experimental.serverActions',
      'Server Actions are available by default now, `experimental.serverActions` option can be safely removed.',
      silent
    )
  }

  if (result.swcMinify === false) {
    // TODO: Remove this warning in Next.js 15
    warnOptionHasBeenDeprecated(
      result,
      'swcMinify',
      'Disabling SWC Minifer will not be an option in the next major version. Please report any issues you may be experiencing to https://github.com/vercel/next.js/issues',
      silent
    )
  }

  if (result.outputFileTracing === false) {
    // TODO: Remove this warning in Next.js 15
    warnOptionHasBeenDeprecated(
      result,
      'outputFileTracing',
      'Disabling outputFileTracing will not be an option in the next major version. Please report any issues you may be experiencing to https://github.com/vercel/next.js/issues',
      silent
    )
  }

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
        'Server Actions Size Limit must be a valid number or filesize format lager than 1MB: https://nextjs.org/docs/app/api-reference/functions/server-actions#size-limitation'
      )
    }
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
    result.experimental?.outputFileTracingRoot &&
    !isAbsolute(result.experimental.outputFileTracingRoot)
  ) {
    result.experimental.outputFileTracingRoot = resolve(
      result.experimental.outputFileTracingRoot
    )
    if (!silent) {
      Log.warn(
        `experimental.outputFileTracingRoot should be absolute, using: ${result.experimental.outputFileTracingRoot}`
      )
    }
  }

  // only leverage deploymentId
  if (result.experimental?.useDeploymentId && process.env.NEXT_DEPLOYMENT_ID) {
    if (!result.experimental) {
      result.experimental = {}
    }
    result.experimental.deploymentId = process.env.NEXT_DEPLOYMENT_ID
  }

  // can't use this one without the other
  if (result.experimental?.useDeploymentIdServerActions) {
    result.experimental.useDeploymentId = true
  }

  // use the closest lockfile as tracing root
  if (!result.experimental?.outputFileTracingRoot) {
    let rootDir = findRootDir(dir)

    if (rootDir) {
      if (!result.experimental) {
        result.experimental = {}
      }
      if (!defaultConfig.experimental) {
        defaultConfig.experimental = {}
      }
      result.experimental.outputFileTracingRoot = rootDir
      defaultConfig.experimental.outputFileTracingRoot =
        result.experimental.outputFileTracingRoot
    }
  }

  if (result.output === 'standalone' && !result.outputFileTracing) {
    if (!silent) {
      Log.warn(
        `"output: 'standalone'" requires outputFileTracing not be disabled please enable it to leverage the standalone build`
      )
    }
    result.output = undefined
  }

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

  if (result.devIndicators?.buildActivityPosition) {
    const { buildActivityPosition } = result.devIndicators
    const allowedValues = [
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ]

    if (!allowedValues.includes(buildActivityPosition)) {
      throw new Error(
        `Invalid "devIndicator.buildActivityPosition" provided, expected one of ${allowedValues.join(
          ', '
        )}, received ${buildActivityPosition}`
      )
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
    'next/server': {
      transform: 'next/dist/server/web/exports/{{ kebabCase member }}',
    },
  }

  const userProvidedOptimizePackageImports =
    result.experimental?.optimizePackageImports || []
  if (!result.experimental) {
    result.experimental = {}
  }
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

  return result
}

export default async function loadConfig(
  phase: string,
  dir: string,
  {
    customConfig,
    rawConfig,
    silent = true,
    onLoadUserConfig,
  }: {
    customConfig?: object | null
    rawConfig?: boolean
    silent?: boolean
    onLoadUserConfig?: (conf: NextConfig) => void
  } = {}
): Promise<NextConfigComplete> {
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
    return JSON.parse(process.env.__NEXT_PRIVATE_STANDALONE_CONFIG)
  }

  // For the render worker, we directly return the serialized config from the
  // parent worker (router worker) to avoid loading it again.
  // This is because loading the config might be expensive especiall when people
  // have Webpack plugins added.
  // Because of this change, unserializable fields like `.webpack` won't be
  // existing here but the render worker shouldn't use these as well.
  if (process.env.__NEXT_PRIVATE_RENDER_WORKER_CONFIG) {
    return JSON.parse(process.env.__NEXT_PRIVATE_RENDER_WORKER_CONFIG)
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

  if (customConfig) {
    return assignDefaults(
      dir,
      {
        configOrigin: 'server',
        configFileName,
        ...customConfig,
      },
      silent
    ) as NextConfigComplete
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
        return userConfigModule
      }
    } catch (err) {
      curLog.error(
        `Failed to load ${configFileName}, see more info here https://nextjs.org/docs/messages/next-config-error`
      )
      throw err
    }
    const userConfig = await normalizeConfig(
      phase,
      userConfigModule.default || userConfigModule
    )

    if (!process.env.NEXT_MINIMAL) {
      // We only validate the config against schema in non minimal mode
      const { configSchema } =
        require('./config-schema') as typeof import('./config-schema')
      const state = configSchema.safeParse(userConfig)

      if (!state.success) {
        // error message header
        const messages = [`Invalid ${configFileName} options detected: `]

        const [errorMessages, shouldExit] = normalizeZodErrors(state.error)
        // ident list item
        for (const error of errorMessages) {
          messages.push(`    ${error}`)
        }

        // error message footer
        messages.push(
          'See more info here: https://nextjs.org/docs/messages/invalid-next-config'
        )

        if (shouldExit) {
          for (const message of messages) {
            console.error(message)
          }
          await flushAndExit(1)
        } else {
          for (const message of messages) {
            curLog.warn(message)
          }
        }
      }
    }

    if (userConfig.target && userConfig.target !== 'server') {
      throw new Error(
        `The "target" property is no longer supported in ${configFileName}.\n` +
          'See more info here https://nextjs.org/docs/messages/deprecated-target-config'
      )
    }

    if (userConfig.amp?.canonicalBase) {
      const { canonicalBase } = userConfig.amp || ({} as any)
      userConfig.amp = userConfig.amp || {}
      userConfig.amp.canonicalBase =
        (canonicalBase.endsWith('/')
          ? canonicalBase.slice(0, -1)
          : canonicalBase) || ''
    }

    if (
      userConfig.experimental?.turbo?.loaders &&
      !userConfig.experimental?.turbo?.rules
    ) {
      curLog.warn(
        'experimental.turbo.loaders is now deprecated. Please update next.config.js to use experimental.turbo.rules as soon as possible.\n' +
          'The new option is similar, but the key should be a glob instead of an extension.\n' +
          'Example: loaders: { ".mdx": ["mdx-loader"] } -> rules: { "*.mdx": ["mdx-loader"] }" }\n' +
          'See more info here https://nextjs.org/docs/app/api-reference/next-config-js/turbo'
      )

      const rules: Record<string, TurboLoaderItem[]> = {}
      for (const [ext, loaders] of Object.entries(
        userConfig.experimental.turbo.loaders
      )) {
        rules['*' + ext] = loaders as TurboLoaderItem[]
      }

      userConfig.experimental.turbo.rules = rules
    }

    onLoadUserConfig?.(userConfig)
    const completeConfig = assignDefaults(
      dir,
      {
        configOrigin: relative(dir, path),
        configFile: path,
        configFileName,
        ...userConfig,
      },
      silent
    ) as NextConfigComplete
    return completeConfig
  } else {
    const configBaseName = basename(CONFIG_FILES[0], extname(CONFIG_FILES[0]))
    const nonJsPath = findUp.sync(
      [
        `${configBaseName}.jsx`,
        `${configBaseName}.ts`,
        `${configBaseName}.tsx`,
        `${configBaseName}.json`,
      ],
      { cwd: dir }
    )
    if (nonJsPath?.length) {
      throw new Error(
        `Configuring Next.js via '${basename(
          nonJsPath
        )}' is not supported. Please replace the file with 'next.config.js' or 'next.config.mjs'.`
      )
    }
  }

  // always call assignDefaults to ensure settings like
  // reactRoot can be updated correctly even with no next.config.js
  const completeConfig = assignDefaults(
    dir,
    defaultConfig,
    silent
  ) as NextConfigComplete
  completeConfig.configFileName = configFileName
  setHttpClientAndAgentOptions(completeConfig)
  return completeConfig
}

export function getEnabledExperimentalFeatures(
  userNextConfigExperimental: NextConfig['experimental']
) {
  const enabledExperiments: (keyof ExperimentalConfig)[] = []

  if (!userNextConfigExperimental) return enabledExperiments

  // defaultConfig.experimental is predefined and will never be undefined
  // This is only a type guard for the typescript
  if (defaultConfig.experimental) {
    for (const featureName of Object.keys(
      userNextConfigExperimental
    ) as (keyof ExperimentalConfig)[]) {
      if (
        featureName in defaultConfig.experimental &&
        userNextConfigExperimental[featureName] !==
          defaultConfig.experimental[featureName]
      ) {
        enabledExperiments.push(featureName)
      }
    }
  }
  return enabledExperiments
}
