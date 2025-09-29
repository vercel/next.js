import type { NextConfig } from '../server/config-shared'
import loadConfig from '../server/config'
import * as Log from '../build/output/log'
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
} from '../shared/lib/constants'

const unsupportedTurbopackNextConfigOptions = [
  // is this supported?
  // 'amp',
  // 'experimental.amp',

  // Left to be implemented (priority)
  // 'experimental.clientRouterFilter',
  // 'experimental.optimizePackageImports',
  // 'compiler.emotion',
  // 'compiler.reactRemoveProperties',
  // 'compiler.relay',
  // 'compiler.removeConsole',
  // 'compiler.styledComponents',
  'experimental.fetchCacheKeyPrefix',

  // Left to be implemented
  // 'excludeDefaultMomentLocales',
  // 'experimental.optimizeServerReact',
  'experimental.clientRouterFilterAllowedRate',
  // 'experimental.serverMinification',
  // 'experimental.serverSourceMaps',

  'experimental.allowedRevalidateHeaderKeys',
  'experimental.extensionAlias',
  'experimental.fallbackNodePolyfills',

  'experimental.sri.algorithm',
  'experimental.swcTraceProfiling',

  // Left to be implemented (Might not be needed for Turbopack)
  'experimental.craCompat',
  'experimental.disablePostcssPresetEnv',
  'experimental.esmExternals',
  // This is used to force swc-loader to run regardless of finding Babel.
  'experimental.forceSwcTransforms',
  'experimental.fullySpecified',
  'experimental.urlImports',
  'experimental.slowModuleDetection',
]

// The following will need to be supported by `next build --turbopack`
const unsupportedProductionSpecificTurbopackNextConfigOptions: string[] = []

/**  */
export async function validateTurboNextConfig({
  dir,
  isDev,
}: {
  dir: string
  isDev?: boolean
}) {
  const { defaultConfig } =
    require('../server/config-shared') as typeof import('../server/config-shared')
  const { cyan, red, underline } =
    require('../lib/picocolors') as typeof import('../lib/picocolors')
  const { interopDefault } =
    require('../lib/interop-default') as typeof import('../lib/interop-default')

  let unsupportedParts = ''

  let hasWebpackConfig = false
  let hasTurboConfig = false

  const unsupportedConfig: string[] = []
  let rawNextConfig: NextConfig = {}

  const phase = isDev ? PHASE_DEVELOPMENT_SERVER : PHASE_PRODUCTION_BUILD
  try {
    rawNextConfig = interopDefault(
      await loadConfig(phase, dir, {
        rawConfig: true,
      })
    ) as NextConfig

    if (typeof rawNextConfig === 'function') {
      rawNextConfig = (rawNextConfig as any)(phase, {
        defaultConfig,
      })
    }

    const flattenKeys = (obj: any, prefix: string = ''): string[] => {
      let keys: string[] = []

      for (const key in obj) {
        if (typeof obj?.[key] === 'undefined') {
          continue
        }

        const pre = prefix.length ? `${prefix}.` : ''

        if (
          typeof obj[key] === 'object' &&
          !Array.isArray(obj[key]) &&
          obj[key] !== null
        ) {
          keys = keys.concat(flattenKeys(obj[key], pre + key))
        } else {
          keys.push(pre + key)
        }
      }

      return keys
    }

    const getDeepValue = (obj: any, keys: string | string[]): any => {
      if (typeof keys === 'string') {
        keys = keys.split('.')
      }
      if (keys.length === 1) {
        return obj?.[keys?.[0]]
      }
      return getDeepValue(obj?.[keys?.[0]], keys.slice(1))
    }

    const customKeys = flattenKeys(rawNextConfig)

    const unsupportedKeys = isDev
      ? unsupportedTurbopackNextConfigOptions
      : [
          ...unsupportedTurbopackNextConfigOptions,
          ...unsupportedProductionSpecificTurbopackNextConfigOptions,
        ]

    for (const key of customKeys) {
      if (key.startsWith('webpack') && rawNextConfig.webpack) {
        hasWebpackConfig = true
      }
      if (key.startsWith('turbopack') || key.startsWith('experimental.turbo')) {
        hasTurboConfig = true
      }

      const isUnsupported =
        unsupportedKeys.some(
          (unsupportedKey) =>
            // Either the key matches (or is a more specific subkey) of
            // unsupportedKey, or the key is the path to a specific subkey.
            // | key     | unsupportedKey |
            // |---------|----------------|
            // | foo     | foo            |
            // | foo.bar | foo            |
            // | foo     | foo.bar        |
            key.startsWith(unsupportedKey) ||
            unsupportedKey.startsWith(`${key}.`)
        ) &&
        getDeepValue(rawNextConfig, key) !== getDeepValue(defaultConfig, key)

      if (isUnsupported) {
        unsupportedConfig.push(key)
      }
    }
  } catch (e) {
    Log.error('Unexpected error occurred while checking config', e)
  }

  // If the build was defaulted to Turbopack, we want to warn about possibly ignored webpack
  // configuration. Otherwise the user explicitly picked turbopack and thus we expect that
  // they have configured it correctly.
  if (process.env.TURBOPACK === 'auto' && hasWebpackConfig && !hasTurboConfig) {
    const logMethod = isDev ? Log.warn : Log.error
    // In a production build with auto-detected Turbopack, we want to fail the build.
    logMethod(
      `Webpack is configured while Turbopack is not. This may be a mistake.`
    )
    logMethod(
      `To configure Turbopack, see:\n  https://nextjs.org/docs/app/api-reference/next-config-js/turbopack`
    )
    logMethod(
      `TIP: Silence this ${isDev ? 'warning' : 'error'} by passing the --turbopack or --webpack flag explicitly.`
    )

    // For production builds we want to simply fail to prevent accidental misconfiguration.
    if (!isDev) {
      process.exit(1)
    }
  }

  if (unsupportedConfig.length) {
    unsupportedParts += `\n\n- Unsupported Next.js configuration option(s) (${cyan(
      'next.config.js'
    )})\n  Turbopack will ignore the following configuration options:\n${unsupportedConfig
      .map((name) => `    - ${red(name)}\n`)
      .join('')}`
  }

  if (unsupportedParts) {
    Log.error(
      `You are using configuration and/or tools that are not yet\nsupported by Next.js with Turbopack:\n${unsupportedParts}\n`
    )

    Log.warn(
      'Learn more about how to configure Turbopack with Next.js:\n' +
        underline(
          'https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack'
        )
    )
  }

  return rawNextConfig
}
