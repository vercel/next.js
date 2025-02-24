import type { NextConfig } from '../server/config-shared'
import path from 'path'
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
  'experimental.typedRoutes',

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
const unsupportedProductionSpecificTurbopackNextConfigOptions: string[] = [
  // TODO: Support disabling sourcemaps, currently they're always enabled.
  // 'productionBrowserSourceMaps',
]

// check for babelrc, swc plugins
export async function validateTurboNextConfig({
  dir,
  isDev,
}: {
  dir: string
  isDev?: boolean
}) {
  const { getPkgManager } =
    require('../lib/helpers/get-pkg-manager') as typeof import('../lib/helpers/get-pkg-manager')
  const { getBabelConfigFile } =
    require('../build/get-babel-config-file') as typeof import('../build/get-babel-config-file')
  const { defaultConfig } =
    require('../server/config-shared') as typeof import('../server/config-shared')
  const { bold, cyan, red, underline } =
    require('../lib/picocolors') as typeof import('../lib/picocolors')
  const { interopDefault } =
    require('../lib/interop-default') as typeof import('../lib/interop-default')

  let unsupportedParts = ''
  let babelrc = await getBabelConfigFile(dir)
  if (babelrc) babelrc = path.basename(babelrc)

  let hasWebpackConfig = false
  let hasTurboConfig = false

  let unsupportedConfig: string[] = []
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

    let unsupportedKeys = isDev
      ? unsupportedTurbopackNextConfigOptions
      : [
          ...unsupportedTurbopackNextConfigOptions,
          ...unsupportedProductionSpecificTurbopackNextConfigOptions,
        ]

    for (const key of customKeys) {
      if (key.startsWith('webpack') && rawNextConfig.webpack) {
        hasWebpackConfig = true
      }
      if (key.startsWith('experimental.turbo')) {
        hasTurboConfig = true
      }

      let isUnsupported =
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

  const feedbackMessage = `Learn more about Next.js and Turbopack: ${underline(
    'https://nextjs.org/docs/architecture/turbopack'
  )}\n`

  if (hasWebpackConfig && !hasTurboConfig) {
    Log.warn(
      `Webpack is configured while Turbopack is not, which may cause problems.`
    )
    Log.warn(
      `See instructions if you need to configure Turbopack:\n  https://nextjs.org/docs/app/api-reference/next-config-js/turbo\n`
    )
  }

  if (babelrc) {
    unsupportedParts += `Babel detected (${cyan(
      babelrc
    )})\n  Babel is not yet supported. To use Turbopack at the moment,\n  you'll need to remove your usage of Babel.`
  }

  if (
    unsupportedConfig.length === 1 &&
    unsupportedConfig[0] === 'experimental.optimizePackageImports'
  ) {
    Log.warn(
      `'experimental.optimizePackageImports' is not yet supported by Turbopack and will be ignored.`
    )
  } else if (unsupportedConfig.length) {
    unsupportedParts += `\n\n- Unsupported Next.js configuration option(s) (${cyan(
      'next.config.js'
    )})\n  To use Turbopack, remove the following configuration options:\n${unsupportedConfig
      .map((name) => `    - ${red(name)}\n`)
      .join('')}`
  }

  if (unsupportedParts) {
    const pkgManager = getPkgManager(dir)

    Log.error(
      `You are using configuration and/or tools that are not yet\nsupported by Next.js with Turbopack:\n${unsupportedParts}\n
If you cannot make the changes above, but still want to try out\nNext.js with Turbopack, create the Next.js playground app\nby running the following commands:

  ${bold(
    cyan(
      `${
        pkgManager === 'npm'
          ? 'npx create-next-app'
          : `${pkgManager} create next-app`
      } --example with-turbopack with-turbopack-app`
    )
  )}\n  cd with-turbopack-app\n  ${pkgManager} run dev
        `
    )

    Log.warn(feedbackMessage)

    process.exit(1)
  }

  return rawNextConfig
}
