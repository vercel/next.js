import type { NextConfig } from '../server/config-shared'
import path from 'path'
import loadConfig from '../server/config'
import * as Log from '../build/output/log'
import { PHASE_DEVELOPMENT_SERVER } from '../shared/lib/constants'

const unsupportedTurbopackNextConfigOptions = [
  // is this supported?
  // 'amp',
  // 'experimental.amp',

  // Left to be implemented (priority)
  // 'experimental.clientRouterFilter',
  // 'experimental.optimizePackageImports',
  // 'compiler.emotion',
  'compiler.reactRemoveProperties',
  // 'compiler.relay',
  'compiler.removeConsole',
  // 'compiler.styledComponents',
  'experimental.fetchCacheKeyPrefix',

  // Left to be implemented
  // 'excludeDefaultMomentLocales',
  // 'experimental.optimizeServerReact',
  'experimental.clientRouterFilterAllowedRate',
  // 'experimental.serverMinification',
  // 'experimental.serverSourceMaps',

  'experimental.adjustFontFallbacks',
  'experimental.adjustFontFallbacksWithSizeAdjust',
  'experimental.allowedRevalidateHeaderKeys',
  'experimental.bundlePagesExternals',
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
]

// The following will need to be supported by `next build --turbo`
const prodSpecificTurboNextConfigOptions = [
  'eslint',
  'typescript',
  'outputFileTracing',
  'generateBuildId',
  'compress',
  'productionBrowserSourceMaps',
  'optimizeFonts',
  'poweredByHeader',
  'staticPageGenerationTimeout',
  'reactProductionProfiling',
  'cleanDistDir',
  'experimental.turbotrace',
  'experimental.outputFileTracingRoot',
  'experimental.outputFileTracingExcludes',
  'experimental.outputFileTracingIgnores',
  'experimental.outputFileTracingIncludes',
]

// check for babelrc, swc plugins
export async function validateTurboNextConfig({
  dir,
  isDev,
}: {
  allowRetry?: boolean
  dir: string
  port: number
  hostname?: string
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

  let hasWebpack = false
  let hasTurbo = !!process.env.TURBOPACK

  let unsupportedConfig: string[] = []
  let rawNextConfig: NextConfig = {}

  try {
    rawNextConfig = interopDefault(
      await loadConfig(PHASE_DEVELOPMENT_SERVER, dir, {
        rawConfig: true,
      })
    ) as NextConfig

    if (typeof rawNextConfig === 'function') {
      rawNextConfig = (rawNextConfig as any)(PHASE_DEVELOPMENT_SERVER, {
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
      : prodSpecificTurboNextConfigOptions

    for (const key of customKeys) {
      if (key.startsWith('webpack')) {
        hasWebpack = true
      }
      if (key.startsWith('experimental.turbo')) {
        hasTurbo = true
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
    'https://nextjs.link/with-turbopack'
  )}\n`

  if (hasWebpack && !hasTurbo) {
    Log.warn(
      `Webpack is configured while Turbopack is not, which may cause problems.`
    )
    Log.warn(
      `See instructions if you need to configure Turbopack:\n  https://turbo.build/pack/docs/features/customizing-turbopack\n`
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
