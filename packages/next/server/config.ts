import chalk from 'chalk'
import findUp from 'next/dist/compiled/find-up'
import { basename, extname } from 'path'
import * as Log from '../build/output/log'
import { hasNextSupport } from '../telemetry/ci-info'
import { CONFIG_FILE, PHASE_DEVELOPMENT_SERVER } from '../shared/lib/constants'
import { execOnce } from '../shared/lib/utils'
import {
  defaultConfig,
  NextConfigComplete,
  normalizeConfig,
} from './config-shared'
import { loadWebpackHook } from './config-utils'
import { ImageConfig, imageConfigDefault, VALID_LOADERS } from './image-config'
import { loadEnvConfig } from '@next/env'

export { DomainLocale, NextConfig, normalizeConfig } from './config-shared'

const targets = ['server', 'serverless', 'experimental-serverless-trace']

const experimentalWarning = execOnce(() => {
  Log.warn(chalk.bold('You have enabled experimental feature(s).'))
  Log.warn(
    `Experimental features are not covered by semver, and may cause unexpected or broken application behavior. ` +
      `Use them at your own risk.`
  )
  console.warn()
})

function assignDefaults(userConfig: { [key: string]: any }) {
  if (typeof userConfig.exportTrailingSlash !== 'undefined') {
    console.warn(
      chalk.yellow.bold('Warning: ') +
        'The "exportTrailingSlash" option has been renamed to "trailingSlash". Please update your next.config.js.'
    )
    if (typeof userConfig.trailingSlash === 'undefined') {
      userConfig.trailingSlash = userConfig.exportTrailingSlash
    }
    delete userConfig.exportTrailingSlash
  }

  if (typeof userConfig.experimental?.reactMode !== 'undefined') {
    console.warn(
      chalk.yellow.bold('Warning: ') +
        'The experimental "reactMode" option has been replaced with "reactRoot". Please update your next.config.js.'
    )
    if (typeof userConfig.experimental?.reactRoot === 'undefined') {
      userConfig.experimental.reactRoot = ['concurrent', 'blocking'].includes(
        userConfig.experimental.reactMode
      )
    }
    delete userConfig.experimental.reactMode
  }

  const config = Object.keys(userConfig).reduce<{ [key: string]: any }>(
    (currentConfig, key) => {
      const value = userConfig[key]

      if (value === undefined || value === null) {
        return currentConfig
      }

      if (
        key === 'experimental' &&
        value !== undefined &&
        value !== defaultConfig[key]
      ) {
        experimentalWarning()
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

  const result = { ...defaultConfig, ...config }

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
    const images: Partial<ImageConfig> = result.images

    if (typeof images !== 'object') {
      throw new Error(
        `Specified images should be an object received ${typeof images}.\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config`
      )
    }

    if (images.domains) {
      if (!Array.isArray(images.domains)) {
        throw new Error(
          `Specified images.domains should be an Array received ${typeof images.domains}.\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config`
        )
      }

      if (images.domains.length > 50) {
        throw new Error(
          `Specified images.domains exceeds length of 50, received length (${images.domains.length}), please reduce the length of the array to continue.\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config`
        )
      }

      const invalid = images.domains.filter(
        (d: unknown) => typeof d !== 'string'
      )
      if (invalid.length > 0) {
        throw new Error(
          `Specified images.domains should be an Array of strings received invalid values (${invalid.join(
            ', '
          )}).\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config`
        )
      }
    }
    if (images.deviceSizes) {
      const { deviceSizes } = images
      if (!Array.isArray(deviceSizes)) {
        throw new Error(
          `Specified images.deviceSizes should be an Array received ${typeof deviceSizes}.\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config`
        )
      }

      if (deviceSizes.length > 25) {
        throw new Error(
          `Specified images.deviceSizes exceeds length of 25, received length (${deviceSizes.length}), please reduce the length of the array to continue.\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config`
        )
      }

      const invalid = deviceSizes.filter((d: unknown) => {
        return typeof d !== 'number' || d < 1 || d > 10000
      })

      if (invalid.length > 0) {
        throw new Error(
          `Specified images.deviceSizes should be an Array of numbers that are between 1 and 10000, received invalid values (${invalid.join(
            ', '
          )}).\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config`
        )
      }
    }
    if (images.imageSizes) {
      const { imageSizes } = images
      if (!Array.isArray(imageSizes)) {
        throw new Error(
          `Specified images.imageSizes should be an Array received ${typeof imageSizes}.\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config`
        )
      }

      if (imageSizes.length > 25) {
        throw new Error(
          `Specified images.imageSizes exceeds length of 25, received length (${imageSizes.length}), please reduce the length of the array to continue.\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config`
        )
      }

      const invalid = imageSizes.filter((d: unknown) => {
        return typeof d !== 'number' || d < 1 || d > 10000
      })

      if (invalid.length > 0) {
        throw new Error(
          `Specified images.imageSizes should be an Array of numbers that are between 1 and 10000, received invalid values (${invalid.join(
            ', '
          )}).\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config`
        )
      }
    }

    if (!images.loader) {
      images.loader = 'default'
    }

    if (!VALID_LOADERS.includes(images.loader)) {
      throw new Error(
        `Specified images.loader should be one of (${VALID_LOADERS.join(
          ', '
        )}), received invalid value (${
          images.loader
        }).\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config`
      )
    }

    // Append trailing slash for non-default loaders
    if (images.path) {
      if (
        images.loader !== 'default' &&
        images.path[images.path.length - 1] !== '/'
      ) {
        images.path += '/'
      }
    }

    if (images.path === imageConfigDefault.path && result.basePath) {
      images.path = `${result.basePath}${images.path}`
    }

    if (
      images.minimumCacheTTL &&
      (!Number.isInteger(images.minimumCacheTTL) || images.minimumCacheTTL < 0)
    ) {
      throw new Error(
        `Specified images.minimumCacheTTL should be an integer 0 or more
          ', '
        )}), received  (${images.minimumCacheTTL}).\nSee more info here: https://nextjs.org/docs/messages/invalid-images-config`
      )
    }
  }

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

  return result
}

export default async function loadConfig(
  phase: string,
  dir: string,
  customConfig?: object | null
): Promise<NextConfigComplete> {
  await loadEnvConfig(dir, phase === PHASE_DEVELOPMENT_SERVER, Log)
  await loadWebpackHook(phase, dir)

  if (customConfig) {
    return assignDefaults({
      configOrigin: 'server',
      ...customConfig,
    }) as NextConfigComplete
  }

  const path = await findUp(CONFIG_FILE, { cwd: dir })

  // If config file was found
  if (path?.length) {
    const userConfigModule = require(path)
    const userConfig = normalizeConfig(
      phase,
      userConfigModule.default || userConfigModule
    )

    if (Object.keys(userConfig).length === 0) {
      Log.warn(
        'Detected next.config.js, no exported configuration found. https://nextjs.org/docs/messages/empty-configuration'
      )
    }

    if (userConfig.target && !targets.includes(userConfig.target)) {
      throw new Error(
        `Specified target is invalid. Provided: "${
          userConfig.target
        }" should be one of ${targets.join(', ')}`
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

    if (hasNextSupport) {
      userConfig.target = process.env.NEXT_PRIVATE_TARGET || 'server'
    }

    return assignDefaults({
      configOrigin: CONFIG_FILE,
      configFile: path,
      ...userConfig,
    }) as NextConfigComplete
  } else {
    const configBaseName = basename(CONFIG_FILE, extname(CONFIG_FILE))
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
        )}' is not supported. Please replace the file with 'next.config.js'.`
      )
    }
  }

  return defaultConfig as NextConfigComplete
}

export function isTargetLikeServerless(target: string) {
  const isServerless = target === 'serverless'
  const isServerlessTrace = target === 'experimental-serverless-trace'
  return isServerless || isServerlessTrace
}
