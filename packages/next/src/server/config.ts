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

import type { ZodError } from 'next/dist/compiled/zod'
import { hasNextSupport } from '../server/ci-info'
import { transpileConfig } from '../build/next-config-ts/transpile-config'
import { dset } from '../shared/lib/dset'
import { normalizeZodErrors } from '../shared/lib/zod'
import { HTML_LIMITED_BOT_UA_RE_STRING } from '../shared/lib/router/utils/is-bot'

export { normalizeConfig } from './config-shared'
export type { DomainLocale, NextConfig } from './config-shared'

function normalizeNextConfigZodErrors(
  error: ZodError<NextConfig>
): [errorMessages: string[], shouldExit: boolean] {
  let shouldExit = false
  const issues = normalizeZodErrors(error)
  return [
    issues.flatMap(({ issue, message }) => {
      if (issue.path[0] === 'images') {
        // We exit the build when encountering an error in the images config
        shouldExit = true
      }

      return message
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
      current[key] = current[key] || {}
      current = current[key]
    }
    current[newKeys.shift()!] = (config.experimental as any)[oldExperimentalKey]
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
    current = current[seg]
  }

  if (!silent && current !== defaultValue) {
    Log.warn(
      `The "${key}" option has been modified. ${customMessage ? customMessage + '. ' : ''}It should be removed from your ${configFileName}.`
    )
  }
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

  // TODO: remove these once we've made PPR default
  // If this was defaulted to true, it implies that the configuration was
  // overridden for testing to be defaulted on.
  if (defaultConfig.experimental?.ppr) {
    Log.warn(
      `\`experimental.ppr\` has been defaulted to \`true\` because \`__NEXT_EXPERIMENTAL_PPR\` was set to \`true\` during testing.`
    )
  }

  const result = { ...defaultConfig, ...config }

  if (
    result.experimental?.allowDevelopmentBuild &&
    process.env.NODE_ENV !== 'development'
  ) {
    throw new Error(
      `The experimental.allowDevelopmentBuild option requires NODE_ENV to be explicitly set to 'development'.`
    )
  }

  if (
    !process.env.__NEXT_VERSION?.includes('canary') &&
    !process.env.__NEXT_TEST_MODE &&
    !process.env.NEXT_PRIVATE_LOCAL_DEV
  ) {
    // Prevents usage of certain experimental features outside of canary
    if (result.experimental?.ppr) {
      throw new CanaryOnlyError('experimental.ppr')
    } else if (result.experimental?.dynamicIO) {
      throw new CanaryOnlyError('experimental.dynamicIO')
    } else if (result.experimental?.turbo?.unstablePersistentCaching) {
      throw new CanaryOnlyError('experimental.turbo.unstablePersistentCaching')
    }
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

  warnOptionHasBeenDeprecated(
    result,
    'experimental.instrumentationHook',
    `\`experimental.instrumentationHook\` is no longer needed, because \`instrumentation.js\` is available by default. You can remove it from ${configFileName}.`,
    silent
  )

  warnOptionHasBeenDeprecated(
    result,
    'experimental.after',
    `\`experimental.after\` is no longer needed, because \`after\` is available by default. You can remove it from ${configFileName}.`,
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

  if (
    result?.experimental?.turbo?.root &&
    !isAbsolute(result.experimental.turbo.root)
  ) {
    result.experimental.turbo.root = resolve(result.experimental.turbo.root)
    if (!silent) {
      Log.warn(
        `experimental.turbo.root should be absolute, using: ${result.experimental.turbo.root}`
      )
    }
  }

  // only leverage deploymentId
  if (process.env.NEXT_DEPLOYMENT_ID) {
    result.deploymentId = process.env.NEXT_DEPLOYMENT_ID
  }

  if (result?.outputFileTracingRoot && !result?.experimental?.turbo?.root) {
    dset(
      result,
      ['experimental', 'turbo', 'root'],
      result.outputFileTracingRoot
    )
  }

  // use the closest lockfile as tracing root
  if (!result?.outputFileTracingRoot || !result?.experimental?.turbo?.root) {
    let rootDir = findRootDir(dir)

    if (rootDir) {
      if (!result?.outputFileTracingRoot) {
        result.outputFileTracingRoot = rootDir
        defaultConfig.outputFileTracingRoot = result.outputFileTracingRoot
      }

      if (!result?.experimental?.turbo?.root) {
        dset(result, ['experimental', 'turbo', 'root'], rootDir)
        dset(defaultConfig, ['experimental', 'turbo', 'root'], rootDir)
      }
    }
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

  if (result.experimental) {
    result.experimental.cacheLife = {
      ...defaultConfig.experimental?.cacheLife,
      ...result.experimental.cacheLife,
    }
    const defaultDefault = defaultConfig.experimental?.cacheLife?.['default']
    if (
      !defaultDefault ||
      defaultDefault.revalidate === undefined ||
      defaultDefault.expire === undefined ||
      !defaultConfig.experimental?.staleTimes?.static
    ) {
      throw new Error('No default cacheLife profile.')
    }
    const defaultCacheLifeProfile = result.experimental.cacheLife['default']
    if (!defaultCacheLifeProfile) {
      result.experimental.cacheLife['default'] = defaultDefault
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
    // This is the most dynamic cache life profile.
    const secondsCacheLifeProfile = result.experimental.cacheLife['seconds']
    if (
      secondsCacheLifeProfile &&
      secondsCacheLifeProfile.stale === undefined
    ) {
      // We default this to whatever stale time you had configured for dynamic content.
      // Since this is basically a dynamic cache life profile.
      const dynamicStaleTime = result.experimental.staleTimes?.dynamic
      secondsCacheLifeProfile.stale =
        dynamicStaleTime ?? defaultConfig.experimental?.staleTimes?.dynamic
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
      if (!allowedHandlerNameRegex.test(key)) {
        invalidHandlerItems.push({
          key,
          reason: 'key must only use characters a-z and -',
        })
      } else {
        const handlerPath = result.experimental.cacheHandlers[key]

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
  if (!result.experimental) {
    result.experimental = {}
  }

  // TODO(jiwon): remove once we've made new UI default
  if (process.env.__NEXT_EXPERIMENTAL_NEW_DEV_OVERLAY === 'false') {
    result.experimental.newDevOverlay = false
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
      '@effect/sql-squlite-node',
      '@effect/sql-squlite-bun',
      '@effect/sql-squlite-wasm',
      '@effect/sql-squlite-react-native',
      '@effect/sql-squlite-wasm',
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

  if (!result.experimental.htmlLimitedBots) {
    // @ts-expect-error: override the htmlLimitedBots with default string, type covert: RegExp -> string
    result.experimental.htmlLimitedBots = HTML_LIMITED_BOT_UA_RE_STRING
  }

  // "use cache" was originally implicitly enabled with the dynamicIO flag, so
  // we transfer the value for dynamicIO to the explicit useCache flag to ensure
  // backwards compatibility.
  if (result.experimental.useCache === undefined) {
    result.experimental.useCache = result.experimental.dynamicIO
  }

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
    reactProductionProfiling,
  }: {
    customConfig?: object | null
    rawConfig?: boolean
    silent?: boolean
    onLoadUserConfig?: (conf: NextConfig) => void
    reactProductionProfiling?: boolean
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

  if (process.env.__NEXT_TEST_MODE) {
    if (path) {
      Log.info(`Loading config from ${path}`)
    } else {
      Log.info('No config file found')
    }
  }

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
        return userConfigModule
      }
    } catch (err) {
      // TODO: Modify docs to add cases of failing next.config.ts transformation
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

      if (state.success === false) {
        // error message header
        const messages = [`Invalid ${configFileName} options detected: `]

        const [errorMessages, shouldExit] = normalizeNextConfigZodErrors(
          state.error
        )
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

    if (reactProductionProfiling) {
      userConfig.reactProductionProfiling = reactProductionProfiling
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

    if (userConfig.experimental?.useLightningcss) {
      const { loadBindings } = require('next/dist/build/swc')
      const isLightningSupported = (await loadBindings())?.css?.lightning

      if (!isLightningSupported) {
        curLog.warn(
          `experimental.useLightningcss is set, but the setting is disabled because next-swc/wasm does not support it yet.`
        )
        userConfig.experimental.useLightningcss = false
      }
    }

    // serialize the regex config into string
    if (userConfig.experimental?.htmlLimitedBots instanceof RegExp) {
      userConfig.experimental.htmlLimitedBots =
        userConfig.experimental.htmlLimitedBots.source
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
    const unsupportedConfig = findUp.sync(
      [
        `${configBaseName}.cjs`,
        `${configBaseName}.cts`,
        `${configBaseName}.mts`,
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

export type ConfiguredExperimentalFeature =
  | { name: keyof ExperimentalConfig; type: 'boolean'; value: boolean }
  | { name: keyof ExperimentalConfig; type: 'number'; value: number }
  | { name: keyof ExperimentalConfig; type: 'other' }

export function getConfiguredExperimentalFeatures(
  userNextConfigExperimental: NextConfig['experimental']
) {
  const configuredExperimentalFeatures: ConfiguredExperimentalFeature[] = []

  if (!userNextConfigExperimental) {
    return configuredExperimentalFeatures
  }

  // defaultConfig.experimental is predefined and will never be undefined
  // This is only a type guard for the typescript
  if (defaultConfig.experimental) {
    for (const name of Object.keys(
      userNextConfigExperimental
    ) as (keyof ExperimentalConfig)[]) {
      const value = userNextConfigExperimental[name]

      if (name === 'turbo' && !process.env.TURBOPACK) {
        // Ignore any Turbopack config if Turbopack is not enabled
        continue
      }

      if (
        name in defaultConfig.experimental &&
        value !== defaultConfig.experimental[name]
      ) {
        configuredExperimentalFeatures.push(
          typeof value === 'boolean'
            ? { name, type: 'boolean', value }
            : typeof value === 'number'
              ? { name, type: 'number', value }
              : { name, type: 'other' }
        )
      }
    }
  }
  return configuredExperimentalFeatures
}

class CanaryOnlyError extends Error {
  constructor(feature: string) {
    super(
      `The experimental feature "${feature}" can only be enabled when using the latest canary version of Next.js.`
    )
    // This error is meant to interrupt the server start/build process
    // but the stack trace isn't meaningful, as it points to internal code.
    this.stack = undefined
  }
}
